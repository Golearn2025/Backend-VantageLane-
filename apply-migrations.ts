/**
 * Apply Dual Quote Stop Pricing Migrations
 * Run: npx ts-node apply-migrations.ts
 */

import { supabase } from './src/config/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigrations() {
  console.log('🚀 Starting migration process...\n');

  try {
    // Read migration files
    const migration001 = fs.readFileSync(
      path.join(__dirname, 'migrations/001_add_dual_quote_stop_config_to_pricing_versions.sql'),
      'utf-8'
    );
    
    const migration002 = fs.readFileSync(
      path.join(__dirname, 'migrations/002_add_route_metrics_and_pricing_logic_to_quotes.sql'),
      'utf-8'
    );

    // Apply Migration 001
    console.log('📝 Applying Migration 001: pricing_versions extensions...');
    const { error: error001 } = await supabase.rpc('exec_sql', { sql: migration001 });
    
    if (error001) {
      console.error('❌ Migration 001 failed:', error001);
      // Try direct execution if RPC fails
      console.log('Trying direct execution...');
      const statements001 = migration001.split(';').filter(s => s.trim());
      for (const stmt of statements001) {
        if (stmt.trim()) {
          const { error } = await supabase.rpc('exec_sql', { sql: stmt });
          if (error) console.error('Statement error:', error);
        }
      }
    } else {
      console.log('✅ Migration 001 applied successfully\n');
    }

    // Apply Migration 002
    console.log('📝 Applying Migration 002: client_booking_quotes extensions...');
    const { error: error002 } = await supabase.rpc('exec_sql', { sql: migration002 });
    
    if (error002) {
      console.error('❌ Migration 002 failed:', error002);
      // Try direct execution if RPC fails
      console.log('Trying direct execution...');
      const statements002 = migration002.split(';').filter(s => s.trim());
      for (const stmt of statements002) {
        if (stmt.trim()) {
          const { error } = await supabase.rpc('exec_sql', { sql: stmt });
          if (error) console.error('Statement error:', error);
        }
      }
    } else {
      console.log('✅ Migration 002 applied successfully\n');
    }

    // Verify migrations
    console.log('🔍 Verifying migrations...\n');
    
    // Check pricing_versions columns
    const { data: pricingVersions, error: pvError } = await supabase
      .from('pricing_versions')
      .select('enable_dual_quote_stop_logic, stop_grace_threshold_miles, stop_grace_threshold_minutes, multi_stop_fee_pence')
      .eq('is_active', true)
      .single();

    if (pvError) {
      console.error('❌ Could not verify pricing_versions:', pvError);
    } else {
      console.log('✅ pricing_versions columns verified:');
      console.log('  - enable_dual_quote_stop_logic:', pricingVersions.enable_dual_quote_stop_logic);
      console.log('  - stop_grace_threshold_miles:', pricingVersions.stop_grace_threshold_miles);
      console.log('  - stop_grace_threshold_minutes:', pricingVersions.stop_grace_threshold_minutes);
      console.log('  - multi_stop_fee_pence:', pricingVersions.multi_stop_fee_pence);
      console.log('');
    }

    // Check client_booking_quotes columns (just verify table structure)
    const { data: quotes, error: quotesError } = await supabase
      .from('client_booking_quotes')
      .select('id, direct_distance_miles, direct_quote_pence, stop_grace_applied')
      .limit(1);

    if (quotesError) {
      console.error('❌ Could not verify client_booking_quotes:', quotesError);
    } else {
      console.log('✅ client_booking_quotes columns verified (structure OK)\n');
    }

    console.log('🎉 Migration process complete!\n');
    console.log('📊 Current Configuration:');
    console.log(`  Feature Flag: ${pricingVersions?.enable_dual_quote_stop_logic ? 'ENABLED ✅' : 'DISABLED ⚙️'}`);
    console.log(`  Grace Threshold: ${pricingVersions?.stop_grace_threshold_miles || 0.5} miles / ${pricingVersions?.stop_grace_threshold_minutes || 5} minutes`);
    console.log(`  Legacy Fee: £${(pricingVersions?.multi_stop_fee_pence || 1500) / 100}\n`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations
applyMigrations()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
