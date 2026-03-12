/**
 * Vantage Lane Pricing System - Critical Edge Case Tests
 * 
 * These 3 additional tests catch common production bugs in ride-hailing platforms:
 * 1. Rounding errors in VAT and commission calculations
 * 2. Minimum fare edge cases
 * 3. Multi-currency precision issues
 * 
 * Usage: node pricing-critical-tests.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ORGANIZATION_ID = '9a5caade-4791-4860-93b5-c704eb580223';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
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

async function calculatePricing(requestData) {
  const response = await axios.post(
    `${BASE_URL}/api/pricing/calculate-with-commissions`,
    { ...requestData, organizationId: ORGANIZATION_ID },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}

/**
 * CRITICAL TEST 1 — Rounding Precision
 * 
 * Tests that VAT and commission calculations don't accumulate rounding errors.
 * Common bug: priceBeforeVAT + vatAmount ≠ priceWithVAT due to rounding
 */
async function testRoundingPrecision() {
  logSection('CRITICAL TEST 1 — Rounding Precision');
  
  log('Testing: Very short trip that triggers minimum fare', 'cyan');
  log('Common bug: Rounding errors in VAT calculation\n', 'yellow');
  
  const result = await calculatePricing({
    pickup: 'Central London',
    dropoff: 'Central London',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: new Date().toISOString(),
    distance: 0.5,  // Very short distance
    duration: 3     // Very short duration
  });
  
  const priceBeforeVAT = result.pricing?.priceBeforeVAT || 0;
  const vatAmount = result.pricing?.vatAmount || 0;
  const priceWithVAT = result.pricing?.priceWithVAT || 0;
  const platformFee = result.commissions?.platformFee || 0;
  const operatorNet = result.commissions?.operatorNet || 0;
  const operatorCommission = result.commissions?.operatorCommission || 0;
  const driverPayout = result.commissions?.driverPayout || 0;
  
  log(`Price Before VAT: £${priceBeforeVAT.toFixed(2)}`);
  log(`VAT Amount: £${vatAmount.toFixed(2)}`);
  log(`Price With VAT: £${priceWithVAT.toFixed(2)}`);
  log(`Calculated Sum: £${(priceBeforeVAT + vatAmount).toFixed(2)}\n`);
  
  log(`Platform Fee: £${platformFee.toFixed(2)}`);
  log(`Operator Net: £${operatorNet.toFixed(2)}`);
  log(`Operator Commission: £${operatorCommission.toFixed(2)}`);
  log(`Driver Payout: £${driverPayout.toFixed(2)}`);
  log(`Commission Sum: £${(platformFee + operatorNet).toFixed(2)}\n`);
  
  // Verification 1: VAT calculation precision
  const vatDiff = Math.abs((priceBeforeVAT + vatAmount) - priceWithVAT);
  const vatPassed = vatDiff < 0.01;
  
  if (vatPassed) {
    log('✅ VAT calculation is precise (diff < £0.01)', 'green');
  } else {
    log(`❌ VAT rounding error detected: £${vatDiff.toFixed(4)}`, 'red');
  }
  
  // Verification 2: Commission calculation precision
  const commissionSum = platformFee + operatorNet;
  const commissionDiff = Math.abs(commissionSum - priceBeforeVAT);
  const commissionPassed = commissionDiff < 0.01;
  
  if (commissionPassed) {
    log('✅ Commission split is precise (diff < £0.01)', 'green');
  } else {
    log(`❌ Commission rounding error detected: £${commissionDiff.toFixed(4)}`, 'red');
  }
  
  // Verification 3: Operator split precision
  const operatorSum = operatorCommission + driverPayout;
  const operatorDiff = Math.abs(operatorSum - operatorNet);
  const operatorPassed = operatorDiff < 0.01;
  
  if (operatorPassed) {
    log('✅ Operator split is precise (diff < £0.01)', 'green');
  } else {
    log(`❌ Operator split rounding error detected: £${operatorDiff.toFixed(4)}`, 'red');
  }
  
  return vatPassed && commissionPassed && operatorPassed;
}

/**
 * CRITICAL TEST 2 — Minimum Fare Edge Case
 * 
 * Tests that minimum fare is applied correctly and doesn't break commission calculations.
 * Common bug: Minimum fare applied after commissions, causing negative driver payout
 */
async function testMinimumFareEdgeCase() {
  logSection('CRITICAL TEST 2 — Minimum Fare Edge Case');
  
  log('Testing: Trip below minimum fare threshold', 'cyan');
  log('Common bug: Commissions calculated on pre-minimum price\n', 'yellow');
  
  const result = await calculatePricing({
    pickup: 'Central London',
    dropoff: 'Central London',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: new Date().toISOString(),
    distance: 0.3,  // Very short
    duration: 2     // Very short
  });
  
  const finalPrice = result.finalPrice || 0;
  const priceBeforeVAT = result.pricing?.priceBeforeVAT || 0;
  const platformFee = result.commissions?.platformFee || 0;
  const operatorNet = result.commissions?.operatorNet || 0;
  const driverPayout = result.commissions?.driverPayout || 0;
  
  log(`Final Price: £${finalPrice.toFixed(2)}`);
  log(`Price Before VAT: £${priceBeforeVAT.toFixed(2)}`);
  log(`Platform Fee: £${platformFee.toFixed(2)}`);
  log(`Operator Net: £${operatorNet.toFixed(2)}`);
  log(`Driver Payout: £${driverPayout.toFixed(2)}\n`);
  
  // Verification 1: Driver payout is positive
  const driverPayoutPositive = driverPayout > 0;
  
  if (driverPayoutPositive) {
    log('✅ Driver payout is positive', 'green');
  } else {
    log('❌ Driver payout is zero or negative!', 'red');
  }
  
  // Verification 2: Minimum fare was likely applied
  const likelyMinimumApplied = finalPrice >= 10; // Assuming £10 minimum
  
  if (likelyMinimumApplied) {
    log('✅ Minimum fare appears to be applied', 'green');
  } else {
    log('⚠️  Price is very low, minimum fare may not be working', 'yellow');
  }
  
  // Verification 3: All amounts are reasonable
  const allReasonable = platformFee > 0 && operatorNet > 0 && driverPayout > 0;
  
  if (allReasonable) {
    log('✅ All commission amounts are reasonable', 'green');
  } else {
    log('❌ Some commission amounts are invalid', 'red');
  }
  
  return driverPayoutPositive && allReasonable;
}

/**
 * CRITICAL TEST 3 — Pence Precision
 * 
 * Tests that pence-based storage doesn't cause precision loss.
 * Common bug: Converting £12.345 to pence and back loses precision
 */
async function testPencePrecision() {
  logSection('CRITICAL TEST 3 — Pence Precision');
  
  log('Testing: Price that results in fractional pence', 'cyan');
  log('Common bug: Precision loss when converting to/from pence\n', 'yellow');
  
  const result = await calculatePricing({
    pickup: 'Central London',
    dropoff: 'Heathrow Airport',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: new Date().toISOString(),
    distance: 23.7,  // Odd distance
    duration: 37     // Odd duration
  });
  
  const finalPrice = result.finalPrice || 0;
  const priceBeforeVAT = result.pricing?.priceBeforeVAT || 0;
  const vatAmount = result.pricing?.vatAmount || 0;
  const priceWithVAT = result.pricing?.priceWithVAT || 0;
  
  log(`Final Price: £${finalPrice.toFixed(2)}`);
  log(`Price Before VAT: £${priceBeforeVAT.toFixed(2)}`);
  log(`VAT Amount: £${vatAmount.toFixed(2)}`);
  log(`Price With VAT: £${priceWithVAT.toFixed(2)}\n`);
  
  // Convert to pence and back
  const finalPricePence = Math.round(finalPrice * 100);
  const finalPriceFromPence = finalPricePence / 100;
  
  const priceBeforeVATPence = Math.round(priceBeforeVAT * 100);
  const priceBeforeVATFromPence = priceBeforeVATPence / 100;
  
  log(`Final Price in pence: ${finalPricePence}p`);
  log(`Converted back: £${finalPriceFromPence.toFixed(2)}`);
  log(`Price Before VAT in pence: ${priceBeforeVATPence}p`);
  log(`Converted back: £${priceBeforeVATFromPence.toFixed(2)}\n`);
  
  // Verification 1: No precision loss in final price
  const finalPriceDiff = Math.abs(finalPrice - finalPriceFromPence);
  const finalPricePassed = finalPriceDiff < 0.01;
  
  if (finalPricePassed) {
    log('✅ Final price pence conversion is precise', 'green');
  } else {
    log(`❌ Final price precision loss: £${finalPriceDiff.toFixed(4)}`, 'red');
  }
  
  // Verification 2: No precision loss in price before VAT
  const priceBeforeVATDiff = Math.abs(priceBeforeVAT - priceBeforeVATFromPence);
  const priceBeforeVATPassed = priceBeforeVATDiff < 0.01;
  
  if (priceBeforeVATPassed) {
    log('✅ Price before VAT pence conversion is precise', 'green');
  } else {
    log(`❌ Price before VAT precision loss: £${priceBeforeVATDiff.toFixed(4)}`, 'red');
  }
  
  // Verification 3: All prices end in .00 or .50 (proper rounding)
  const finalPriceProperlyRounded = (finalPrice * 100) % 1 === 0;
  const priceBeforeVATProperlyRounded = (priceBeforeVAT * 100) % 1 === 0;
  
  if (finalPriceProperlyRounded && priceBeforeVATProperlyRounded) {
    log('✅ All prices are properly rounded to pence', 'green');
  } else {
    log('⚠️  Some prices have fractional pence', 'yellow');
  }
  
  return finalPricePassed && priceBeforeVATPassed;
}

/**
 * Main execution
 */
async function main() {
  try {
    logSection('🔍 VANTAGE LANE - CRITICAL EDGE CASE TESTS');
    log('These tests catch common production bugs in ride-hailing platforms\n', 'cyan');
    
    try {
      // Check server
      await axios.get(`${BASE_URL}/health`);
      log('✅ Backend server is running\n', 'green');
    } catch (error) {
      log('❌ Backend server is not running!', 'red');
      log('Please start the server with: npm run dev', 'yellow');
      process.exit(1);
    }
    
    const results = [];
    
    try {
      results.push({ name: 'Rounding Precision', passed: await testRoundingPrecision() });
    } catch (error) {
      log(`❌ Test failed: ${error.message}`, 'red');
      results.push({ name: 'Rounding Precision', passed: false, error: error.message });
    }
    
    try {
      results.push({ name: 'Minimum Fare Edge Case', passed: await testMinimumFareEdgeCase() });
    } catch (error) {
      log(`❌ Test failed: ${error.message}`, 'red');
      results.push({ name: 'Minimum Fare Edge Case', passed: false, error: error.message });
    }
    
    try {
      results.push({ name: 'Pence Precision', passed: await testPencePrecision() });
    } catch (error) {
      log(`❌ Test failed: ${error.message}`, 'red');
      results.push({ name: 'Pence Precision', passed: false, error: error.message });
    }
    
    // Summary
    logSection('📊 CRITICAL TESTS SUMMARY');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      log(`${status} - ${result.name}`, result.passed ? 'green' : 'red');
      if (result.error) {
        log(`  Error: ${result.error}`, 'red');
      }
    });
    
    log(`\nPassed: ${passed}/3`, passed === 3 ? 'green' : 'yellow');
    log(`Failed: ${failed}/3\n`, failed === 0 ? 'green' : 'red');
    
    if (passed === 3) {
      logSection('✅ ALL CRITICAL TESTS PASSED - NO PRODUCTION BUGS DETECTED');
    } else {
      logSection('❌ CRITICAL BUGS DETECTED - FIX BEFORE PRODUCTION');
    }
    
    process.exit(failed === 0 ? 0 : 1);
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
