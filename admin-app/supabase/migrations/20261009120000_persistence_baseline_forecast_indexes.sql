begin;

-- Safe, repeatable support for the non-ML province baseline. This migration
-- does not insert forecast values and does not run any model.
create index if not exists pm25_forecast_baseline_province_date_idx
  on public.pm25_forecast (province, target_date, issued_date)
  where model_version = 'persistence-baseline';

comment on column public.pm25_forecast.model_version is
  'persistence-baseline means the province latest real PM2.5 value was repeated for the horizon; it is not an ML forecast';

commit;
