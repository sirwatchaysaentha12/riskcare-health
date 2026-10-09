-- ═══════════════════════════════════════════════════════════════════════════
-- check_pipeline_health.sql — ตรวจสถานะ pipeline รายวัน
-- รันใน Supabase SQL Editor (read-only — ไม่แก้ข้อมูล)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) ดู pipeline run ล่าสุด 7 วัน
select
  run_date,
  status,
  finished_at,
  stations_total,
  array_length(coalesce(stations_missing, '{}'), 1) as stations_missing_count,
  detail->>'providerUsed'   as provider_used,
  detail->>'pipelineStatus' as pipeline_status,
  detail->>'openaqDegraded' as openaq_degraded,
  detail->>'saved'          as forecasts_saved
from public.pipeline_runs
order by started_at desc
limit 7;

-- 2) ตรวจข้อมูลพยากรณ์ล่าสุด (ควรมีภายใน 2 วัน)
select
  max(updated_at)                                              as latest_forecast,
  now() - max(updated_at)                                      as age,
  case when now() - max(updated_at) > interval '2 days'
       then '⚠️ เก่าเกิน 2 วัน — รัน pipeline'
       else '✅ ปกติ'
  end                                                          as health_status,
  count(distinct station_id)                                   as stations_with_forecast,
  count(*)                                                     as total_rows
from public.pm25_forecast_daily
where date >= current_date;

-- 3) ตรวจ shadow_forecasts (ถ้ามี)
select
  province,
  model_version,
  count(*) filter (where pm25_actual is not null) as evaluated_rows,
  count(*) filter (where pm25_actual is null)     as pending_rows,
  round(avg(abs(pm25_predicted - pm25_actual))::numeric, 2) as mae,
  max(target_date)                                 as latest_target
from public.shadow_forecasts
group by province, model_version
order by province, model_version;
