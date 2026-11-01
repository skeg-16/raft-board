-- Migration: Set pg_cron schedule to run every minute (* * * * *)
-- Not tied to a weekday in UTC. Fast-exit in public.close_week() handles immediate no-op.
-- Updates settings trigger to dynamically handle meeting_time and meeting_weekday adjustments.

-- 1. Refined trigger function handling both meeting_time and meeting_weekday
create or replace function public.handle_settings_meeting_update()
returns trigger as $$
declare
  v_tz text;
  v_cutoff_time time;
  v_target_cutoff timestamptz;
  v_week record;
  v_target_day int;
  v_current_day int;
  v_days_until int;
  v_now_local timestamp;
  v_target_date date;
begin
  v_tz := coalesce(new.timezone, 'Asia/Manila');
  v_cutoff_time := public.parse_meeting_time(new.meeting_time);
  
  -- Sunday=0, Monday=1, ..., Saturday=6
  case lower(trim(coalesce(new.meeting_weekday, 'saturday')))
    when 'sunday' then v_target_day := 0;
    when 'monday' then v_target_day := 1;
    when 'tuesday' then v_target_day := 2;
    when 'wednesday' then v_target_day := 3;
    when 'thursday' then v_target_day := 4;
    when 'friday' then v_target_day := 5;
    else v_target_day := 6; -- saturday
  end case;

  v_now_local := timezone(v_tz, now());
  v_current_day := extract(dow from v_now_local)::int;

  if v_current_day = v_target_day then
    -- Cutoff date is today at new meeting_time.
    -- If new meeting_time has already passed today, now >= cutoff_at immediately holds, locking the week.
    v_target_date := v_now_local::date;
  else
    v_days_until := (v_target_day - v_current_day + 7) % 7;
    if v_days_until = 0 then v_days_until := 7; end if;
    v_target_date := (v_now_local + (v_days_until || ' days')::interval)::date;
  end if;

  v_target_cutoff := timezone(v_tz, (v_target_date || ' ' || v_cutoff_time)::timestamp);

  for v_week in (select * from public.weeks where is_current = true) loop
    update public.weeks
    set cutoff_at = v_target_cutoff,
        updated_at = timezone('utc'::text, now())
    where id = v_week.id;
  end loop;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_settings_meeting_update on public.settings;
create trigger trigger_settings_meeting_update
after update of meeting_time, meeting_weekday, timezone on public.settings
for each row
execute function public.handle_settings_meeting_update();

-- 2. Update pg_cron to every minute (* * * * *)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('raft-weekly-close');
    perform cron.schedule(
      'raft-weekly-close',
      '* * * * *',
      'select public.close_week();'
    );
  end if;
exception
  when others then
    null;
end;
$$;
