# 🎯 PLAN: Trip Interpretation - Backend ca Sursă de Adevăr

**Data:** 24 Martie 2026  
**Obiectiv:** Mutăm logica de trip interpretation din frontend în backend pricing

---

## 📋 SITUAȚIA ACTUALĂ

### ❌ Problema
- Backend primește doar `pickup`, `dropoff`, `distance`, `duration`
- Backend NU știe de `additionalStops`
- Frontend construiește legs în `buildLegsPayload()`
- Pricing calculează pe distanță totală, nu pe stops reale
- Risc: pricing calculat diferit de booking salvat

### ✅ Ce funcționează
- PricingEngine calculează corect pentru input simplu
- QuoteService persistă quotes
- PaymentService gestionează payment intents
- WebhookService procesează events

---

## 🎯 OBIECTIVUL FINAL

Backend-ul de pricing devine **Trip Interpreter + Pricing Truth**:
- Primește `pickup + additionalStops + dropoff`
- Normalizează ruta
- Construiește legs logice
- Calculează pricing pe legs reale
- Salvează quote cu model complet

---

## 📝 PLAN DE IMPLEMENTARE

### **FAZA 1: Extindere Model Input** ✅ PRIORITATE
**Fișiere afectate:**
- `src/types/pricing.types.ts`
- `src/api/pricing/calculate-and-quote.ts`

**Modificări:**
1. Creează `TripPoint` interface:
   ```typescript
   interface TripPoint {
     address: string;
     placeId?: string | null;
     lat?: number | null;
     lng?: number | null;
   }
   ```

2. Extinde `PricingRequestData`:
   ```typescript
   interface PricingRequestData {
     // Vechile câmpuri (păstrăm pentru compatibilitate)
     pickup: string | TripPoint;  // Accept both
     dropoff: string | TripPoint; // Accept both
     
     // NOI
     additionalStops?: TripPoint[];
     
     // Rest rămâne la fel
     vehicleType: VehicleType;
     bookingType: BookingType;
     dateTime: string;
     distance?: number;
     duration?: number;
     // ...
   }
   ```

3. Adaptează `calculate-and-quote` endpoint:
   - Accept `additionalStops` în request body
   - Pasează către PricingEngine

---

### **FAZA 2: Route Normalization** ✅ PRIORITATE
**Fișier nou:** `src/services/RouteNormalizer.ts`

**Responsabilități:**
- Validează pickup (required)
- Validează dropoff (required)
- Curăță stops goale/invalide
- Ordonează route points: `[pickup, ...stops, dropoff]`
- Returnează model normalizat

**Interface output:**
```typescript
interface NormalizedRoute {
  points: TripPoint[];
  pickup: TripPoint;
  dropoff: TripPoint;
  stops: TripPoint[];
  totalPoints: number;
}
```

**Funcții:**
```typescript
class RouteNormalizer {
  static normalize(request: PricingRequestData): NormalizedRoute
  static validatePoint(point: TripPoint): boolean
  static cleanStops(stops: TripPoint[]): TripPoint[]
}
```

---

### **FAZA 3: Leg Building** ✅ PRIORITATE
**Fișier nou:** `src/services/LegBuilder.ts`

**Responsabilități:**
- Primește `NormalizedRoute`
- Construiește legs logice pentru fiecare segment
- Suportă ONE_WAY, RETURN, HOURLY, DAILY, FLEET

**Interface output:**
```typescript
interface LogicalLeg {
  leg_number: number;
  leg_kind: 'main' | 'return';
  pickup: TripPoint;
  dropoff: TripPoint;
  scheduled_at: string;
  distance_miles?: number;
  duration_min?: number;
}
```

**Exemplu ONE_WAY cu 2 stops:**
```
Input: Heathrow → Oxford → Cambridge → London
Output:
  Leg 1: Heathrow → Oxford
  Leg 2: Oxford → Cambridge
  Leg 3: Cambridge → London
```

**Funcții:**
```typescript
class LegBuilder {
  static buildLegs(route: NormalizedRoute, bookingType: BookingType, dateTime: string): LogicalLeg[]
  static buildOnewayLegs(route: NormalizedRoute, dateTime: string): LogicalLeg[]
  static buildReturnLegs(route: NormalizedRoute, outboundDateTime: string, returnDateTime: string): LogicalLeg[]
}
```

---

### **FAZA 4: Adaptare PricingEngine** 🔄 MEDIE PRIORITATE
**Fișier:** `src/services/PricingEngine.ts`

**Modificări:**
1. Adaugă suport pentru legs în calcul:
   ```typescript
   static async calculate(request: PricingRequestData): Promise<PricingResult> {
     // 1. Normalizează ruta
     const route = RouteNormalizer.normalize(request);
     
     // 2. Construiește legs
     const legs = LegBuilder.buildLegs(route, request.bookingType, request.dateTime);
     
     // 3. Calculează pricing (poate fi per leg sau total)
     // ...
   }
   ```

2. Opțional: Adaugă `calculatePerLeg()` pentru breakdown detaliat

3. Include legs în `PricingResult`:
   ```typescript
   interface PricingResult {
     // Existing fields
     finalPrice: number;
     breakdown: {...};
     
     // NEW
     route?: NormalizedRoute;
     legs?: LogicalLeg[];
   }
   ```

---

### **FAZA 5: Adaptare QuoteService** 🔄 MEDIE PRIORITATE
**Fișier:** `src/services/QuoteService.ts`

**Modificări:**
1. Salvează route model în quote:
   ```typescript
   line_items: {
     components: [...],
     discounts: [...],
     meta: {
       trip: {
         pickup: route.pickup,
         dropoff: route.dropoff,
         stops: route.stops,
         legs: legs.map(l => ({
           leg_number: l.leg_number,
           pickup: l.pickup.address,
           dropoff: l.dropoff.address
         }))
       }
     }
   }
   ```

2. Permite reconstitution din quote

---

### **FAZA 6: Booking Creation Refactor** ⏳ LOW PRIORITY (DUPĂ BACKEND)
**Fișiere afectate:**
- `vantage-lane-2.0/src/app/api/bookings/route.ts`
- `vantage-lane-2.0/src/services/booking-mapping/dbPayload.ts`

**Modificări:**
- Scoate leg building din frontend
- Folosește legs din quote sau apelează backend pentru leg generation
- Simplifică `buildLegsPayload()`

**⚠️ NU FACEM ACUM - Doar după ce backend-ul e gata**

---

### **FAZA 7: UI Cleanup** ⏳ LOW PRIORITY (ULTIMUL)
**Fișiere afectate:**
- `vantage-lane-2.0/src/hooks/booking-store/*`
- `vantage-lane-2.0/src/features/booking/*`

**Modificări:**
- Cleanup cod mort
- Eventual simplificare request building

**⚠️ NU FACEM ACUM - Doar după booking flow**

---

## 🔄 ORDINEA DE EXECUȚIE

### **ACUM (Sprint 1):**
1. ✅ Extinde `PricingRequestData` cu `additionalStops`
2. ✅ Creează `RouteNormalizer`
3. ✅ Creează `LegBuilder`
4. ✅ Adaptează `calculate-and-quote` endpoint
5. ✅ Adaptează `PricingEngine.calculate()`
6. ✅ Testează cu ONE_WAY + 2 stops

### **APOI (Sprint 2):**
7. 🔄 Adaptează `QuoteService` pentru route snapshot
8. 🔄 Testează quote creation cu stops
9. 🔄 Testează `convertQuoteToBooking` cu stops

### **MAI TÂRZIU (Sprint 3):**
10. ⏳ Refactorizează booking creation în frontend
11. ⏳ Scoate leg building din `buildLegsPayload()`
12. ⏳ Simplifică `app/api/bookings/route.ts`

### **LA FINAL (Sprint 4):**
13. ⏳ UI cleanup
14. ⏳ Documentation update

---

## 📊 COMPATIBILITATE

### **Backward Compatibility:**
- `pickup`/`dropoff` rămân string pentru compatibilitate
- `distance`/`duration` rămân opționale
- Vechile request-uri funcționează în continuare
- Noul câmp `additionalStops` e opțional

### **Migration Strategy:**
1. Backend suportă AMBELE formate (vechi + nou)
2. Frontend trimite treptat noul format
3. După migrare completă, curățăm codul vechi

---

## 🧪 TESTE NECESARE

### **Unit Tests:**
- `RouteNormalizer.normalize()` cu diverse inputs
- `LegBuilder.buildLegs()` pentru toate booking types
- `PricingEngine.calculate()` cu stops

### **Integration Tests:**
- `POST /api/pricing/calculate-and-quote` cu stops
- Quote creation cu route model
- Booking conversion cu legs

### **E2E Tests:**
- ONE_WAY cu 0 stops
- ONE_WAY cu 2 stops
- RETURN cu 1 stop pe fiecare leg

---

## 📝 NOTES

### **Design Decisions:**
1. **Legs separate vs stops_raw:**
   - Backend construiește legs LOGICE separate
   - DB poate stoca fie legs separate, fie 1 leg cu stops_raw
   - Decizia finală la persistență, nu la interpretare

2. **Pricing per leg vs total:**
   - Inițial: pricing total (backward compatible)
   - Opțional: pricing per leg pentru breakdown detaliat

3. **Route normalization:**
   - Validare strictă în backend
   - Frontend trimite raw data
   - Backend decide ce e valid

### **Risks:**
- Breaking changes dacă nu păstrăm compatibilitate
- Performance impact dacă leg building e prea complex
- DB schema changes dacă trecem la legs separate

### **Mitigations:**
- Dual format support (vechi + nou)
- Feature flags pentru rollout treptat
- Extensive testing înainte de deploy

---

## ✅ DEFINITION OF DONE

### **Pentru FAZA 1-3 (Backend Core):**
- [ ] `TripPoint` interface definit
- [ ] `PricingRequestData` extins cu `additionalStops`
- [ ] `RouteNormalizer` implementat + tested
- [ ] `LegBuilder` implementat + tested
- [ ] `calculate-and-quote` acceptă stops
- [ ] `PricingEngine` consumă route normalizat
- [ ] Unit tests pass
- [ ] Integration test: ONE_WAY cu 2 stops funcționează

### **Pentru FAZA 4-5 (Quote Integration):**
- [ ] `QuoteService` salvează route model
- [ ] Quote include legs în metadata
- [ ] `convertQuoteToBooking` folosește legs din quote
- [ ] Tests pass

### **Pentru FAZA 6-7 (Frontend Cleanup):**
- [ ] Leg building scos din frontend
- [ ] `buildLegsPayload()` simplificat
- [ ] UI cleanup complet
- [ ] Documentation updated

---

## 🚀 NEXT STEPS

**IMEDIAT:**
```bash
# 1. Creează branch nou
git checkout -b feature/trip-interpretation-backend

# 2. Implementează FAZA 1: Extinde model
# Fișier: src/types/pricing.types.ts

# 3. Implementează FAZA 2: RouteNormalizer
# Fișier: src/services/RouteNormalizer.ts

# 4. Implementează FAZA 3: LegBuilder
# Fișier: src/services/LegBuilder.ts
```

**APOI:**
- Adaptează PricingEngine
- Testează end-to-end
- Commit + push
- Review + merge

---

**STATUS:** 📝 Plan aprobat, ready pentru implementare
**FOCUS:** Backend pricing core logic - NU atingem UI-ul încă
