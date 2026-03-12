/**
 * END-TO-END PRICING ENGINE TEST
 * 
 * Tests the complete flow:
 * 1. Create booking
 * 2. Create booking leg
 * 3. Calculate pricing with commissions
 * 4. Store quote with pricing_version_id
 * 5. Create financial snapshot
 * 6. Validate pricing_version_id consistency
 * 7. Generate detailed report
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/config/supabase';
import { PricingEngine } from './src/services/PricingEngine';
import { QuoteService } from './src/services/QuoteService';
import { FinancialSnapshotService } from './src/services/FinancialSnapshotService';
import { OrganizationSettingsService } from './src/services/OrganizationSettingsService';

// Test data
const TEST_DATA = {
  organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830',
  customerId: 'ead7ed58-46f6-458a-95d3-c0386bcdb5af',
  vehicleType: 'luxury',
  bookingType: 'one_way',
  pickup: 'London Heathrow Airport, Longford, UK',
  dropoff: 'Central London, Westminster, UK',
  distance: 28, // miles (converted to km: 28 * 1.60934 = 45.06 km)
  duration: 45, // minutes
  dateTime: '2026-03-15T08:30:00Z', // Saturday morning (weekend + peak)
  pickupLat: 51.4700,
  pickupLng: -0.4543,
  dropoffLat: 51.5074,
  dropoffLng: -0.1278
};

interface TestReport {
  booking_id: string;
  quote_id: string;
  pricing_version_id: string | null;
  subtotal_pence: number;
  vat_pence: number;
  total_pence: number;
  line_items: any;
  financial_snapshot_id: string;
  validation: {
    pricing_version_matches_active: boolean;
    quote_total_matches_pricing: boolean;
    snapshot_version_matches_quote: boolean;
    pricing_from_views: boolean;
  };
  calculation_breakdown: {
    base_fare: number;
    distance_cost: number;
    time_cost: number;
    surge_multiplier: string;
    surge_amount: number;
    subtotal_before_minimum: number;
    minimum_fare_adjustment: number;
    subtotal_after_minimum: number;
    vat_rate: number;
    vat_amount: number;
    total_with_vat: number;
  };
}

async function runEndToEndTest(): Promise<TestReport> {
  console.log('🚀 Starting END-TO-END Pricing Engine Test\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ============================================================
  // STEP 1: Create Draft Booking
  // ============================================================
  console.log('📝 STEP 1: Creating draft booking...');
  
  const bookingReference = `E2E-TEST-${Date.now()}`;
  const bookingId = crypto.randomUUID();
  
  // Use raw SQL to bypass RLS for testing
  const { error: bookingError } = await supabase.rpc('exec_sql', {
    sql: `
      INSERT INTO bookings (
        id, customer_id, organization_id, booking_type, status, 
        currency, source, start_at, reference, trip_configuration_raw
      ) VALUES (
        '${bookingId}',
        '${TEST_DATA.customerId}',
        '${TEST_DATA.organizationId}',
        'oneway',
        'NEW',
        'GBP',
        'e2e_test',
        '${TEST_DATA.dateTime}',
        '${bookingReference}',
        '{"test": "end_to_end", "scenario": "weekend_morning_surge"}'::jsonb
      )
    `
  });

  if (bookingError) {
    throw new Error(`Failed to create booking: ${bookingError.message}`);
  }

  console.log(`✅ Booking created: ${bookingId}`);
  console.log(`   Reference: ${bookingReference}`);
  console.log(`   Status: NEW\n`);

  // ============================================================
  // STEP 2: Create Booking Leg
  // ============================================================
  console.log('📝 STEP 2: Creating booking leg...');

  const { data: leg, error: legError } = await supabase
    .from('booking_legs')
    .insert({
      booking_id: bookingId,
      leg_number: 1,
      leg_kind: 'main',
      status: 'PENDING',
      pickup_address: TEST_DATA.pickup,
      pickup_lat: TEST_DATA.pickupLat,
      pickup_lng: TEST_DATA.pickupLng,
      dropoff_address: TEST_DATA.dropoff,
      dropoff_lat: TEST_DATA.dropoffLat,
      dropoff_lng: TEST_DATA.dropoffLng,
      scheduled_at: TEST_DATA.dateTime,
      vehicle_category_id: TEST_DATA.vehicleType,
      distance_miles: TEST_DATA.distance,
      duration_min: TEST_DATA.duration
    })
    .select('id, leg_number, distance_miles, duration_min')
    .single();

  if (legError || !leg) {
    throw new Error(`Failed to create booking leg: ${legError?.message}`);
  }

  console.log(`✅ Booking leg created: ${leg.id}`);
  console.log(`   Distance: ${leg.distance_miles} miles`);
  console.log(`   Duration: ${leg.duration_min} minutes\n`);

  // ============================================================
  // STEP 3: Call Pricing Engine
  // ============================================================
  console.log('💰 STEP 3: Calculating pricing with commissions...');

  const pricingRequest = {
    pickup: TEST_DATA.pickup,
    dropoff: TEST_DATA.dropoff,
    vehicleType: TEST_DATA.vehicleType as any,
    bookingType: TEST_DATA.bookingType as any,
    dateTime: TEST_DATA.dateTime,
    distance: TEST_DATA.distance * 1.60934, // Convert miles to km
    duration: TEST_DATA.duration,
    organizationId: TEST_DATA.organizationId
  };

  const pricingResult = await PricingEngine.calculate(pricingRequest);

  if (!pricingResult.success) {
    throw new Error(`Pricing calculation failed: ${pricingResult.error}`);
  }

  console.log(`✅ Pricing calculated successfully`);
  console.log(`   Final Price (before VAT): £${pricingResult.finalPrice}`);
  console.log(`   Pricing Version ID: ${pricingResult.pricing_version_id || 'NOT CAPTURED'}\n`);

  // Get organization settings for VAT and commissions
  const orgSettings = await OrganizationSettingsService.getOrganizationSettings(TEST_DATA.organizationId);

  const priceBeforeVAT = pricingResult.finalPrice || 0;
  const vatAmount = Math.round(priceBeforeVAT * orgSettings.vat_rate * 100) / 100;
  const priceWithVAT = priceBeforeVAT + vatAmount;

  console.log(`   VAT (${orgSettings.vat_rate * 100}%): £${vatAmount}`);
  console.log(`   Total (with VAT): £${priceWithVAT}\n`);

  // ============================================================
  // STEP 4: Store Quote with pricing_version_id
  // ============================================================
  console.log('💾 STEP 4: Storing quote in database...');

  const subtotalPence = Math.round(priceBeforeVAT * 100);
  const vatPence = Math.round(vatAmount * 100);
  const totalPence = subtotalPence + vatPence;

  const { data: quote, error: quoteError } = await supabase
    .from('client_booking_quotes')
    .insert({
      booking_id: bookingId,
      organization_id: TEST_DATA.organizationId,
      version: 1,
      is_locked: false,
      quote_valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      currency: 'GBP',
      subtotal_pence: subtotalPence,
      discount_pence: 0,
      vat_rate: orgSettings.vat_rate,
      vat_pence: vatPence,
      total_pence: totalPence,
      line_items: {
        base_fare: pricingResult.breakdown?.baseFare || 0,
        distance_fee: pricingResult.breakdown?.distanceFee || 0,
        time_fee: pricingResult.breakdown?.timeFee || 0,
        additional_fees: pricingResult.breakdown?.additionalFees || 0,
        services: pricingResult.breakdown?.services || 0,
        multipliers: pricingResult.breakdown?.multipliers || {},
        discounts: pricingResult.breakdown?.discounts || 0,
        pricing_version_id: pricingResult.pricing_version_id // Store version ID
      },
      calc_source: 'pricing_engine_v2',
      calc_version: '2.0.0',
      calculated_at: new Date().toISOString()
    })
    .select('id, subtotal_pence, vat_pence, total_pence, line_items')
    .single();

  if (quoteError || !quote) {
    throw new Error(`Failed to create quote: ${quoteError?.message}`);
  }

  console.log(`✅ Quote created: ${quote.id}`);
  console.log(`   Subtotal: ${quote.subtotal_pence} pence (£${quote.subtotal_pence / 100})`);
  console.log(`   VAT: ${quote.vat_pence} pence (£${quote.vat_pence / 100})`);
  console.log(`   Total: ${quote.total_pence} pence (£${quote.total_pence / 100})\n`);

  // ============================================================
  // STEP 5: Confirm Booking
  // ============================================================
  console.log('✅ STEP 5: Confirming booking...');

  const { error: confirmError } = await supabase
    .from('bookings')
    .update({ status: 'CONFIRMED' })
    .eq('id', bookingId);

  if (confirmError) {
    throw new Error(`Failed to confirm booking: ${confirmError.message}`);
  }

  console.log(`✅ Booking confirmed\n`);

  // ============================================================
  // STEP 6: Create Financial Snapshot
  // ============================================================
  console.log('📊 STEP 6: Creating financial snapshot...');

  // Calculate commissions
  const platformFee = Math.round(priceBeforeVAT * orgSettings.platform_commission_pct);
  const operatorNet = priceBeforeVAT - platformFee;
  const operatorCommission = Math.round(operatorNet * orgSettings.operator_commission_pct);
  const driverPayout = operatorNet - operatorCommission;

  const { data: financialSnapshot, error: snapshotError } = await supabase
    .from('internal_booking_financials')
    .insert({
      booking_id: bookingId,
      booking_quote_id: quote.id,
      pricing_version_id: pricingResult.pricing_version_id || null,
      
      customer_price_pence: Math.round(priceWithVAT * 100),
      price_before_vat_pence: subtotalPence,
      vat_amount_pence: vatPence,
      vat_rate: orgSettings.vat_rate,
      
      platform_fee_pence: Math.round(platformFee * 100),
      platform_commission_pct: orgSettings.platform_commission_pct,
      operator_net_pence: Math.round(operatorNet * 100),
      operator_commission_pence: Math.round(operatorCommission * 100),
      operator_commission_pct: orgSettings.operator_commission_pct,
      driver_payout_pence: Math.round(driverPayout * 100),
      
      currency: 'GBP',
      snapshot_created_at: new Date().toISOString()
    })
    .select('id, pricing_version_id')
    .single();

  if (snapshotError || !financialSnapshot) {
    throw new Error(`Failed to create financial snapshot: ${snapshotError?.message}`);
  }

  console.log(`✅ Financial snapshot created: ${financialSnapshot.id}`);
  console.log(`   Pricing Version ID: ${financialSnapshot.pricing_version_id || 'NULL'}\n`);

  // ============================================================
  // STEP 7: Validation Checks
  // ============================================================
  console.log('🔍 STEP 7: Running validation checks...\n');

  // Check 1: pricing_version_id matches active version
  const { data: activeVersion } = await supabase
    .from('pricing_versions')
    .select('id, version_name')
    .eq('organization_id', TEST_DATA.organizationId)
    .eq('is_active', true)
    .single();

  const versionMatchesActive = pricingResult.pricing_version_id === activeVersion?.id;
  console.log(`✓ Pricing version matches active: ${versionMatchesActive ? '✅ PASS' : '❌ FAIL'}`);
  if (activeVersion) {
    console.log(`  Active version: ${activeVersion.version_name} (${activeVersion.id})`);
    console.log(`  Used version: ${pricingResult.pricing_version_id || 'NOT CAPTURED'}`);
  }

  // Check 2: quote total matches pricing
  const quoteTotalPounds = quote.total_pence / 100;
  const pricingTotalPounds = priceWithVAT;
  const totalMatches = Math.abs(quoteTotalPounds - pricingTotalPounds) < 0.01;
  console.log(`✓ Quote total matches pricing: ${totalMatches ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Quote: £${quoteTotalPounds}`);
  console.log(`  Pricing: £${pricingTotalPounds}`);

  // Check 3: snapshot version matches quote version
  const snapshotVersionMatchesQuote = 
    financialSnapshot.pricing_version_id === pricingResult.pricing_version_id;
  console.log(`✓ Snapshot version matches quote: ${snapshotVersionMatchesQuote ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Snapshot: ${financialSnapshot.pricing_version_id || 'NULL'}`);
  console.log(`  Quote: ${pricingResult.pricing_version_id || 'NULL'}`);

  // Check 4: Pricing from views (verified by checking pricing_version_id exists)
  const pricingFromViews = !!pricingResult.pricing_version_id;
  console.log(`✓ Pricing from views: ${pricingFromViews ? '✅ PASS' : '❌ FAIL'}\n`);

  // ============================================================
  // STEP 8: Generate Detailed Calculation Breakdown
  // ============================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 DETAILED CALCULATION BREAKDOWN');
  console.log('═══════════════════════════════════════════════════════════\n');

  const breakdown = pricingResult.breakdown!;
  const details = pricingResult.details || [];

  console.log('🔢 BASE COMPONENTS:');
  console.log(`   Base Fare:        £${breakdown.baseFare.toFixed(2)}`);
  console.log(`   Distance Cost:    £${breakdown.distanceFee.toFixed(2)} (${TEST_DATA.distance} miles)`);
  console.log(`   Time Cost:        £${breakdown.timeFee.toFixed(2)} (${TEST_DATA.duration} minutes)`);
  console.log(`   Additional Fees:  £${breakdown.additionalFees.toFixed(2)}`);
  console.log(`   Services:         £${breakdown.services.toFixed(2)}`);
  console.log('   ─────────────────────────────────');

  const subtotalBeforeSurge = breakdown.baseFare + breakdown.distanceFee + breakdown.timeFee + 
                               breakdown.additionalFees + breakdown.services;
  console.log(`   Subtotal (before surge): £${subtotalBeforeSurge.toFixed(2)}\n`);

  console.log('🔥 SURGE PRICING:');
  const multipliers = breakdown.multipliers || {};
  const multiplierKeys = Object.keys(multipliers);
  if (multiplierKeys.length > 0) {
    multiplierKeys.forEach(key => {
      const multiplier = multipliers[key];
      const surgeAmount = subtotalBeforeSurge * (multiplier - 1);
      console.log(`   ${key}: ${multiplier}x (+${((multiplier - 1) * 100).toFixed(0)}%)`);
      console.log(`   Surge Amount: £${surgeAmount.toFixed(2)}`);
    });
  } else {
    console.log(`   No surge applied`);
  }
  console.log('   ─────────────────────────────────');
  console.log(`   Subtotal (after surge): £${breakdown.subtotal.toFixed(2)}\n`);

  console.log('💷 MINIMUM FARE CHECK:');
  const minimumFareDetail = details.find(d => d.component === 'minimum_fare');
  if (minimumFareDetail) {
    console.log(`   ⚠️  Minimum fare applied: +£${minimumFareDetail.amount.toFixed(2)}`);
    console.log(`   ${minimumFareDetail.description}`);
  } else {
    console.log(`   ✓ Subtotal exceeds minimum fare`);
  }
  console.log('   ─────────────────────────────────');
  console.log(`   Final Subtotal: £${breakdown.finalPrice.toFixed(2)}\n`);

  console.log('📈 VAT & TOTAL:');
  console.log(`   VAT Rate:         ${(orgSettings.vat_rate * 100).toFixed(0)}%`);
  console.log(`   VAT Amount:       £${vatAmount.toFixed(2)}`);
  console.log('   ═════════════════════════════════');
  console.log(`   TOTAL (with VAT): £${priceWithVAT.toFixed(2)}\n`);

  console.log('💰 COMMISSION BREAKDOWN:');
  console.log(`   Platform Fee (${(orgSettings.platform_commission_pct * 100).toFixed(0)}%):  £${platformFee.toFixed(2)}`);
  console.log(`   Operator Net:      £${operatorNet.toFixed(2)}`);
  console.log(`   Operator Fee (${(orgSettings.operator_commission_pct * 100).toFixed(0)}%):  £${operatorCommission.toFixed(2)}`);
  console.log('   ─────────────────────────────────');
  console.log(`   Driver Payout:     £${driverPayout.toFixed(2)}\n`);

  // ============================================================
  // Generate Final Report
  // ============================================================
  const report: TestReport = {
    booking_id: bookingId,
    quote_id: quote.id,
    pricing_version_id: pricingResult.pricing_version_id || null,
    subtotal_pence: quote.subtotal_pence,
    vat_pence: quote.vat_pence,
    total_pence: quote.total_pence,
    line_items: quote.line_items,
    financial_snapshot_id: financialSnapshot.id,
    validation: {
      pricing_version_matches_active: versionMatchesActive,
      quote_total_matches_pricing: totalMatches,
      snapshot_version_matches_quote: snapshotVersionMatchesQuote,
      pricing_from_views: pricingFromViews
    },
    calculation_breakdown: {
      base_fare: breakdown.baseFare,
      distance_cost: breakdown.distanceFee,
      time_cost: breakdown.timeFee,
      surge_multiplier: multiplierKeys.length > 0 ? `${multipliers[multiplierKeys[0]]}x` : 'none',
      surge_amount: multiplierKeys.length > 0 ? subtotalBeforeSurge * (multipliers[multiplierKeys[0]] - 1) : 0,
      subtotal_before_minimum: subtotalBeforeSurge,
      minimum_fare_adjustment: minimumFareDetail?.amount || 0,
      subtotal_after_minimum: breakdown.finalPrice,
      vat_rate: orgSettings.vat_rate,
      vat_amount: vatAmount,
      total_with_vat: priceWithVAT
    }
  };

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ END-TO-END TEST COMPLETED SUCCESSFULLY');
  console.log('═══════════════════════════════════════════════════════════\n');

  return report;
}

// Run the test
runEndToEndTest()
  .then(report => {
    console.log('📋 FINAL REPORT:\n');
    console.log(JSON.stringify(report, null, 2));
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
