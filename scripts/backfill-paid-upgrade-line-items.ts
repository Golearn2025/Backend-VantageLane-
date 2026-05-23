/**
 * LOCAL/DEV ONLY — backfill paid_upgrade rows in booking_line_items from quote extras.
 *
 * Usage:
 *   npx tsx scripts/backfill-paid-upgrade-line-items.ts CB-000735
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { BookingCatalogLineItemsService } = await import(
    '../src/services/BookingCatalogLineItemsService'
  );

  const reference = process.argv[2];
  if (!reference) {
    console.error('Usage: npx tsx scripts/backfill-paid-upgrade-line-items.ts <CB-REFERENCE>');
    process.exit(1);
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, reference, organization_id')
    .eq('reference', reference)
    .single();

  if (bookingError || !booking) {
    console.error('Booking not found:', bookingError?.message);
    process.exit(1);
  }

  const { data: quote, error: quoteError } = await supabase
    .from('client_booking_quotes')
    .select('id, line_items')
    .eq('booking_id', booking.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quoteError || !quote) {
    console.error('Quote not found for booking:', quoteError?.message);
    process.exit(1);
  }

  const ids = await BookingCatalogLineItemsService.persistPaidUpgradesFromQuote(
    booking.id,
    quote,
    booking.organization_id
  );

  console.log(`Done. Line item ids (${ids.length}):`, ids);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
