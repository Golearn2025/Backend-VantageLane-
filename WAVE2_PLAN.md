# Phase 2C Wave 2: Webhook Processing

## Status: 🔄 IN PROGRESS (March 23, 2026)

## Overview
Wave 2 implements Stripe webhook processing to confirm payments and update booking statuses.

## Architecture
```
Wave 1 → Wave 2 → Wave 3
Payment → Webhook → Confirmation
```

## Webhook Events to Handle

### Primary Events
1. **payment_intent.succeeded** → booking CONFIRMED
2. **payment_intent.payment_failed** → booking PAYMENT_FAILED
3. **payment_intent.canceled** → booking CANCELED

### Secondary Events
4. **charge.succeeded** → fee calculation
5. **charge.refunded** → refund processing (Wave 3)

## Implementation Plan

### 1. Webhook Endpoint
```
POST /api/stripe/webhook
```
- Verify Stripe signature
- Parse event type
- Route to appropriate handler

### 2. Event Deduplication
```sql
CREATE TABLE stripe_events (
  id UUID PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  processed_at TIMESTAMP
);
```

### 3. Payment Status Updates
```sql
-- Update booking_payments
UPDATE booking_payments 
SET status = 'succeeded', 
    stripe_fee_pence = calculated_fee,
    net_amount_pence = amount - fee
WHERE stripe_payment_intent_id = :payment_intent_id;

-- Update bookings
UPDATE bookings 
SET status = 'CONFIRMED'
WHERE id = :booking_id;
```

### 4. Fee Calculation
```typescript
// Stripe fee calculation (typical)
const fee = Math.round(amount * 0.014) + 20; // 1.4% + 20p
```

## Database Schema Updates

### stripe_events Table
```sql
CREATE TABLE stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed BOOLEAN DEFAULT false,
  payment_intent_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  metadata JSONB,
  error_message TEXT
);
```

### booking_payments Updates
```sql
ALTER TABLE booking_payments 
ADD COLUMN stripe_fee_pence INTEGER DEFAULT 0,
ADD COLUMN net_amount_pence INTEGER,
ADD COLUMN processed_at TIMESTAMP;
```

## Flow Logic

### payment_intent.succeeded
1. Verify event not processed
2. Find booking_payments record
3. Calculate Stripe fees
4. Update booking_payments status to 'succeeded'
5. Update booking status to 'CONFIRMED'
6. Mark event as processed

### payment_intent.payment_failed
1. Verify event not processed
2. Find booking_payments record
3. Update booking_payments status to 'failed'
4. Update booking status to 'PAYMENT_FAILED'
5. Mark event as processed

### payment_intent.canceled
1. Verify event not processed
2. Find booking_payments record
3. Update booking_payments status to 'canceled'
4. Update booking status to 'CANCELED'
5. Mark event as processed

## Error Handling

### Retry Logic
- Temporary failures → retry later
- Permanent failures → log and mark as error
- Webhook signature verification failures → reject

### Idempotency
- Stripe event ID uniqueness
- Database transaction protection
- Event replay safety

## Testing Strategy

### 1. Manual Testing
- Create payment intent (Wave 1)
- Complete payment in Stripe test mode
- Verify webhook processing
- Check booking status updates

### 2. Automated Testing
- Mock Stripe webhook events
- Test all event types
- Verify idempotency
- Test error scenarios

## Security Considerations

### 1. Webhook Security
- Verify Stripe signature using webhook secret
- Use HTTPS only
- Rate limiting

### 2. Data Validation
- Validate payment_intent_id exists
- Verify booking ownership
- Check amounts match

## Current Status

### ✅ Completed
- Wave 1 payment intent creation
- Database schema for booking_payments
- Stripe integration

### 🔄 In Progress
- Webhook endpoint implementation
- Event deduplication
- Status update logic

### 📋 Next Steps
1. Create webhook endpoint
2. Implement event deduplication
3. Add stripe_events table
4. Handle payment_intent.succeeded
5. Handle payment_intent.payment_failed
6. Handle payment_intent.canceled
7. Add fee calculation
8. Test end-to-end flow

## Dependencies
- Stripe webhook secret: `whsec_2f7a6a3e75ccf8f054869572f0aaf7ece0567eb16c3fa7098e132a66aa760f59`
- Existing payment intents: 3 pending payments ready for testing
- Wave 1 payment intent creation: ✅ Complete
