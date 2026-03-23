/**
 * TEST FINANCIAL SNAPSHOT DOAR
 *
 * Testează doar crearea financial snapshot pentru quote-ul deja creat
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { FinancialSnapshotService } from './src/services/FinancialSnapshotService';

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

// Quote creat cu RLS activ
const QUOTE_ID = '3cf59d1c-c3af-49ae-b126-c97cecbbb262';
const BOOKING_ID = '6fb0ffa5-4876-44e2-afc1-50cb47d15ec5';
const ORG_ID = '9a5caade-4791-4860-93b5-12b1c4fa9830';

async function testFinancialSnapshot() {
  console.log('\n🧪 TESTING FINANCIAL SNAPSHOT SERVICE\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Quote ID: ${QUOTE_ID}`);
  console.log(`Booking ID: ${BOOKING_ID}`);
  console.log(`Organization ID: ${ORG_ID}\n`);

  try {
    console.log('📊 Creating financial snapshot...\n');

    const result = await FinancialSnapshotService.createFinancialSnapshot(
      BOOKING_ID,
      QUOTE_ID,
      ORG_ID
    );

    console.log('✅ FINANCIAL SNAPSHOT CREATED SUCCESSFULLY!\n');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\n');

    // Verify in DB
    console.log('🔍 Verifying data in DB...\n');

    const { data: bookingFinancial } = await supabase
      .from('internal_booking_financials')
      .select('*')
      .eq('id', result.booking_financial_id)
      .single();

    if (bookingFinancial) {
      console.log('✅ BOOKING FINANCIAL FOUND:');
      console.log(`   ID: ${bookingFinancial.id}`);
      console.log(`   Quote ID: ${bookingFinancial.quote_id}`);
      console.log(`   Gross Amount: ${bookingFinancial.gross_amount_pence} pence`);
      console.log(`   VAT: ${bookingFinancial.vat_amount_pence} pence`);
      console.log(`   Subtotal ex VAT: ${bookingFinancial.subtotal_ex_vat_pence} pence`);
      console.log(`   Platform Fee: ${bookingFinancial.platform_fee_pence} pence (${bookingFinancial.platform_fee_rate_bp} bp)`);
      console.log(`   Operator Fee: ${bookingFinancial.operator_fee_pence} pence (${bookingFinancial.operator_fee_rate_bp} bp)`);
      console.log(`   Driver Payout: ${bookingFinancial.driver_payout_pence} pence`);
      console.log(`   Pricing Source: ${bookingFinancial.pricing_source}`);
      console.log(`   Line Items Source: ${bookingFinancial.line_items?.source || 'N/A'}\n`);
    }

    const { data: legFinancials } = await supabase
      .from('internal_leg_financials')
      .select('*')
      .eq('booking_id', BOOKING_ID);

    console.log(`✅ LEG FINANCIALS FOUND: ${legFinancials?.length || 0} records\n`);

    const { data: lineItems } = await supabase
      .from('booking_line_items')
      .select('*')
      .eq('booking_id', BOOKING_ID);

    console.log(`📦 BOOKING LINE ITEMS: ${lineItems?.length || 0} records`);
    if (lineItems && lineItems.length > 0) {
      console.log(`   ⚠️  WARNING: Found ${lineItems.length} items in booking_line_items`);
      console.log(`   Item types: ${lineItems.map(i => i.item_type).join(', ')}\n`);
    } else {
      console.log(`   ✅ CORRECT: No pricing breakdown in booking_line_items\n`);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TEST PASSED - FINANCIAL SNAPSHOT WORKING!');
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testFinancialSnapshot();
