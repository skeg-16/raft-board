import { createClient } from '@supabase/supabase-js';

// Seed script to initialize default system settings
// Usage: npx tsx scripts/seed.ts

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seed() {
  console.log('🦦 Initializing Raft Board system settings...');

  const { error: settingsError } = await supabase.from('settings').upsert({
    id: 1,
    meeting_weekday: 'Saturday',
    meeting_time: '10:00 AM',
    timezone: 'Asia/Manila',
  });

  if (settingsError) {
    console.error('Error seeding settings:', settingsError.message);
  } else {
    console.log('✓ Verified global settings: Saturday 10:00 AM Asia/Manila');
  }

  console.log('🎉 No default passwords or user accounts seeded. Self-service accounts are active.');
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
