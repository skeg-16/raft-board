import { createClient } from '@supabase/supabase-js';

// Seed script to provision the 6 Otter Software Systems (OSS) members
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

interface SeedMember {
  email: string;
  fullName: string;
  roleTitle: string;
  roleType: 'executive' | 'lead';
  isSuperAdmin: boolean;
  isTreasurer: boolean;
  weeklyTargetXp: number;
}

const SEED_MEMBERS: SeedMember[] = [
  // 3 Executives
  {
    email: 'coo@otter.systems',
    fullName: 'Samira Chen',
    roleTitle: 'Chief Operating Officer',
    roleType: 'executive',
    isSuperAdmin: true, // Backup super_admin
    isTreasurer: true,   // Treasurer
    weeklyTargetXp: 80,
  },
  {
    email: 'cto@otter.systems',
    fullName: 'Alex Rivera',
    roleTitle: 'Chief Technology Officer',
    roleType: 'executive',
    isSuperAdmin: true, // Primary super_admin
    isTreasurer: false,
    weeklyTargetXp: 80,
  },
  {
    email: 'cmo@otter.systems',
    fullName: 'Marcus Vance',
    roleTitle: 'Chief Marketing Officer',
    roleType: 'executive',
    isSuperAdmin: false,
    isTreasurer: false,
    weeklyTargetXp: 80,
  },
  // 3 Leads
  {
    email: 'creatives@otter.systems',
    fullName: 'Chloe Santos',
    roleTitle: 'Creatives Lead',
    roleType: 'lead',
    isSuperAdmin: false,
    isTreasurer: false,
    weeklyTargetXp: 80,
  },
  {
    email: 'backend@otter.systems',
    fullName: 'David Kim',
    roleTitle: 'Backend Lead',
    roleType: 'lead',
    isSuperAdmin: false,
    isTreasurer: false,
    weeklyTargetXp: 80,
  },
  {
    email: 'operations@otter.systems',
    fullName: 'Bea Alcantara',
    roleTitle: 'Operations Lead',
    roleType: 'lead',
    isSuperAdmin: false,
    isTreasurer: false,
    weeklyTargetXp: 80,
  },
];

async function seed() {
  console.log('🦦 Seeding Raft Board team members...');

  for (const member of SEED_MEMBERS) {
    console.log(`Processing: ${member.fullName} (${member.email})...`);

    // Check if user already exists
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('Failed to list users:', listError.message);
      return;
    }

    const existingUser = usersData.users.find((u) => u.email === member.email);
    let userId = existingUser?.id;

    if (!userId) {
      // Create user with initial password
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: member.email,
        password: 'OtterPass2026!',
        email_confirm: true,
        user_metadata: {
          full_name: member.fullName,
          role_title: member.roleTitle,
        },
      });

      if (createError) {
        console.error(`Error creating user ${member.email}:`, createError.message);
        continue;
      }
      userId = newUser.user.id;
      console.log(`✓ Created auth user: ${member.email} (ID: ${userId})`);
    } else {
      console.log(`Existing auth user found: ${member.email} (ID: ${userId})`);
    }

    // Upsert profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: member.fullName,
      role_title: member.roleTitle,
      role_type: member.roleType,
      is_super_admin: member.isSuperAdmin,
      is_treasurer: member.isTreasurer,
      weekly_target_xp: member.weeklyTargetXp,
      active: true,
      must_change_password: true,
    });

    if (profileError) {
      console.error(`Error upserting profile for ${member.fullName}:`, profileError.message);
    } else {
      console.log(`✓ Upserted profile: ${member.fullName} [${member.roleTitle}]`);
    }
  }

  // Ensure default settings exist
  const { error: settingsError } = await supabase.from('settings').upsert({
    id: 1,
    meeting_weekday: 'Saturday',
    meeting_time: '10:00',
    timezone: 'Asia/Manila',
  });

  if (settingsError) {
    console.error('Error seeding settings:', settingsError.message);
  } else {
    console.log('✓ Verified global settings (Saturday 10:00 Asia/Manila)');
  }

  console.log('🎉 Seeding complete! All 6 members ready with password "OtterPass2026!".');
}

seed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
