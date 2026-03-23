/**
 * TEST REFACTORED FLOW
 *
 * Tests the complete refactored flow:
 * 1. Calculate pricing with PricingEngine
 * 2. Create quote with QuoteService.createQuote() (uses new line_items format)
 * 3. Create financial snapshot with FinancialSnapshotService.createFinancialSnapshot()
 * 4. Verify data integrity across all tables
 *
 * IMPORTANT: This uses the REFACTORED services with standardized line_items format
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { FinancialSnapshotService } from './src/services/FinancialSnapshotService';
import { PricingEngine } from './src/services/PricingEngine';
import { QuoteService } from './src/services/QuoteService';
import { BookingType, VehicleType } from './src/types/pricing.types';

// Use service role for testing (bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Test configuration
const TEST_CONFIG = {
  organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830',
  customerId: 'ead7ed58-46f6-458a-95d3-c0386bcdb5af',

  // Pricing request
  pickup: 'London Heathrow Airport, Longford, UK',
  dropoff: 'Central London, Westminster, UK',
  vehicleType: VehicleType.LUXURY,
  bookingType: BookingType.ONE_WAY,
  dateTime: '2026-03-17T10:00:00Z',
  distance: 45.06, // km (28 miles)
  duration: 45, // minutes

  // Coordinates
  pickupLat: 51.4700,
  pickupLng: -0.4543,
  dropoffLat: 51.5074,
  dropoffLng: -0.1278
};

interface TestResult {
  success: boolean;
  bookingId: string;
  bookingLegId: string;
  quoteId: string;
  legQuoteIds: string[];
  financialSnapshotId: string;
  legFinancialIds: string[];
  pricingData: {
    subtotal_pence: number;
    discount_pence: number;
    vat_pence: number;
    total_pence: number;
  };
  verificationQueries: string[];
  errors?: string[];
}

async function runRefactoredFlowTest(): Promise<TestResult> {
  console.log('\n🚀 TESTING REFACTORED FLOW\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const errors: string[] = [];
  const verificationQueries: string[] = [];

  try {
    // ============================================================
    // STEP 1: Create NEW booking for clean test
    // ============================================================
    console.log('📝 STEP 1: Creating NEW booking for test...\n');

    const bookingId = crypto.randomUUID();
    const bookingReference = `E2E-TEST-${Date.now()}`;

    // Create booking
    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        customer_id: TEST_CONFIG.customerId,
        organization_id: TEST_CONFIG.organizationId,
        booking_type: 'oneway',
        status: 'NEW',
        currency: 'GBP',
        source: 'e2e_test',
        start_at: TEST_CONFIG.dateTime,
        reference: bookingReference,
        trip_configuration_raw: { test: 'e2e_complete_flow' }
      });

    if (bookingError) {
      throw new Error(`Failed to create booking: ${bookingError.message}`);
    }

    console.log(`✅ Booking created: ${bookingId}`);
    console.log(`   Reference: ${bookingReference}`);
    console.log(`   Organization: ${TEST_CONFIG.organizationId}`);
    console.log(`   Status: NEW\n`);

    // Create booking leg
    const { data: leg, error: legError } = await supabase
      .from('booking_legs')
      .insert({
        booking_id: bookingId,
        leg_number: 1,
        leg_kind: 'main',
        status: 'PENDING',
        pickup_address: TEST_CONFIG.pickup,
        pickup_lat: TEST_CONFIG.pickupLat,
        pickup_lng: TEST_CONFIG.pickupLng,
        dropoff_address: TEST_CONFIG.dropoff,
        dropoff_lat: TEST_CONFIG.dropoffLat,
        dropoff_lng: TEST_CONFIG.dropoffLng,
        scheduled_at: TEST_CONFIG.dateTime,
        vehicle_category_id: TEST_CONFIG.vehicleType,
        distance_miles: TEST_CONFIG.distance / 1.60934,
        duration_min: TEST_CONFIG.duration
      })
      .select('id')
      .single();

    if (legError || !leg) {
      throw new Error(`Failed to create leg: ${legError?.message}`);
    }

    const legId = leg.id;
    console.log(`✅ Booking leg created: ${legId}\n`);

    // ============================================================
    // STEP 2: Calculate pricing with PricingEngine
    // ============================================================
    console.log('💰 STEP 2: Calculating pricing...\n');

    const pricingRequest = {
      pickup: TEST_CONFIG.pickup,
      dropoff: TEST_CONFIG.dropoff,
      vehicleType: TEST_CONFIG.vehicleType,
      bookingType: TEST_CONFIG.bookingType,
      dateTime: TEST_CONFIG.dateTime,
      distance: TEST_CONFIG.distance,
      duration: TEST_CONFIG.duration,
      organizationId: TEST_CONFIG.organizationId
    };

    const pricingResult = await PricingEngine.calculate(pricingRequest);

    if (!pricingResult.success) {
      throw new Error(`Pricing failed: ${pricingResult.error}`);
    }

    console.log(`✅ Pricing calculated`);
    console.log(`   Final Price: £${pricingResult.finalPrice}`);
    console.log(`   Breakdown: base=${pricingResult.breakdown?.baseFare}, distance=${pricingResult.breakdown?.distanceFee}, time=${pricingResult.breakdown?.timeFee}\n`);

    // ============================================================
    // STEP 3: Create quote with QuoteService (NEW FORMAT)
    // ============================================================
    console.log('💾 STEP 3: Creating quote with QuoteService.createQuote()...\n');

    const quoteResult = await QuoteService.createQuote(
      pricingResult,
      pricingRequest,
      TEST_CONFIG.organizationId,
      bookingId  // Pass bookingId as 4th parameter
    );

    if (!quoteResult.success) {
      throw new Error(`Quote creation failed: ${quoteResult.error}`);
    }

    console.log(`✅ Quote created`);
    console.log(`   Booking Quote ID: ${quoteResult.booking_quote_id}`);
    console.log(`   Leg Quote IDs: ${quoteResult.leg_quote_ids.join(', ')}\n`);

    // Add verification query for quote
    verificationQueries.push(`
-- Verify booking quote line_items structure
SELECT
  id,
  subtotal_pence,
  discount_pence,
  vat_pence,
  total_pence,
  line_items->'components' as components,
  line_items->'discounts' as discounts,
  line_items->'multipliers' as multipliers,
  line_items->'summary' as summary,
  line_items->'meta' as meta
FROM client_booking_quotes
WHERE id = '${quoteResult.booking_quote_id}';
    `.trim());

    verificationQueries.push(`
-- Verify leg quote line_items structure
SELECT
  id,
  booking_leg_id,
  subtotal_pence,
  vat_pence,
  total_pence,
  line_items->'components' as components,
  line_items->'discounts' as discounts,
  line_items->'summary' as summary
FROM client_leg_quotes
WHERE booking_quote_id = '${quoteResult.booking_quote_id}';
    `.trim());

    // ============================================================
    // STEP 4: Confirm booking
    // ============================================================
    console.log('✅ STEP 4: Confirming booking...\n');

    const { error: confirmError } = await supabase
      .from('bookings')
      .update({ status: 'CONFIRMED' })
      .eq('id', bookingId);

    if (confirmError) {
      throw new Error(`Failed to confirm booking: ${confirmError.message}`);
    }

    console.log(`✅ Booking confirmed\n`);

    // ============================================================
    // STEP 5: Create financial snapshot (NEW SCHEMA)
    // ============================================================
    console.log('📊 STEP 5: Creating financial snapshot...\n');

    const snapshotResult = await FinancialSnapshotService.createFinancialSnapshot(
      bookingId,
      quoteResult.booking_quote_id,
      TEST_CONFIG.organizationId
    );

    if (!snapshotResult.success) {
      throw new Error(`Financial snapshot failed: ${snapshotResult.error}`);
    }

    console.log(`✅ Financial snapshot created`);
    console.log(`   Booking Financial ID: ${snapshotResult.booking_financial_id}`);
    console.log(`   Leg Financial IDs: ${snapshotResult.leg_financial_ids.join(', ')}`);
    console.log(`   Line Item IDs: ${snapshotResult.line_item_ids.length} (should be 0)\n`);

    // Add verification queries for financial snapshots
    verificationQueries.push(`
-- Verify booking financial with NEW schema
SELECT
  id,
  quote_id,
  pricing_version_id,
  gross_amount_pence,
  vat_amount_pence,
  subtotal_ex_vat_pence,
  platform_fee_pence,
  platform_fee_rate_bp,
  operator_fee_pence,
  operator_fee_rate_bp,
  driver_payout_pence,
  vendor_cost_pence,
  platform_profit_pence,
  processor_fee_pence,
  net_collected_pence,
  net_to_platform_pence,
  net_to_operator_pence,
  net_to_driver_pence,
  booking_payment_id,
  pricing_source,
  line_items->'source' as line_items_source,
  line_items->'summary' as line_items_summary,
  line_items->'commissions' as line_items_commissions
FROM internal_booking_financials
WHERE id = '${snapshotResult.booking_financial_id}';
    `.trim());

    verificationQueries.push(`
-- Verify leg financial with NEW schema
SELECT
  id,
  booking_leg_id,
  booking_id,
  version,
  driver_payout_pence,
  platform_fee_pence,
  vendor_cost_pence,
  line_items->'source' as line_items_source,
  line_items->'pricing' as line_items_pricing,
  line_items->'components' as line_items_components,
  line_items->'commissions' as line_items_commissions
FROM internal_leg_financials
WHERE booking_id = '${bookingId}';
    `.trim());

    verificationQueries.push(`
-- Verify booking_line_items is EMPTY (no pricing breakdown)
SELECT COUNT(*) as count,
       array_agg(item_type) as item_types
FROM booking_line_items
WHERE booking_id = '${bookingId}';
    `.trim());

    // ============================================================
    // STEP 6: Fetch and verify data
    // ============================================================
    console.log('🔍 STEP 6: Fetching created data for verification...\n');

    const { data: quote } = await supabase
      .from('client_booking_quotes')
      .select('*')
      .eq('id', quoteResult.booking_quote_id)
      .single();

    if (!quote) {
      errors.push('Quote not found after creation');
    } else {
      console.log('📋 QUOTE DATA:');
      console.log(`   Subtotal: ${quote.subtotal_pence} pence`);
      console.log(`   Discount: ${quote.discount_pence} pence`);
      console.log(`   VAT: ${quote.vat_pence} pence`);
      console.log(`   Total: ${quote.total_pence} pence`);
      console.log(`   Line Items Format: ${quote.line_items?.components ? 'NEW (components[])' : 'OLD'}`);

      if (quote.line_items?.components) {
        console.log(`   Components count: ${quote.line_items.components.length}`);
      }
      if (quote.line_items?.meta) {
        console.log(`   Calc source: ${quote.line_items.meta.calc_source}`);
        console.log(`   Calc version: ${quote.line_items.meta.calc_version}`);
      }
      console.log('');
    }

    const { data: bookingFinancial } = await supabase
      .from('internal_booking_financials')
      .select('*')
      .eq('id', snapshotResult.booking_financial_id)
      .single();

    if (!bookingFinancial) {
      errors.push('Booking financial not found after creation');
    } else {
      console.log('💰 BOOKING FINANCIAL DATA:');
      console.log(`   Gross amount: ${bookingFinancial.gross_amount_pence} pence`);
      console.log(`   VAT: ${bookingFinancial.vat_amount_pence} pence`);
      console.log(`   Subtotal ex VAT: ${bookingFinancial.subtotal_ex_vat_pence} pence`);
      console.log(`   Platform fee: ${bookingFinancial.platform_fee_pence} pence (${bookingFinancial.platform_fee_rate_bp} bp)`);
      console.log(`   Operator fee: ${bookingFinancial.operator_fee_pence} pence (${bookingFinancial.operator_fee_rate_bp} bp)`);
      console.log(`   Driver payout: ${bookingFinancial.driver_payout_pence} pence`);
      console.log(`   Processor fee: ${bookingFinancial.processor_fee_pence} pence`);
      console.log(`   Line items source: ${bookingFinancial.line_items?.source}`);
      console.log('');
    }

    const { data: lineItems } = await supabase
      .from('booking_line_items')
      .select('*')
      .eq('booking_id', bookingId);

    console.log('📦 BOOKING LINE ITEMS:');
    console.log(`   Count: ${lineItems?.length || 0}`);
    if (lineItems && lineItems.length > 0) {
      console.log(`   ⚠️  WARNING: Found ${lineItems.length} items (should be 0 for pricing breakdown)`);
      console.log(`   Item types: ${lineItems.map(i => i.item_type).join(', ')}`);
      errors.push(`booking_line_items contains ${lineItems.length} items - should be empty for pricing breakdown`);
    } else {
      console.log(`   ✅ CORRECT: No pricing breakdown in booking_line_items`);
    }
    console.log('');

    // ============================================================
    // FINAL RESULT
    // ============================================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log(errors.length === 0 ? '✅ TEST PASSED' : '❌ TEST FAILED');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (errors.length > 0) {
      console.log('❌ ERRORS FOUND:');
      errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
      console.log('');
    }

    return {
      success: errors.length === 0,
      bookingId,
      bookingLegId: legId,
      quoteId: quoteResult.booking_quote_id,
      legQuoteIds: quoteResult.leg_quote_ids,
      financialSnapshotId: snapshotResult.booking_financial_id,
      legFinancialIds: snapshotResult.leg_financial_ids,
      pricingData: {
        subtotal_pence: quote?.subtotal_pence || 0,
        discount_pence: quote?.discount_pence || 0,
        vat_pence: quote?.vat_pence || 0,
        total_pence: quote?.total_pence || 0
      },
      verificationQueries,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error: any) {
    console.error('\n❌ TEST FAILED WITH EXCEPTION:', error.message);
    console.error(error.stack);

    return {
      success: false,
      bookingId: '',
      bookingLegId: '',
      quoteId: '',
      legQuoteIds: [],
      financialSnapshotId: '',
      legFinancialIds: [],
      pricingData: {
        subtotal_pence: 0,
        discount_pence: 0,
        vat_pence: 0,
        total_pence: 0
      },
      verificationQueries,
      errors: [error.message]
    };
  }
}

// Run the test
runRefactoredFlowTest()
  .then(result => {
    console.log('\n📊 VERIFICATION QUERIES:\n');
    console.log('Run these queries in your Supabase SQL editor to verify the data:\n');
    result.verificationQueries.forEach((query, i) => {
      console.log(`-- Query ${i + 1}`);
      console.log(query);
      console.log('\n');
    });

    console.log('\n📋 TEST RESULT SUMMARY:\n');
    console.log(JSON.stringify(result, null, 2));

    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ FATAL ERROR:', error);
    process.exit(1);
  });
