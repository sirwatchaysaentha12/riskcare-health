# -*- coding: utf-8 -*-
"""v2.6 local evaluation — วัด R² ทีละข้อตามแผนผู้ใช้ (เทียบ baseline 0.861)
รันในเครื่อง: ดึงข้อมูลจริงจาก Supabase + Open-Meteo แล้ววัดผลเชิงเปรียบเทียบ (ablation)
ผลลัพธ์: notebooks/eval_v26_results.json + ตารางใน stdout
หมายเหตุ: โมเดลใช้ hyperparameter คงที่ (ไม่จูน) ทุกข้อเท่ากัน — ตัวเลขเด็ดขาดอาจต่างจาก Colab
แต่ "เดลตะระหว่างข้อ" ใช้ตัดสินใจได้เต็มที่"""
import json, time, warnings
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

warnings.filterwarnings('ignore')
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.om_cache'
CACHE.mkdir(exist_ok=True)
T0 = time.time()


def load_env() -> dict:
    e = {}
    for line in (ROOT.parent / 'admin-app' / '.env.local').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            e[k.strip()] = v.strip()
    return e


ENV = load_env()
URL = ENV.get('NEXT_PUBLIC_SUPABASE_URL') or ENV.get('SUPABASE_URL')
KEY = ENV.get('SUPABASE_SERVICE_ROLE_KEY')

BAND_EDGES = [15, 25, 37.5, 75]


def evaluate(y_true, y_pred):
    y_true = np.asarray(y_true, float); y_pred = np.asarray(y_pred, float)
    m = np.isfinite(y_true) & np.isfinite(y_pred)
    y_true, y_pred = y_true[m], y_pred[m]
    nz = y_true != 0
    return {
        'R2': round(r2_score(y_true, y_pred), 4),
        'MAE': round(mean_absolute_error(y_true, y_pred), 3),
        'RMSE': round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        'within5': round(float(np.mean(np.abs(y_true - y_pred) <= 5) * 100), 1),
    }


print('=== 1) ดึงข้อมูลจาก Supabase ===')
rows, off = [], 0
while True:
    r = requests.get(f'{URL}/rest/v1/air_quality_daily?select=*&order=date.asc',
                     headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Range': f'{off}-{off + 999}'},
                     timeout=60)
    r.raise_for_status()
    chunk = r.json()
    if not chunk:
        break
    rows += chunk
    off += 1000
    if len(chunk) < 1000:
        break
df = pd.DataFrame(rows)
df['date'] = pd.to_datetime(df['date'])
df = df.sort_values(['station_id', 'date']).reset_index(drop=True)
print(f'rows={len(df)} stations={df.station_id.nunique()} range={df.date.min().date()}..{df.date.max().date()}')

print('=== 2) สร้างฟีเจอร์ทั้งหมด (รวมของใหม่: lag_14, roll min/max, trend, interactions) ===')


def add_features(g):
    g = g.sort_values('date').copy()
    d = g['date'].diff().dt.days
    for i in range(1, 15):
        g[f'lag_{i}'] = g['pm25'].shift(i).where(d.rolling(i).max() == 1)
    for w in (3, 7, 14):
        ok = d.rolling(w).max() == 1
        g[f'rolling_mean_{w}'] = g['pm25'].shift(1).rolling(w).mean().where(ok)
        g[f'rolling_std_{w}'] = g['pm25'].shift(1).rolling(w).std().where(ok)
        g[f'rolling_min_{w}'] = g['pm25'].shift(1).rolling(w).min().where(ok)
        g[f'rolling_max_{w}'] = g['pm25'].shift(1).rolling(w).max().where(ok)
    g['day_of_week'] = g['date'].dt.dayofweek
    g['month'] = g['date'].dt.month
    g['is_weekend'] = (g['day_of_week'] >= 5).astype(int)
    doy = g['date'].dt.dayofyear
    g['doy_sin'] = np.sin(2 * np.pi * doy / 365.25)
    g['doy_cos'] = np.cos(2 * np.pi * doy / 365.25)
    g['is_burning_season'] = g['month'].isin([12, 1, 2, 3, 4]).astype(int)
    return g


df['_g'] = df['station_id']  # group ผ่านคอลัมน์ temp — กัน pandas ใหม่ตัด grouping column ทิ้ง
df = df.groupby('_g', group_keys=False).apply(add_features)
df = df.drop(columns=['_g'], errors='ignore')  # pandas เก่า: _g ติดมากับผล / pandas ใหม่: ไม่มี — ข้ามได้ทั้งคู่

pivot = df.pivot_table(index='date', columns='station_id', values='pm25')
full_days = pd.date_range(pivot.index.min(), pivot.index.max(), freq='D')
pivot = pivot.reindex(full_days)
n_others = pivot.notna().sum(axis=1).values[:, None] - 1
with np.errstate(divide='ignore', invalid='ignore'):
    others_mean = (pivot.sum(axis=1).values[:, None] - pivot.values) / n_others
others_lag1 = pd.DataFrame(others_mean, index=full_days, columns=pivot.columns).shift(1)
key = pd.MultiIndex.from_arrays([df['date'], df['station_id']])
df['neighbors_pm25_lag1'] = others_lag1.stack().reindex(key).values

print('=== 3) ดึงสภาพอากาศ Open-Meteo (cache ในเครื่อง) ===')


def fetch_weather(sid, lat, lon, start, end):
    cache = CACHE / f'{sid}.csv'
    if cache.exists():
        w = pd.read_csv(cache, parse_dates=['date'])
        return w
    params = {'latitude': lat, 'longitude': lon, 'start_date': start, 'end_date': end,
              'daily': 'temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_sum,wind_direction_10m_dominant',
              'hourly': 'boundary_layer_height', 'timezone': 'Asia/Bangkok'}
    r = requests.get('https://archive-api.open-meteo.com/v1/archive', params=params, timeout=90)
    r.raise_for_status()
    data = r.json()
    daily = pd.DataFrame(data['daily']).rename(columns={
        'time': 'date', 'temperature_2m_mean': 'temperature',
        'relative_humidity_2m_mean': 'humidity',
        'wind_speed_10m_max': 'wind_speed', 'precipitation_sum': 'rainfall'})
    rad = np.deg2rad(daily['wind_direction_10m_dominant'])
    daily['wind_dir_sin'] = np.sin(rad)
    daily['wind_dir_cos'] = np.cos(rad)
    hourly = pd.DataFrame(data['hourly'])
    hourly['date'] = pd.to_datetime(hourly['time']).dt.date
    daily['boundary_layer_height'] = hourly.groupby('date')['boundary_layer_height'].mean().values
    daily['date'] = pd.to_datetime(daily['date'])
    daily['station_id'] = sid
    daily.to_csv(cache, index=False)
    return daily


start = df['date'].min().date().isoformat()
end = df['date'].max().date().isoformat()
frames = []
for sid, lat, lon in df[['station_id', 'latitude', 'longitude']].drop_duplicates().itertuples(index=False):
    frames.append(fetch_weather(str(sid), lat, lon, start, end))
    time.sleep(0.4)
weather = pd.concat(frames, ignore_index=True)
weather['date'] = weather['date'] + pd.Timedelta(days=1)  # ค่า "เมื่อวาน" กันรั่วอนาคต

df = df.drop(columns=['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'rainfall'], errors='ignore')
df['station_id'] = df['station_id'].astype(str)
weather['station_id'] = weather['station_id'].astype(str)
df = df.merge(weather[['station_id', 'date', 'temperature', 'humidity', 'wind_speed', 'rainfall',
                       'wind_dir_sin', 'wind_dir_cos', 'boundary_layer_height']],
              on=['station_id', 'date'], how='left')

# interactions (ข้อ 6 และ 10)
df['trend_lag1_lag7'] = df['lag_1'] - df['lag_7']
df['trend_lag1_lag14'] = df['lag_1'] - df['lag_14']
df['lag1_x_lag2'] = df['lag_1'] * df['lag_2']
df['lag1_sq'] = df['lag_1'] ** 2

df_model = df.dropna(subset=['lag_1']).reset_index(drop=True)
df_model['station_code'] = df_model['station_id'].astype('category').cat.codes
print(f'พร้อมเทรน {len(df_model)} แถว')

BASE28 = ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5', 'lag_6', 'lag_7',
          'rolling_mean_3', 'rolling_mean_7', 'rolling_mean_14',
          'rolling_std_3', 'rolling_std_7', 'rolling_std_14',
          'day_of_week', 'is_weekend', 'month', 'station_code',
          'neighbors_pm25_lag1', 'doy_sin', 'doy_cos', 'is_burning_season',
          'temperature', 'humidity', 'wind_speed', 'rainfall',
          'wind_dir_sin', 'wind_dir_cos', 'boundary_layer_height']
ADD_LAG14 = ['lag_14']
ADD_ROLLMM = ['rolling_min_3', 'rolling_max_3', 'rolling_min_7', 'rolling_max_7', 'rolling_min_14', 'rolling_max_14']
ADD_TREND = ['trend_lag1_lag7', 'trend_lag1_lag14']
ADD_INTER = ['lag1_x_lag2', 'lag1_sq']


def make_models():
    return [
        RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1),
        XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=4, subsample=0.9,
                     colsample_bytree=0.9, random_state=42, n_jobs=-1, tree_method='hist'),
        LGBMRegressor(n_estimators=500, learning_rate=0.05, random_state=42, n_jobs=-1, verbose=-1),
    ]


cutoff = df_model['date'].quantile(0.8)
train = df_model[df_model['date'] < cutoff]
test = df_model[df_model['date'] >= cutoff]
print(f'train={len(train)} test={len(test)} cutoff={cutoff.date()}')

results = []
persistence = evaluate(test['pm25'], test['lag_1'])
results.append({'step': 'baseline: persistence', **persistence})


def run_step(name, features, drop_outliers=False):
    tr = train.copy()
    if drop_outliers:
        med = tr['pm25'].median()
        mad = (tr['pm25'] - med).abs().median() * 1.4826
        mask = (tr['pm25'] - med).abs() / max(mad, 1e-9) <= 8
        kept = int(mask.sum())
        tr = tr[mask]
        print(f'   [outlier] ตัด {len(train) - kept}/{len(train)} แถว (robust z>8) เหลือ {kept}')
    models = make_models()
    preds = []
    for m in models:
        m.fit(tr[features], tr['pm25'])
        preds.append(m.predict(test[features]))
    ens = np.mean(preds, axis=0)
    ev = evaluate(test['pm25'], ens)
    xgb_ev = evaluate(test['pm25'], preds[1])
    results.append({'step': name, **ev, 'xgb_R2': xgb_ev['R2']})
    print(f'   {name}: ensemble R2={ev["R2"]} (XGB เดี่ยว {xgb_ev["R2"]})')
    return ev


print('=== 4) วัดผลทีละข้อ (โมเดลเหมือนกันทุกข้อ เปลี่ยนแค่ฟีเจอร์) ===')
base_ev = run_step('ข้อ 0: ชุดเดิม 28 ฟีเจอร์ (baseline)', BASE28)
run_step('ข้อ 3: +lag_14', BASE28 + ADD_LAG14)
run_step('ข้อ 4: +rolling min/max (3,7,14)', BASE28 + ADD_LAG14 + ADD_ROLLMM)
run_step('ข้อ 6: +trend (lag1-lag7, lag1-lag14)', BASE28 + ADD_LAG14 + ADD_ROLLMM + ADD_TREND)
full39 = BASE28 + ADD_LAG14 + ADD_ROLLMM + ADD_TREND + ADD_INTER
run_step('ข้อ 10: +interactions (lag1*lag2, lag1²)', full39)
run_step('ข้อ 11: ชุดเต็ม + ตัด outlier (z>8, train เท่านั้น)', full39, drop_outliers=True)

print('=== 5) Feature importance (XGB ชุดเต็ม) ===')
xm = make_models()[1].fit(train[full39], train['pm25'])
imp = pd.Series(xm.feature_importances_, index=full39).sort_values(ascending=False)
print(imp.head(10).round(4).to_string())

out = {
    'version': '2.6-local-eval',
    'timestamp': time.strftime('%Y-%m-%d %H:%M'),
    'rows': int(len(df_model)),
    'stations': int(df_model.station_id.nunique()),
    'train': int(len(train)), 'test': int(len(test)),
    'elapsed_sec': round(time.time() - T0, 1),
    'results': results,
    'top_features': imp.head(10).round(4).to_dict(),
}
(ROOT / 'eval_v26_results.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print(f"\n=== เสร็จใน {out['elapsed_sec']} วินาที — บันทึก notebooks/eval_v26_results.json ===")
print(pd.DataFrame(results).to_string(index=False))
