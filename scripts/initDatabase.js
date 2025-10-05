const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbPath = path.join(__dirname, '..', 'database', 'pricing.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

async function initializeDatabase() {
  console.log('🗄️  Initializing Vantage Lane Pricing Database...');

  db.serialize(() => {
    // Vehicle Types Table
    db.run(`
      CREATE TABLE IF NOT EXISTS vehicle_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        capacity INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Booking Types Table
    db.run(`
      CREATE TABLE IF NOT EXISTS booking_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Base Pricing Configuration Table
    db.run(`
      CREATE TABLE IF NOT EXISTS base_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_type_id INTEGER NOT NULL,
        booking_type_id INTEGER NOT NULL,
        base_fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        minimum_fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        distance_rate_first_10km DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        distance_rate_after_10km DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        time_rate_per_minute DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        minimum_distance_km DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        minimum_time_minutes INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types (id),
        FOREIGN KEY (booking_type_id) REFERENCES booking_types (id),
        UNIQUE(vehicle_type_id, booking_type_id)
      )
    `);

    // Time Multipliers Table
    db.run(`
      CREATE TABLE IF NOT EXISTS time_multipliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        multiplier DECIMAL(5,3) NOT NULL DEFAULT 1.000,
        start_time TIME,
        end_time TIME,
        days_of_week TEXT, -- JSON array of day numbers (0=Sunday, 6=Saturday)
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Special Events and Holidays Table
    db.run(`
      CREATE TABLE IF NOT EXISTS special_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        event_date DATE,
        start_date DATE,
        end_date DATE,
        multiplier DECIMAL(5,3) NOT NULL DEFAULT 1.000,
        is_active BOOLEAN DEFAULT 1,
        event_type TEXT DEFAULT 'holiday', -- 'holiday', 'event', 'seasonal'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Airport Fees Table
    db.run(`
      CREATE TABLE IF NOT EXISTS airport_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        airport_code TEXT UNIQUE NOT NULL,
        airport_name TEXT NOT NULL,
        pickup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        dropoff_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        waiting_time_free_minutes INTEGER DEFAULT 45,
        coordinates_lat DECIMAL(10,8),
        coordinates_lng DECIMAL(11,8),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Zone Fees Table (Congestion, ULEZ, etc.)
    db.run(`
      CREATE TABLE IF NOT EXISTS zone_fees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_name TEXT UNIQUE NOT NULL,
        fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        zone_type TEXT NOT NULL, -- 'congestion', 'ulez', 'lez', 'toll'
        coordinates TEXT, -- JSON polygon coordinates
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Additional Services/Extras Table
    db.run(`
      CREATE TABLE IF NOT EXISTS additional_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        is_active BOOLEAN DEFAULT 1,
        category TEXT DEFAULT 'service', -- 'service', 'amenity', 'equipment'
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Corporate Discounts Table
    db.run(`
      CREATE TABLE IF NOT EXISTS corporate_discounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        discount_type TEXT NOT NULL, -- 'percentage', 'fixed'
        discount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        minimum_booking_value DECIMAL(10,2) DEFAULT 0.00,
        is_active BOOLEAN DEFAULT 1,
        valid_from DATE,
        valid_until DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // General Settings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS general_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        setting_type TEXT NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Admin Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        is_active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Pricing Calculation Logs (for debugging and analytics)
    db.run(`
      CREATE TABLE IF NOT EXISTS pricing_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT,
        pickup_location TEXT,
        dropoff_location TEXT,
        vehicle_type TEXT,
        booking_type TEXT,
        calculated_price DECIMAL(10,2),
        calculation_breakdown TEXT, -- JSON object with detailed breakdown
        request_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  // Insert default data
  await insertDefaultData();
  
  console.log('✅ Database initialized successfully!');
  db.close();
}

async function insertDefaultData() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Insert Vehicle Types
      const vehicleTypes = [
        ['executive', 'Executive (E-Class)', 'Mercedes E-Class, BMW 5 Series or similar', 4],
        ['luxury', 'Luxury (S-Class)', 'Mercedes S-Class, BMW 7 Series or similar', 4],
        ['suv', 'SUV (Range Rover)', 'Range Rover, Mercedes GLS or similar', 6],
        ['van', 'Van/MPV (V-Class)', 'Mercedes V-Class or similar', 8]
      ];

      vehicleTypes.forEach(([name, display_name, description, capacity]) => {
        db.run(
          'INSERT OR IGNORE INTO vehicle_types (name, display_name, description, capacity) VALUES (?, ?, ?, ?)',
          [name, display_name, description, capacity]
        );
      });

      // Insert Booking Types
      const bookingTypes = [
        ['one_way', 'One Way', 'Single journey from pickup to destination'],
        ['return', 'Return Trip', 'Round trip with return journey'],
        ['hourly', 'Hourly Hire', 'Hire by the hour for multiple stops or waiting'],
        ['fleet', 'Fleet Booking', 'Multiple vehicles for group transportation']
      ];

      bookingTypes.forEach(([name, display_name, description]) => {
        db.run(
          'INSERT OR IGNORE INTO booking_types (name, display_name, description) VALUES (?, ?, ?)',
          [name, display_name, description]
        );
      });

      // Insert Base Pricing (sample data based on your research)
      const basePricing = [
        // Executive rates
        [1, 1, 60.00, 60.00, 2.50, 2.00, 0.75, 50.00, 5.0, 15], // one_way
        [1, 2, 120.00, 120.00, 2.50, 2.00, 0.75, 50.00, 10.0, 30], // return
        [1, 3, 0.00, 150.00, 0.00, 0.00, 0.00, 50.00, 0.0, 0], // hourly
        [1, 4, 60.00, 300.00, 2.50, 2.00, 0.75, 50.00, 5.0, 15], // fleet

        // Luxury rates
        [2, 1, 90.00, 90.00, 3.00, 2.50, 1.00, 75.00, 5.0, 15], // one_way
        [2, 2, 180.00, 180.00, 3.00, 2.50, 1.00, 75.00, 10.0, 30], // return
        [2, 3, 0.00, 200.00, 0.00, 0.00, 0.00, 75.00, 0.0, 0], // hourly
        [2, 4, 90.00, 450.00, 3.00, 2.50, 1.00, 75.00, 5.0, 15], // fleet

        // SUV rates
        [3, 1, 120.00, 120.00, 3.50, 3.00, 1.25, 100.00, 5.0, 15], // one_way
        [3, 2, 240.00, 240.00, 3.50, 3.00, 1.25, 100.00, 10.0, 30], // return
        [3, 3, 0.00, 250.00, 0.00, 0.00, 0.00, 100.00, 0.0, 0], // hourly
        [3, 4, 120.00, 600.00, 3.50, 3.00, 1.25, 100.00, 5.0, 15], // fleet

        // Van/MPV rates
        [4, 1, 100.00, 100.00, 3.25, 2.75, 1.10, 85.00, 5.0, 15], // one_way
        [4, 2, 200.00, 200.00, 3.25, 2.75, 1.10, 85.00, 10.0, 30], // return
        [4, 3, 0.00, 225.00, 0.00, 0.00, 0.00, 85.00, 0.0, 0], // hourly
        [4, 4, 100.00, 500.00, 3.25, 2.75, 1.10, 85.00, 5.0, 15] // fleet
      ];

      basePricing.forEach(([vehicle_type_id, booking_type_id, base_fare, minimum_fare, 
                          distance_rate_first_10km, distance_rate_after_10km, time_rate_per_minute, 
                          hourly_rate, minimum_distance_km, minimum_time_minutes]) => {
        db.run(`
          INSERT OR IGNORE INTO base_pricing 
          (vehicle_type_id, booking_type_id, base_fare, minimum_fare, distance_rate_first_10km, 
           distance_rate_after_10km, time_rate_per_minute, hourly_rate, minimum_distance_km, minimum_time_minutes) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [vehicle_type_id, booking_type_id, base_fare, minimum_fare, distance_rate_first_10km, 
            distance_rate_after_10km, time_rate_per_minute, hourly_rate, minimum_distance_km, minimum_time_minutes]);
      });

      // Insert Time Multipliers
      const timeMultipliers = [
        ['day_normal', 1.000, '06:00:00', '22:00:00', '[1,2,3,4,5]', 1],
        ['night_surcharge', 1.300, '22:00:00', '06:00:00', '[0,1,2,3,4,5,6]', 1],
        ['peak_morning', 1.200, '07:00:00', '09:00:00', '[1,2,3,4,5]', 1],
        ['peak_evening', 1.200, '17:00:00', '19:00:00', '[1,2,3,4,5]', 1],
        ['weekend_premium', 1.150, null, null, '[0,6]', 1]
      ];

      timeMultipliers.forEach(([name, multiplier, start_time, end_time, days_of_week, is_active]) => {
        db.run(
          'INSERT OR IGNORE INTO time_multipliers (name, multiplier, start_time, end_time, days_of_week, is_active) VALUES (?, ?, ?, ?, ?, ?)',
          [name, multiplier, start_time, end_time, days_of_week, is_active]
        );
      });

      // Insert Major UK Airports
      const airports = [
        ['LHR', 'London Heathrow', 5.00, 5.00, 45, 51.4700, -0.4543],
        ['LGW', 'London Gatwick', 5.00, 5.00, 45, 51.1481, -0.1903],
        ['STN', 'London Stansted', 7.00, 7.00, 45, 51.8860, 0.2389],
        ['LTN', 'London Luton', 6.00, 6.00, 45, 51.8763, -0.3717],
        ['LCY', 'London City', 4.00, 4.00, 30, 51.5048, 0.0495],
        ['SEN', 'Southend', 8.00, 8.00, 45, 51.5714, 0.6956]
      ];

      airports.forEach(([code, name, pickup_fee, dropoff_fee, waiting_time, lat, lng]) => {
        db.run(
          'INSERT OR IGNORE INTO airport_fees (airport_code, airport_name, pickup_fee, dropoff_fee, waiting_time_free_minutes, coordinates_lat, coordinates_lng) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [code, name, pickup_fee, dropoff_fee, waiting_time, lat, lng]
        );
      });

      // Insert Zone Fees
      const zoneFees = [
        ['central_london_congestion', 15.00, 'congestion'],
        ['ulez_central', 12.50, 'ulez'],
        ['lez_greater_london', 7.50, 'lez'],
        ['dartford_crossing', 2.50, 'toll'],
        ['m6_toll', 6.70, 'toll']
      ];

      zoneFees.forEach(([zone_name, fee_amount, zone_type]) => {
        db.run(
          'INSERT OR IGNORE INTO zone_fees (zone_name, fee_amount, zone_type) VALUES (?, ?, ?)',
          [zone_name, fee_amount, zone_type]
        );
      });

      // Insert Additional Services
      const services = [
        ['child_seat', 'Child Safety Seat', 15.00, 1, 'equipment'],
        ['booster_seat', 'Booster Seat', 10.00, 1, 'equipment'],
        ['bottled_water', 'Complimentary Water', 0.00, 1, 'amenity'],
        ['champagne', 'Champagne Service', 25.00, 1, 'amenity'],
        ['wifi', 'WiFi Access', 0.00, 1, 'amenity'],
        ['meet_greet', 'Meet & Greet Service', 20.00, 1, 'service'],
        ['flight_monitoring', 'Flight Monitoring', 0.00, 1, 'service'],
        ['extra_stop', 'Additional Stop', 15.00, 1, 'service'],
        ['waiting_time', 'Waiting Time (per 15min after free period)', 12.50, 1, 'service']
      ];

      services.forEach(([name, display_name, price, is_active, category]) => {
        db.run(
          'INSERT OR IGNORE INTO additional_services (name, display_name, price, is_active, category) VALUES (?, ?, ?, ?, ?)',
          [name, display_name, price, is_active, category]
        );
      });

      // Insert General Settings
      const settings = [
        ['rounding_policy', 'round_to_5', 'string', 'Round final prices to nearest 5 (round_to_5, round_to_10, no_rounding)'],
        ['maximum_waiting_time_hours', '4', 'number', 'Maximum waiting time in hours before additional charges'],
        ['cancellation_free_hours', '2', 'number', 'Hours before pickup when cancellation is free'],
        ['multi_stop_fee', '15.00', 'number', 'Fee per additional stop in GBP'],
        ['google_maps_api_enabled', 'true', 'boolean', 'Enable Google Maps integration for distance/time calculation'],
        ['default_currency', 'GBP', 'string', 'Default currency code'],
        ['business_hours_start', '06:00', 'string', 'Business hours start time'],
        ['business_hours_end', '22:00', 'string', 'Business hours end time'],
        ['holiday_surcharge_multiplier', '1.50', 'number', 'Multiplier for holiday pricing']
      ];

      settings.forEach(([key, value, type, description]) => {
        db.run(
          'INSERT OR IGNORE INTO general_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
          [key, value, type, description]
        );
      });

      // Create default admin user
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@vantagelane.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'VantageLane2024!';
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);

      db.run(
        'INSERT OR IGNORE INTO admin_users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
        [adminEmail, hashedPassword, 'System Administrator', 'super_admin'],
        function(err) {
          if (err) {
            console.error('Error creating admin user:', err);
          } else {
            console.log(`🔐 Default admin user created: ${adminEmail}`);
            console.log(`🔑 Default password: ${adminPassword}`);
            console.log('⚠️  Please change the default password after first login!');
          }
          resolve();
        }
      );
    });
  });
}

// Run the initialization
initializeDatabase().catch(console.error);
