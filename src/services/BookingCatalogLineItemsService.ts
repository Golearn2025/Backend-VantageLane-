/**
 * Persists catalog selections (paid upgrades) into booking_line_items.
 * Source: client_booking_quotes.line_items.meta.trip.extras + service_items DB prices.
 *
 * Does NOT touch pricing engine — snapshot only at quote→booking conversion.
 */

import { supabase } from '../config/supabase';

interface ServiceItemRow {
  id: string;
  name: string;
  price_pence: number;
  currency: string | null;
  item_group: string | null;
  pricing_mode: string | null;
  metadata: Record<string, unknown> | null;
}

export class BookingCatalogLineItemsService {
  /**
   * Insert paid_upgrade rows for extras present on the quote.
   * Idempotent per booking: skips if paid_upgrade line items already exist.
   */
  static async persistPaidUpgradesFromQuote(
    bookingId: string,
    quote: { line_items?: { meta?: { trip?: { extras?: string[] } } } },
    organizationId: string
  ): Promise<string[]> {
    const extras = quote?.line_items?.meta?.trip?.extras;
    if (!Array.isArray(extras) || extras.length === 0) {
      console.log('[BookingCatalogLineItems] No trip.extras on quote — skipping');
      return [];
    }

    const { count: existingCount, error: countError } = await supabase
      .from('booking_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('item_group', 'paid_upgrade');

    if (countError) {
      throw new Error(`Failed to check existing line items: ${countError.message}`);
    }

    if ((existingCount ?? 0) > 0) {
      console.log(
        `[BookingCatalogLineItems] Booking ${bookingId} already has ${existingCount} paid_upgrade rows — skip`
      );
      const { data: existing } = await supabase
        .from('booking_line_items')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('item_group', 'paid_upgrade');
      return (existing ?? []).map(r => r.id);
    }

    const { data: serviceItems, error: itemsError } = await supabase
      .from('service_items')
      .select('id, name, price_pence, currency, item_group, pricing_mode, metadata')
      .in('id', extras)
      .eq('is_active', true);

    if (itemsError) {
      throw new Error(`Failed to load service_items: ${itemsError.message}`);
    }

    const paidItems = (serviceItems ?? []).filter(
      (row: ServiceItemRow) => row.item_group === 'paid_upgrade'
    );

    if (paidItems.length === 0) {
      console.log('[BookingCatalogLineItems] No paid_upgrade items in quote extras');
      return [];
    }

    const { data: legs } = await supabase
      .from('booking_legs')
      .select('id')
      .eq('booking_id', bookingId)
      .order('leg_number', { ascending: true })
      .limit(1);

    const bookingLegId = legs?.[0]?.id ?? null;

    const rows = paidItems.map((item: ServiceItemRow) => {
      const unitPence = Math.round(item.price_pence ?? 0);
      return {
        organization_id: organizationId,
        booking_id: bookingId,
        booking_leg_id: bookingLegId,
        service_item_id: item.id,
        item_group: item.item_group ?? 'paid_upgrade',
        item_key: item.id,
        item_value: item.name,
        quantity: 1,
        unit_price_pence: unitPence,
        total_price_pence: unitPence,
        currency: item.currency ?? 'GBP',
        is_included: false,
        snapshot: {
          service_item_id: item.id,
          name: item.name,
          pricing_mode: item.pricing_mode,
          metadata: item.metadata ?? {},
          quote_extras: extras,
          persisted_at: new Date().toISOString(),
        },
        source: 'quote_catalog_snapshot',
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('booking_line_items')
      .insert(rows)
      .select('id');

    if (insertError) {
      throw new Error(`Failed to insert booking_line_items: ${insertError.message}`);
    }

    const ids = (inserted ?? []).map(r => r.id);
    console.log(
      `[BookingCatalogLineItems] Inserted ${ids.length} paid_upgrade line items for booking ${bookingId}:`,
      paidItems.map((p: ServiceItemRow) => p.id).join(', ')
    );
    return ids;
  }
}
