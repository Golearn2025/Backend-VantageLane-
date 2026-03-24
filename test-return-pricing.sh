#!/bin/bash

# Test RETURN Pricing Handler
# Tests various RETURN trip scenarios

API_URL="http://localhost:3003/api/pricing/calculate"

echo "=========================================="
echo "RETURN PRICING HANDLER TESTS"
echo "=========================================="
echo ""

# Test 1: Simple RETURN trip (no additional stops)
echo "Test 1: Simple RETURN trip (Heathrow → Central London → Heathrow)"
echo "------------------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "return",
    "vehicleType": "executive",
    "dateTime": "2026-03-25T10:00:00Z",
    "pickup": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "dropoff": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "10 Downing Street, London, UK",
      "coordinates": [51.5034, -0.1276],
      "type": "standard"
    },
    "additionalStops": [],
    "returnDateTime": "2026-03-25T18:00:00Z",
    "returnPickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "10 Downing Street, London, UK",
      "coordinates": [51.5034, -0.1276],
      "type": "standard"
    },
    "returnDropoff": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "returnAdditionalStops": [],
    "extras": []
  }' | jq '.'

echo ""
echo ""

# Test 2: RETURN trip with outbound stop
echo "Test 2: RETURN with outbound stop (Heathrow → Hotel → Central London → Heathrow)"
echo "---------------------------------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "return",
    "vehicleType": "luxury",
    "dateTime": "2026-03-26T09:00:00Z",
    "pickup": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "additionalStops": [
      {
        "placeId": "ChIJ_xyz123",
        "address": "The Savoy Hotel, London, UK",
        "coordinates": [51.5104, -0.1203],
        "type": "standard"
      }
    ],
    "dropoff": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "10 Downing Street, London, UK",
      "coordinates": [51.5034, -0.1276],
      "type": "standard"
    },
    "returnDateTime": "2026-03-26T20:00:00Z",
    "returnPickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "10 Downing Street, London, UK",
      "coordinates": [51.5034, -0.1276],
      "type": "standard"
    },
    "returnDropoff": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "returnAdditionalStops": [],
    "extras": []
  }' | jq '.'

echo ""
echo ""

# Test 3: RETURN trip with both outbound and return stops
echo "Test 3: RETURN with stops on both legs"
echo "---------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "return",
    "vehicleType": "suv",
    "dateTime": "2026-03-27T08:00:00Z",
    "pickup": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "additionalStops": [
      {
        "placeId": "ChIJ_stop1",
        "address": "Buckingham Palace, London, UK",
        "coordinates": [51.5014, -0.1419],
        "type": "standard"
      }
    ],
    "dropoff": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "10 Downing Street, London, UK",
      "coordinates": [51.5034, -0.1276],
      "type": "standard"
    },
    "returnDateTime": "2026-03-27T17:00:00Z",
    "returnPickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "10 Downing Street, London, UK",
      "coordinates": [51.5034, -0.1276],
      "type": "standard"
    },
    "returnAdditionalStops": [
      {
        "placeId": "ChIJ_stop2",
        "address": "Tower of London, UK",
        "coordinates": [51.5081, -0.0759],
        "type": "standard"
      }
    ],
    "returnDropoff": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "extras": []
  }' | jq '.'

echo ""
echo ""

# Test 4: RETURN trip with extras
echo "Test 4: RETURN with extras (child seats, meet & greet)"
echo "-------------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "return",
    "vehicleType": "executive",
    "dateTime": "2026-03-28T11:00:00Z",
    "pickup": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "dropoff": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "additionalStops": [],
    "returnDateTime": "2026-03-28T19:00:00Z",
    "returnPickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "returnDropoff": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "returnAdditionalStops": [],
    "extras": ["child_seat", "meet_greet"]
  }' | jq '.'

echo ""
echo "=========================================="
echo "RETURN PRICING TESTS COMPLETE"
echo "=========================================="
