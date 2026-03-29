#!/bin/bash

# Test HOURLY and DAILY Pricing Handlers

API_URL="http://localhost:3003/api/pricing/calculate"

echo "=========================================="
echo "HOURLY & DAILY PRICING HANDLER TESTS"
echo "=========================================="
echo ""

# Test 1: HOURLY - 3 hours
echo "Test 1: HOURLY - 3 hours chauffeur service"
echo "-------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "hourly",
    "vehicleType": "executive",
    "dateTime": "2026-03-25T10:00:00Z",
    "hours": 3,
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "extras": []
  }' | jq '{success,finalPrice,hours:3,baseFare:.bookingBreakdown.baseFare,legs_count:(.legs|length)}'

echo ""
echo ""

# Test 2: HOURLY - 5 hours with extras
echo "Test 2: HOURLY - 5 hours with child seat"
echo "-----------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "hourly",
    "vehicleType": "luxury",
    "dateTime": "2026-03-26T14:00:00Z",
    "hours": 5,
    "pickup": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "extras": ["child_seat"]
  }' | jq '{success,finalPrice,hours:5,serviceItemFees:.bookingBreakdown.serviceItemFees}'

echo ""
echo ""

# Test 3: DAILY - 1 day (24 hours)
echo "Test 3: DAILY - 1 day (24 hours)"
echo "---------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "daily",
    "vehicleType": "suv",
    "dateTime": "2026-03-27T08:00:00Z",
    "days": 1,
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "extras": []
  }' | jq '{success,finalPrice,days:1,baseFare:.bookingBreakdown.baseFare,legs_count:(.legs|length)}'

echo ""
echo ""

# Test 4: DAILY - 2.5 days
echo "Test 4: DAILY - 2.5 days"
echo "------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "daily",
    "vehicleType": "executive",
    "dateTime": "2026-03-28T09:00:00Z",
    "days": 2.5,
    "pickup": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "extras": []
  }' | jq '{success,finalPrice,days:2.5,baseFare:.bookingBreakdown.baseFare}'

echo ""
echo ""

# Test 5: DAILY - Fractional days (should fail - only whole days allowed)
echo "Test 5: DAILY - Fractional days (1.5 days) - SHOULD FAIL"
echo "---------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "daily",
    "vehicleType": "executive",
    "dateTime": "2026-03-29T10:00:00Z",
    "days": 1.5,
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "extras": []
  }' | jq '{success,error}'

echo ""
echo ""

# Test 6: DAILY - Below minimum (should fail - minimum 1 day)
echo "Test 6: DAILY - Below minimum (0.5 days) - SHOULD FAIL"
echo "-------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "daily",
    "vehicleType": "executive",
    "dateTime": "2026-03-30T10:00:00Z",
    "days": 0.5,
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "extras": []
  }' | jq '{success,error}'

echo ""
echo "=========================================="
echo "HOURLY & DAILY PRICING TESTS COMPLETE"
echo "=========================================="
