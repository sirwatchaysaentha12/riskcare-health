-- Backfill health_profiles from the existing risk_assessments.answers JSON.
-- This is a summary of assessment signals, not a medical diagnosis.
-- Run once in Supabase SQL Editor after health_planning.sql has created health_profiles.

insert into public.health_profiles (user_id, chronic_condition, medication, updated_at)
select
  ra.user_id,
  case
    when coalesce(ra.answers->>'lungDisease', '') in ('controlled', 'active')
      and coalesce(ra.answers->>'comorbidity', '') = 'yes'
      and coalesce(ra.answers->>'vulnerable', '') = 'yes'
      then 'มีประวัติโรคปอดจากแบบประเมิน / มีโรคร่วมที่อาจกระทบการหายใจจากแบบประเมิน / อยู่ในกลุ่มเปราะบางจากแบบประเมิน'
    when coalesce(ra.answers->>'lungDisease', '') in ('controlled', 'active')
      and coalesce(ra.answers->>'comorbidity', '') = 'yes'
      then 'มีประวัติโรคปอดจากแบบประเมิน / มีโรคร่วมที่อาจกระทบการหายใจจากแบบประเมิน'
    when coalesce(ra.answers->>'lungDisease', '') in ('controlled', 'active')
      then 'มีประวัติโรคปอดจากแบบประเมิน'
    when coalesce(ra.answers->>'comorbidity', '') = 'yes'
      then 'มีโรคร่วมที่อาจกระทบการหายใจจากแบบประเมิน'
    when coalesce(ra.answers->>'vulnerable', '') = 'yes'
      then 'อยู่ในกลุ่มเปราะบางจากแบบประเมิน'
    else 'ไม่มีโรคประจำตัว'
  end,
  coalesce(hp.medication, 'ไม่ได้ใช้ยาประจำ'),
  now()
from public.risk_assessments ra
left join public.health_profiles hp on hp.user_id = ra.user_id
where ra.user_id in (
  '59f8a24c-a3ba-48a5-b7f1-88d8a5f68381'::uuid,
  'c453b639-1e28-43fd-a025-92519e65476f'::uuid
)
and ra.created_at = (
  select max(latest.created_at)
  from public.risk_assessments latest
  where latest.user_id = ra.user_id
)
on conflict (user_id) do update
set chronic_condition = excluded.chronic_condition,
    updated_at = excluded.updated_at;

-- Ensure a general-profile row also exists when a user has no assessment yet.
-- This does not overwrite an existing health profile or infer a medical condition.
insert into public.health_profiles (user_id, chronic_condition, medication, updated_at)
select target.user_id, 'ไม่มีโรคประจำตัว', 'ไม่ได้ใช้ยาประจำ', now()
from (
  values
    ('59f8a24c-a3ba-48a5-b7f1-88d8a5f68381'::uuid),
    ('c453b639-1e28-43fd-a025-92519e65476f'::uuid)
) as target(user_id)
where not exists (
  select 1
  from public.health_profiles hp
  where hp.user_id = target.user_id
)
on conflict (user_id) do nothing;

-- Verify the two backfilled rows.
select user_id, chronic_condition, medication, updated_at
from public.health_profiles
where user_id in (
  '59f8a24c-a3ba-48a5-b7f1-88d8a5f68381'::uuid,
  'c453b639-1e28-43fd-a025-92519e65476f'::uuid
)
order by user_id;
