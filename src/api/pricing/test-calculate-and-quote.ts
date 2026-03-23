/**
 * Test script for Phase 2A calculate-and-quote endpoint
 * 
 * This test:
 * 1. Calls the new endpoint
 * 2. Verifies quote creation in DB
 * 3. Validates response format
 */

import { calculateAndQuote } from './calculate-and-quote';
import { supabase } from '../../config/supabase';

// Mock Express request/response
const mockRequest = {
  body: {
    pickup: 'London Heathrow Airport',
    dropoff: 'Central London',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: '2026-03-24T10:00:00Z',
    distance: 15.5,
    duration: 45
  },
  // Mock auth context
  user: { organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830' }
};

const mockResponse: any = {
  statusCode: 0,
  responseData: null,
  status: function (code: number) {
    this.statusCode = code;
    return this;
  },
  json: function (data: any) {
    this.responseData = data;
    console.log('📊 Response Status:', this.statusCode);
    console.log('📊 Response Data:', JSON.stringify(data, null, 2));
    return this;
  }
};

async function testCalculateAndQuote() {
  console.log('🧪 Testing Phase 2A calculate-and-quote endpoint...');

  try {
    await calculateAndQuote(mockRequest as any, mockResponse as any);

    // Verify response
    if (mockResponse.statusCode === 201 && mockResponse.responseData?.success) {
      console.log('✅ Test PASSED - Phase 2A endpoint working');

      const quoteId = mockResponse.responseData.data?.quoteId;
      const pricing = mockResponse.responseData.data?.pricing;

      if (quoteId && pricing) {
        console.log('✅ Quote ID:', quoteId);
        console.log('✅ Pricing calculated:', pricing.finalPrice, pricing.currency);
        console.log('✅ Quote type:', mockResponse.responseData.data?.quote?.type);

        // Step 2: Verify quote in database
        console.log('🔍 Verifying quote in database...');
        const { data: dbQuote, error } = await supabase
          .from('client_booking_quotes')
          .select('*')
          .eq('id', quoteId)
          .single();

        if (error) {
          console.log('❌ Test FAILED - Database error:', error);
          return;
        }

        if (dbQuote) {
          console.log('✅ Quote found in database');
          console.log('✅ Quote booking_id:', dbQuote.booking_id); // Should be NULL
          console.log('✅ Quote is_current:', dbQuote.is_current); // Should be true
          console.log('✅ Quote organization_id:', dbQuote.organization_id);
          console.log('✅ Quote currency:', dbQuote.currency);

          // Verify financial fields
          console.log('📊 Financial verification:');
          console.log('  DB subtotal_pence:', dbQuote.subtotal_pence);
          console.log('  DB vat_pence:', dbQuote.vat_pence);
          console.log('  DB total_pence:', dbQuote.total_pence);
          console.log('  DB vat_rate:', dbQuote.vat_rate);

          // Verify vehicle/services split
          console.log('🚗 Vehicle/Services split:');
          console.log('  DB vehicle_subtotal_pence:', dbQuote.vehicle_subtotal_pence);
          console.log('  DB services_subtotal_pence:', dbQuote.services_subtotal_pence);

          // Verify Phase 2A properties
          const phase2AChecks = {
            bookingIdIsNull: dbQuote.booking_id === null,
            isCurrentTrue: dbQuote.is_current === true,
            orgIdMatches: dbQuote.organization_id === mockRequest.user.organizationId,
            currencySet: dbQuote.currency === 'GBP',
            // Financial consistency checks
            apiDbConsistency: Number(dbQuote.total_pence) === (pricing.finalPrice * 100),
            vatZeroCorrect: Number(dbQuote.vat_pence) === 0,
            vatRateZeroCorrect: Number(dbQuote.vat_rate) === 0,
            financialsConsistent: Number(dbQuote.total_pence) === (Number(dbQuote.subtotal_pence) + Number(dbQuote.vat_pence) - Number(dbQuote.discount_pence)),
            splitConsistent: Number(dbQuote.subtotal_pence) === (Number(dbQuote.vehicle_subtotal_pence) + Number(dbQuote.services_subtotal_pence)),
            lineItemsSummaryMatch: (
              Number(dbQuote.line_items?.summary?.subtotal_pence) === Number(dbQuote.subtotal_pence) &&
              Number(dbQuote.line_items?.summary?.vat_pence) === Number(dbQuote.vat_pence) &&
              Number(dbQuote.line_items?.summary?.total_pence) === Number(dbQuote.total_pence)
            )
          };

          console.log('🔍 Phase 2A checks:', phase2AChecks);

          const allChecksPass = Object.values(phase2AChecks).every(check => check === true);

          if (allChecksPass) {
            console.log('✅ All Phase 2A properties verified');
            console.log('✅ Financial calculations consistent');
            console.log('🎉 TEST FULLY PASSED - Endpoint + Database verification successful');
          } else {
            console.log('❌ Test FAILED - Some Phase 2A properties incorrect');
            const failedChecks = Object.entries(phase2AChecks).filter(([_, value]) => !value);
            console.log('Failed checks:', failedChecks);
          }
        } else {
          console.log('❌ Test FAILED - Quote not found in database');
        }
      } else {
        console.log('❌ Test FAILED - Missing quoteId or pricing in response');
      }
    } else {
      console.log('❌ Test FAILED - Endpoint returned error:', mockResponse.responseData);
    }

  } catch (error) {
    console.error('❌ Test FAILED - Exception:', error);
  }
}

// Export for manual testing
export { testCalculateAndQuote };

// Auto-run if this file is executed directly
if (require.main === module) {
  testCalculateAndQuote();
}
