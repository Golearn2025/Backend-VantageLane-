/**
 * Vantage Lane Pricing System - E2E Functional Test Runner
 * 
 * Tests the complete pricing pipeline:
 * - Pricing calculation
 * - VAT calculation
 * - Commission calculation
 * - Quote persistence
 * - Booking confirmation
 * - Financial snapshot creation
 * 
 * Usage: node pricing-test-runner.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ORGANIZATION_ID = '9a5caade-4791-4860-93b5-c704eb580223';

// Test results storage
const testResults = [];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70) + '\n');
}

function logSubSection(title) {
  log(`\n${title}`, 'cyan');
  console.log('-'.repeat(70));
}

/**
 * Call pricing endpoint with commissions
 */
async function calculatePricing(scenario, requestData) {
  try {
    log(`📊 Calculating pricing for: ${scenario}`, 'blue');
    
    const response = await axios.post(
      `${BASE_URL}/api/pricing/calculate-with-commissions`,
      {
        ...requestData,
        organizationId: ORGANIZATION_ID
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.data.success) {
      throw new Error(`Pricing calculation failed: ${response.data.error}`);
    }

    return response.data;
  } catch (error) {
    log(`❌ Error calculating pricing: ${error.message}`, 'red');
    if (error.response) {
      log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    throw error;
  }
}

/**
 * Confirm booking and create financial snapshot
 */
async function confirmBooking(quoteId, scenario) {
  try {
    log(`📝 Confirming booking for: ${scenario}`, 'blue');
    
    const bookingId = `test-booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await axios.post(
      `${BASE_URL}/api/booking/confirm`,
      {
        quoteId: quoteId,
        bookingId: bookingId,
        organizationId: ORGANIZATION_ID
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.data.success) {
      throw new Error(`Booking confirmation failed: ${response.data.error}`);
    }

    return {
      bookingId,
      ...response.data.data
    };
  } catch (error) {
    log(`❌ Error confirming booking: ${error.message}`, 'red');
    if (error.response) {
      log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    throw error;
  }
}

/**
 * Run a single test scenario
 */
async function runTest(testNumber, scenario, requestData, verifications) {
  logSection(`TEST ${testNumber} — ${scenario}`);
  
  try {
    // Step 1: Calculate pricing
    log('Step 1: Calculate pricing with commissions', 'yellow');
    const pricingResult = await calculatePricing(scenario, requestData);
    
    // Log pricing breakdown
    logSubSection('Pricing Result');
    log(`Final Price: £${pricingResult.finalPrice?.toFixed(2) || 'N/A'}`, 'green');
    
    if (pricingResult.pricing) {
      log(`Price Before VAT: £${pricingResult.pricing.priceBeforeVAT?.toFixed(2) || 'N/A'}`);
      log(`VAT Amount (${(pricingResult.pricing.vatRate * 100).toFixed(0)}%): £${pricingResult.pricing.vatAmount?.toFixed(2) || 'N/A'}`);
      log(`Price With VAT: £${pricingResult.pricing.priceWithVAT?.toFixed(2) || 'N/A'}`, 'green');
    }
    
    if (pricingResult.commissions) {
      logSubSection('Commission Breakdown');
      log(`Platform Fee (${(pricingResult.commissions.platformCommissionPct * 100).toFixed(0)}%): £${pricingResult.commissions.platformFee?.toFixed(2) || 'N/A'}`);
      log(`Operator Net: £${pricingResult.commissions.operatorNet?.toFixed(2) || 'N/A'}`);
      log(`Operator Commission (${(pricingResult.commissions.operatorCommissionPct * 100).toFixed(0)}%): £${pricingResult.commissions.operatorCommission?.toFixed(2) || 'N/A'}`);
      log(`Driver Payout: £${pricingResult.commissions.driverPayout?.toFixed(2) || 'N/A'}`, 'green');
    }
    
    if (pricingResult.breakdown) {
      logSubSection('Fee Breakdown');
      log(`Base Fare: £${pricingResult.breakdown.baseFare?.toFixed(2) || '0.00'}`);
      log(`Distance Fee: £${pricingResult.breakdown.distanceFee?.toFixed(2) || '0.00'}`);
      log(`Time Fee: £${pricingResult.breakdown.timeFee?.toFixed(2) || '0.00'}`);
      log(`Additional Fees: £${pricingResult.breakdown.additionalFees?.toFixed(2) || '0.00'}`);
      log(`Services: £${pricingResult.breakdown.services?.toFixed(2) || '0.00'}`);
      log(`Subtotal: £${pricingResult.breakdown.subtotal?.toFixed(2) || '0.00'}`);
      log(`Discounts: £${pricingResult.breakdown.discounts?.toFixed(2) || '0.00'}`);
    }
    
    logSubSection('Quote Information');
    log(`Quote ID: ${pricingResult.quote_id || 'N/A'}`, 'cyan');
    log(`Leg Quote IDs: ${pricingResult.leg_quote_ids?.length || 0} legs`, 'cyan');
    
    if (pricingResult.legs && pricingResult.legs.length > 0) {
      log(`\nLegs Generated: ${pricingResult.legs.length}`);
      pricingResult.legs.forEach((leg, idx) => {
        log(`  Leg ${idx + 1}: ${leg.leg_type} - £${leg.pricing?.leg_price?.toFixed(2) || 'N/A'}`);
      });
    }
    
    if (pricingResult.fleet_summary) {
      log(`\nFleet Summary:`);
      pricingResult.fleet_summary.forEach((vehicle, idx) => {
        log(`  ${vehicle.vehicle_category}: ${vehicle.count} vehicles - £${vehicle.total_price?.toFixed(2) || 'N/A'}`);
      });
    }
    
    // Step 2: Verify quote_id exists
    if (!pricingResult.quote_id) {
      throw new Error('quote_id not returned in pricing response');
    }
    
    // Step 3: Confirm booking
    log('\nStep 2: Confirm booking and create financial snapshot', 'yellow');
    const bookingResult = await confirmBooking(pricingResult.quote_id, scenario);
    
    logSubSection('Booking Confirmation Result');
    log(`Booking ID: ${bookingResult.bookingId}`, 'cyan');
    log(`Quote ID: ${bookingResult.quote_id}`, 'cyan');
    log(`Booking Financial ID: ${bookingResult.booking_financial_id}`, 'cyan');
    log(`Leg Financial IDs: ${bookingResult.leg_financial_ids?.length || 0} records`, 'cyan');
    log(`Line Item IDs: ${bookingResult.line_item_ids?.length || 0} items`, 'cyan');
    
    // Step 4: Run verifications
    logSubSection('Verifications');
    const verificationResults = [];
    
    for (const verification of verifications) {
      const result = verification(pricingResult, bookingResult);
      verificationResults.push(result);
      
      if (result.passed) {
        log(`✅ ${result.description}`, 'green');
      } else {
        log(`❌ ${result.description}: ${result.error}`, 'red');
      }
    }
    
    const allPassed = verificationResults.every(v => v.passed);
    
    // Store test result
    testResults.push({
      testNumber,
      scenario,
      passed: allPassed,
      finalPrice: pricingResult.finalPrice,
      priceBeforeVAT: pricingResult.pricing?.priceBeforeVAT,
      vatAmount: pricingResult.pricing?.vatAmount,
      priceWithVAT: pricingResult.pricing?.priceWithVAT,
      platformFee: pricingResult.commissions?.platformFee,
      driverPayout: pricingResult.commissions?.driverPayout,
      quoteId: pricingResult.quote_id,
      bookingId: bookingResult.bookingId,
      legsCount: pricingResult.legs?.length || 0,
      verifications: verificationResults
    });
    
    if (allPassed) {
      log(`\n✅ TEST ${testNumber} PASSED`, 'green');
    } else {
      log(`\n❌ TEST ${testNumber} FAILED`, 'red');
    }
    
  } catch (error) {
    log(`\n❌ TEST ${testNumber} ERROR: ${error.message}`, 'red');
    testResults.push({
      testNumber,
      scenario,
      passed: false,
      error: error.message
    });
  }
}

/**
 * Verification helper functions
 */
const verifications = {
  hasFinalPrice: (pricing) => ({
    passed: pricing.finalPrice > 0,
    description: 'Has final price',
    error: pricing.finalPrice ? null : 'Final price is 0 or missing'
  }),
  
  hasVAT: (pricing) => ({
    passed: pricing.pricing?.vatAmount > 0,
    description: 'VAT calculated',
    error: pricing.pricing?.vatAmount ? null : 'VAT amount is 0 or missing'
  }),
  
  hasCommissions: (pricing) => ({
    passed: pricing.commissions?.platformFee > 0 && pricing.commissions?.driverPayout > 0,
    description: 'Commissions calculated',
    error: !pricing.commissions ? 'Commissions missing' : 'Platform fee or driver payout is 0'
  }),
  
  hasQuoteId: (pricing) => ({
    passed: !!pricing.quote_id,
    description: 'Quote ID generated',
    error: 'Quote ID missing'
  }),
  
  hasLegs: (expectedCount) => (pricing) => ({
    passed: (pricing.legs?.length || 0) === expectedCount,
    description: `Has ${expectedCount} leg(s)`,
    error: `Expected ${expectedCount} legs, got ${pricing.legs?.length || 0}`
  }),
  
  hasFleetSummary: (pricing) => ({
    passed: !!pricing.fleet_summary && pricing.fleet_summary.length > 0,
    description: 'Fleet summary generated',
    error: 'Fleet summary missing'
  }),
  
  bookingConfirmed: (pricing, booking) => ({
    passed: !!booking.booking_financial_id,
    description: 'Booking financial snapshot created',
    error: 'Booking financial ID missing'
  }),
  
  hasLineItems: (pricing, booking) => ({
    passed: booking.line_item_ids?.length > 0,
    description: 'Line items created',
    error: 'No line items created'
  }),
  
  vatConsistency: (pricing) => {
    const priceBeforeVAT = pricing.pricing?.priceBeforeVAT || 0;
    const vatAmount = pricing.pricing?.vatAmount || 0;
    const priceWithVAT = pricing.pricing?.priceWithVAT || 0;
    const calculated = priceBeforeVAT + vatAmount;
    const diff = Math.abs(calculated - priceWithVAT);
    
    return {
      passed: diff < 0.01,
      description: 'VAT calculation consistency',
      error: diff >= 0.01 ? `Price mismatch: ${priceBeforeVAT} + ${vatAmount} = ${calculated}, but priceWithVAT = ${priceWithVAT}` : null
    };
  }
};

/**
 * Test Scenarios
 */
async function runAllTests() {
  logSection('🚗 VANTAGE LANE PRICING SYSTEM - E2E FUNCTIONAL TESTS');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  log(`Organization ID: ${ORGANIZATION_ID}`, 'cyan');
  log(`Started at: ${new Date().toISOString()}`, 'cyan');
  
  // TEST 1 — Short city trip
  await runTest(
    1,
    'Short City Trip (5km, 15min)',
    {
      pickup: 'Central London',
      dropoff: 'Canary Wharf',
      vehicleType: 'executive',
      bookingType: 'one_way',
      dateTime: new Date().toISOString(),
      distance: 5,
      duration: 15
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.bookingConfirmed,
      verifications.hasLineItems,
      verifications.vatConsistency
    ]
  );
  
  // TEST 2 — Medium city trip
  await runTest(
    2,
    'Medium City Trip (20km, 35min)',
    {
      pickup: 'Central London',
      dropoff: 'Heathrow Airport',
      vehicleType: 'executive',
      bookingType: 'one_way',
      dateTime: new Date().toISOString(),
      distance: 20,
      duration: 35
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // TEST 3 — Long distance trip
  await runTest(
    3,
    'Long Distance Trip (120km, 120min)',
    {
      pickup: 'London',
      dropoff: 'Birmingham',
      vehicleType: 'executive',
      bookingType: 'one_way',
      dateTime: new Date().toISOString(),
      distance: 120,
      duration: 120
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // TEST 4 — Hourly booking
  await runTest(
    4,
    'Hourly Booking (4 hours)',
    {
      pickup: 'Central London',
      dropoff: 'Central London',
      vehicleType: 'executive',
      bookingType: 'hourly',
      dateTime: new Date().toISOString(),
      hours: 4
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // TEST 5 — Daily booking
  await runTest(
    5,
    'Daily Booking (2 days)',
    {
      pickup: 'Central London',
      dropoff: 'Central London',
      vehicleType: 'executive',
      bookingType: 'daily',
      dateTime: new Date().toISOString(),
      days: 2
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // TEST 6 — Airport transfer
  await runTest(
    6,
    'Airport Transfer (LHR to Central London)',
    {
      pickup: 'London Heathrow Airport',
      dropoff: 'Central London',
      vehicleType: 'executive',
      bookingType: 'one_way',
      dateTime: new Date().toISOString(),
      distance: 25,
      duration: 45
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // TEST 7 — Return trip
  await runTest(
    7,
    'Return Trip (25km, 45min each way)',
    {
      pickup: 'Central London',
      dropoff: 'Heathrow Airport',
      vehicleType: 'executive',
      bookingType: 'return',
      dateTime: new Date().toISOString(),
      distance: 25,
      duration: 45
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.hasLegs(2),
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // TEST 8 — Fleet booking
  await runTest(
    8,
    'Fleet Booking (3 vehicles)',
    {
      pickup: 'Central London',
      dropoff: 'Heathrow Airport',
      vehicleType: 'executive',
      bookingType: 'fleet',
      dateTime: new Date().toISOString(),
      distance: 25,
      duration: 45,
      fleetConfig: {
        vehicles: [
          { type: 'executive', count: 2 },
          { type: 'luxury', count: 1 }
        ]
      }
    },
    [
      verifications.hasFinalPrice,
      verifications.hasVAT,
      verifications.hasCommissions,
      verifications.hasQuoteId,
      verifications.hasFleetSummary,
      verifications.bookingConfirmed,
      verifications.vatConsistency
    ]
  );
  
  // Print summary
  printSummary();
}

/**
 * Print test summary
 */
function printSummary() {
  logSection('📊 TEST SUMMARY');
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;
  
  log(`Total Tests: ${total}`, 'cyan');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`, failed > 0 ? 'yellow' : 'green');
  
  // Summary table
  console.log('┌────┬─────────────────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ #  │ Scenario                            │ Status │ Price    │ VAT      │ Platform │ Driver   │');
  console.log('├────┼─────────────────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┤');
  
  testResults.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const price = result.finalPrice ? `£${result.finalPrice.toFixed(2)}` : 'N/A';
    const vat = result.vatAmount ? `£${result.vatAmount.toFixed(2)}` : 'N/A';
    const platform = result.platformFee ? `£${result.platformFee.toFixed(2)}` : 'N/A';
    const driver = result.driverPayout ? `£${result.driverPayout.toFixed(2)}` : 'N/A';
    
    console.log(
      `│ ${String(result.testNumber).padEnd(2)} │ ` +
      `${result.scenario.padEnd(35)} │ ` +
      `${status.padEnd(6)} │ ` +
      `${price.padEnd(8)} │ ` +
      `${vat.padEnd(8)} │ ` +
      `${platform.padEnd(8)} │ ` +
      `${driver.padEnd(8)} │`
    );
  });
  
  console.log('└────┴─────────────────────────────────────┴────────┴──────────┴──────────┴──────────┴──────────┘\n');
  
  // Failed tests details
  if (failed > 0) {
    logSection('❌ FAILED TESTS DETAILS');
    testResults.filter(r => !r.passed).forEach(result => {
      log(`\nTest ${result.testNumber}: ${result.scenario}`, 'red');
      if (result.error) {
        log(`  Error: ${result.error}`, 'red');
      }
      if (result.verifications) {
        result.verifications.filter(v => !v.passed).forEach(v => {
          log(`  ❌ ${v.description}: ${v.error}`, 'red');
        });
      }
    });
  }
  
  // Final verdict
  logSection(failed === 0 ? '✅ ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION' : '❌ SOME TESTS FAILED - REVIEW REQUIRED');
  
  log(`Completed at: ${new Date().toISOString()}`, 'cyan');
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check if server is running
    try {
      await axios.get(`${BASE_URL}/health`);
      log('✅ Backend server is running\n', 'green');
    } catch (error) {
      log('❌ Backend server is not running!', 'red');
      log('Please start the server with: npm run dev', 'yellow');
      process.exit(1);
    }
    
    // Run all tests
    await runAllTests();
    
    // Exit with appropriate code
    const allPassed = testResults.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main();
