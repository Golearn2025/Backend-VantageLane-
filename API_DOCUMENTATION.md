# API Documentation - Vantage Lane Pricing Backend v1.0

## Base URL
```
http://localhost:3001
```

## Authentication
Currently, no authentication required for pricing endpoints. Admin endpoints will require authentication in future versions.

## Content Type
All API requests should include:
```
Content-Type: application/json
```

---

## 📡 Production Endpoints

### 1. Calculate Price

**Endpoint:** `POST /api/pricing/calculate`

**Description:** Calculates ride price based on provided distance and duration data.

**Request Body:**
```typescript
{
  pickup: string;           // Pickup location (required)
  dropoff: string;          // Dropoff location (required)
  vehicleType: "executive" | "luxury" | "suv" | "van";  // Vehicle type (required)
  bookingType: "one_way" | "return" | "hourly" | "fleet";  // Booking type (required)
  dateTime: string;         // ISO 8601 datetime (required)
  distance?: number;        // Distance in kilometers (optional)
  duration?: number;        // Duration in minutes (optional)
  extras?: string[];        // Optional services array
  corporateTier?: "tier1" | "tier2";  // Corporate discount tier
}
```

**Example Request:**
```json
{
  "pickup": "Central London",
  "dropoff": "Heathrow Airport",
  "vehicleType": "executive",
  "bookingType": "one_way",
  "dateTime": "2024-01-15T14:30:00Z",
  "distance": 28,
  "duration": 55,
  "extras": ["child_seat"],
  "corporateTier": "tier1"
}
```

**Response:**
```typescript
{
  success: boolean;
  finalPrice?: number;
  currency?: string;
  breakdown?: {
    baseFare: number;
    distanceFee: number;
    timeFee: number;
    additionalFees: number;
    services: number;
    subtotal: number;
    multipliers: Record<string, number>;
    discounts: number;
    finalPrice: number;
  };
  details?: Array<{
    component: string;
    amount: number;
    description: string;
  }>;
  error?: string;
  code?: number;
  timestamp: string;
}
```

**Example Response:**
```json
{
  "success": true,
  "finalPrice": 145,
  "currency": "GBP",
  "breakdown": {
    "baseFare": 70,
    "distanceFee": 41.88,
    "timeFee": 24.75,
    "additionalFees": 5,
    "services": 15,
    "subtotal": 156.63,
    "multipliers": {},
    "discounts": 15.66,
    "finalPrice": 145
  },
  "details": [
    {
      "component": "base_fare",
      "amount": 70,
      "description": "Executive (E-Class) base fare"
    },
    {
      "component": "distance_fee",
      "amount": 41.88,
      "description": "17.4 miles (£2.8/£2.2 per mile)"
    },
    {
      "component": "time_fee",
      "amount": 24.75,
      "description": "55 minutes at £0.45/min"
    },
    {
      "component": "airport_dropoff",
      "amount": 5,
      "description": "LHR dropoff fee"
    },
    {
      "component": "extra_service",
      "amount": 15,
      "description": "Child safety seat"
    },
    {
      "component": "discount",
      "amount": -15.66,
      "description": "Corporate discount (10%)"
    }
  ],
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### 2. Health Check

**Endpoint:** `GET /health`

**Description:** Check API health status.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "service": "Vantage Lane Pricing Engine",
  "version": "1.0.0",
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

---

## 🧪 Testing Endpoints

### 1. Calculate Price with Google Maps

**Endpoint:** `POST /api/testing/calculate-with-maps`

**Description:** Calculates price using Google Maps to fetch distance and duration automatically.

**Request Body:**
```json
{
  "pickup": "Trafalgar Square, London",
  "dropoff": "London Heathrow Airport",
  "vehicleType": "luxury",
  "bookingType": "one_way",
  "dateTime": "2024-01-15T14:30:00Z",
  "extras": ["meet_greet"],
  "corporateTier": "tier2"
}
```

**Response:**
```json
{
  "success": true,
  "finalPrice": 190,
  "currency": "GBP",
  "breakdown": {
    "baseFare": 95,
    "distanceFee": 52.92,
    "timeFee": 33,
    "additionalFees": 5,
    "services": 20,
    "subtotal": 205.92,
    "multipliers": {},
    "discounts": 30.89,
    "finalPrice": 190
  },
  "details": [...],
  "route": {
    "distance": "17.4 km",
    "duration": "55 minutes",
    "coordinates": {
      "pickup": {"lat": 51.508, "lng": -0.128},
      "dropoff": {"lat": 51.470, "lng": -0.454}
    }
  },
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

---

## ⚙️ Configuration Endpoints

### 1. Get Vehicle Types

**Endpoint:** `GET /api/config/vehicle-types`

**Response:**
```json
{
  "success": true,
  "data": [
    {"id": "executive", "name": "executive"},
    {"id": "luxury", "name": "luxury"},
    {"id": "suv", "name": "suv"},
    {"id": "van", "name": "van"}
  ],
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### 2. Get Booking Types

**Endpoint:** `GET /api/config/booking-types`

**Response:**
```json
{
  "success": true,
  "data": [
    {"id": "one_way", "name": "one_way"},
    {"id": "return", "name": "return"},
    {"id": "hourly", "name": "hourly"},
    {"id": "fleet", "name": "fleet"}
  ],
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

---

## 📊 Pricing Calculation Details

### Vehicle Types & Rates

| Vehicle Type | Base Fare | Mile Rate (1-6) | Mile Rate (6+) | Per Minute | Hourly In/Out | Minimum |
|--------------|-----------|-----------------|----------------|------------|---------------|---------|
| executive    | £70       | £2.80          | £2.20          | £0.45      | £85/£90      | £90     |
| luxury       | £95       | £3.50          | £2.80          | £0.60      | £115/£125    | £120    |
| suv          | £140      | £4.20          | £3.50          | £0.75      | £150/£160    | £150    |
| van          | £100      | £3.20          | £2.80          | £0.55      | £120/£130    | £100    |

### Time Multipliers

| Period | Multiplier | Time Range | Days |
|--------|------------|------------|------|
| day    | 1.00       | 06:00-22:00 | Mon-Fri |
| night  | 1.30       | 22:00-06:00 | All |
| peak_morning | 1.20 | 07:00-09:00 | Mon-Fri |
| peak_evening | 1.20 | 17:00-19:00 | Mon-Fri |
| weekend | 1.15      | All day | Sat-Sun |

### Airport Fees

| Airport Code | Name | Pickup/Dropoff Fee | Free Waiting |
|--------------|------|-------------------|--------------|
| LHR | London Heathrow | £5.00 | 45 min |
| LGW | London Gatwick | £5.00 | 45 min |
| STN | London Stansted | £7.00 | 45 min |
| LTN | London Luton | £6.00 | 45 min |
| LCY | London City | £4.00 | 30 min |

### Zone Fees

| Zone | Fee | Type |
|------|-----|------|
| Central London | £15.00 | Congestion |
| ULEZ | £12.50 | Ultra Low Emission |
| LEZ | £7.50 | Low Emission |
| Dartford Crossing | £2.50 | Toll |
| M6 Toll | £6.70 | Toll |

### Additional Services

| Service | Fee | Description |
|---------|-----|-------------|
| Multi-stop | £15.00 | Per additional stop |
| Child seat | £15.00 | Safety equipment |
| Meet & greet | £20.00 | Personal service |
| Champagne | £25.00 | Premium service |
| Waiting time | £12.50 | Per 15min after free period |

### Corporate Discounts

| Tier | Discount | Description |
|------|----------|-------------|
| tier1 | 10% | Standard corporate rate |
| tier2 | 15% | Premium corporate rate |

---

## 🚨 Error Responses

### Validation Errors
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "msg": "Pickup location is required",
      "param": "pickup",
      "location": "body"
    }
  ],
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### Server Errors
```json
{
  "success": false,
  "error": "Internal server error",
  "code": 500,
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### Google Maps Errors
```json
{
  "success": false,
  "error": "Failed to get route information",
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

---

## 📝 Rate Limiting

- **Window**: 15 minutes
- **Limit**: 100 requests per IP
- **Headers**: Standard rate limit headers included in responses

---

## 🔄 Booking Type Specific Logic

### One Way
Standard calculation: Base + Distance + Time + Fees + Multipliers

### Return  
Calculated as double one-way journey (implementation pending)

### Hourly
- Uses hourly rates instead of distance/time rates
- 3-hour minimum billing
- In-town vs out-of-town rates (>25 miles = out-of-town)
- Base fare + (hours × hourly_rate) + zone fees

### Fleet
Multiple vehicle booking support (implementation pending)

---

## 🧮 Calculation Examples

### Example 1: Short Central London Trip
```
Pickup: Trafalgar Square
Dropoff: Oxford Circus  
Distance: 2km (1.24 miles)
Duration: 15 minutes
Vehicle: Executive

Calculation:
- Base fare: £70
- Distance: 3.0 miles (minimum) × £2.80 = £8.40
- Time: 15 min × £0.45 = £6.75
- Subtotal: £85.15
- Minimum fare adjustment: £4.85
- Final: £90
```

### Example 2: Airport Transfer with Night Surcharge
```
Pickup: Central London
Dropoff: Heathrow Airport
Distance: 28km (17.4 miles)  
Duration: 55 minutes
Vehicle: Luxury
Time: 23:00 (night)

Calculation:
- Base fare: £95
- Distance: 6 × £3.50 + 11.4 × £2.80 = £52.92
- Time: 55 min × £0.60 = £33.00
- Airport fee: £5.00
- Zone fees: £15.00 (Central) + £12.50 (ULEZ) = £27.50
- Subtotal: £213.42
- Night multiplier: ×1.30 = £277.45
- Final: £280 (rounded to nearest £5)
```

### Example 3: Hourly Booking
```
Pickup: Mayfair
Service: Corporate meetings
Duration: 4 hours
Distance: 20 miles (in-town)
Vehicle: SUV

Calculation:
- Base fare: £140
- Hourly: 4 hours × £150/hr = £600
- Zone fees: £27.50
- Subtotal: £767.50
- Final: £770 (rounded)
```

This documentation covers all current API functionality. For admin endpoints and additional features, please refer to future version documentation.
