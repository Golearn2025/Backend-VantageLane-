# 🚀 Quick Reference - Vantage Lane Backend Integration

## 📍 Backend URL (Production)
```
https://pricing.vantage-lane.com
```

## 🔑 Ce Trebuie să Știe Cristi

### 1. Google Maps API Key
- **Cristi trebuie să obțină propriul API Key** de la [Google Cloud Console](https://console.cloud.google.com/)
- Activează: **Directions API**, **Places API**, **Geocoding API**
- Restricționează key-ul la domeniul landing page-ului pentru securitate

### 2. Backend Endpoint Principal
```
POST https://pricing.vantage-lane.com/api/pricing/calculate
```

### 3. Nu Este Nevoie de Autentificare
Backend-ul este **PUBLIC** - nu trebuie API keys sau tokens pentru a-l accesa.

---

## 📋 Flow-ul Complet (Simplificat)

```javascript
// PASUL 1: User completează form-ul în landing page
const pickup = "Heathrow Airport";
const dropoff = "Central London";
const vehicleType = "executive"; // executive, luxury, suv, van
const bookingType = "one_way"; // one_way, return, hourly, daily, fleet
const dateTime = "2024-02-10T14:30:00Z";

// PASUL 2: Obține distanța și timpul de la Google Maps
const routeData = await getDistanceAndDuration(pickup, dropoff);
// Returnează: { distance: 15.2, duration: 35 }

// PASUL 3: Trimite la backend pentru preț
const response = await fetch('https://pricing.vantage-lane.com/api/pricing/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pickup,
    dropoff,
    vehicleType,
    bookingType,
    dateTime,
    distance: routeData.distance,
    duration: routeData.duration
  })
});

const data = await response.json();

// PASUL 4: Afișează prețul
console.log('Price:', data.finalPrice, 'GBP');
```

---

## 🗺️ Cod Google Maps (Copy-Paste Ready)

```javascript
async function getDistanceAndDuration(pickup, dropoff) {
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY'; // Cheia lui Cristi
  
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dropoff)}&key=${apiKey}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.status === 'OK') {
    const route = data.routes[0].legs[0];
    return {
      distance: route.distance.value / 1609.34, // metri → mile
      duration: route.duration.value / 60, // secunde → minute
      pickup_coords: {
        lat: route.start_location.lat,
        lng: route.start_location.lng
      },
      dropoff_coords: {
        lat: route.end_location.lat,
        lng: route.end_location.lng
      }
    };
  } else {
    throw new Error('Google Maps error: ' + data.status);
  }
}
```

---

## 📊 Parametri Request (Obligatorii)

| Parametru | Valori Permise | Exemplu |
|-----------|----------------|---------|
| `pickup` | string | `"Heathrow Airport"` |
| `dropoff` | string | `"Central London"` |
| `vehicleType` | `executive`, `luxury`, `suv`, `van` | `"executive"` |
| `bookingType` | `one_way`, `return`, `hourly`, `daily`, `fleet` | `"one_way"` |
| `dateTime` | ISO 8601 | `"2024-02-10T14:30:00Z"` |
| `distance` | number (mile) | `15.2` |
| `duration` | number (minute) | `35` |

### Parametri Condiționați
- `hours` - **obligatoriu** pentru `bookingType: "hourly"` (1-12)
- `days` - **obligatoriu** pentru `bookingType: "daily"` (1-30)

---

## 💰 Prețuri (Reference)

### Hourly Rates (per hour)
- Executive: £80/h
- Luxury: £90/h
- SUV: £110/h
- Van: £90/h

### Daily Rates (per day, 8 hours)
- Executive: £640/day
- Luxury: £720/day
- SUV: £880/day
- Van: £720/day

### Discounts
- **Return trips**: 10% discount automat
- **Fleet bookings**: 
  - 3-4 vehicles: 5% discount
  - 5+ vehicles: 10% discount

---

## ✅ Response Success

```json
{
  "success": true,
  "finalPrice": 85.50,
  "currency": "GBP",
  "breakdown": {
    "baseFare": 25.00,
    "distanceFee": 30.40,
    "timeFee": 17.50,
    "additionalFees": 10.00,
    "services": 0.00,
    "subtotal": 82.90,
    "multipliers": { "peak_morning": 1.15 },
    "discounts": 0.00,
    "finalPrice": 85.50
  },
  "timestamp": "2024-02-10T14:30:00.000Z"
}
```

---

## ❌ Response Error

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "distance",
      "message": "Distance must be positive"
    }
  ],
  "timestamp": "2024-02-10T14:30:00.000Z"
}
```

---

## 🧪 Test Rapid

### Testează Health Check
```bash
curl https://pricing.vantage-lane.com/health
```

### Testează Pricing (cu curl)
```bash
curl -X POST https://pricing.vantage-lane.com/api/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": "Heathrow Airport",
    "dropoff": "Central London",
    "vehicleType": "executive",
    "bookingType": "one_way",
    "dateTime": "2024-02-10T14:30:00Z",
    "distance": 15.2,
    "duration": 35
  }'
```

---

## 🔒 Securitate - Important!

### ✅ Ce TREBUIE să facă Cristi:
1. Restricționează Google Maps API Key la domeniul landing page-ului
2. Folosește environment variables pentru API keys
3. Validează input-urile în frontend

### ❌ Ce NU trebuie să facă:
1. NU pune Google Maps API Key în GitHub
2. NU hardcodează API keys în JavaScript public
3. NU expune Supabase keys în frontend

---

## 📞 Endpoints Complete

| Endpoint | Method | Descriere |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/api/pricing/health` | GET | Pricing service health |
| `/api/pricing/calculate` | POST | Calculate price |
| `/api/pricing/calculate-with-commissions` | POST | Price + commissions |

---

## 🎯 Checklist Rapid

- [ ] Obține Google Maps API Key
- [ ] Activează Directions API, Places API, Geocoding API
- [ ] Restricționează API Key la domeniu
- [ ] Implementează `getDistanceAndDuration()`
- [ ] Creează form în landing page
- [ ] Trimite request la backend
- [ ] Afișează prețul
- [ ] Testează cu diferite locații și vehicule

---

**Pentru detalii complete, vezi `INTEGRATION_GUIDE.md`**
