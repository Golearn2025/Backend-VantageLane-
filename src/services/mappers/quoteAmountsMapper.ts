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
  /** Net transport after discount, before VAT (pence) */
  netPence: number;
  vatPence: number;
  totalPence: number;
  vatRate: number;
}

export interface SplitAmounts {
  vehicleSubtotalPence: number;
  servicesSubtotalPence: number;
}

export class QuoteAmountsMapper {
  
  /**
   * Client total in pounds: net (finalPrice) + VAT from organization_settings.
   */
  static applyVatToNetPricePounds(netPrice: number, vatRate: number): number {
    const netPence = Math.round((netPrice || 0) * 100);
    const safeVatRate = Math.max(0, Number(vatRate) || 0);
    const totalPence = netPence + Math.round(netPence * safeVatRate);
    return totalPence / 100;
  }

  /**
   * Calculate amounts for independent quote (Phase 2A).
   * VAT rate from organization_settings (0 = unchanged prices).
   */
  static calculateIndependentQuoteAmounts(
    pricingResult: PricingResult,
    vatRate: number = 0
  ): QuoteAmounts {
    return this.calculateClientQuoteAmounts(pricingResult, vatRate);
  }

  /**
   * Calculate amounts for booking quote (Phase 2B direct persistence).
   */
  static calculateBookingQuoteAmounts(
    pricingResult: PricingResult,
    vatRate: number = 0
  ): QuoteAmounts {
    return this.calculateClientQuoteAmounts(pricingResult, vatRate);
  }

  private static calculateClientQuoteAmounts(
    pricingResult: PricingResult,
    vatRate: number
  ): QuoteAmounts {
    const breakdown = pricingResult.bookingBreakdown;
    const subtotalPence = Math.round((breakdown?.subtotal || 0) * 100);
    const discountPence = Math.round((breakdown?.discounts?.total || 0) * 100);
    const netPence = Math.round((pricingResult.finalPrice || 0) * 100);
    const safeVatRate = Math.max(0, Number(vatRate) || 0);
    const vatPence = Math.round(netPence * safeVatRate);
    const totalPence = netPence + vatPence;

    return {
      subtotalPence,
      discountPence,
      netPence,
      vatPence,
      totalPence,
      vatRate: safeVatRate,
    };
  }

  /**
   * Calculate amounts for leg quote
   */
  static calculateLegQuoteAmounts(leg: LegBreakdown, vatRate: number = 0): QuoteAmounts {
    const subtotalPence = Math.round((leg.pricing?.subtotal || 0) * 100);
    const discountPence = 0;
    const netPence = Math.round((leg.pricing?.finalPrice ?? leg.pricing?.subtotal ?? 0) * 100);
    const safeVatRate = Math.max(0, Number(vatRate) || 0);
    const vatPence = Math.round(netPence * safeVatRate);
    const totalPence = netPence + vatPence;

    return {
      subtotalPence,
      discountPence,
      netPence,
      vatPence,
      totalPence,
      vatRate: safeVatRate,
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
