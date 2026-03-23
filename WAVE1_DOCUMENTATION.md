# Phase 2C Wave 1: Payment Intent Creation

## Status: ✅ FROZEN (March 23, 2026)

## Overview
Wave 1 implements payment intent creation for existing bookings created in Phase 2B. This is the first step in the payment confirmation flow.

## Architecture
```
Phase 2A → Phase 2B → Wave 1 → Wave 2 → Wave 3
Quote    → Booking → Payment → Webhook → Confirmation
```

## API Endpoint

### POST /api/pricing/create-payment-intent

#### Required Body
```typescript
{
  bookingId: string,           // From Phase 2B conversion
  quoteId: string,             // Must match booking
  customerData: {
    customerId: string,        // Internal customer ID
    email: string              // For Stripe receipt
  },
  idempotencyKey?: string      // Optional, generated if not provided
}
```

#### Response
```typescript
{
  success: true,
  data: {
    paymentId: string,              // booking_payments.id
    bookingId: string,              // bookings.id
    stripePaymentIntentId: string,  // pi_*
    clientSecret: string,           // For frontend Stripe Elements
    amount: number,                 // In pence (backend source)
    currency: string,               // GBP
    status: "pending",              // booking_payments.status
    idempotencyKey: string
  }
}
```

## Implementation Details

### PaymentService
- **validateBooking()**: Checks PENDING_PAYMENT status + organization
- **validateQuote()**: Checks quote exists + matches booking + expiration
- **checkExistingIdempotency()**: Prevents duplicate payments
- **createStripePaymentIntent()**: Stripe integration with proper idempotency
- **createPaymentRecord()**: booking_payments persistence

### Security Features
- **Organization ID**: From auth context (not body)
- **Idempotency**: Double protection (DB + Stripe)
- **Quote Expiration**: Automatic rejection
- **Amount Source**: Backend quote, not frontend override
- **Customer ID**: In metadata, not Stripe customer field

## Flow Validation

### 1. Quote → Booking (Phase 2B)
```sql
-- Booking created with PENDING_PAYMENT status
INSERT INTO bookings (status, ...) VALUES ('PENDING_PAYMENT', ...);
```

### 2. Booking → Payment Intent (Wave 1)
```sql
-- Payment record created with pending status
INSERT INTO booking_payments (status, ...) VALUES ('pending', ...);
```

### 3. Idempotency Protection
```typescript
// Same idempotency key = same payment intent
// Different idempotency key = new payment intent
```

## Test Results

### ✅ Validated
- [x] Complete flow: quote → booking → payment intent
- [x] Idempotency (same key = same payment)
- [x] Retry logic (different key = new payment)
- [x] Quote expiration rejection
- [x] Amount consistency (£90 from backend)
- [x] Customer ID handling (metadata)
- [x] Stripe integration (real payment intents)

### 📊 Test Data
```
Quote ID: eda2dee9-1c90-43b8-b796-78f0a7057278
Booking ID: bb89c2dc-8a1c-4e3c-97f3-7f55ba0aac44
Payment ID: 52776ff6-e520-4773-bcd2-9f94d0ef0b07
Stripe PI: pi_3TDyBoD3AaQDXJX40YxwQlpM
Amount: £90 (9000 pence)
Status: pending
```

## Database Schema

### booking_payments
```sql
CREATE TABLE booking_payments (
  id UUID PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  quote_id UUID REFERENCES client_booking_quotes(id),
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  amount_pence INTEGER,
  currency TEXT,
  status TEXT, -- pending, succeeded, failed, refunded, canceled
  receipt_email TEXT,
  idempotency_key TEXT UNIQUE,
  attempt_no INTEGER DEFAULT 1,
  livemode BOOLEAN DEFAULT false,
  metadata JSONB,
  organization_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

## Next Phase: Wave 2

### Webhook Processing
- `payment_intent.succeeded` → booking CONFIRMED
- `payment_intent.payment_failed` → booking PAYMENT_FAILED  
- `payment_intent.canceled` → booking CANCELED
- `stripe_events` deduplication
- Fee calculation and updates

### Frontend Integration (After Wave 2)
- Send quoteId + customerData in request
- Replace "Booking Confirmed" with "Payment processing"
- Use clientSecret for Stripe Elements
- Wait for webhook confirmation

## Commit Information
- **Commit:** e7067d3
- **Date:** March 23, 2026
- **Files:** 6 changed, 517 insertions
- **Status:** Production Ready

## Notes
- Wave 1 creates payment intent but does NOT confirm booking
- Final confirmation comes from Wave 2 webhooks
- Frontend should show "Processing" until webhook confirmation
- All amounts sourced from backend quotes for security
