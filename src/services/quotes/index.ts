/**
 * Quote Services - Modular Export
 * 
 * Replaces monolithic QuoteService with focused services:
 * - QuotePersistenceService: Database persistence
 * - QuoteConversionService: Quote → Booking conversion
 * - QuoteReadService: Fetching quotes
 * - Line Items Builder: Shared helpers
 */

export { QuotePersistenceService, QuoteCreationResult } from './quotePersistence.service';
export { QuoteConversionService, ConversionResult } from './quoteConversion.service';
export { QuoteReadService } from './quoteRead.service';
export {
  buildBookingLineItems,
  buildLegLineItems,
  buildTripMetadata,
  LineItems,
  LineItemComponent,
  LineItemDiscount,
  LineItemMultiplier,
  LineItemSummary,
  LineItemMeta
} from './quoteLineItemsBuilder';

/**
 * MIGRATION NOTES:
 * 
 * Old QuoteService → New Services mapping:
 * 
 * QuoteService.createIndependentQuote() 
 *   → QuotePersistenceService.createIndependentQuote()
 * 
 * QuoteService.createQuote()
 *   → QuotePersistenceService.createBookingQuote()
 * 
 * QuoteService.getQuote()
 *   → QuoteReadService.getQuote()
 * 
 * QuoteService.convertQuoteToBooking()
 *   → QuoteConversionService.convertQuoteToBooking()
 * 
 * Line items building logic
 *   → buildBookingLineItems(), buildLegLineItems()
 */
