# 🚗 Vantage Lane - Ghid Integrare Backend Pricing

## 📋 Cuprins
1. [Informații Generale](#informații-generale)
2. [URL-uri Backend](#url-uri-backend)
3. [Chei și Autentificare](#chei-și-autentificare)
4. [Integrare Google Maps API](#integrare-google-maps-api)
5. [Endpoint-uri API](#endpoint-uri-api)
6. [Exemple de Request/Response](#exemple-de-requestresponse)
7. [Flow Complet de Integrare](#flow-complet-de-integrare)
8. [Tipuri de Vehicule și Booking](#tipuri-de-vehicule-și-booking)
9. [Erori Comune](#erori-comune)

---

## 🌐 Informații Generale

### Backend URL (Render)
```
Production: https://pricing.vantage-lane.com
```

### Ce Face Backend-ul?
Backend-ul calculează prețul pentru curse în funcție de:
- **Distanță și timp** (primite de la Google Maps)
- **Tip vehicul**: Executive, Luxury, SUV, Van
- **Tip booking**: One Way, Return, Hourly, Daily, Fleet
- **Locații**: Airport fees, congestion zones, toll roads
- **Timp**: Peak hours, night, weekend, surge pricing
- **Extra servicii**: Multi-stop, waiting time, etc.

---

## 🔑 Chei și Autentificare

### 1. Google Maps API Key
**Cristi trebuie să obțină propriul API Key de la Google Cloud Console:**

#### Pași pentru a obține Google Maps API Key:
1. Mergi la [Google Cloud Console](https://console.cloud.google.com/)
2. Creează un proiect nou sau selectează unul existent
3. Activează următoarele API-uri:
   - **Maps JavaScript API**
   - **Directions API** (pentru distanță și timp)
   - **Places API** (pentru autocomplete locații)
   - **Geocoding API** (pentru coordonate)

4. Creează un API Key:
   - Mergi la "Credentials" → "Create Credentials" → "API Key"
   - **IMPORTANT**: Restricționează key-ul pentru securitate:
     - Application restrictions: HTTP referrers (websites)
     - Adaugă domeniul landing page-ului (ex: `https://vantagelane.com/*`)
     - API restrictions: Selectează doar API-urile de mai sus

5. Salvează API Key-ul (va arăta așa: `AIzaSyD...`)

#### Unde se folosește Google Maps API Key?
- **În Landing Page** (frontend) - pentru a obține distanța și timpul
- **NU în backend** - backend-ul primește doar rezultatele calculate

### 2. Backend - Fără Autentificare Necesară
Backend-ul este **PUBLIC** și nu necesită API keys pentru endpoint-urile de pricing.

---

## 🗺️ Integrare Google Maps API

### În Landing Page (JavaScript/React)

#### 1. Instalare (dacă folosești npm)
```bash
npm install @googlemaps/js-api-loader
```

#### 2. Cod pentru a obține Distanță și Timp

```javascript
// Exemplu cu Google Maps Directions API
async function getDistanceAndDuration(pickup, dropoff) {
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY'; // Cheia lui Cristi
  
  const service = new google.maps.DistanceMatrixService();
  
  return new Promise((resolve, reject) => {
    service.getDistanceMatrix(
      {
        origins: [pickup],
        destinations: [dropoff],
        travelMode: 'DRIVING',
        unitSystem: google.maps.UnitSystem.IMPERIAL, // Pentru mile
      },
      (response, status) => {
        if (status === 'OK') {
          const result = response.rows[0].elements[0];
          
          if (result.status === 'OK') {
            resolve({
              distance: result.distance.value / 1609.34, // Convertim metri în mile
              duration: result.duration.value / 60, // Convertim secunde în minute
              pickup_coords: {
                lat: response.originAddresses[0].lat,
                lng: response.originAddresses[0].lng
              },
              dropoff_coords: {
                lat: response.destinationAddresses[0].lat,
                lng: response.destinationAddresses[0].lng
              }
            });
          } else {
            reject(new Error('Route not found'));
          }
        } else {
          reject(new Error('Google Maps API error: ' + status));
        }
      }
    );
  });
}

// Exemplu de utilizare
const routeData = await getDistanceAndDuration(
  'Heathrow Airport, London',
  'Central London'
);

console.log(routeData);
// {
//   distance: 15.2,  // mile
//   duration: 35,    // minute
//   pickup_coords: { lat: 51.4700, lng: -0.4543 },
//   dropoff_coords: { lat: 51.5074, lng: -0.1278 }
// }
```

#### 3. Alternativă cu Fetch (fără library)

```javascript
async function getDistanceAndDuration(pickup, dropoff) {
  const apiKey = 'YOUR_GOOGLE_MAPS_API_KEY';
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

## 🔌 Endpoint-uri API

### 1. **Calculate Price** (Endpoint Principal)
```
POST https://pricing.vantage-lane.com/api/pricing/calculate
```

#### Headers
```json
{
  "Content-Type": "application/json"
}
```

#### Request Body (Obligatoriu)
```json
{
  "pickup": "Heathrow Airport, London",
  "dropoff": "Central London",
  "vehicleType": "executive",
  "bookingType": "one_way",
  "dateTime": "2024-02-10T14:30:00Z",
  "distance": 15.2,
  "duration": 35,
  "coordinates": {
    "pickup": {
      "lat": 51.4700,
      "lng": -0.4543
    },
    "dropoff": {
      "lat": 51.5074,
      "lng": -0.1278
    }
  },
  "extras": []
}
```

#### Parametri Request

| Parametru | Tip | Obligatoriu | Descriere |
|-----------|-----|-------------|-----------|
| `pickup` | string | ✅ Da | Adresa de ridicare |
| `dropoff` | string | ✅ Da | Adresa de destinație |
| `vehicleType` | string | ✅ Da | `executive`, `luxury`, `suv`, `van` |
| `bookingType` | string | ✅ Da | `one_way`, `return`, `hourly`, `daily`, `fleet` |
| `dateTime` | string | ✅ Da | ISO 8601 format (ex: `2024-02-10T14:30:00Z`) |
| `distance` | number | ✅ Da | Distanța în **mile** (de la Google Maps) |
| `duration` | number | ✅ Da | Durata în **minute** (de la Google Maps) |
| `coordinates` | object | ❌ Nu | Coordonate GPS pentru pickup și dropoff |
| `extras` | array | ❌ Nu | Servicii extra (ex: `["child_seat", "wifi"]`) |
| `hours` | number | ⚠️ Condiționat | Obligatoriu pentru `bookingType: "hourly"` (1-12) |
| `days` | number | ⚠️ Condiționat | Obligatoriu pentru `bookingType: "daily"` (1-30) |
| `fleetConfig` | object | ⚠️ Condiționat | Obligatoriu pentru `bookingType: "fleet"` |

#### Response Success (200)
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
    "multipliers": {
      "peak_morning": 1.15
    },
    "discounts": 0.00,
    "finalPrice": 85.50
  },
  "details": [
    {
      "component": "Base Fare",
      "amount": 25.00,
      "description": "Executive base fare"
    },
    {
      "component": "Distance Fee",
      "amount": 30.40,
      "description": "15.2 miles"
    },
    {
      "component": "Time Fee",
      "amount": 17.50,
      "description": "35 minutes"
    },
    {
      "component": "Airport Fee",
      "amount": 10.00,
      "description": "Heathrow pickup"
    },
    {
      "component": "Peak Morning Multiplier",
      "amount": 2.60,
      "description": "15% surge (7-9 AM)"
    }
  ],
  "timestamp": "2024-02-10T14:30:00.000Z"
}
```

#### Response Error (400/500)
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

### 2. **Calculate with Commissions** (Opțional)
```
POST https://pricing.vantage-lane.com/api/pricing/calculate-with-commissions
```

Același request ca mai sus, dar returnează și breakdown-ul comisioanelor pentru platformă, operator și driver.

#### Response Extra Fields
```json
{
  "success": true,
  "customerPrice": 85.50,
  "commissions": {
    "platformFee": 8.55,
    "platformCommissionPct": 0.10,
    "operatorNet": 76.95,
    "operatorCommission": 7.70,
    "operatorCommissionPct": 0.10,
    "driverPayout": 69.25
  },
  "breakdown": { ... },
  "timestamp": "2024-02-10T14:30:00.000Z"
}
```

---

### 3. **Health Check**
```
GET https://pricing.vantage-lane.com/api/pricing/health
```

Verifică dacă backend-ul funcționează.

#### Response
```json
{
  "success": true,
  "service": "Vantage Lane Pricing Engine",
  "version": "1.0.0",
  "status": "healthy",
  "timestamp": "2024-02-10T14:30:00.000Z"
}
```

---

## 📝 Exemple de Request/Response

### Exemplu 1: One Way Trip (Executive)

#### Request
```javascript
const response = await fetch('https://pricing.vantage-lane.com/api/pricing/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pickup: 'Heathrow Airport',
    dropoff: 'Central London',
    vehicleType: 'executive',
    bookingType: 'one_way',
    dateTime: '2024-02-10T14:30:00Z',
    distance: 15.2,
    duration: 35
  })
});

const data = await response.json();
console.log('Price:', data.finalPrice, 'GBP');
```

---

### Exemplu 2: Return Trip (Luxury)

#### Request
```javascript
const response = await fetch('https://pricing.vantage-lane.com/api/pricing/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pickup: 'Central London',
    dropoff: 'Gatwick Airport',
    vehicleType: 'luxury',
    bookingType: 'return',
    dateTime: '2024-02-10T08:00:00Z',
    distance: 28.5,
    duration: 55
  })
});

const data = await response.json();
// Return trips primesc 10% discount automat
```

---

### Exemplu 3: Hourly Booking (SUV)

#### Request
```javascript
const response = await fetch('https://pricing.vantage-lane.com/api/pricing/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pickup: 'Central London',
    dropoff: 'Central London',
    vehicleType: 'suv',
    bookingType: 'hourly',
    dateTime: '2024-02-10T10:00:00Z',
    hours: 4, // OBLIGATORIU pentru hourly
    distance: 0,
    duration: 0
  })
});

const data = await response.json();
// Prețul va fi: 110 GBP/oră × 4 ore = 440 GBP
```

---

### Exemplu 4: Daily Booking (Van)

#### Request
```javascript
const response = await fetch('https://pricing.vantage-lane.com/api/pricing/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pickup: 'London',
    dropoff: 'London',
    vehicleType: 'van',
    bookingType: 'daily',
    dateTime: '2024-02-10T09:00:00Z',
    days: 3, // OBLIGATORIU pentru daily
    distance: 0,
    duration: 0
  })
});

const data = await response.json();
// Prețul va fi: 720 GBP/zi × 3 zile = 2160 GBP
```

---

## 🔄 Flow Complet de Integrare

### Pașii pentru Landing Page (Cristi)

```javascript
// 1. User selectează locațiile în landing page
const pickup = 'Heathrow Airport';
const dropoff = 'Central London';
const vehicleType = 'executive'; // din dropdown
const bookingType = 'one_way'; // din dropdown
const dateTime = '2024-02-10T14:30:00Z'; // din date picker

// 2. Obține distanța și timpul de la Google Maps
const routeData = await getDistanceAndDuration(pickup, dropoff);
// routeData = { distance: 15.2, duration: 35, pickup_coords: {...}, dropoff_coords: {...} }

// 3. Trimite request la backend pentru preț
const pricingResponse = await fetch('https://pricing.vantage-lane.com/api/pricing/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pickup: pickup,
    dropoff: dropoff,
    vehicleType: vehicleType,
    bookingType: bookingType,
    dateTime: dateTime,
    distance: routeData.distance,
    duration: routeData.duration,
    coordinates: {
      pickup: routeData.pickup_coords,
      dropoff: routeData.dropoff_coords
    }
  })
});

const pricingData = await pricingResponse.json();

// 4. Afișează prețul clientului
if (pricingData.success) {
  console.log('Final Price:', pricingData.finalPrice, 'GBP');
  console.log('Breakdown:', pricingData.breakdown);
  
  // Afișează în UI
  document.getElementById('price').textContent = `£${pricingData.finalPrice}`;
  
  // User acceptă și face booking
  // Trimite comanda la sistemul vostru de management
} else {
  console.error('Pricing error:', pricingData.error);
}
```

---

## 🚗 Tipuri de Vehicule și Booking

### Vehicle Types
```javascript
const vehicleTypes = {
  executive: 'Executive Sedan',
  luxury: 'Luxury Sedan',
  suv: 'SUV',
  van: 'Van (6-8 passengers)'
};
```

### Booking Types
```javascript
const bookingTypes = {
  one_way: 'One Way Trip',
  return: 'Return Trip (10% discount)',
  hourly: 'Hourly Booking (min 3h, max 12h)',
  daily: 'Daily Booking (min 1 day, max 30 days)',
  fleet: 'Fleet Booking (multiple vehicles)'
};
```

### Hourly Rates (per hour)
```javascript
const hourlyRates = {
  executive: 80,  // GBP/hour
  luxury: 90,     // GBP/hour
  suv: 110,       // GBP/hour
  van: 90         // GBP/hour
};
```

### Daily Rates (per day, 8 hours)
```javascript
const dailyRates = {
  executive: 640,  // GBP/day
  luxury: 720,     // GBP/day
  suv: 880,        // GBP/day
  van: 720         // GBP/day
};
```

---

## ⚠️ Erori Comune

### 1. CORS Error
**Problemă**: Browser blochează request-ul din cauza CORS.

**Soluție**: Backend-ul acceptă deja CORS. Asigură-te că:
- Folosești `https://` în production
- Request-ul are header-ul `Content-Type: application/json`

---

### 2. Distance/Duration Missing
**Problemă**: Backend returnează eroare că `distance` sau `duration` lipsește.

**Soluție**: Asigură-te că obții aceste valori de la Google Maps **ÎNAINTE** de a trimite request la backend.

---

### 3. Invalid Vehicle Type
**Problemă**: Backend returnează "Invalid vehicle type".

**Soluție**: Folosește doar valorile permise:
- `executive`
- `luxury`
- `suv`
- `van`

(toate cu litere mici, fără spații)

---

### 4. Invalid Booking Type
**Problemă**: Backend returnează "Invalid booking type".

**Soluție**: Folosește doar valorile permise:
- `one_way`
- `return`
- `hourly`
- `daily`
- `fleet`

---

### 5. Hourly Booking fără `hours`
**Problemă**: Pentru `bookingType: "hourly"`, backend cere parametrul `hours`.

**Soluție**: Adaugă `hours` în request (între 1 și 12).

---

### 6. Daily Booking fără `days`
**Problemă**: Pentru `bookingType: "daily"`, backend cere parametrul `days`.

**Soluție**: Adaugă `days` în request (între 1 și 30).

---

## 🎯 Checklist pentru Cristi

### Înainte de a începe:
- [ ] Obține Google Maps API Key de la Google Cloud Console
- [ ] Activează API-urile necesare (Directions, Places, Geocoding)
- [ ] Restricționează API Key-ul pentru securitate
- [ ] Testează Google Maps API în browser console

### În Landing Page:
- [ ] Adaugă Google Maps JavaScript API
- [ ] Implementează funcția `getDistanceAndDuration()`
- [ ] Creează form pentru pickup, dropoff, vehicle type, booking type, date/time
- [ ] La submit, obține distanța și timpul de la Google Maps
- [ ] Trimite request la backend cu toate datele
- [ ] Afișează prețul returnat de backend
- [ ] Gestionează erorile (CORS, validation, etc.)

### Testing:
- [ ] Testează cu diferite locații
- [ ] Testează cu toate tipurile de vehicule
- [ ] Testează cu toate tipurile de booking
- [ ] Testează cu date/ore diferite (peak hours, night, weekend)
- [ ] Verifică că prețurile sunt corecte

---

## 📞 Contact și Suport

### Backend URL (Production)
```
https://pricing.vantage-lane.com
```

### Health Check
```
GET https://pricing.vantage-lane.com/health
```

### Supabase (Database)
- Project ID: `fmeonuvmlopkutbjejlo`
- URL: `https://fmeonuvmlopkutbjejlo.supabase.co`

---

## 🔐 Securitate

### Ce NU trebuie să facă Cristi:
- ❌ NU pune Google Maps API Key în cod public (GitHub)
- ❌ NU hardcodează API Key-ul în JavaScript fără restricții
- ❌ NU expune Supabase keys în frontend

### Ce TREBUIE să facă:
- ✅ Restricționează Google Maps API Key la domeniul landing page-ului
- ✅ Folosește environment variables pentru API keys
- ✅ Validează input-urile în frontend înainte de a trimite la backend
- ✅ Gestionează erorile și afișează mesaje user-friendly

---

## 📚 Resurse Utile

### Google Maps API
- [Directions API Documentation](https://developers.google.com/maps/documentation/directions)
- [Distance Matrix API](https://developers.google.com/maps/documentation/distance-matrix)
- [Places API](https://developers.google.com/maps/documentation/places)

### Testing Tools
- [Postman](https://www.postman.com/) - pentru testarea API-urilor
- [Insomnia](https://insomnia.rest/) - alternativă la Postman

---

**Succes cu integrarea! 🚀**
