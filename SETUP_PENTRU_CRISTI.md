# 🚀 Setup pentru Cristi - Landing Page Integration

## 📍 Backend URLs

### Development (Local)
Când lucrezi **local** pe calculatorul tău:
```javascript
const BACKEND_URL = 'http://localhost:3000';
```

### Production (Live)
Când publici landing page-ul **live**:
```javascript
const BACKEND_URL = 'https://pricing.vantage-lane.com';
```

**Recomandare:** Folosește **environment variables** pentru a schimba automat între local și production.

---

## 🗺️ Google Maps API Key

### Cheia Ta Google Maps
```javascript
const GOOGLE_MAPS_API_KEY = 'AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY';
```

### Ce Poate Face Această Cheie
Această cheie funcționează pentru **TOATE** serviciile Google Maps:
- ✅ **Directions API** - pentru distanță și timp
- ✅ **Places API** - pentru autocomplete locații
- ✅ **Geocoding API** - pentru coordonate GPS
- ✅ **Distance Matrix API** - pentru calcule multiple

**O singură cheie pentru tot!** Nu ai nevoie de chei separate.

---

## 🔧 Setup Environment Variables (Recomandat)

### Pentru React/Vite
Creează fișier `.env` în root-ul proiectului:

```env
# .env
VITE_GOOGLE_MAPS_API_KEY=AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY
VITE_BACKEND_URL=http://localhost:3000
```

În cod:
```javascript
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
```

### Pentru Next.js
Creează fișier `.env.local`:

```env
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

În cod:
```javascript
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
```

### Pentru Vanilla JavaScript
Creează fișier `config.js`:

```javascript
// config.js
const config = {
  googleMapsApiKey: 'AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY',
  backendUrl: window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://pricing.vantage-lane.com'
};

export default config;
```

---

## 🎯 Cod Complet pentru Landing Page

### Setup Inițial

```javascript
// Configuration
const GOOGLE_MAPS_API_KEY = 'AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY';

// Auto-detect local vs production
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'  // Local development
  : 'https://pricing.vantage-lane.com';  // Production

console.log('Backend URL:', BACKEND_URL);
```

### Funcție pentru Distanță și Timp (Google Maps)

```javascript
/**
 * Obține distanța și timpul de la Google Maps
 */
async function getDistanceAndDuration(pickup, dropoff) {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dropoff)}&key=${GOOGLE_MAPS_API_KEY}`;
  
  try {
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
  } catch (error) {
    console.error('Error getting route:', error);
    throw error;
  }
}
```

### Funcție pentru Calculare Preț (Backend)

```javascript
/**
 * Calculează prețul folosind backend-ul
 */
async function calculatePrice(bookingData) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/pricing/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bookingData)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to calculate price');
    }

    return data;
  } catch (error) {
    console.error('Error calculating price:', error);
    throw error;
  }
}
```

### Flow Complet

```javascript
/**
 * Flow complet: de la input user până la preț final
 */
async function getQuote() {
  try {
    // 1. Obține datele din form
    const pickup = document.getElementById('pickup').value;
    const dropoff = document.getElementById('dropoff').value;
    const vehicleType = document.getElementById('vehicleType').value;
    const bookingType = document.getElementById('bookingType').value;
    const dateTime = new Date(document.getElementById('dateTime').value).toISOString();

    // 2. Obține distanța și timpul de la Google Maps
    console.log('Getting route from Google Maps...');
    const routeData = await getDistanceAndDuration(pickup, dropoff);
    console.log('Route data:', routeData);

    // 3. Calculează prețul cu backend-ul
    console.log('Calculating price...');
    const pricingData = await calculatePrice({
      pickup,
      dropoff,
      vehicleType,
      bookingType,
      dateTime,
      distance: routeData.distance,
      duration: routeData.duration,
      coordinates: {
        pickup: routeData.pickup_coords,
        dropoff: routeData.dropoff_coords
      }
    });

    // 4. Afișează prețul
    console.log('Final price:', pricingData.finalPrice, 'GBP');
    document.getElementById('price').textContent = `£${pricingData.finalPrice}`;
    
    return pricingData;

  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
  }
}
```

---

## 🧪 Testare Locală

### 1. Pornește Backend-ul Local (Opțional)

Dacă vrei să testezi cu backend local:

```bash
cd /path/to/backend
npm install
npm run dev
```

Backend-ul va rula pe `http://localhost:3000`

### 2. Testează Landing Page-ul

Deschide landing page-ul în browser și verifică:
- ✅ Console-ul arată: `Backend URL: http://localhost:3000`
- ✅ Google Maps returnează distanță și timp
- ✅ Backend-ul returnează preț

### 3. Testează cu Production Backend

Schimbă în cod:
```javascript
const BACKEND_URL = 'https://pricing.vantage-lane.com';
```

Sau folosește auto-detect (recomandare de mai sus).

---

## 📊 Parametri pentru Backend

### Obligatorii
```javascript
{
  pickup: "Heathrow Airport",           // string
  dropoff: "Central London",            // string
  vehicleType: "executive",             // executive|luxury|suv|van
  bookingType: "one_way",               // one_way|return|hourly|daily|fleet
  dateTime: "2024-02-10T14:30:00Z",    // ISO 8601
  distance: 15.2,                       // mile (de la Google Maps)
  duration: 35                          // minute (de la Google Maps)
}
```

### Opționali
```javascript
{
  coordinates: {
    pickup: { lat: 51.4700, lng: -0.4543 },
    dropoff: { lat: 51.5074, lng: -0.1278 }
  },
  hours: 4,              // Pentru bookingType: "hourly" (1-12)
  days: 3,               // Pentru bookingType: "daily" (1-30)
  extras: ["wifi", "child_seat"]
}
```

---

## 🔒 Securitate - IMPORTANT!

### ❌ NU Face Asta:
```javascript
// NU pune cheia direct în cod public pe GitHub!
const API_KEY = 'AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY';
```

### ✅ Fă Asta:
```javascript
// Folosește environment variables
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
```

### Restricționează Cheia în Google Cloud Console:
1. Mergi la [Google Cloud Console](https://console.cloud.google.com/)
2. API & Services → Credentials
3. Editează cheia `AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY`
4. **Application restrictions**: HTTP referrers
5. Adaugă domeniul landing page-ului (ex: `https://vantagelane.com/*`)
6. **API restrictions**: Selectează doar:
   - Directions API
   - Places API
   - Geocoding API
   - Distance Matrix API

---

## 🎯 Checklist pentru Cristi

### Setup Inițial
- [ ] Salvează cheia Google Maps: `AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY`
- [ ] Restricționează cheia în Google Cloud Console
- [ ] Configurează environment variables în proiect
- [ ] Testează cu backend local: `http://localhost:3000`
- [ ] Testează cu backend production: `https://pricing.vantage-lane.com`

### Development
- [ ] Implementează funcția `getDistanceAndDuration()`
- [ ] Implementează funcția `calculatePrice()`
- [ ] Creează form pentru input user
- [ ] Afișează prețul returnat de backend
- [ ] Gestionează erorile (network, validation, etc.)

### Testing
- [ ] Testează cu diferite locații
- [ ] Testează toate tipurile de vehicule (executive, luxury, suv, van)
- [ ] Testează toate tipurile de booking (one_way, return, hourly, daily)
- [ ] Testează cu date/ore diferite (peak hours, night, weekend)
- [ ] Verifică că prețurile sunt corecte

### Production
- [ ] Schimbă `BACKEND_URL` la production URL
- [ ] Verifică că CORS funcționează
- [ ] Testează pe domeniul live
- [ ] Monitorizează erorile în console

---

## 📞 Support

### Backend URLs
- **Local**: `http://localhost:3000`
- **Production**: `https://pricing.vantage-lane.com`
- **Custom Domain** (când va fi gata): `https://pricing.vantagelane.com`

### Endpoints
- **Health Check**: `GET /health`
- **Calculate Price**: `POST /api/pricing/calculate`
- **With Commissions**: `POST /api/pricing/calculate-with-commissions`

### Google Maps API Key
```
AIzaSyBFVTh-xzPAPHuW2Qa-w9v_qjnZV-nNCbY
```

---

## 📚 Documentație Completă

Pentru detalii complete, vezi:
- `INTEGRATION_GUIDE.md` - Ghid complet cu toate detaliile
- `QUICK_REFERENCE.md` - Referință rapidă
- `EXAMPLE_CODE.html` - Exemplu HTML funcțional
- `EXAMPLE_CODE.js` - Funcții JavaScript ready-to-use

---

**Succes cu integrarea, Cristi! 🚀**
