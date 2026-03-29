/**
 * Manual Test for Dual Quote Stop Pricing Logic
 * 
 * This test demonstrates the dual quote pricing functionality
 * without requiring the persistence layer to be complete.
 * 
 * Run: npx ts-node test-dual-quote.ts
 */

import { handleOneWayPricing } from './src/handlers/oneWayPricingHandler';
import { BookingType, VehicleType } from './src/types/pricing.types';

async function testDualQuotePricing() {
  console.log('🧪 Testing Dual Quote Stop Pricing Logic\n');
  console.log('='.repeat(60));

  // Test Case 1: Small detour (should use direct quote with grace)
  console.log('\n📍 TEST 1: Small Detour (< threshold)');
  console.log('Expected: Grace applied, direct quote used\n');

  const testRequest1 = {
    bookingType: BookingType.ONE_WAY as BookingType.ONE_WAY,
    vehicleType: VehicleType.EXECUTIVE,
    dateTime: new Date().toISOString(),
    pickup: {
      address: 'Heathrow Airport, London, UK',
      coordinates: { lat: 51.4700, lng: -0.4543 }
    },
    dropoff: {
      address: 'Central London, UK',
      coordinates: { lat: 51.5074, lng: -0.1278 }
    },
    // Small detour - stop is almost on the way
    additionalStops: [{
      address: 'Hammersmith, London, UK',
      coordinates: { lat: 51.4927, lng: -0.2339 }
    }],
    distance: 18.5,  // Full route with stop
    duration: 45,    // Full route with stop
    extras: [],
    organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830'
  };

  try {
    const result1 = await handleOneWayPricing({
      request: testRequest1
    });

    if (result1.success) {
      console.log('✅ Pricing calculated successfully');
      console.log(`💰 Final Price: £${result1.finalPrice?.toFixed(2)}`);

      if (result1.routeMetrics) {
        console.log('\n📊 Route Metrics:');
        console.log(`  Direct Distance: ${result1.routeMetrics.directDistance?.toFixed(2)} miles`);
        console.log(`  Full Distance: ${result1.routeMetrics.fullDistance?.toFixed(2)} miles`);
        console.log(`  Detour: ${result1.routeMetrics.detourDistance?.toFixed(2)} miles`);
        console.log(`  Detour Time: ${result1.routeMetrics.detourDuration} minutes`);
      }

      if (result1.dualQuotePricing) {
        console.log('\n💡 Pricing Decision:');
        console.log(`  Direct Quote: £${(result1.dualQuotePricing.directQuotePence / 100).toFixed(2)}`);
        console.log(`  Full Quote: £${(result1.dualQuotePricing.fullQuotePence / 100).toFixed(2)}`);
        console.log(`  Grace Applied: ${result1.dualQuotePricing.stopGraceApplied ? '✅ YES' : '❌ NO'}`);
        console.log(`  Strategy: ${result1.dualQuotePricing.pricingStrategy.toUpperCase()}`);
        console.log(`  Threshold: ${result1.dualQuotePricing.graceThresholdMiles} miles / ${result1.dualQuotePricing.graceThresholdMinutes} min`);
      }
    } else {
      console.log('❌ Error:', result1.error);
    }
  } catch (error) {
    console.log('❌ Test failed:', error instanceof Error ? error.message : error);
  }

  // Test Case 2: Large detour (should use full quote)
  console.log('\n' + '='.repeat(60));
  console.log('\n📍 TEST 2: Large Detour (> threshold)');
  console.log('Expected: Grace NOT applied, full quote used\n');

  const testRequest2 = {
    bookingType: BookingType.ONE_WAY as BookingType.ONE_WAY,
    vehicleType: VehicleType.EXECUTIVE,
    dateTime: new Date().toISOString(),
    pickup: {
      address: 'Heathrow Airport, London, UK',
      coordinates: { lat: 51.4700, lng: -0.4543 }
    },
    dropoff: {
      address: 'Central London, UK',
      coordinates: { lat: 51.5074, lng: -0.1278 }
    },
    // Large detour - stop is way off route
    additionalStops: [{
      address: 'Oxford, UK',
      coordinates: { lat: 51.7520, lng: -1.2577 }
    }],
    distance: 75,    // Full route with big detour
    duration: 120,   // Full route with big detour
    extras: [],
    organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830'
  };

  try {
    const result2 = await handleOneWayPricing({
      request: testRequest2
    });

    if (result2.success) {
      console.log('✅ Pricing calculated successfully');
      console.log(`💰 Final Price: £${result2.finalPrice?.toFixed(2)}`);

      if (result2.routeMetrics) {
        console.log('\n📊 Route Metrics:');
        console.log(`  Direct Distance: ${result2.routeMetrics.directDistance?.toFixed(2)} miles`);
        console.log(`  Full Distance: ${result2.routeMetrics.fullDistance?.toFixed(2)} miles`);
        console.log(`  Detour: ${result2.routeMetrics.detourDistance?.toFixed(2)} miles`);
        console.log(`  Detour Time: ${result2.routeMetrics.detourDuration} minutes`);
      }

      if (result2.dualQuotePricing) {
        console.log('\n💡 Pricing Decision:');
        console.log(`  Direct Quote: £${(result2.dualQuotePricing.directQuotePence / 100).toFixed(2)}`);
        console.log(`  Full Quote: £${(result2.dualQuotePricing.fullQuotePence / 100).toFixed(2)}`);
        console.log(`  Grace Applied: ${result2.dualQuotePricing.stopGraceApplied ? '✅ YES' : '❌ NO'}`);
        console.log(`  Strategy: ${result2.dualQuotePricing.pricingStrategy.toUpperCase()}`);
        console.log(`  Threshold: ${result2.dualQuotePricing.graceThresholdMiles} miles / ${result2.dualQuotePricing.graceThresholdMinutes} min`);
      }
    } else {
      console.log('❌ Error:', result2.error);
    }
  } catch (error) {
    console.log('❌ Test failed:', error instanceof Error ? error.message : error);
  }

  // Test Case 3: Legacy mode (flag OFF)
  console.log('\n' + '='.repeat(60));
  console.log('\n📍 TEST 3: Legacy Mode (Feature Flag OFF)');
  console.log('Expected: Flat £15 per stop fee\n');
  console.log('ℹ️  To test this, set enable_dual_quote_stop_logic = false in DB');
  console.log('   or set DISABLE_DUAL_QUOTE_STOP_LOGIC=true in env\n');

  console.log('='.repeat(60));
  console.log('\n✅ Tests completed!\n');
}

// Run tests
testDualQuotePricing().catch(console.error);
