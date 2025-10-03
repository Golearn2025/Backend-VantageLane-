# Vantage Lane Pricing Backend v1.0

🚗 **Professional chauffeur pricing engine built for London's luxury transportation market**

## Overview

This backend system provides comprehensive pricing calculations for Vantage Lane's ride booking platform. Built with TypeScript, it implements 15 detailed pricing factors calibrated against London's premium chauffeur services (Gerrard Chauffeur, TBR/IO London).

## 🎯 Key Features

- **15 Pricing Factors**: Base fare, distance (tiered), time, multipliers, zone fees, airport charges, and more
- **4 Vehicle Classes**: Executive (E-Class), Luxury (S-Class), SUV (Range Rover), Van/MPV (V-Class)
- **Multiple Booking Types**: One-way, return, hourly hire, fleet bookings
- **London-Specific**: Mile-based pricing, ULEZ/congestion charges, airport fees
- **Time-Based Multipliers**: Day/night rates, peak hours, weekend surcharges
- **Google Maps Integration**: For testing and development
- **TypeScript**: Full type safety and professional code structure

## 📊 Pricing Methodology

### Competitive Analysis
Pricing calibrated against:
- **Gerrard Chauffeur Drive**: £85-150/hr hourly rates, £2.20-2.75/mile
- **TBR/IO London**: £31-45/hr rates, zone-based airport transfers
- **Industry Standards**: 3-hour minimums, 15-45min free waiting, strict cancellation policies

### Vehicle Pricing Tiers
| Vehicle | Base | Per Mile (1-6mi) | Per Mile (6mi+) | Hourly (In/Out) | Minimum |
|---------|------|------------------|-----------------|-----------------|---------|
| Executive | £70 | £2.80 | £2.20 | £85/£90 | £90 |
| Luxury | £95 | £3.50 | £2.80 | £115/£125 | £120 |
| SUV | £140 | £4.20 | £3.50 | £150/£160 | £150 |
| Van/MPV | £100 | £3.20 | £2.80 | £120/£130 | £100 |

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- TypeScript

### Installation
```bash
git clone https://github.com/Golearn2025/Backend-VantageLane-.git
cd Backend-VantageLane-
npm install
```

### Environment Setup
```bash
cp .env.example .env
# Edit .env with your settings:
# PORT=3001
# GOOGLE_MAPS_API_KEY=your_key_here
```

### Development
```bash
npm run dev        # Start development server
npm run build      # Build TypeScript
npm start          # Start production server
```

## 📡 API Endpoints

### Production Endpoints

#### Calculate Price
```http
POST /api/pricing/calculate
Content-Type: application/json

{
  "pickup": "Central London",
  "dropoff": "Heathrow Airport",
  "vehicleType": "executive",
  "bookingType": "one_way",
  "dateTime": "2024-01-15T14:30:00Z",
  "distance": 28,
  "duration": 55
}
```

**Response:**
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
    "services": 0,
    "subtotal": 141.63,
    "multipliers": {},
    "discounts": 0,
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
    }
  ],
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### Testing Endpoints

#### Calculate with Google Maps
```http
POST /api/testing/calculate-with-maps
```
Automatically fetches distance/duration from Google Maps API.

### Configuration Endpoints

#### Get Vehicle Types
```http
GET /api/config/vehicle-types
```

#### Get Booking Types  
```http
GET /api/config/booking-types
```

#### Health Check
```http
GET /health
```

## 🏗️ Architecture

### Project Structure
```
src/
├── controllers/          # API endpoint handlers
│   ├── PricingController.ts
│   ├── TestingController.ts
│   └── ConfigController.ts
├── services/            # Business logic
│   ├── PricingEngine.ts
│   └── GoogleMapsService.ts
├── utils/               # Helper functions
│   └── PricingHelpers.ts
├── types/               # TypeScript definitions
│   └── pricing.types.ts
├── config/              # Configuration files
│   └── pricing.config.ts
├── routes/              # API route definitions
│   ├── pricing.ts
│   ├── testing.ts
│   └── config.ts
└── server.ts            # Main application entry
```

### Key Components

**PricingEngine**: Core calculation logic with 15 pricing factors
**PricingHelpers**: Time detection, zone detection, airport recognition
**GoogleMapsService**: Distance/duration fetching for testing
**Configuration**: Type-safe pricing parameters in TypeScript

## 💰 Pricing Factors Implementation

### 1. Base Fare
Per-vehicle starting charge (£70-140)

### 2. Distance Fee (Mile-Based)
- First 6 miles: Higher rate (£2.8-4.2/mile)
- After 6 miles: Lower rate (£2.2-3.5/mile)
- Automatic km→miles conversion

### 3. Time Fee
Per-minute charges (£0.45-0.75/min) with minimum billable time

### 4. Time Multipliers
- **Night** (22:00-06:00): +30%
- **Peak Morning** (07:00-09:00): +20%  
- **Peak Evening** (17:00-19:00): +20%
- **Weekend**: +15%

### 5. Airport Fees
- Heathrow/Gatwick: £5
- Stansted: £7
- Luton: £6
- City: £4

### 6. Zone Fees
- Central London: £15
- ULEZ: £12.50
- LEZ: £7.50

### 7. Hourly Rates
Separate in-town/out-of-town rates with 3-hour minimum

### 8. Additional Services
- Multi-stop: £15/stop
- Waiting time: £12.50/15min after free period
- Corporate discounts: 10-15%

### 9-15. Other Factors
Minimum fares, rounding policies, cancellation fees, toll charges, extras, surge pricing capability, event multipliers

## 🧪 Testing Examples

### Short Trip (Central London)
```bash
curl -X POST http://localhost:3001/api/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": "Trafalgar Square",
    "dropoff": "Oxford Circus",
    "vehicleType": "executive", 
    "bookingType": "one_way",
    "dateTime": "2024-01-15T14:30:00Z",
    "distance": 2,
    "duration": 15
  }'
# Result: £90 (minimum fare protection)
```

### Airport Transfer
```bash
curl -X POST http://localhost:3001/api/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": "Central London",
    "dropoff": "Heathrow Airport",
    "vehicleType": "luxury",
    "bookingType": "one_way", 
    "dateTime": "2024-01-15T14:30:00Z",
    "distance": 28,
    "duration": 55
  }'
# Result: £190 (includes £5 airport fee)
```

### Hourly Booking
```bash
curl -X POST http://localhost:3001/api/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": "Central London",
    "dropoff": "Business meetings",
    "vehicleType": "suv",
    "bookingType": "hourly",
    "dateTime": "2024-01-15T14:30:00Z",
    "distance": 20,
    "duration": 300
  }'
# Result: £970 (5 hours at £150/hr + base + zones)
```

### Night Surcharge
```bash
curl -X POST http://localhost:3001/api/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": "Central London",
    "dropoff": "Heathrow Airport",
    "vehicleType": "executive",
    "bookingType": "one_way",
    "dateTime": "2024-01-15T23:00:00Z",
    "distance": 28,
    "duration": 55
  }'
# Result: £188 (30% night surcharge applied)
```

## 🔧 Configuration

Pricing parameters are centralized in `src/config/pricing.config.ts` with TypeScript interfaces ensuring type safety. All rates can be easily modified without code changes.

### Key Configuration Areas:
- **Vehicle rates**: Base fares, per-mile rates, hourly rates, minimums
- **Time multipliers**: Peak hours, night rates, weekend surcharges
- **Zone definitions**: Airport codes, congestion zones, toll roads
- **Service policies**: Waiting time, multi-stop fees, corporate discounts
- **Business rules**: Rounding policies, cancellation terms, minimum fares

## 🌍 Deployment

### Environment Variables
```bash
PORT=3001
NODE_ENV=production
GOOGLE_MAPS_API_KEY=your_key_here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Build & Deploy
```bash
npm run build
npm start
```

The application builds to `dist/` directory and runs the compiled JavaScript in production.

## 📈 Future Enhancements

- **Admin Interface**: Web UI for real-time pricing management
- **Analytics**: Pricing performance and optimization insights
- **Advanced Surge**: Dynamic pricing based on demand/supply
- **Multi-Currency**: Support for international operations
- **Route Optimization**: Integration with routing services
- **Corporate Portal**: Dedicated booking interface for business accounts

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is proprietary software owned by Vantage Lane.

## 📞 Support

For technical support or pricing calibration requests, please contact the development team.

---

**Built with ❤️ for London's finest chauffeur services**
