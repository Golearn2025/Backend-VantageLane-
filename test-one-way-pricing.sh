#!/bin/bash

# ONE_WAY Pricing Integration Test Script
# Tests the complete flow: validator → parser → PricingEngine → QuotePersistence

API_URL="http://localhost:3000/api/pricing/calculate-and-quote"

echo "🧪 Testing ONE_WAY Pricing Integration"
echo "========================================"
echo ""

# Test 1: Simple ONE_WAY (Heathrow → Central London)
echo "📍 Test 1: ONE_WAY Simple (Heathrow → Central London)"
echo "------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "oneway",
    "vehicleType": "executive",
    "dateTime": "2026-03-25T10:00:00Z",
    "pickup": {
      "address": "Heathrow Airport, London TW6",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "dropoff": {
      "address": "Central London, Mayfair W1",
      "coordinates": [51.5074, -0.1278],
      "type": "address"
    },
    "extras": []
  }' | jq '.'

echo ""
echo ""

# Test 2: ONE_WAY with 1 additional stop
echo "📍 Test 2: ONE_WAY with 1 Stop (Gatwick → Brighton → London)"
echo "--------------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "oneway",
    "vehicleType": "luxury",
    "dateTime": "2026-03-25T14:00:00Z",
    "pickup": {
      "address": "Gatwick Airport, RH6",
      "coordinates": [51.1537, -0.1821],
      "type": "airport"
    },
    "additionalStops": [
      {
        "address": "Brighton, BN1",
        "coordinates": [50.8225, -0.1372],
        "type": "address"
      }
    ],
    "dropoff": {
      "address": "London Bridge, SE1",
      "coordinates": [51.5081, -0.0759],
      "type": "address"
    },
    "extras": []
  }' | jq '.'

echo ""
echo ""

# Test 3: ONE_WAY with 2 additional stops
echo "📍 Test 3: ONE_WAY with 2 Stops (Oxford St → Buckingham → Tower → Canary)"
echo "--------------------------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "oneway",
    "vehicleType": "suv",
    "dateTime": "2026-03-25T16:00:00Z",
    "pickup": {
      "address": "Oxford Street, London W1",
      "coordinates": [51.5152, -0.1419],
      "type": "address"
    },
    "additionalStops": [
      {
        "address": "Buckingham Palace, SW1",
        "coordinates": [51.5014, -0.1419],
        "type": "poi"
      },
      {
        "address": "Tower Bridge, SE1",
        "coordinates": [51.5055, -0.0754],
        "type": "poi"
      }
    ],
    "dropoff": {
      "address": "Canary Wharf, E14",
      "coordinates": [51.5054, -0.0235],
      "type": "address"
    },
    "extras": []
  }' | jq '.'

echo ""
echo ""

# Test 4: ONE_WAY with premium extras
echo "📍 Test 4: ONE_WAY with Premium Extras (Heathrow → City)"
echo "---------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "oneway",
    "vehicleType": "luxury",
    "dateTime": "2026-03-25T18:00:00Z",
    "pickup": {
      "address": "Heathrow Airport Terminal 5, TW6",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "dropoff": {
      "address": "City of London, EC2",
      "coordinates": [51.5155, -0.0922],
      "type": "address"
    },
    "extras": ["meet_and_greet", "child_seat", "wifi"]
  }' | jq '.'

echo ""
echo ""
echo "✅ All tests complete!"
echo ""
echo "Expected Response Structure:"
echo "{"
echo "  \"success\": true,"
echo "  \"quote_id\": \"uuid\","
echo "  \"pricing\": {"
echo "    \"finalPrice\": number,"
echo "    \"currency\": \"GBP\","
echo "    \"bookingBreakdown\": { ... },"
echo "    \"legs\": [ { ... } ],"
echo "    \"normalizedRoute\": { ... }"
echo "  }"
echo "}"
