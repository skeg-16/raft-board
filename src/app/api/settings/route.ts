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
// RULE: Changes apply starting from the NEXT week by default.
// Must never alter or lock the current open week. Cutoffs in the past are rejected.
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
  const { meeting_weekday, meeting_time, timezone, cutoff_at, new_cutoff_at } = body;

  // Safety check: a cutoff in the past must be rejected
  const requestedCutoff = cutoff_at || new_cutoff_at;
  if (requestedCutoff) {
    const targetDate = new Date(requestedCutoff);
    if (!isNaN(targetDate.getTime()) && targetDate.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Cannot set cutoff in the past. New cutoff must be in the future.' },
        { status: 400 }
      );
    }
  }

  try {
    const result = await updateSystemSettings(
      {
        meeting_weekday,
        meeting_time,
        timezone,
      },
      profile.id
    );

    return NextResponse.json({
      success: true,
      settings: result.settings,
      currentWeek: result.currentWeek,
      message: 'Settings updated successfully. New meeting schedule applies starting from next week. Current week cutoff is preserved.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update settings.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
