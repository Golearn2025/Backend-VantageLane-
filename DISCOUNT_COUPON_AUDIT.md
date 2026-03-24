# 🎫 AUDIT: Discounts, Coupons & Corporate Tiers

**Data:** 24 Martie 2026  
**Scop:** Verificare ce există în DB și pricing engine pentru discounts, coupons, corporate tiers

---

## 📊 REZUMAT EXECUTIV

### **Ce EXISTĂ:**
- ✅ **Corporate Discount** - Implementat în pricing engine
- ✅ **Return Discount** - Implementat pentru return bookings
- ✅ **Fleet Discount** - Implementat pentru fleet bookings

### **Ce NU EXISTĂ:**
- ❌ **Coupon/Promo Codes** - NU există în DB
- ❌ **Tabela coupons** - NU există
- ❌ **Discount codes** - NU există
- ❌ **Vouchers** - NU există

---

## 1️⃣ CORPORATE DISCOUNT

### **Status:** ✅ **IMPLEMENTAT și FUNCȚIONAL**

### **Locație în cod:**
**Fișier:** `src/services/FeeCalculators.ts:330-356`

```typescript
/**
 * Apply corporate discounts
 * Reads from: v_active_pricing_version
 */
static async applyDiscounts(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
  if (request.corporateTier) {
    const discounts = await PricingDataService.getCorporateDiscounts();

    let discountRate = 0;

    if (request.corporateTier === 'tier1') {
      discountRate = discounts.tier1;
    } else if (request.corporateTier === 'tier2') {
      discountRate = discounts.tier2;
    }

    if (discountRate > 0) {
      const discountAmount = breakdown.subtotal * discountRate;
      breakdown.discounts += discountAmount;

      breakdown.details.push({
        component: 'corporate_discount',
        amount: -discountAmount,
        description: `Corporate ${request.corporateTier} discount (${(discountRate * 100).toFixed(0)}%)`
      });
    }
  }
}
```

### **Input în PricingRequestData:**
**Fișier:** `src/types/pricing.types.ts:34-52`

```typescript
export interface PricingRequestData {
  // ...
  corporateTier?: string;  // ✅ EXISTĂ
  // ...
}
```

### **Tiers disponibile:**
**Fișier:** `src/types/pricing.types.ts:116-119`

```typescript
corporate: {
  tier1: number;  // Discount rate (e.g., 0.05 = 5%)
  tier2: number;  // Discount rate (e.g., 0.10 = 10%)
}
```

### **Cum funcționează:**
1. Request include `corporateTier: 'tier1'` sau `'tier2'`
2. `PricingDataService.getCorporateDiscounts()` citește din DB view
3. Se aplică discount rate pe subtotal
4. Se adaugă în breakdown ca `corporate_discount`

### **Sursă date:**
- **DB View:** `v_active_pricing_version`
- **Câmp:** `corporate_tier1_discount`, `corporate_tier2_discount`

### **Exemplu:**
```json
{
  "corporateTier": "tier1",
  // ... rest of request
}
```

**Rezultat:**
```
Subtotal: £100
Corporate tier1 discount (5%): -£5
Final: £95
```

---

## 2️⃣ RETURN DISCOUNT

### **Status:** ✅ **IMPLEMENTAT și FUNCȚIONAL**

### **Locație în cod:**
**Fișier:** `src/services/BookingTypeHandlers.ts:27-43`

```typescript
/**
 * Apply RETURN trip logic: (subtotal × 2) - discount
 * Reads from: v_active_pricing_version (return_discount_rate)
 */
static async applyReturnTripLogic(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
  const returnSettings = await PricingDataService.getReturnSettings();

  // Double the subtotal for round trip
  breakdown.subtotal = breakdown.subtotal * 2;

  // Apply return discount
  const discountAmount = breakdown.subtotal * returnSettings.discount_rate;
  breakdown.discounts += discountAmount;
  breakdown.subtotal -= discountAmount;

  breakdown.details.push({
    component: 'return_discount',
    amount: -discountAmount,
    description: `Return trip discount (${(returnSettings.discount_rate * 100).toFixed(0)}%)`
  });
}
```

### **Cum funcționează:**
1. Pentru `bookingType: 'return'`
2. Calculează outbound price
3. Dublează subtotal (× 2)
4. Aplică return discount (e.g., 10%)
5. Final = (outbound × 2) - discount

### **Sursă date:**
- **DB View:** `v_active_pricing_version`
- **Câmp:** `return_discount_rate`

### **Exemplu:**
```
Outbound: £100
Subtotal × 2: £200
Return discount (10%): -£20
Final: £180
```

---

## 3️⃣ FLEET DISCOUNT

### **Status:** ✅ **IMPLEMENTAT și FUNCȚIONAL**

### **Locație în cod:**
**Fișier:** `src/services/BookingTypeHandlers.ts:49-130`

```typescript
/**
 * Apply FLEET logic: Calculate price per vehicle type, apply tier discounts
 * Reads from: v_pricing_vehicle_rates, v_active_pricing_version (fleet settings)
 */
static async applyFleetLogic(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
  if (!request.fleetConfig) return;

  const fleetSettings = await PricingDataService.getFleetSettings();

  // Calculate total number of vehicles
  const totalVehicles = Object.values(request.fleetConfig).reduce((sum, count) => sum + count, 0);

  // ... calculate price per vehicle type ...

  // Apply fleet discount based on tier
  let fleetDiscountRate = 0;
  if (totalVehicles >= fleetSettings.tier2_min_vehicles) {
    fleetDiscountRate = fleetSettings.tier2_discount_rate;
  } else if (totalVehicles >= fleetSettings.tier1_min_vehicles) {
    fleetDiscountRate = fleetSettings.tier1_discount_rate;
  }

  if (fleetDiscountRate > 0) {
    const discountAmount = fleetSubtotal * fleetDiscountRate;
    breakdown.discounts += discountAmount;
    breakdown.details.push({
      component: 'fleet_discount',
      amount: -discountAmount,
      description: `Fleet discount (${totalVehicles} vehicles, ${(fleetDiscountRate * 100).toFixed(0)}%)`
    });
  }
}
```

### **Fleet Tiers:**
```typescript
fleet_settings: {
  tier1: { 
    min_vehicles: 3,      // Minimum 3 vehicles
    discount_rate: 0.05   // 5% discount
  },
  tier2: { 
    min_vehicles: 5,      // Minimum 5 vehicles
    discount_rate: 0.10   // 10% discount
  }
}
```

### **Cum funcționează:**
1. Request include `fleetConfig: { executive: 2, luxury: 3 }`
2. Total vehicles = 5
3. Dacă >= 5 → tier2 (10% discount)
4. Dacă >= 3 → tier1 (5% discount)
5. Se aplică pe fleet subtotal

### **Sursă date:**
- **DB View:** `v_active_pricing_version`
- **Câmpuri:** `fleet_tier1_min_vehicles`, `fleet_tier1_discount_rate`, etc.

---

## 4️⃣ COUPON / PROMO CODES

### **Status:** ❌ **NU EXISTĂ**

### **Ce am verificat:**
1. ✅ Căutat în `sql/` folder - NU există
2. ✅ Căutat fișiere `*coupon*` - 0 rezultate
3. ✅ Căutat fișiere `*discount*` - 0 rezultate
4. ✅ Verificat `PricingRequestData` - NU are câmp `couponCode` sau `promoCode`
5. ✅ Verificat `FeeCalculators` - NU există funcție pentru coupons
6. ✅ Verificat `PricingDataService` - NU există metode pentru coupons

### **Ce NU există în DB:**
- ❌ Tabela `coupons`
- ❌ Tabela `promo_codes`
- ❌ Tabela `discount_codes`
- ❌ Tabela `vouchers`
- ❌ View pentru coupons
- ❌ RPC pentru validare coupons

### **Ce NU există în backend:**
- ❌ `couponCode` field în `PricingRequestData`
- ❌ `applyCouponDiscount()` în `FeeCalculators`
- ❌ `validateCoupon()` în `PricingDataService`
- ❌ Coupon validation logic

---

## 5️⃣ MULTI-STOP FEE

### **Status:** 🟡 **PARȚIAL IMPLEMENTAT**

### **Locație în cod:**
**Fișier:** `src/services/FeeCalculators.ts:246-257`

```typescript
/**
 * Calculate additional services fees
 * Reads from: v_active_pricing_version (multi-stop fee), service_items (premium services)
 */
static async calculateAdditionalServices(breakdown: PricingBreakdownData, request: PricingRequestData): Promise<void> {
  // Multi-stop fee (legacy)
  if (request.extras?.includes('multi_stop')) {
    const policies = await PricingDataService.getServicePolicies();
    const fee = policies.multiStop;
    breakdown.multiStopFees += fee;
    breakdown.details.push({
      component: 'multi_stop',
      amount: fee,
      description: 'Multi-stop service'
    });
  }
  // ...
}
```

### **Problema:**
- ⚠️ Se activează doar dacă `extras` include `'multi_stop'` manual
- ⚠️ NU se activează automat când există `additionalStops`
- ⚠️ Frontend nu trimite `extras: ['multi_stop']`

### **Sursă date:**
- **DB View:** `v_active_pricing_version`
- **Câmp:** `multi_stop_fee`

---

## 6️⃣ SERVICE ITEMS (EXTRAS)

### **Status:** ✅ **IMPLEMENTAT**

### **Locație în cod:**
**Fișier:** `src/services/FeeCalculators.ts:259-282`

```typescript
// Premium services from service_items table
const otherExtras = request.extras?.filter(e => e !== 'multi_stop') || [];
if (otherExtras.length > 0) {
  try {
    const serviceItems = await PricingDataService.getServiceItemsByIds(
      otherExtras,
      request.organizationId
    );

    for (const item of serviceItems) {
      const price = PricingDataService.penceToPounds(item.price_pence || 0);
      breakdown.serviceItemFees += price;
      breakdown.details.push({
        component: 'service_item',
        amount: price,
        description: `${item.name || item.id} (${item.id})`
      });
    }
  } catch (error) {
    console.error('Failed to load service items:', error);
  }
}
```

### **Cum funcționează:**
1. Request include `extras: ['child_seat', 'meet_greet']`
2. Se citesc din tabela `service_items`
3. Se adaugă prețul fiecărui item
4. Se include în breakdown

### **Sursă date:**
- **DB Table:** `service_items`
- **Câmpuri:** `id`, `name`, `price_pence`, `organization_id`

---

## 📊 TABEL COMPARATIV - DISCOUNT TYPES

| **Discount Type** | **Există?** | **Locație** | **Trigger** | **Source** |
|-------------------|-------------|-------------|-------------|------------|
| **Corporate Tier1** | ✅ Da | `FeeCalculators.applyDiscounts()` | `corporateTier: 'tier1'` | DB view |
| **Corporate Tier2** | ✅ Da | `FeeCalculators.applyDiscounts()` | `corporateTier: 'tier2'` | DB view |
| **Return Discount** | ✅ Da | `BookingTypeHandlers.applyReturnTripLogic()` | `bookingType: 'return'` | DB view |
| **Fleet Tier1** | ✅ Da | `BookingTypeHandlers.applyFleetLogic()` | `totalVehicles >= 3` | DB view |
| **Fleet Tier2** | ✅ Da | `BookingTypeHandlers.applyFleetLogic()` | `totalVehicles >= 5` | DB view |
| **Multi-stop Fee** | 🟡 Parțial | `FeeCalculators.calculateAdditionalServices()` | `extras: ['multi_stop']` | DB view |
| **Coupon Code** | ❌ Nu | - | - | - |
| **Promo Code** | ❌ Nu | - | - | - |
| **Voucher** | ❌ Nu | - | - | - |
| **Discount Code** | ❌ Nu | - | - | - |

---

## 🎯 RECOMANDĂRI

### **Pentru implementare ONE_WAY cu stops:**
✅ **NU trebuie să implementăm coupons/promo codes acum**

Motivație:
1. Corporate discounts funcționează deja
2. Return/Fleet discounts funcționează deja
3. Coupons sunt feature separat, nu blocant pentru stops
4. ONE_WAY cu stops e prioritate P0

### **Pentru viitor (dacă vrei coupons):**

#### **Structură DB necesară:**
```sql
CREATE TABLE coupons (
  id UUID PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(20), -- 'percentage' | 'fixed_amount'
  discount_value NUMERIC,
  min_amount_pence INTEGER,
  max_discount_pence INTEGER,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  booking_types TEXT[], -- ['one_way', 'return', ...]
  organization_id UUID,
  active BOOLEAN DEFAULT true
);

CREATE TABLE coupon_usage (
  id UUID PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id),
  booking_id UUID REFERENCES bookings(id),
  customer_id UUID REFERENCES customers(id),
  discount_amount_pence INTEGER,
  used_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **Backend changes necesare:**
```typescript
// 1. Extinde PricingRequestData
interface PricingRequestData {
  // ...
  couponCode?: string;
}

// 2. Adaugă în PricingDataService
static async validateCoupon(code: string, organizationId: string): Promise<CouponData | null>

// 3. Adaugă în FeeCalculators
static async applyCouponDiscount(breakdown, request): Promise<void>
```

---

## ✅ CONCLUZIE

### **Ce avem:**
- ✅ Corporate discounts (tier1, tier2) - FUNCȚIONEAZĂ
- ✅ Return discount - FUNCȚIONEAZĂ
- ✅ Fleet discounts (tier1, tier2) - FUNCȚIONEAZĂ
- ✅ Service items (extras) - FUNCȚIONEAZĂ

### **Ce NU avem:**
- ❌ Coupons/Promo codes - NU EXISTĂ
- ❌ Vouchers - NU EXISTĂ
- ❌ Discount codes - NU EXISTĂ

### **Decizie:**
**Continuăm cu ONE_WAY stops implementation** - discounts existente sunt suficiente pentru acum.

Coupons pot fi implementate mai târziu ca feature separat, independent de stops logic.

---

**STATUS:** 📝 Audit complet, ready să continuăm cu ONE_WAY stops
