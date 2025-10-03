# Changelog

All notable changes to the Vantage Lane Pricing Backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-03

### 🎉 Initial Release

#### Added
- **Core Pricing Engine** with 15 comprehensive pricing factors
- **TypeScript architecture** with strict type safety
- **4 Vehicle Classes**: Executive (E-Class), Luxury (S-Class), SUV (Range Rover), Van/MPV (V-Class)
- **Multiple Booking Types**: One-way, return, hourly hire, fleet bookings
- **London-Specific Features**:
  - Mile-based pricing system (UK standard)
  - Airport fees for all major London airports (LHR, LGW, STN, LTN, LCY)
  - ULEZ, LEZ, and congestion charge integration
  - Zone-based fee detection
- **Time-Based Multipliers**:
  - Day/night rates (30% night surcharge)
  - Peak hour pricing (20% surcharge 07:00-09:00, 17:00-19:00)
  - Weekend rates (15% surcharge)
- **Professional Rate Structure**:
  - Competitive rates calibrated against Gerrard Chauffeur Drive and TBR/IO London
  - Tiered distance pricing (first 6 miles at premium rate)
  - Hourly rates with in-town/out-of-town differentiation
  - 3-hour minimum for hourly bookings
- **Google Maps Integration** for testing and development
- **Corporate Pricing**: Tier-based discount system (10% and 15% tiers)
- **Additional Services**: Multi-stop fees, waiting time charges, premium extras

#### API Endpoints
- `POST /api/pricing/calculate` - Production pricing endpoint
- `POST /api/testing/calculate-with-maps` - Google Maps integration for testing
- `GET /api/config/vehicle-types` - Available vehicle configurations
- `GET /api/config/booking-types` - Available booking types
- `GET /health` - Service health check

#### Technical Features
- **Modular Architecture**: Clean separation of concerns
- **Type Safety**: Full TypeScript implementation with strict interfaces
- **Error Handling**: Comprehensive error responses and validation
- **Rate Limiting**: 100 requests per 15-minute window per IP
- **Security**: Helmet.js, CORS, input validation
- **Environment Configuration**: Flexible deployment settings
- **Documentation**: Complete API documentation and examples

#### Pricing Factors Implemented
1. **Base Fare**: Vehicle-specific starting charges (£70-£140)
2. **Distance Fee**: Tiered mile-based pricing with UK conversion
3. **Time Fee**: Per-minute charges with minimum billing
4. **Time Multipliers**: Dynamic rates based on time of day/week
5. **Airport Fees**: Specific charges per airport with free waiting periods
6. **Zone Fees**: Congestion, ULEZ, LEZ, and toll charges
7. **Multi-Stop Charges**: £15 per additional stop
8. **Waiting Time**: £12.50 per 15-minute increment after free period
9. **Optional Extras**: Child seats, meet & greet, premium services
10. **Corporate Discounts**: Percentage-based tier system
11. **Cancellation Policies**: Industry-standard 2-hour free cancellation
12. **Minimum Fares**: Per-vehicle minimum charges for profitability
13. **Rounding Policies**: Premium £5 rounding for professional pricing
14. **Hourly Rates**: Separate in-town/out-of-town pricing with minimums
15. **Event Multipliers**: Framework for holiday and special event pricing

#### Testing & Validation
- **Production-Ready**: Tested against real London routes
- **Competitive Pricing**: Aligned with premium market rates
- **Edge Cases**: Minimum fares, short trips, long-distance journeys
- **Time Scenarios**: Day/night/peak/weekend rate validation
- **Vehicle Classes**: All types tested across different journey profiles

#### Performance & Reliability
- **Fast Calculations**: Sub-second pricing computation
- **Memory Efficient**: Optimized TypeScript compilation
- **Scalable**: Stateless design for horizontal scaling
- **Reliable**: Comprehensive error handling and fallbacks

### Development Notes
- Built with competitive analysis of London's premium chauffeur market
- Pricing methodology based on industry standards and competitor benchmarking
- Future-ready architecture for admin interfaces and advanced features
- Comprehensive documentation for frontend integration

### Dependencies
- Express.js 4.18.2 with TypeScript support
- Google Maps APIs for distance/duration calculation
- Express-validator for input validation
- Helmet.js and CORS for security
- Rate limiting and professional middleware stack

---

## Future Releases

### Planned for v1.1.0
- **Admin Interface API**: Endpoints for real-time pricing management
- **Enhanced Analytics**: Pricing performance tracking
- **Return Journey Logic**: Proper round-trip calculations
- **Fleet Booking Support**: Multi-vehicle booking coordination

### Planned for v1.2.0  
- **Advanced Surge Pricing**: Dynamic demand-based pricing
- **Route Optimization**: Integration with advanced routing services
- **Multi-Currency Support**: International operation capabilities
- **Enhanced Corporate Features**: Custom pricing tiers and contracts

### Planned for v2.0.0
- **Machine Learning Integration**: Predictive pricing optimization
- **Real-Time Analytics Dashboard**: Live pricing performance monitoring
- **Advanced Admin Portal**: Comprehensive management interface
- **API v2**: Enhanced endpoints with additional functionality
