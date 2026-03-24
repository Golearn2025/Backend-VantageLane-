/**
 * Verify Quote in Database
 * Checks client_booking_quotes table for quote persistence
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const quoteId = process.argv[2];

if (!quoteId) {
  console.error('Usage: node verify-quote-db.js <quote_id>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyQuote() {
  console.log(`\n🔍 Verifying Quote: ${quoteId}\n`);
  
  const { data, error } = await supabase
    .from('client_booking_quotes')
    .select('*')
    .eq('id', quoteId)
    .single();

  if (error) {
    console.error('❌ Error fetching quote:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.error('❌ Quote not found');
    process.exit(1);
  }

  console.log('✅ Quote Found\n');
  console.log('📊 Basic Info:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Booking ID: ${data.booking_id || 'NULL ✅ (Phase 2A - independent quote)'}`);
  console.log(`  Currency: ${data.currency}`);
  console.log(`  Pricing Version: ${data.pricing_version_id || 'N/A'}`);
  console.log(`  Created: ${data.created_at}`);
  
  console.log('\n💰 Pricing (pence):');
  console.log(`  Subtotal: ${data.subtotal_pence} (£${(data.subtotal_pence / 100).toFixed(2)})`);
  console.log(`  Discount: ${data.discount_pence} (£${(data.discount_pence / 100).toFixed(2)})`);
  console.log(`  Total: ${data.total_pence} (£${(data.total_pence / 100).toFixed(2)})`);
  
  if (data.line_items) {
    console.log('\n📋 Line Items:');
    
    if (data.line_items.components) {
      console.log('\n  Components:');
      data.line_items.components.forEach(comp => {
        console.log(`    - ${comp.name}: £${comp.amount.toFixed(2)} (${comp.quantity || 1}x)`);
      });
    }
    
    if (data.line_items.summary) {
      console.log('\n  Summary:');
      console.log(`    Subtotal: £${data.line_items.summary.subtotal}`);
      console.log(`    Discount: £${data.line_items.summary.discount}`);
      console.log(`    Total: £${data.line_items.summary.total}`);
    }
    
    if (data.line_items.meta?.trip) {
      console.log('\n  Trip Metadata:');
      const trip = data.line_items.meta.trip;
      console.log(`    Booking Type: ${trip.bookingType}`);
      console.log(`    Vehicle: ${trip.vehicleType}`);
      console.log(`    Pickup: ${trip.pickup?.address || 'N/A'}`);
      console.log(`    Dropoff: ${trip.dropoff?.address || 'N/A'}`);
      
      if (trip.additionalStops && trip.additionalStops.length > 0) {
        console.log(`    Additional Stops (${trip.additionalStops.length}):`);
        trip.additionalStops.forEach((stop, idx) => {
          console.log(`      ${idx + 1}. ${stop.address}`);
        });
      } else {
        console.log(`    Additional Stops: None`);
      }
      
      if (trip.distance !== undefined) {
        console.log(`    Distance: ${trip.distance} miles`);
      }
      if (trip.duration !== undefined) {
        console.log(`    Duration: ${trip.duration} minutes`);
      }
    }
  }
  
  // Verification checks
  console.log('\n✅ Verification Checks:');
  const checks = [];
  
  if (data.booking_id === null) {
    checks.push('✅ booking_id is NULL (Phase 2A independent quote)');
  } else {
    checks.push('❌ booking_id should be NULL for independent quote');
  }
  
  if (data.subtotal_pence > 0) {
    checks.push('✅ subtotal_pence > 0');
  } else {
    checks.push('⚠️  subtotal_pence is 0');
  }
  
  if (data.total_pence > 0) {
    checks.push('✅ total_pence > 0');
  } else {
    checks.push('⚠️  total_pence is 0');
  }
  
  if (data.line_items?.components) {
    checks.push(`✅ line_items.components present (${data.line_items.components.length} items)`);
  } else {
    checks.push('❌ line_items.components missing');
  }
  
  if (data.line_items?.meta?.trip) {
    checks.push('✅ line_items.meta.trip present');
  } else {
    checks.push('❌ line_items.meta.trip missing');
  }
  
  checks.forEach(check => console.log(`  ${check}`));
  
  console.log('\n');
}

verifyQuote().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
