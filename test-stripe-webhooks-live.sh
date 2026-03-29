#!/bin/bash

# Live Stripe Webhook Testing Script
# Tests real webhook events using Stripe CLI

echo "🔔 STRIPE WEBHOOK LIVE TESTING"
echo "================================"
echo ""

# Check if server is running
echo "1. Checking if backend server is running on port 3003..."
if ! curl -s http://localhost:3003/health > /dev/null 2>&1; then
    echo "❌ Backend server not running on port 3003"
    echo "Please start server with: npm run dev"
    exit 1
fi
echo "✅ Backend server is running"
echo ""

# Get a real payment intent ID from our test
echo "2. Getting a real payment intent ID from database..."
PAYMENT_INTENT_ID=$(curl -s "http://localhost:3003/api/pricing/create-payment-intent" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"302166e3-3068-4079-922a-c1d2b4f56021","quoteId":"af737b9f-4ee2-4566-a3c3-71c115a931fe","customerData":{"customerId":"ead7ed58-46f6-458a-95d3-c0386bcdb5af","email":"webhook-test@example.com"}}' \
  | jq -r '.data.stripePaymentIntentId')

if [ -z "$PAYMENT_INTENT_ID" ] || [ "$PAYMENT_INTENT_ID" = "null" ]; then
    echo "❌ Failed to create payment intent"
    exit 1
fi

echo "✅ Created payment intent: $PAYMENT_INTENT_ID"
echo ""

echo "3. Testing webhook events with Stripe CLI..."
echo ""
echo "📋 INSTRUCTIONS:"
echo "   1. Open a NEW terminal window"
echo "   2. Run: stripe listen --forward-to localhost:3003/api/stripe/webhook"
echo "   3. Copy the webhook signing secret (whsec_...)"
echo "   4. Update .env file: STRIPE_WEBHOOK_SECRET=whsec_..."
echo "   5. Restart the backend server"
echo ""
echo "Then run these commands to trigger events:"
echo ""
echo "✅ Test payment success:"
echo "   stripe trigger payment_intent.succeeded"
echo ""
echo "❌ Test payment failure:"
echo "   stripe trigger payment_intent.payment_failed"
echo ""
echo "🚫 Test payment canceled:"
echo "   stripe trigger payment_intent.canceled"
echo ""
echo "💳 Test charge succeeded (for fee tracking):"
echo "   stripe trigger charge.succeeded"
echo ""
echo "Or trigger with specific payment intent:"
echo "   stripe trigger payment_intent.succeeded --override payment_intent:id=$PAYMENT_INTENT_ID"
echo ""
echo "📊 Monitor webhook events in real-time:"
echo "   - Watch terminal with 'stripe listen'"
echo "   - Check backend logs for processing"
echo "   - Query DB to verify status changes"
echo ""
