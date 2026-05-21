/**
 * Quick check: CC polygon + airport fee wiring (no server required).
 * Run: npx ts-node scripts/test-cc-zone.ts
 */

import {
  detectCongestionChargeTouch,
  isPointInsideCongestionZone,
} from '../src/services/CongestionZoneService';

const mayfair = { lat: 51.5082218, lng: -0.1442488 };
const heathrowT5 = { lat: 51.4713012, lng: -0.4877641 };
const city = { lat: 51.5155, lng: -0.0925 };

function assert(label: string, ok: boolean) {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) process.exitCode = 1;
}

assert('Mayfair inside CC', isPointInsideCongestionZone(mayfair));
assert('Heathrow outside CC', !isPointInsideCongestionZone(heathrowT5));
assert('City inside CC', isPointInsideCongestionZone(city));

const mayfairToLhr = detectCongestionChargeTouch(
  { address: 'Mayfair', coordinates: mayfair },
  { address: 'Heathrow TW6', coordinates: heathrowT5 }
);
assert('Mayfair → LHR: CC on pickup', mayfairToLhr === 'pickup');

const lhrToMayfair = detectCongestionChargeTouch(
  { address: 'Heathrow', coordinates: heathrowT5 },
  { address: 'Mayfair', coordinates: mayfair }
);
assert('LHR → Mayfair: CC on dropoff', lhrToMayfair === 'dropoff');

const lhrToGatwick = detectCongestionChargeTouch(
  { address: 'Heathrow TW6', coordinates: heathrowT5 },
  { address: 'Gatwick RH6', coordinates: { lat: 51.1537, lng: -0.1821 } }
);
assert('LHR → Gatwick: no CC', lhrToGatwick === null);

console.log('\nDone.');
