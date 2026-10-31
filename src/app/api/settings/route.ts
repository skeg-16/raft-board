import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { getSettings, updateSystemSettings, getCurrentWeek } from '@/lib/tasks';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/settings - Read system settings
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const settings = await getSettings();
  const currentWeek = await getCurrentWeek();
  return NextResponse.json({ settings, currentWeek });
}

// PATCH /api/settings - Update system settings (Super Admins only)
// Automatically updates the open week's cutoff to follow new meeting time with zero cron change
export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (!profile.is_super_admin) {
    return NextResponse.json(
      { error: 'Forbidden: Only super admins can update system settings.' },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { meeting_weekday, meeting_time, timezone } = body;

  const result = await updateSystemSettings({
    meeting_weekday,
    meeting_time,
    timezone,
  });

  return NextResponse.json({
    success: true,
    settings: result.settings,
    currentWeek: result.currentWeek,
    message: 'Settings updated successfully. Current week cutoff updated to match new meeting time.',
  });
}
