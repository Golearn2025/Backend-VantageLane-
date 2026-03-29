#!/bin/bash

# Test FLEET Pricing Handler (ONE_WAY, HOURLY, DAILY)

API_URL="http://localhost:3003/api/pricing/calculate"
ORG_ID="9a5caade-4791-4860-93b5-12b1c4fa9830"

echo "=========================================="
echo "FLEET PRICING HANDLER TESTS"
echo "=========================================="
echo ""

# Test 1: FLEET + ONE_WAY (2 executive, 1 luxury)
echo "Test 1: FLEET + ONE_WAY - 2 Executive + 1 Luxury"
echo "--------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "fleet",
    "baseServiceType": "one_way",
    "dateTime": "2026-03-25T10:00:00Z",
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "dropoff": {
      "placeId": "ChIJr_x8f0FYwokRYM7rTpHiYUQ",
      "address": "Heathrow Airport, London, UK",
      "coordinates": [51.4700, -0.4543],
      "type": "airport"
    },
    "additionalStops": [],
    "fleetConfig": {
      "executive": 2,
      "luxury": 1
    },
    "distance": 18.5,
    "duration": 45,
    "extras": [],
    "organizationId": "'$ORG_ID'"
  }' | jq '{success,finalPrice,legs_count:(.legs|length),baseFare:.bookingBreakdown.baseFare,vehicles:.legs|map({vehicle:.vehicle_category,price:.pricing.finalPrice})}'

echo ""
echo ""

# Test 2: FLEET + HOURLY (3 executive for 4 hours)
echo "Test 2: FLEET + HOURLY - 3 Executive for 4 hours"
echo "-------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "fleet",
    "baseServiceType": "hourly",
    "dateTime": "2026-03-25T14:00:00Z",
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "dropoff": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "additionalStops": [],
    "fleetConfig": {
      "executive": 3
    },
    "duration": 240,
    "extras": [],
    "organizationId": "'$ORG_ID'"
  }' | jq '{success,finalPrice,legs_count:(.legs|length),baseFare:.bookingBreakdown.baseFare,vehicles:.legs|map({vehicle:.vehicle_category,price:.pricing.finalPrice})}'

echo ""
echo ""

# Test 3: FLEET + DAILY (2 SUV for 2 days)
echo "Test 3: FLEET + DAILY - 2 SUV for 2 days"
echo "-----------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "fleet",
    "baseServiceType": "daily",
    "dateTime": "2026-03-26T08:00:00Z",
    "pickup": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "dropoff": {
      "placeId": "ChIJdd4hrwug2EcRmSrV3Vo6llI",
      "address": "Central London, UK",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "additionalStops": [],
    "fleetConfig": {
      "suv": 2
    },
    "duration": 2880,
    "extras": [],
    "organizationId": "'$ORG_ID'"
  }' | jq '{success,finalPrice,legs_count:(.legs|length),baseFare:.bookingBreakdown.baseFare,vehicles:.legs|map({vehicle:.vehicle_category,price:.pricing.finalPrice})}'

echo ""
echo ""

# Test 4: FLEET + ONE_WAY - Mixed fleet with multi-stop
echo "Test 4: FLEET + ONE_WAY - Mixed fleet with 2 stops"
echo "---------------------------------------------------"
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingType": "fleet",
    "baseServiceType": "one_way",
    "dateTime": "2026-03-27T09:00:00Z",
    "pickup": {
      "placeId": "ChIJ1",
      "address": "London",
      "coordinates": [51.5074, -0.1278],
      "type": "standard"
    },
    "dropoff": {
      "placeId": "ChIJ2",
      "address": "Manchester",
      "coordinates": [53.4808, -2.2426],
      "type": "standard"
    },
    "additionalStops": [
      {
        "placeId": "ChIJ3",
        "address": "Birmingham",
        "coordinates": [52.4862, -1.8904],
        "type": "standard"
      },
      {
        "placeId": "ChIJ4",
        "address": "Liverpool",
        "coordinates": [53.4084, -2.9916],
        "type": "standard"
      }
    ],
    "fleetConfig": {
      "executive": 1,
      "suv": 1,
      "mpv": 1
    },
    "distance": 210,
    "duration": 240,
    "extras": [],
    "organizationId": "'$ORG_ID'"
  }' | jq '{success,finalPrice,legs_count:(.legs|length),multiStopFees:.bookingBreakdown.multiStopFees,vehicles:.legs|map({vehicle:.vehicle_category,price:.pricing.finalPrice})}'

echo ""
echo "=========================================="
echo "FLEET PRICING TESTS COMPLETE"
echo "=========================================="
