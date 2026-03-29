/**
 * Quote Amounts Mapper
 * 
 * Handles all money calculations and splits for quotes
 * Separated from QuoteService to reduce complexity
 */

import { PricingResult, LegBreakdown } from '../../types/pricing.types';

export interface QuoteAmounts {
  subtotalPence: number;
  discountPence: number;
  vatPence: number;
  totalPence: number;
}

export interface SplitAmounts {
  vehicleSubtotalPence: number;
  servicesSubtotalPence: number;
}

export class QuoteAmountsMapper {
  
  /**
   * Calculate amounts for independent quote (Phase 2A - no VAT)
   */
  static calculateIndependentQuoteAmounts(pricingResult: PricingResult): QuoteAmounts {
    const breakdown = pricingResult.bookingBreakdown;
    
    const subtotalPence = Math.round((breakdown?.subtotal || 0) * 100);
    const discountPence = Math.round((breakdown?.discounts?.total || 0) * 100);
    const totalPence = Math.round((pricingResult.finalPrice || 0) * 100);
    
    // Phase 2A: No VAT calculated
    const vatPence = 0;
    
    return {
      subtotalPence,
      discountPence,
      vatPence,
      totalPence
    };
  }

  /**
   * Calculate amounts for booking quote (Phase 2B - with VAT)
   */
  static calculateBookingQuoteAmounts(pricingResult: PricingResult): QuoteAmounts {
    const breakdown = pricingResult.bookingBreakdown;
    
    const subtotalPence = Math.round((breakdown?.subtotal || 0) * 100);
    const discountPence = Math.round((breakdown?.discounts?.total || 0) * 100);
    const totalPence = Math.round((pricingResult.finalPrice || 0) * 100);
    
    // Phase 2B: Calculate VAT at 20%
    const vatPence = Math.round(totalPence * 0.20);
    
    return {
      subtotalPence,
      discountPence,
      vatPence,
      totalPence
    };
  }

  /**
   * Calculate amounts for leg quote
   */
  static calculateLegQuoteAmounts(leg: LegBreakdown, vatRate: number = 0): QuoteAmounts {
    const subtotalPence = Math.round((leg.pricing?.subtotal || 0) * 100);
    const discountPence = 0; // Legs don't have discounts
    const totalPence = subtotalPence;
    const vatPence = Math.round(totalPence * vatRate);
    
    return {
      subtotalPence,
      discountPence,
      vatPence,
      totalPence
    };
  }

  /**
   * Split subtotal into vehicle and services components
   * Used for detailed breakdown in quotes
   */
  static splitSubtotal(pricingResult: PricingResult): SplitAmounts {
    const breakdown = pricingResult.bookingBreakdown;
    
    // Vehicle costs: base fare + distance + time
    const vehicleSubtotal = 
      (breakdown?.baseFare || 0) +
      (breakdown?.distanceFee || 0) +
      (breakdown?.timeFee || 0);
    
    // Service costs: airports + multi-stop + extras
    const servicesSubtotal = 
      (breakdown?.airportFees || 0) +
      (breakdown?.multiStopFees || 0) +
      (breakdown?.serviceItemFees || 0);
    
    return {
      vehicleSubtotalPence: Math.round(vehicleSubtotal * 100),
      servicesSubtotalPence: Math.round(servicesSubtotal * 100)
    };
  }

  /**
   * Apply discount to subtotal
   */
  static applyDiscount(subtotalPence: number, discountPence: number): number {
    return Math.max(0, subtotalPence - discountPence);
  }

  /**
   * Calculate VAT on amount
   */
  static calculateVAT(amountPence: number, vatRate: number = 0.20): number {
    return Math.round(amountPence * vatRate);
  }

  /**
   * Calculate total with VAT
   */
  static calculateTotalWithVAT(subtotalPence: number, discountPence: number, vatRate: number = 0.20): number {
    const afterDiscount = this.applyDiscount(subtotalPence, discountPence);
    const vat = this.calculateVAT(afterDiscount, vatRate);
    return afterDiscount + vat;
  }
}
