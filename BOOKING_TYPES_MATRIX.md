# 📊 MATRICE COMPLETĂ - BOOKING TYPES

**Data:** 24 Martie 2026  
**Scop:** Definire clară a tuturor booking types înainte de implementare

---

## 🎯 BOOKING TYPES OVERVIEW

| **Type** | **Categorie** | **Pricing Basis** | **Route-Based?** | **Time-Based?** | **Status** |
|----------|---------------|-------------------|------------------|-----------------|------------|
| **ONE_WAY** | Journey | Distance + Time | ✅ Da | 🟡 Parțial | 🟡 Partial |
| **RETURN** | Journey | Distance + Time × 2 | ✅ Da | 🟡 Parțial | 🟡 Partial |
| **HOURLY** | Service | Hourly Rate | 🟡 Opțional | ✅ Da | ✅ Done |
| **DAILY** | Service | Daily Rate | 🟡 Opțional | ✅ Da | ✅ Done |
| **FLEET** | Multiplier | Depends on base type | Depends | Depends | ✅ Done |
| **BESPOKE** | Request Form | N/A (manual quote) | ❌ Nu | ❌ Nu | ⏳ Future |
| **EVENTS** | Special | TBD | ⏳ TBD | ⏳ TBD | ⏳ Future |
| **CORPORATE** | Layer | TBD | ⏳ TBD | ⏳ TBD | ⏳ Future |

---

## 1️⃣ ONE_WAY

### **Descriere:**
Un singur journey de la pickup la dropoff, cu posibilitate de stops intermediare.

### **Required Input:**
```typescript
{
  bookingType: 'one_way',
  vehicleType: VehicleType,
  dateTime: string,
  pickup: TripPoint,
  dropoff: TripPoint
}
```

### **Optional Input:**
```typescript
{
  additionalStops?: TripPoint[],
  distance?: number,
  duration?: number,
  extras?: string[],
  corporateTier?: string
}
```

### **Route Normalization:**
✅ **DA** - Trebuie normalizat:
- `[pickup, ...additionalStops, dropoff]`
- Validare coordonate
- Sanitizare adrese

### **Leg Building:**
✅ **DA** - Construiește legs:
- 0 stops: 1 leg (pickup → dropoff)
- 1 stop: 2 legs (pickup → stop1 → dropoff)
- 2 stops: 3 legs (pickup → stop1 → stop2 → dropoff)
- N stops: N+1 legs

### **Pricing Basis:**
- Base fare
- Distance fee (per mile, tiered)
- Time fee (per minute)
- Airport fees (dacă pickup/dropoff e airport)
- Zone fees (congestion, etc.)
- Toll fees (dacă ruta include toll roads)
- **Multi-stop fee** (per stop adițional)
- Service item fees (extras)
- Time multipliers (peak, night, weekend)
- Corporate discounts

### **Pricing Formula:**
```
Total = (BaseFare + DistanceFee + TimeFee + AirportFees + ZoneFees + TollFees + MultiStopFees + ServiceFees) 
        × Multipliers 
        - Discounts
```

### **Quote Snapshot Requirements:**
```typescript
{
  pickup: TripPoint,
  dropoff: TripPoint,
  stops: TripPoint[],
  legs: LogicalLeg[],
  distance_miles: number,
  duration_min: number,
  pricing_breakdown: {...}
}
```

### **Validation Rules:**
- `pickup` required
- `dropoff` required
- `vehicleType` required
- `dateTime` required
- `additionalStops` max 5 (business rule)
- Dacă `distance` lipsește → calculate from route
- Dacă `duration` lipsește → calculate from route

### **Status Actual:**
- ✅ Funcționează pentru pickup → dropoff simplu
- ❌ NU suportă `additionalStops`
- ❌ NU calculează multi-stop fee

---

## 2️⃣ RETURN

### **Descriere:**
Două journeys: outbound (dus) și inbound (întors), cu posibilitate de stops pe fiecare leg.

### **Required Input:**
```typescript
{
  bookingType: 'return',
  vehicleType: VehicleType,
  
  // Outbound
  outboundDateTime: string,
  outboundPickup: TripPoint,
  outboundDropoff: TripPoint,
  
  // Inbound
  inboundDateTime: string,
  inboundPickup: TripPoint,
  inboundDropoff: TripPoint
}
```

### **Optional Input:**
```typescript
{
  outboundStops?: TripPoint[],
  inboundStops?: TripPoint[],
  
  // Sau simplified (same locations reversed)
  isDifferentReturnLocation?: boolean,
  
  distance?: number,
  duration?: number,
  extras?: string[],
  corporateTier?: string
}
```

### **Route Normalization:**
✅ **DA** - Două route separate:
- Outbound: `[outboundPickup, ...outboundStops, outboundDropoff]`
- Inbound: `[inboundPickup, ...inboundStops, inboundDropoff]`

### **Leg Building:**
✅ **DA** - Construiește legs pentru ambele journeys:
- Outbound legs (leg_kind: 'main')
- Inbound legs (leg_kind: 'return')

### **Pricing Basis:**
- Calculează pricing pentru outbound
- Calculează pricing pentru inbound
- Aplică return discount (dacă există în config)
- Total = outbound + inbound - discount

### **Pricing Formula:**
```
OutboundPrice = calculate(outbound route)
InboundPrice = calculate(inbound route)
ReturnDiscount = (OutboundPrice + InboundPrice) × return_settings.discount_rate
Total = OutboundPrice + InboundPrice - ReturnDiscount
```

### **Quote Snapshot Requirements:**
```typescript
{
  outbound: {
    pickup: TripPoint,
    dropoff: TripPoint,
    stops: TripPoint[],
    legs: LogicalLeg[],
    pricing: {...}
  },
  inbound: {
    pickup: TripPoint,
    dropoff: TripPoint,
    stops: TripPoint[],
    legs: LogicalLeg[],
    pricing: {...}
  },
  return_discount: number,
  total_pricing: {...}
}
```

### **Validation Rules:**
- Toate câmpurile outbound required
- Toate câmpurile inbound required
- `inboundDateTime` > `outboundDateTime`
- Minimum hours between trips (din config)
- Max stops per journey: 5

### **Status Actual:**
- ✅ Există `BookingTypeHandlers.applyReturnTripLogic()`
- ✅ Există `return_settings` în config
- ❌ NU suportă stops pe legs
- ❌ Input model incomplet

---

## 3️⃣ HOURLY

### **Descriere:**
Service rezervat pe ore, cu pickup point și eventual route flexibil. NU e journey fix.

### **Required Input:**
```typescript
{
  bookingType: 'hourly',
  vehicleType: VehicleType,
  dateTime: string,
  hours: number,
  pickup: TripPoint
}
```

### **Optional Input:**
```typescript
{
  dropoff?: TripPoint,          // Poate fi necunoscut
  estimatedRoute?: TripPoint[], // Route aproximativ
  areaRestriction?: string,     // 'in_town' | 'out_of_town'
  extras?: string[],
  corporateTier?: string
}
```

### **Route Normalization:**
🟡 **OPȚIONAL** - Nu e route-first:
- Dacă există `estimatedRoute` → normalizează
- Altfel → doar pickup point

### **Leg Building:**
❌ **NU** - Nu are sens legs clasice pentru hourly:
- E un service pe timp, nu journey segmentat
- Poate crea 1 "leg" simbolic pentru DB consistency

### **Pricing Basis:**
- Hourly rate (per hour)
- Minimum hours (din config)
- Overtime rate (dacă depășește)
- Distance cap (dacă există în config)
- Area multiplier (in_town vs out_of_town)

### **Pricing Formula:**
```
BasePrice = hourly_rate × hours
MinimumPrice = hourly_rate × minimum_hours
OvertimePrice = (hours - included_hours) × overtime_rate
Total = max(BasePrice, MinimumPrice) + OvertimePrice + ServiceFees
```

### **Quote Snapshot Requirements:**
```typescript
{
  pickup: TripPoint,
  hours: number,
  hourly_rate: number,
  minimum_hours: number,
  area_restriction?: string,
  pricing: {...}
}
```

### **Validation Rules:**
- `pickup` required
- `hours` required
- `hours` >= `minimum_hours` (din config)
- `hours` <= `maximum_hours` (din config)
- Dacă `distance` provided → check against `distance_limit_per_hour`

### **Status Actual:**
- ✅ Există `FeeCalculators.calculateHourlyFee()`
- ✅ Există `hourly_settings` în config
- ✅ Validare `hours` required
- ✅ Funcționează

---

## 4️⃣ DAILY

### **Descriere:**
Service rezervat pe zile, similar cu hourly dar pe interval mai lung.

### **Required Input:**
```typescript
{
  bookingType: 'daily',
  vehicleType: VehicleType,
  dateTime: string,
  days: number,
  pickup: TripPoint
}
```

### **Optional Input:**
```typescript
{
  dropoff?: TripPoint,
  estimatedRoute?: TripPoint[],
  areaRestriction?: string,
  extras?: string[],
  corporateTier?: string
}
```

### **Route Normalization:**
🟡 **OPȚIONAL** - Similar cu hourly

### **Leg Building:**
❌ **NU** - Nu are sens legs clasice

### **Pricing Basis:**
- Daily rate (per day)
- Minimum days (din config)
- Hours per day included (din config)
- Distance cap per day (dacă există)
- Overtime/extra charges

### **Pricing Formula:**
```
BasePrice = daily_rate × days
MinimumPrice = daily_rate × minimum_days
Total = max(BasePrice, MinimumPrice) + ServiceFees
```

### **Quote Snapshot Requirements:**
```typescript
{
  pickup: TripPoint,
  days: number,
  daily_rate: number,
  minimum_days: number,
  hours_per_day: number,
  pricing: {...}
}
```

### **Validation Rules:**
- `pickup` required
- `days` required
- `days` >= `minimum_days`
- `days` <= `maximum_days`

### **Status Actual:**
- ✅ Există `FeeCalculators.calculateDailyFee()`
- ✅ Există `daily_settings` în config
- ✅ Validare `days` required
- ✅ Funcționează

---

## 5️⃣ FLEET

### **Descriere:**
Multiplicator peste un tip de booking de bază (ONE_WAY, HOURLY, DAILY). Mai multe vehicule simultan.

### **Conceptual Model:**
```
FLEET = base_booking_type × number_of_vehicles + fleet_discount
```

### **Required Input:**
```typescript
{
  bookingType: 'fleet',
  baseServiceType: 'one_way' | 'hourly' | 'daily',
  
  // Base booking fields (depends on baseServiceType)
  ...baseBookingFields,
  
  // Fleet specific
  fleetConfig: {
    [vehicleCategory: string]: number  // e.g., { executive: 2, luxury: 1 }
  }
}
```

### **Optional Input:**
```typescript
{
  fleetMode?: 'standard' | 'hourly' | 'daily',
  extras?: string[],
  corporateTier?: string
}
```

### **Route Normalization:**
Depends on `baseServiceType`:
- ONE_WAY → ✅ DA
- HOURLY → 🟡 OPȚIONAL
- DAILY → 🟡 OPȚIONAL

### **Leg Building:**
Depends on `baseServiceType`:
- ONE_WAY → ✅ DA (per vehicle)
- HOURLY → ❌ NU
- DAILY → ❌ NU

### **Pricing Basis:**
1. Calculează pricing pentru base booking type
2. Multiplică cu numărul de vehicule per categorie
3. Aplică fleet discount (tier-based)

### **Pricing Formula:**
```
BasePrice = calculate(base_booking_type)
FleetTotal = sum(BasePrice × vehicle_count per category)
FleetDiscount = FleetTotal × fleet_discount_rate (based on tier)
Total = FleetTotal - FleetDiscount
```

### **Fleet Discount Tiers:**
```typescript
tier1: { min_vehicles: 3, discount_rate: 0.05 }  // 5% off
tier2: { min_vehicles: 5, discount_rate: 0.10 }  // 10% off
```

### **Quote Snapshot Requirements:**
```typescript
{
  base_service_type: string,
  fleet_config: {...},
  vehicles: [
    {
      category: string,
      count: number,
      unit_price: number,
      total: number
    }
  ],
  fleet_discount: number,
  total_pricing: {...}
}
```

### **Validation Rules:**
- `fleetConfig` required
- Total vehicles >= 2 (altfel nu e fleet)
- Validate base booking type fields
- Validate vehicle categories exist

### **Status Actual:**
- ✅ Există `BookingTypeHandlers.applyFleetLogic()`
- ✅ Există `fleet_settings` în config
- ✅ Validare `fleetConfig` required
- ⚠️ **Problema:** Fleet e tratat ca tip separat, nu ca layer peste base type

---

## 6️⃣ BESPOKE

### **Descriere:**
Formular de cerere pentru quote manual. NU intră în pricing engine automat.

### **Natura:**
- Request form only
- NU calculează pricing automat
- NU creează quote automat
- Admin/operator creează quote manual

### **Required Input:**
```typescript
{
  bookingType: 'bespoke',
  customRequirements: string,  // Free text description
  pickup?: TripPoint,
  dropoff?: TripPoint,
  dateTime?: string
}
```

### **Optional Input (din TripConfiguration real):**
```typescript
{
  bespoke?: {
    budgetMinGBP?: string,
    budgetMaxGBP?: string,
    currency?: string
  },
  passengers?: number,
  luggage?: number,
  vehiclePreference?: string
}
```

### **Route Normalization:**
❌ **NU** - E free-form request

### **Leg Building:**
❌ **NU** - E free-form request

### **Pricing Basis:**
❌ **NU** - Manual quote by operator

### **Quote Snapshot Requirements:**
```typescript
{
  request_type: 'bespoke',
  customer_info: {...},
  requirements: string,
  status: 'pending_review',
  manual_quote?: {
    created_by: operator_id,
    amount: number,
    notes: string
  }
}
```

### **Validation Rules:**
- `customerInfo` required
- `requirements` required (min length)
- Email valid format
- Phone valid format

### **Status Actual:**
- ⚠️ **NU există în backend pricing**
- ✅ Există în frontend form
- ❌ NU trebuie să intre în PricingEngine

### **Recomandare:**
- Creează endpoint separat: `POST /api/bespoke-requests`
- NU include în `PricingRequestData`
- NU include în `BookingType` enum pentru pricing
- Tratează ca entitate separată

---

## 7️⃣ EVENTS

### **Descriere:**
**FUTURE FEATURE** - Booking pentru evenimente speciale (weddings, conferences, etc.)

### **Status:**
- ✅ Există în `BookingType` enum frontend
- ❌ NU există în UI dock
- ❌ NU există handler în backend
- ❌ NU există validare
- ⏳ **Reserved pentru viitor**

### **Concept:**
Probabil va fi similar cu FLEET dar cu:
- Event-specific requirements
- Multiple pickups/dropoffs
- Coordonare mai complexă
- Event timeline management

### **Recomandare:**
⏳ **NU implementa acum** - păstrează doar enum pentru viitor

---

## 8️⃣ CORPORATE

### **Descriere:**
**FUTURE FEATURE** - Booking pentru clienți corporate cu contract

### **Status:**
- ✅ Există în `BookingType` enum frontend
- ❌ NU există în UI dock
- ❌ NU există handler în backend
- ❌ NU există validare
- ⏳ **Reserved pentru viitor**

### **Concept:**
Probabil va fi layer peste booking types existente cu:
- Corporate account linking
- Invoice generation
- Monthly billing
- Corporate discount tiers (există deja `corporateTier` în PricingRequestData)

### **Recomandare:**
⏳ **NU implementa acum** - păstrează doar enum pentru viitor

---

## 📊 TABEL COMPARATIV

| **Feature** | **ONE_WAY** | **RETURN** | **HOURLY** | **DAILY** | **FLEET** | **BESPOKE** | **EVENTS** | **CORPORATE** |
|-------------|-------------|------------|------------|-----------|-----------|-------------|------------|---------------|
| **Route-based** | ✅ | ✅ | 🟡 | 🟡 | Depends | ❌ | ⏳ | ⏳ |
| **Time-based** | 🟡 | 🟡 | ✅ | ✅ | Depends | ❌ | ⏳ | ⏳ |
| **Needs RouteNormalizer** | ✅ | ✅ | 🟡 | 🟡 | Depends | ❌ | ⏳ | ⏳ |
| **Needs LegBuilder** | ✅ | ✅ | ❌ | ❌ | Depends | ❌ | ⏳ | ⏳ |
| **Supports stops** | ✅ | ✅ | 🟡 | 🟡 | Depends | ❌ | ⏳ | ⏳ |
| **Auto pricing** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⏳ | ⏳ |
| **Manual quote** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⏳ | ⏳ |
| **Pickup required** | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ⏳ | ⏳ |
| **Dropoff required** | ✅ | ✅ | ❌ | ❌ | Depends | ❌ | ⏳ | ⏳ |
| **Hours required** | ❌ | ❌ | ✅ | ❌ | 🟡 | ❌ | ⏳ | ⏳ |
| **Days required** | ❌ | ❌ | ❌ | ✅ | 🟡 | ❌ | ⏳ | ⏳ |
| **FleetConfig required** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ⏳ | ⏳ |
| **Implementation Status** | 🟡 Partial | 🟡 Partial | ✅ Done | ✅ Done | ✅ Done | ⏳ Future | ⏳ Future | ⏳ Future |

---

## 🎯 RECOMANDĂRI ARHITECTURALE

### **1. BookingType Enum**
```typescript
export enum BookingType {
  ONE_WAY = 'one_way',
  RETURN = 'return',
  HOURLY = 'hourly',
  DAILY = 'daily',
  FLEET = 'fleet',
  BESPOKE = 'bespoke',  // Manual quote request
  EVENTS = 'events',    // ⏳ Future: event bookings
  CORPORATE = 'corporate' // ⏳ Future: corporate contracts
}
```

**Note:**
- `BESPOKE`, `EVENTS`, `CORPORATE` există în enum pentru viitor
- Doar ONE_WAY, RETURN, HOURLY, DAILY, FLEET sunt implementate în pricing engine
- BESPOKE folosește flow separat (manual quote)

### **2. PricingRequestData Strategy**

**Opțiunea A: Universal Interface (RECOMANDAT)**
```typescript
interface TripPoint {
  address: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface PricingRequestData {
  bookingType: BookingType;
  vehicleType: VehicleType;
  dateTime: string;
  organizationId?: string;
  
  // Journey fields (ONE_WAY, RETURN)
  pickup?: TripPoint;
  dropoff?: TripPoint;
  additionalStops?: TripPoint[];
  
  // Return specific
  returnDateTime?: string;
  returnPickup?: TripPoint;
  returnDropoff?: TripPoint;
  returnAdditionalStops?: TripPoint[];
  isDifferentReturnLocation?: boolean;
  
  // Time-based fields (HOURLY, DAILY)
  hours?: number;
  days?: number;
  
  // Fleet specific
  fleetConfig?: Record<string, number>;
  baseServiceType?: 'one_way' | 'hourly' | 'daily';
  
  // Optional
  distance?: number;
  duration?: number;
  coordinates?: {
    pickup: Coordinates;
    dropoff: Coordinates;
  };
  extras?: string[];
  corporateTier?: string;
}
```

**Opțiunea B: Discriminated Union**
```typescript
type PricingRequestData =
  | OnewayPricingRequest
  | ReturnPricingRequest
  | HourlyPricingRequest
  | DailyPricingRequest
  | FleetPricingRequest;
```

**Verdict:** **Opțiunea A** pentru:
- Backward compatibility
- Simplitate
- Flexibility
- Easier validation

### **3. Validator Strategy**
```typescript
class PricingRequestValidator {
  static validate(request: PricingRequestData): ValidationResult {
    // Generic validation
    const genericErrors = this.validateGeneric(request);
    if (genericErrors) return genericErrors;
    
    // Type-specific validation
    switch (request.bookingType) {
      case BookingType.ONE_WAY:
        return this.validateOneway(request);
      case BookingType.RETURN:
        return this.validateReturn(request);
      case BookingType.HOURLY:
        return this.validateHourly(request);
      case BookingType.DAILY:
        return this.validateDaily(request);
      case BookingType.FLEET:
        return this.validateFleet(request);
    }
  }
  
  private static validateOneway(request: PricingRequestData): ValidationResult {
    if (!request.pickup) return { valid: false, error: 'pickup required' };
    if (!request.dropoff) return { valid: false, error: 'dropoff required' };
    if (request.additionalStops && request.additionalStops.length > 5) {
      return { valid: false, error: 'max 5 stops allowed' };
    }
    return { valid: true };
  }
  
  // ... similar pentru celelalte tipuri
}
```

---

## ✅ NEXT STEPS

### **IMEDIAT:**
1. ✅ Matrice completă creată
2. Decide implementare strategy:
   - Universal `PricingRequestData` (RECOMANDAT)
   - Sau discriminated unions
3. Implementează pentru **ONE_WAY** complet:
   - Extinde `PricingRequestData`
   - Creează `TripPoint` interface
   - Creează `RouteNormalizer`
   - Creează `LegBuilder`
   - Implementează multi-stop fee
   - Testează

### **APOI:**
4. Implementează **RETURN**
5. Verifică **HOURLY** și **DAILY** (deja funcționează)
6. Refactorizează **FLEET** ca layer peste base types
7. Creează endpoint separat pentru **BESPOKE**

---

**STATUS:** 📝 Matrice completă, ready pentru decizie arhitecturală
**RECOMANDARE:** Universal `PricingRequestData` + validator per type
