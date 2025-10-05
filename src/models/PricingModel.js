/**
 * Pricing Data Models - Clean structure for pricing calculations
 */

class PricingRequest {
  constructor(data) {
    this.pickup = data.pickup;
    this.dropoff = data.dropoff;
    this.vehicleType = data.vehicleType;
    this.bookingType = data.bookingType;
    this.dateTime = new Date(data.dateTime);
    this.distance = data.distance || null;
    this.duration = data.duration || null;
    this.coordinates = data.coordinates || null;
    this.extras = data.extras || [];
    this.corporateTier = data.corporateTier || null;
  }

  isValid() {
    return this.pickup && this.dropoff && this.vehicleType && this.bookingType;
  }
}

class PricingBreakdown {
  constructor() {
    this.baseFare = 0;
    this.distanceFee = 0;
    this.timeFee = 0;
    this.airportFees = 0;
    this.zoneFees = 0;
    this.tollFees = 0;
    this.multiStopFees = 0;
    this.waitingFees = 0;
    this.extraServices = 0;
    this.subtotal = 0;
    this.multipliers = {};
    this.discounts = 0;
    this.finalPrice = 0;
    this.details = [];
  }

  addDetail(component, amount, description) {
    this.details.push({ component, amount, description });
  }

  calculateSubtotal() {
    this.subtotal = this.baseFare + this.distanceFee + this.timeFee + 
                   this.airportFees + this.zoneFees + this.tollFees + 
                   this.multiStopFees + this.waitingFees + this.extraServices;
    return this.subtotal;
  }

  applyMultipliers(multiplierValue, type) {
    this.multipliers[type] = multiplierValue;
    const multipliedAmount = this.subtotal * (multiplierValue - 1);
    this.addDetail('multiplier', multipliedAmount, `${type} surcharge`);
    return multipliedAmount;
  }

  applyDiscount(discountValue, type) {
    this.discounts += discountValue;
    this.addDetail('discount', -discountValue, `${type} discount`);
    return discountValue;
  }
}

class PricingResponse {
  constructor(breakdown) {
    this.success = true;
    this.finalPrice = breakdown.finalPrice;
    this.currency = 'GBP';
    this.breakdown = {
      baseFare: breakdown.baseFare,
      distanceFee: breakdown.distanceFee,
      timeFee: breakdown.timeFee,
      additionalFees: breakdown.airportFees + breakdown.zoneFees + breakdown.tollFees,
      services: breakdown.extraServices + breakdown.multiStopFees + breakdown.waitingFees,
      subtotal: breakdown.subtotal,
      multipliers: breakdown.multipliers,
      discounts: breakdown.discounts,
      finalPrice: breakdown.finalPrice
    };
    this.details = breakdown.details;
    this.timestamp = new Date().toISOString();
  }

  static error(message, code = 400) {
    return {
      success: false,
      error: message,
      code,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  PricingRequest,
  PricingBreakdown,
  PricingResponse
};
