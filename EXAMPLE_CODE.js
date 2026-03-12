/**
 * Vantage Lane - Backend Pricing Integration
 * JavaScript Examples for Landing Page
 * 
 * Copy-paste ready code snippets
 */

// ============================================
// CONFIGURATION
// ============================================

const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY'; // Replace with actual key
const BACKEND_URL = 'https://pricing.vantage-lane.com';

// ============================================
// GOOGLE MAPS INTEGRATION
// ============================================

/**
 * Get distance and duration from Google Maps Directions API
 * @param {string} pickup - Pickup location (address or place name)
 * @param {string} dropoff - Dropoff location (address or place name)
 * @returns {Promise<Object>} - { distance, duration, pickup_coords, dropoff_coords }
 */
async function getDistanceAndDuration(pickup, dropoff) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dropoff)}&key=${GOOGLE_MAPS_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK') {
      const route = data.routes[0].legs[0];
      
      return {
        distance: route.distance.value / 1609.34, // meters to miles
        duration: route.duration.value / 60, // seconds to minutes
        pickup_coords: {
          lat: route.start_location.lat,
          lng: route.start_location.lng
        },
        dropoff_coords: {
          lat: route.end_location.lat,
          lng: route.end_location.lng
        }
      };
    } else {
      throw new Error(`Google Maps error: ${data.status}`);
    }
  } catch (error) {
    console.error('Error getting route:', error);
    throw error;
  }
}

// ============================================
// BACKEND PRICING API
// ============================================

/**
 * Calculate price using Vantage Lane backend
 * @param {Object} params - Pricing parameters
 * @returns {Promise<Object>} - Pricing result with finalPrice and breakdown
 */
async function calculatePrice(params) {
  const {
    pickup,
    dropoff,
    vehicleType,
    bookingType,
    dateTime,
    distance,
    duration,
    coordinates,
    hours,
    days,
    extras
  } = params;

  // Build request body
  const requestBody = {
    pickup,
    dropoff,
    vehicleType,
    bookingType,
    dateTime,
    distance,
    duration
  };

  // Add optional parameters
  if (coordinates) requestBody.coordinates = coordinates;
  if (hours) requestBody.hours = hours;
  if (days) requestBody.days = days;
  if (extras) requestBody.extras = extras;

  try {
    const response = await fetch(`${BACKEND_URL}/api/pricing/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to calculate price');
    }

    return data;
  } catch (error) {
    console.error('Error calculating price:', error);
    throw error;
  }
}

// ============================================
// COMPLETE FLOW EXAMPLE
// ============================================

/**
 * Complete flow: Get route data and calculate price
 * @param {Object} bookingData - User's booking selections
 * @returns {Promise<Object>} - Pricing result
 */
async function getQuote(bookingData) {
  const {
    pickup,
    dropoff,
    vehicleType,
    bookingType,
    dateTime,
    hours,
    days,
    extras
  } = bookingData;

  try {
    // Step 1: Get distance and duration from Google Maps
    console.log('Getting route data from Google Maps...');
    const routeData = await getDistanceAndDuration(pickup, dropoff);
    console.log('Route data:', routeData);

    // Step 2: Calculate price using backend
    console.log('Calculating price...');
    const pricingResult = await calculatePrice({
      pickup,
      dropoff,
      vehicleType,
      bookingType,
      dateTime,
      distance: routeData.distance,
      duration: routeData.duration,
      coordinates: {
        pickup: routeData.pickup_coords,
        dropoff: routeData.dropoff_coords
      },
      hours,
      days,
      extras
    });

    console.log('Pricing result:', pricingResult);
    return pricingResult;

  } catch (error) {
    console.error('Error getting quote:', error);
    throw error;
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================

// Example 1: One Way Trip
async function exampleOneWay() {
  const result = await getQuote({
    pickup: 'Heathrow Airport, London',
    dropoff: 'Central London',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: '2024-02-10T14:30:00Z'
  });

  console.log(`Price: £${result.finalPrice}`);
  console.log('Breakdown:', result.breakdown);
}

// Example 2: Return Trip
async function exampleReturn() {
  const result = await getQuote({
    pickup: 'Central London',
    dropoff: 'Gatwick Airport',
    vehicleType: 'luxury',
    bookingType: 'return',
    dateTime: '2024-02-10T08:00:00Z'
  });

  console.log(`Price: £${result.finalPrice} (includes 10% return discount)`);
}

// Example 3: Hourly Booking
async function exampleHourly() {
  const result = await getQuote({
    pickup: 'Central London',
    dropoff: 'Central London',
    vehicleType: 'suv',
    bookingType: 'hourly',
    dateTime: '2024-02-10T10:00:00Z',
    hours: 4
  });

  console.log(`Price: £${result.finalPrice} for 4 hours`);
}

// Example 4: Daily Booking
async function exampleDaily() {
  const result = await getQuote({
    pickup: 'London',
    dropoff: 'London',
    vehicleType: 'van',
    bookingType: 'daily',
    dateTime: '2024-02-10T09:00:00Z',
    days: 3
  });

  console.log(`Price: £${result.finalPrice} for 3 days`);
}

// Example 5: With Extra Services
async function exampleWithExtras() {
  const result = await getQuote({
    pickup: 'Heathrow Airport',
    dropoff: 'Central London',
    vehicleType: 'luxury',
    bookingType: 'one_way',
    dateTime: '2024-02-10T14:30:00Z',
    extras: ['child_seat', 'wifi', 'water']
  });

  console.log(`Price: £${result.finalPrice} (includes extras)`);
}

// ============================================
// REACT COMPONENT EXAMPLE
// ============================================

/**
 * React Component Example
 */
/*
import React, { useState } from 'react';

function PricingForm() {
  const [formData, setFormData] = useState({
    pickup: '',
    dropoff: '',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: new Date().toISOString(),
    hours: 3,
    days: 1
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const quote = await getQuote(formData);
      setResult(quote);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Pickup location"
          value={formData.pickup}
          onChange={(e) => setFormData({ ...formData, pickup: e.target.value })}
          required
        />
        
        <input
          type="text"
          placeholder="Dropoff location"
          value={formData.dropoff}
          onChange={(e) => setFormData({ ...formData, dropoff: e.target.value })}
          required
        />
        
        <select
          value={formData.vehicleType}
          onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
        >
          <option value="executive">Executive</option>
          <option value="luxury">Luxury</option>
          <option value="suv">SUV</option>
          <option value="van">Van</option>
        </select>
        
        <select
          value={formData.bookingType}
          onChange={(e) => setFormData({ ...formData, bookingType: e.target.value })}
        >
          <option value="one_way">One Way</option>
          <option value="return">Return</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
        </select>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Calculating...' : 'Get Quote'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="result">
          <h2>Price: £{result.finalPrice}</h2>
          <div className="breakdown">
            <p>Base Fare: £{result.breakdown.baseFare}</p>
            <p>Distance Fee: £{result.breakdown.distanceFee}</p>
            <p>Time Fee: £{result.breakdown.timeFee}</p>
            <p>Additional Fees: £{result.breakdown.additionalFees}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PricingForm;
*/

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format price for display
 */
function formatPrice(price) {
  return `£${price.toFixed(2)}`;
}

/**
 * Validate booking data before sending
 */
function validateBookingData(data) {
  const errors = [];

  if (!data.pickup) errors.push('Pickup location is required');
  if (!data.dropoff) errors.push('Dropoff location is required');
  if (!data.vehicleType) errors.push('Vehicle type is required');
  if (!data.bookingType) errors.push('Booking type is required');
  if (!data.dateTime) errors.push('Date and time is required');

  if (data.bookingType === 'hourly' && !data.hours) {
    errors.push('Hours is required for hourly bookings');
  }

  if (data.bookingType === 'daily' && !data.days) {
    errors.push('Days is required for daily bookings');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get vehicle type display name
 */
function getVehicleTypeName(type) {
  const names = {
    executive: 'Executive Sedan',
    luxury: 'Luxury Sedan',
    suv: 'SUV',
    van: 'Van (6-8 passengers)'
  };
  return names[type] || type;
}

/**
 * Get booking type display name
 */
function getBookingTypeName(type) {
  const names = {
    one_way: 'One Way Trip',
    return: 'Return Trip',
    hourly: 'Hourly Booking',
    daily: 'Daily Booking',
    fleet: 'Fleet Booking'
  };
  return names[type] || type;
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Handle API errors gracefully
 */
function handlePricingError(error) {
  if (error.message.includes('Google Maps')) {
    return 'Could not find route. Please check the addresses and try again.';
  } else if (error.message.includes('Validation')) {
    return 'Invalid booking data. Please check your selections.';
  } else if (error.message.includes('network')) {
    return 'Network error. Please check your internet connection.';
  } else {
    return 'An error occurred. Please try again later.';
  }
}

// ============================================
// EXPORT FOR USE IN OTHER FILES
// ============================================

// For ES6 modules
export {
  getDistanceAndDuration,
  calculatePrice,
  getQuote,
  formatPrice,
  validateBookingData,
  getVehicleTypeName,
  getBookingTypeName,
  handlePricingError
};

// For CommonJS (Node.js)
/*
module.exports = {
  getDistanceAndDuration,
  calculatePrice,
  getQuote,
  formatPrice,
  validateBookingData,
  getVehicleTypeName,
  getBookingTypeName,
  handlePricingError
};
*/
