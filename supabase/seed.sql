-- ==============================================================================
-- Raft Board: Seed Data
-- Only initializes the global settings row.
-- No seeded member accounts or shared passwords exist. Accounts are self-registered.
-- ==============================================================================

insert into public.settings (id, meeting_weekday, meeting_time, timezone)
values (1, 'Saturday', '10:00 AM', 'Asia/Manila')
on conflict (id) do update set
  meeting_weekday = excluded.meeting_weekday,
  meeting_time = excluded.meeting_time,
  timezone = excluded.timezone;
