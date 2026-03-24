# 🔍 GAP ANALYSIS: Frontend vs Backend

**Data:** 24 Martie 2026  
**Scop:** Identificare precisă a diferențelor dintre ce există în frontend și ce lipsește în backend

---

## 📊 REZUMAT EXECUTIV

### **Problema Principală:**
Frontend colectează `additionalStops` dar backend-ul NU le primește și NU le procesează.

### **Impact:**
- ONE_WAY cu stops → backend calculează doar pickup → dropoff direct
- RETURN cu stops → backend calculează doar outbound/inbound fără stops
- Multi-stop fee → există în breakdown DAR = 0 (nu e calculat)
- Quote → nu salvează stops structurat

---

## 1️⃣ BOOKING TYPES

### **Frontend (`BookingType` enum):**
```typescript
// src/hooks/useBookingState/booking.types.ts:28-36
export type BookingType =
  | 'oneway'
  | 'return'
  | 'hourly'
  | 'daily'
  | 'fleet'
  | 'bespoke'
  | 'events'      // ⏳ Future
  | 'corporate';  // ⏳ Future
```

### **Backend (`BookingType` enum):**
```typescript
// src/types/pricing.types.ts:13-19
export enum BookingType {
  ONE_WAY = 'one_way',
  RETURN = 'return',
  HOURLY = 'hourly',
  DAILY = 'daily',
  FLEET = 'fleet'
  // ❌ Lipsesc: BESPOKE, EVENTS, CORPORATE
}
```

### **GAP:**
- ❌ Backend NU are `BESPOKE`, `EVENTS`, `CORPORATE` în enum
- ⚠️ Diferență naming: frontend `'oneway'` vs backend `'one_way'`

---

## 2️⃣ LOCATION DATA

### **Frontend (`LocationData`):**
```typescript
// src/hooks/useBookingState/booking.types.ts:20-26
export interface LocationData {
  placeId: string;
  address: string;
  coordinates: Coordinates;  // [lng, lat]
  type: 'address' | 'airport' | 'hotel' | 'poi';
  components: Record<string, string>;
}
```

### **Backend (`Coordinates` only):**
```typescript
// src/types/pricing.types.ts:29-32
export interface Coordinates {
  lat: number;
  lng: number;
}
```

### **GAP:**
- ❌ Backend NU are `TripPoint` sau `LocationData` interface
- ❌ Backend NU are `placeId`, `type`, `components`
- ⚠️ Coordonate: frontend `[lng, lat]` vs backend `{lat, lng}`

---

## 3️⃣ TRIP CONFIGURATION - ONE_WAY

### **Frontend (`TripConfiguration`):**
```typescript
// src/hooks/useBookingState/booking.types.ts:38-94
export interface TripConfiguration {
  // ✅ Locations
  pickup: LocationData | null;
  dropoff: LocationData | null;
  additionalStops: LocationData[];  // ← EXISTĂ!
  
  // DateTime
  pickupDateTime: Date | null;
  
  // Passengers
  passengers: number;
  luggage: number;
  flightNumberPickup: string;
  
  // Vehicle
  selectedVehicle: VehicleSelection;
}
```

### **Backend (`PricingRequestData`):**
```typescript
// src/types/pricing.types.ts:34-52
export interface PricingRequestData {
  pickup: string;              // ← DOAR string
  dropoff: string;             // ← DOAR string
  // ❌ NU există additionalStops
  
  vehicleType: VehicleType;
  bookingType: BookingType;
  dateTime: string;
  
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

### **GAP:**
- ❌ Backend NU are `additionalStops`
- ❌ Backend `pickup`/`dropoff` sunt doar string, nu structuri
- ❌ Backend NU are `passengers`, `luggage`, `flightNumber`
- ⚠️ Backend are `coordinates` opțional, dar doar pentru pickup/dropoff

---

## 4️⃣ TRIP CONFIGURATION - RETURN

### **Frontend (`TripConfiguration`):**
```typescript
export interface TripConfiguration {
  // Return locations
  returnPickup: LocationData | null;
  returnDropoff: LocationData | null;
  returnAdditionalStops: LocationData[];  // ← EXISTĂ!
  isDifferentReturnLocation: boolean;
  
  // Return datetime
  returnDateTime: Date | null;
  
  flightNumberReturn: string;
}
```

### **Backend (`PricingRequestData`):**
```typescript
export interface PricingRequestData {
  // ❌ NU există return-specific fields
  // ❌ NU există returnPickup
  // ❌ NU există returnDropoff
  // ❌ NU există returnAdditionalStops
  // ❌ NU există returnDateTime
}
```

### **GAP:**
- ❌ Backend NU suportă return trip fields
- ❌ Backend NU știe de `returnAdditionalStops`
- ❌ Backend NU știe de `isDifferentReturnLocation`

---

## 5️⃣ HOURLY BOOKING

### **Frontend (`TripConfiguration`):**
```typescript
export interface TripConfiguration {
  hoursRequested: number | null;
}
```

### **Backend (`PricingRequestData`):**
```typescript
export interface PricingRequestData {
  hours?: number;  // ✅ EXISTĂ
}
```

### **GAP:**
- ✅ **NONE** - Backend suportă hourly corect

---

## 6️⃣ DAILY BOOKING

### **Frontend (`TripConfiguration`):**
```typescript
export interface TripConfiguration {
  daysRequested: number | null;
  dailyRange: [Date | null, Date | null];
}
```

### **Backend (`PricingRequestData`):**
```typescript
export interface PricingRequestData {
  days?: number;  // ✅ EXISTĂ
}
```

### **GAP:**
- ✅ **NONE** - Backend suportă daily corect
- ⚠️ Backend NU are `dailyRange` (start/end dates)

---

## 7️⃣ BESPOKE BOOKING

### **Frontend (`TripConfiguration`):**
```typescript
export interface TripConfiguration {
  customRequirements: string;
  bespoke?: {
    budgetMinGBP?: string;
    budgetMaxGBP?: string;
    currency?: string;
  };
}
```

### **Backend (`PricingRequestData`):**
```typescript
// ❌ NU există bespoke fields
```

### **GAP:**
- ❌ Backend NU are `customRequirements`
- ❌ Backend NU are `bespoke` budget fields
- ⚠️ Bespoke nu ar trebui în PricingEngine oricum (manual quote)

---

## 8️⃣ FLEET BOOKING

### **Frontend (`TripConfiguration`):**
```typescript
export interface TripConfiguration {
  fleetSelection: FleetSelection;  // Complex object
}
```

### **Backend (`PricingRequestData`):**
```typescript
export interface PricingRequestData {
  fleetConfig?: Record<string, number>;  // ✅ EXISTĂ
}
```

### **GAP:**
- ✅ **MINIMAL** - Backend suportă fleet cu `fleetConfig`
- ⚠️ Frontend are structură mai complexă (`FleetSelection`)

---

## 📊 TABEL COMPARATIV - FIELDS

| **Field** | **Frontend** | **Backend** | **Status** |
|-----------|--------------|-------------|------------|
| **pickup** | `LocationData` | `string` | 🟡 Incomplet |
| **dropoff** | `LocationData` | `string` | 🟡 Incomplet |
| **additionalStops** | `LocationData[]` | ❌ Lipsă | 🔴 LIPSEȘTE |
| **returnPickup** | `LocationData` | ❌ Lipsă | 🔴 LIPSEȘTE |
| **returnDropoff** | `LocationData` | ❌ Lipsă | 🔴 LIPSEȘTE |
| **returnAdditionalStops** | `LocationData[]` | ❌ Lipsă | 🔴 LIPSEȘTE |
| **isDifferentReturnLocation** | `boolean` | ❌ Lipsă | 🔴 LIPSEȘTE |
| **pickupDateTime** | `Date` | `string` (dateTime) | ✅ OK |
| **returnDateTime** | `Date` | ❌ Lipsă | 🔴 LIPSEȘTE |
| **passengers** | `number` | ❌ Lipsă | 🟡 Optional |
| **luggage** | `number` | ❌ Lipsă | 🟡 Optional |
| **flightNumberPickup** | `string` | ❌ Lipsă | 🟡 Optional |
| **hoursRequested** | `number` | `hours` | ✅ OK |
| **daysRequested** | `number` | `days` | ✅ OK |
| **customRequirements** | `string` | ❌ Lipsă | 🟡 Bespoke only |
| **fleetSelection** | `FleetSelection` | `fleetConfig` | ✅ OK |

---

## 🚨 PROBLEME CRITICE

### **P0 - CRITICAL:**

1. **additionalStops lipsește complet**
   - Frontend colectează
   - Backend ignoră
   - Pricing calculat greșit pentru ONE_WAY cu stops

2. **returnAdditionalStops lipsește complet**
   - Frontend colectează
   - Backend ignoră
   - Pricing calculat greșit pentru RETURN cu stops

3. **Multi-stop fee nu e calculat**
   - Field există în breakdown
   - Logica lipsește
   - Întotdeauna = 0

### **P1 - HIGH:**

4. **Return trip fields incomplete**
   - `returnPickup`, `returnDropoff`, `returnDateTime` lipsesc
   - Backend nu poate calcula corect return cu locații diferite

5. **Location data structure mismatch**
   - Frontend: `LocationData` (rich structure)
   - Backend: `string` (doar address)
   - Pierdere de informație (placeId, coordinates, type)

### **P2 - MEDIUM:**

6. **Passenger/luggage info lipsește**
   - Poate fi relevant pentru pricing (extra charges)
   - Poate fi relevant pentru vehicle selection validation

7. **Flight number lipsește**
   - Relevant pentru airport pickups
   - Poate influența wait time fees

---

## ✅ CE FUNCȚIONEAZĂ CORECT

1. **HOURLY** - ✅ Backend suportă complet
2. **DAILY** - ✅ Backend suportă complet
3. **FLEET** - ✅ Backend suportă cu `fleetConfig`
4. **Basic ONE_WAY** (fără stops) - ✅ Funcționează perfect
5. **Basic RETURN** (fără stops, same locations) - ✅ Funcționează

---

## 🎯 PRIORITIZARE FIXES

### **ACUM (Sprint 1):**
1. ✅ Adaugă `TripPoint` interface în backend
2. ✅ Adaugă `additionalStops` în `PricingRequestData`
3. ✅ Implementează `RouteNormalizer`
4. ✅ Implementează `LegBuilder`
5. ✅ Implementează multi-stop fee calculator
6. ✅ Adaptează `PricingEngine` pentru stops
7. ✅ Testează ONE_WAY cu 0, 1, 2, 3 stops

### **APOI (Sprint 2):**
8. Adaugă return trip fields în `PricingRequestData`
9. Adaptează `RouteNormalizer` pentru return
10. Adaptează `LegBuilder` pentru return
11. Testează RETURN cu stops

### **MAI TÂRZIU (Sprint 3):**
12. Adaugă passenger/luggage/flightNumber (optional)
13. Consideră dacă influențează pricing
14. Update quote snapshot structure

---

## 📝 RECOMANDARE FINALĂ

### **Abordare:**
1. **NU modifica frontend** - funcționează corect
2. **Extinde backend** - adaugă suport pentru ce trimite frontend
3. **Backward compatible** - vechile request-uri trebuie să funcționeze
4. **Incremental** - ONE_WAY → RETURN → rest

### **Decizie arhitecturală:**
- **Universal `PricingRequestData`** (nu discriminated unions)
- Toate câmpurile opționale (backward compatible)
- Validator per booking type (validează ce e necesar)

---

**STATUS:** 📝 GAP analysis complet, ready pentru implementare ONE_WAY cu stops
