# 🔍 AUDIT BACKEND - ONE_WAY ACTUAL

**Data:** 24 Martie 2026  
**Scop:** Verificare ce există deja pentru ONE_WAY în backend înainte de orice modificare

---

## 📋 CE EXISTĂ ACUM

### **1. BookingType Enum**
**Fișier:** `src/types/pricing.types.ts:13-19`

```typescript
export enum BookingType {
  ONE_WAY = 'one_way',
  RETURN = 'return',
  HOURLY = 'hourly',
  DAILY = 'daily',
  FLEET = 'fleet'
}
```

**Status:** ✅ ONE_WAY definit  
**Observație:** Nu există `fleet_hourly`, `fleet_daily` - doar `fleet` generic

---

### **2. PricingRequestData Interface**
**Fișier:** `src/types/pricing.types.ts:34-52`

```typescript
export interface PricingRequestData {
  pickup: string;              // ← DOAR string
  dropoff: string;             // ← DOAR string
  vehicleType: VehicleType;
  bookingType: BookingType;
  dateTime: string;
  distance?: number;           // ← Optional
  duration?: number;           // ← Optional
  hours?: number;              // For hourly bookings
  days?: number;               // For daily bookings
  coordinates?: {
    pickup: Coordinates;
    dropoff: Coordinates;
  };
  extras?: string[];
  corporateTier?: string;
  fleetConfig?: Record<string, number>; // For fleet bookings
  organizationId?: string;
}
```

**Status pentru ONE_WAY:**
- ✅ Suportă `pickup`, `dropoff` ca string
- ✅ Suportă `vehicleType`, `bookingType`, `dateTime`
- ✅ Suportă `distance`, `duration` opțional
- ❌ **NU suportă `additionalStops`**
- ❌ **NU suportă coordonate structurate pentru stops**
- ❌ **NU suportă return trip fields**

---

### **3. Endpoint: calculate-and-quote**
**Fișier:** `src/api/pricing/calculate-and-quote.ts:36-67`

**Input validation:**
```typescript
const {
  pickup,        // string
  dropoff,       // string
  vehicleType,
  bookingType,
  dateTime,
  distance,      // optional
  duration,      // optional
  hours,
  days,
  extras,
  corporateTier
} = req.body;

// Required fields validation
if (!pickup || !dropoff || !vehicleType || !bookingType || !dateTime) {
  return res.status(400).json({
    success: false,
    error: 'Missing required fields: pickup, dropoff, vehicleType, bookingType, dateTime'
  });
}
```

**Status pentru ONE_WAY:**
- ✅ Validează `pickup`, `dropoff` required
- ✅ Validează `vehicleType`, `bookingType`, `dateTime` required
- ❌ **NU validează `additionalStops`**
- ❌ **NU există validare specifică per booking type**

---

### **4. PricingEngine.validateRequest()**
**Fișier:** `src/services/PricingEngine.ts:159-189`

```typescript
private static validateRequest(request: PricingRequestData): string | null {
  if (!request.vehicleType) {
    return 'Vehicle type is required';
  }

  if (!request.bookingType) {
    return 'Booking type is required';
  }

  if (!Object.values(VehicleType).includes(request.vehicleType)) {
    return `Invalid vehicle type: ${request.vehicleType}`;
  }

  if (!Object.values(BookingType).includes(request.bookingType)) {
    return `Invalid booking type: ${request.bookingType}`;
  }

  if (request.bookingType === BookingType.HOURLY && !request.hours) {
    return 'Hours are required for hourly bookings';
  }

  if (request.bookingType === BookingType.DAILY && !request.days) {
    return 'Days are required for daily bookings';
  }

  if (request.bookingType === BookingType.FLEET && !request.fleetConfig) {
    return 'Fleet configuration is required for fleet bookings';
  }

  return null;
}
```

**Status pentru ONE_WAY:**
- ✅ Validează enum values
- ✅ Validează HOURLY needs `hours`
- ✅ Validează DAILY needs `days`
- ✅ Validează FLEET needs `fleetConfig`
- ❌ **NU validează ONE_WAY specific requirements**
- ❌ **NU validează RETURN specific requirements**

---

### **5. PricingEngine.calculate() Flow**
**Fișier:** `src/services/PricingEngine.ts:28-154`

**Flow pentru ONE_WAY:**
```typescript
1. validateRequest() - generic validation
2. Base fare calculation (NOT for hourly/daily)
3. Distance fee calculation (if distance provided)
4. Time fee calculation (if duration provided)
5. Zone fees (airports, congestion)
6. Toll fees
7. Multi-stop fees (există în breakdown dar NU e folosit)
8. Additional services
9. Subtotal calculation
10. Booking type handlers (RETURN / FLEET only)
11. Time multipliers
12. Corporate discounts
13. Minimum fare
14. Rounding
15. Return PricingResult
```

**Status pentru ONE_WAY:**
- ✅ Calculează base fare
- ✅ Calculează distance fee
- ✅ Calculează time fee
- ✅ Calculează zone fees
- ✅ Calculează toll fees
- ⚠️ **Are `multiStopFees` în breakdown DAR nu e folosit**
- ❌ **NU procesează stops**
- ❌ **NU construiește legs**

---

### **6. Multi-Stop Fee Support**
**Fișier:** `src/types/pricing.types.ts:166-181`

```typescript
export interface PricingBreakdownData {
  baseFare: number;
  distanceFee: number;
  timeFee: number;
  airportFees: number;
  zoneFees: number;
  tollFees: number;
  multiStopFees: number;     // ← EXISTĂ dar = 0
  waitingFees: number;
  serviceItemFees: number;
  subtotal: number;
  multipliers: Record<string, number>;
  discounts: number;
  finalPrice: number;
  details: PricingDetail[];
}
```

**Status:**
- ✅ `multiStopFees` field există în breakdown
- ❌ **NU există logică de calcul pentru multi-stop**
- ❌ **NU există în FeeCalculators**

---

### **7. Quote Creation**
**Fișier:** `src/services/QuoteService.ts:32-130`

**createIndependentQuote():**
```typescript
static async createIndependentQuote(
  pricingResult: PricingResult,
  requestData: any,           // ← Primește req.body RAW
  organizationId: string
): Promise<QuoteCreationResult>
```

**Ce salvează:**
- ✅ Pricing breakdown complet
- ✅ Request data RAW în `request_data` field
- ✅ Line items JSONB
- ❌ **NU salvează stops structurat**
- ❌ **NU salvează legs**
- ❌ **NU salvează route model**

---

## 📊 MATRICE: CE LIPSEȘTE PENTRU ONE_WAY

| **Componenta** | **Există?** | **Funcționează?** | **Ce lipsește?** |
|----------------|-------------|-------------------|------------------|
| **Input model** | ✅ Parțial | 🟡 Da, dar incomplet | `additionalStops`, coordonate structurate |
| **Validation** | ✅ Da | 🟡 Generic | Validare specifică ONE_WAY |
| **Route normalization** | ❌ Nu | ❌ Nu | Tot - RouteNormalizer lipsește |
| **Stops processing** | ❌ Nu | ❌ Nu | Tot - nu există logică |
| **Leg building** | ❌ Nu | ❌ Nu | Tot - LegBuilder lipsește |
| **Multi-stop fee** | ⚠️ Field există | ❌ Nu | Logică de calcul lipsește |
| **Pricing calculation** | ✅ Da | ✅ Da | Funcționează pentru pickup→dropoff simplu |
| **Quote creation** | ✅ Da | ✅ Da | Nu salvează stops/legs |

---

## 🎯 CE FUNCȚIONEAZĂ ACUM

### **Scenariul: ONE_WAY simplu (fără stops)**

**Input:**
```json
{
  "pickup": "Heathrow Airport",
  "dropoff": "London",
  "vehicleType": "executive",
  "bookingType": "one_way",
  "dateTime": "2024-03-24T10:00:00Z",
  "distance": 25,
  "duration": 45
}
```

**Flow:**
1. ✅ Endpoint primește request
2. ✅ Validare basic (pickup, dropoff, vehicleType, bookingType, dateTime)
3. ✅ PricingEngine.calculate()
   - Base fare
   - Distance fee (25 miles)
   - Time fee (45 min)
   - Zone fees (Heathrow airport)
   - Multipliers
   - Discounts
4. ✅ QuoteService.createIndependentQuote()
   - Salvează pricing breakdown
   - Salvează request data raw
5. ✅ Returnează quote_id + pricing

**Rezultat:** ✅ **FUNCȚIONEAZĂ PERFECT**

---

### **Scenariul: ONE_WAY cu 2 stops**

**Input:**
```json
{
  "pickup": "Heathrow Airport",
  "additionalStops": [
    { "address": "Oxford", "lat": 51.7520, "lng": -1.2577 },
    { "address": "Cambridge", "lat": 52.2053, "lng": 0.1218 }
  ],
  "dropoff": "London",
  "vehicleType": "executive",
  "bookingType": "one_way",
  "dateTime": "2024-03-24T10:00:00Z"
}
```

**Flow:**
1. ❌ Endpoint NU extrage `additionalStops`
2. ❌ PricingEngine NU primește stops
3. ❌ Calculează doar Heathrow → London direct
4. ❌ NU calculează multi-stop fee
5. ❌ NU construiește legs
6. ❌ Quote NU salvează stops

**Rezultat:** 🔴 **NU FUNCȚIONEAZĂ - stops sunt ignorate**

---

## 🚨 PROBLEME CRITICE IDENTIFICATE

### **1. Input Model Incomplet**
```
❌ PricingRequestData nu suportă additionalStops
❌ Nu există TripPoint interface
❌ pickup/dropoff sunt doar string, nu structuri
```

### **2. Lipsă Route Normalization**
```
❌ Nu există RouteNormalizer
❌ Nu există validare coordonate
❌ Nu există sanitizare adrese
❌ Nu există ordonare route points
```

### **3. Lipsă Leg Building**
```
❌ Nu există LegBuilder
❌ Nu există logică pickup → stop1 → stop2 → dropoff
❌ Nu există construcție legs pentru stops
```

### **4. Multi-Stop Fee Nefuncțional**
```
⚠️ multiStopFees field există în breakdown
❌ DAR nu există logică de calcul
❌ DAR nu există în FeeCalculators
❌ Întotdeauna = 0
```

### **5. Quote Incomplet**
```
❌ Nu salvează stops structurat
❌ Nu salvează legs
❌ Nu salvează route model
❌ Doar request_data raw (care oricum nu conține stops)
```

---

## ✅ CE TREBUIE IMPLEMENTAT PENTRU ONE_WAY

### **PRIORITATE P0 - CRITICAL:**

1. **Extinde PricingRequestData**
   ```typescript
   interface TripPoint {
     address: string;
     placeId?: string | null;
     lat?: number | null;
     lng?: number | null;
   }
   
   interface PricingRequestData {
     // Existing fields...
     additionalStops?: TripPoint[];  // NEW
   }
   ```

2. **Creează RouteNormalizer**
   ```typescript
   class RouteNormalizer {
     static normalize(request: PricingRequestData): NormalizedRoute
     static validatePoint(point: TripPoint): boolean
     static cleanStops(stops: TripPoint[]): TripPoint[]
   }
   ```

3. **Creează LegBuilder**
   ```typescript
   class LegBuilder {
     static buildOnewayLegs(route: NormalizedRoute, dateTime: string): LogicalLeg[]
   }
   ```

4. **Implementează Multi-Stop Fee Calculator**
   ```typescript
   // În FeeCalculators
   static async calculateMultiStopFees(breakdown, request): Promise<void>
   ```

5. **Adaptează calculate-and-quote endpoint**
   ```typescript
   const { pickup, dropoff, additionalStops, ... } = req.body;
   ```

6. **Adaptează PricingEngine.calculate()**
   ```typescript
   const route = RouteNormalizer.normalize(request);
   const legs = LegBuilder.buildOnewayLegs(route, request.dateTime);
   // Calculate multi-stop fee
   await FeeCalculators.calculateMultiStopFees(breakdown, request);
   ```

7. **Adaptează QuoteService**
   ```typescript
   // Salvează route + legs în quote metadata
   line_items: {
     meta: {
       trip: {
         pickup: route.pickup,
         stops: route.stops,
         dropoff: route.dropoff,
         legs: legs
       }
     }
   }
   ```

---

### **PRIORITATE P1 - HIGH:**

8. **Validare specifică ONE_WAY**
   ```typescript
   static validateOnewayRequest(request: PricingRequestData): string | null
   ```

9. **Unit tests pentru RouteNormalizer**

10. **Unit tests pentru LegBuilder**

11. **Integration test ONE_WAY cu stops**

---

## 📝 OBSERVAȚII IMPORTANTE

### **1. Backward Compatibility**
- Vechile request-uri (fără `additionalStops`) TREBUIE să funcționeze
- `pickup`/`dropoff` rămân string pentru compatibilitate
- `additionalStops` e OPȚIONAL

### **2. Multi-Stop Fee**
- Field există deja în breakdown
- Trebuie doar implementată logica de calcul
- Probabil există în DB config (`services.multiStop`)

### **3. Distance/Duration**
- Acum sunt opționale și calculate de frontend
- Cu stops, trebuie recalculate sau primite per segment

### **4. Quote Metadata**
- `request_data` field salvează deja req.body raw
- Trebuie adăugat și model normalizat în `line_items.meta`

---

## 🎯 NEXT STEPS

### **IMEDIAT:**
1. ✅ Creează matrice pentru TOATE booking types (ONE_WAY, RETURN, HOURLY, DAILY, FLEET)
2. ✅ Definește exact ce input trebuie pentru fiecare tip
3. ✅ Decide dacă extindem `PricingRequestData` sau creăm interface-uri separate

### **APOI:**
4. Implementează pentru ONE_WAY:
   - TripPoint interface
   - Extinde PricingRequestData
   - RouteNormalizer
   - LegBuilder
   - Multi-stop fee calculator
   - Adaptează PricingEngine
   - Adaptează QuoteService

### **LA FINAL:**
5. Testează ONE_WAY cu 0, 1, 2, 3 stops
6. Documentează
7. Merge

---

**STATUS:** 📝 Audit complet, ready pentru matrice booking types
**FOCUS:** Nu modificăm nimic până nu avem matricea completă
