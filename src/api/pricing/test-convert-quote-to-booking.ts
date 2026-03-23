/**
 * Phase 2B: Test convert quote to booking endpoint
 */

import { QuoteService } from '../../services/QuoteService';
import { supabase } from '../../config/supabase';

// Mock request/response objects
const mockRequest = {
  body: {
    quoteId: 'test-quote-id',
    customerData: {
      customerId: 'test-customer-id',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+447700900123'
    },
    bookingData: {
      passengerCount: 1,
      bagCount: 2,
      notes: 'Test booking notes',
      preferences: {
        vehiclePreference: 'executive',
        musicPreference: 'classical'
      }
    }
  },
  user: {
    organizationId: '9a5caade-4791-4860-93b5-12b1c4fa9830'
  }
};

const mockResponse = {
  status: function (code: number) {
    this.statusCode = code;
    return this;
  },
  json: function (data: any) {
    this.responseData = data;
    return this;
  },
  responseData: null as any,
  statusCode: null as number | null
};

async function testConvertQuoteToBooking() {
  console.log('🧪 Testing Phase 2B: Convert Quote to Booking');
  console.log('=====================================');

  try {
    // Step 1: Create an independent quote first (Phase 2A)
    console.log('📝 Step 1: Creating independent quote...');

    // This would normally be done via the calculate-and-quote endpoint
    // For testing, we'll assume we have a quote ID
    const testQuoteId = 'eef4d2de-48ba-4a0d-8cf2-3a9c687d92cf'; // Use existing quote

    console.log(`✅ Using existing quote: ${testQuoteId}`);

    // Step 2: Test quote to booking conversion
    console.log('🔄 Step 2: Converting quote to booking...');

    const result = await QuoteService.convertQuoteToBooking(
      testQuoteId,
      mockRequest.body.customerData,
      mockRequest.body.bookingData
    );

    console.log('📊 Conversion Result:', result);

    if (result.success) {
      console.log('✅ Quote successfully converted to booking');
      console.log(`  Booking ID: ${result.bookingId}`);
      console.log(`  Quote ID: ${result.quoteId}`);

      // Step 3: Verify database state
      console.log('🔍 Step 3: Verifying database state...');

      // Check quote is updated
      const { data: updatedQuote, error: quoteError } = await supabase
        .from('client_booking_quotes')
        .select('booking_id, is_current')
        .eq('id', testQuoteId)
        .single();

      if (quoteError) {
        console.log('❌ Error checking updated quote:', quoteError);
        return;
      }

      console.log('✅ Quote updated in database:');
      console.log('  booking_id:', updatedQuote.booking_id);
      console.log('  is_current:', updatedQuote.is_current);

      // Check booking exists
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, customer_id, organization_id, status, reference')
        .eq('id', result.bookingId!)
        .single();

      if (bookingError) {
        console.log('❌ Error checking booking:', bookingError);
        return;
      }

      console.log('✅ Booking created in database:');
      console.log('  id:', booking.id);
      console.log('  customer_id:', booking.customer_id);
      console.log('  organization_id:', booking.organization_id);
      console.log('  status:', booking.status);
      console.log('  reference:', booking.reference);

      // Check booking legs
      const { data: legs, error: legsError } = await supabase
        .from('booking_legs')
        .select('id, leg_number, pickup_address, dropoff_address, status')
        .eq('booking_id', result.bookingId!);

      if (legsError) {
        console.log('❌ Error checking booking legs:', legsError);
        return;
      }

      console.log('✅ Booking legs created:');
      legs.forEach((leg, index) => {
        console.log(`  Leg ${index + 1}:`, {
          id: leg.id,
          leg_number: leg.leg_number,
          pickup_address: leg.pickup_address,
          dropoff_address: leg.dropoff_address,
          status: leg.status
        });
      });

      // Check client leg quotes
      const { data: legQuotes, error: legQuotesError } = await supabase
        .from('client_leg_quotes')
        .select('id, booking_leg_id, booking_id, total_pence')
        .eq('booking_id', result.bookingId!);

      if (legQuotesError) {
        console.log('❌ Error checking client leg quotes:', legQuotesError);
        return;
      }

      console.log('✅ Client leg quotes created:');
      legQuotes.forEach((legQuote, index) => {
        console.log(`  Leg Quote ${index + 1}:`, {
          id: legQuote.id,
          booking_leg_id: legQuote.booking_leg_id,
          booking_id: legQuote.booking_id,
          total_pence: legQuote.total_pence
        });
      });

      // Phase 2B verification checks
      const phase2BChecks = {
        quoteConverted: updatedQuote.booking_id === result.bookingId,
        quoteNotCurrent: updatedQuote.is_current === false,
        bookingExists: !!booking,
        bookingStatusNew: booking.status === 'NEW',
        legsCreated: legs.length > 0,
        legQuotesCreated: legQuotes.length > 0,
        legQuotesHaveCorrectBookingId: legQuotes.every(lq => lq.booking_id === result.bookingId),
        organizationConsistent: booking.organization_id === mockRequest.user.organizationId
      };

      console.log('🔍 Phase 2B checks:', phase2BChecks);

      const allChecksPass = Object.values(phase2BChecks).every(check => check === true);

      if (allChecksPass) {
        console.log('✅ All Phase 2B properties verified');
        console.log('🎉 PHASE 2B TEST FULLY PASSED - Quote to booking conversion successful');
      } else {
        console.log('❌ Phase 2B test FAILED - Some properties incorrect');
        const failedChecks = Object.entries(phase2BChecks).filter(([_, value]) => !value);
        console.log('Failed checks:', failedChecks);
      }

    } else {
      console.log('❌ Phase 2B test FAILED - Conversion failed');
      console.log('Error:', result.error);
    }

  } catch (error: any) {
    console.error('❌ Phase 2B test FAILED - Exception:', error);
  }
}

// Run the test
testConvertQuoteToBooking().then(() => {
  console.log('\n🏁 Phase 2B test completed');
}).catch((error) => {
  console.error('🚨 Test runner error:', error);
});
