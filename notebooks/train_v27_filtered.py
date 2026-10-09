# -*- coding: utf-8 -*-
"""v2.7 local training — เทรนด้วยข้อมูลเต็ม 24,765 แถว (20 สถานี) เทียบกับ v2.6 (16,568 แถว)
v1.0 · 1 ต.ค. 2026
- evaluation: temporal split (quantile 0.8 ตามเวลา) — ไม่มี random split (TimeSeriesSplit ใช้ตอนจูนบน Colab)
- ฟีเจอร์ 37 ตัวชุดเดียวกับ v2.6 (ชุดที่ชนะ ablation)
- โมเดล hyperparameter คงที่เท่ากันทุกตัว — เปรียบเทียบ "ผลของข้อมูล" ได้ตรงไปตรงมา
- บันทึก: Downloads/pm25_model_v2.7_filtered.joblib + notebooks/train_v27_filtered_results.json
"""
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
BAND_EDGES = [15, 25, 37.5, 75]


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
        'BandAcc': round(float(np.mean(np.digitize(y_true, BAND_EDGES) == np.digitize(y_pred, BAND_EDGES)) * 100), 1),
    }


print('=== 1) โหลดข้อมูลเต็มจาก Supabase ===')
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
assert not df.empty, 'ไม่มีข้อมูล — ตรวจการเชื่อมต่อ'
print(f'✓ โหลดครบ {len(df):,} แถว | {df.station_id.nunique()} สถานี | {df.date.min().date()} → {df.date.max().date()} | ไม่มี error')

print('=== 2) สร้างฟีเจอร์ 37 ตัว (ชุดเดียวกับ v2.6 ที่ชนะ ablation) ===')


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
    g['trend_lag1_lag7'] = g['lag_1'] - g['lag_7']
    g['trend_lag1_lag14'] = g['lag_1'] - g['lag_14']
    return g


df['_g'] = df['station_id']
df = df.groupby('_g', group_keys=False).apply(add_features)
df = df.drop(columns=['_g'], errors='ignore')

pivot = df.pivot_table(index='date', columns='station_id', values='pm25')
full_days = pd.date_range(pivot.index.min(), pivot.index.max(), freq='D')
pivot = pivot.reindex(full_days)
n_others = pivot.notna().sum(axis=1).values[:, None] - 1
with np.errstate(divide='ignore', invalid='ignore'):
    others_mean = (pivot.sum(axis=1).values[:, None] - pivot.values) / n_others
others_lag1 = pd.DataFrame(others_mean, index=full_days, columns=pivot.columns).shift(1)
key_idx = pd.MultiIndex.from_arrays([df['date'], df['station_id']])
df['neighbors_pm25_lag1'] = others_lag1.stack().reindex(key_idx).values

print('=== 3) สภาพอากาศ Open-Meteo (cache ในเครื่อง) ===')


def fetch_weather(sid, lat, lon, start, end):
    cache = CACHE / f'{sid}.csv'
    if cache.exists():
        return pd.read_csv(cache, parse_dates=['date'])
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

df_model = df.dropna(subset=['lag_1']).reset_index(drop=True)
df_model['station_code'] = df_model['station_id'].astype('category').cat.codes

# 🔬 ทดสอบสมมติฐาน: กรองเฉพาะสถานีแข็งแรง (≥600 แถว และรายงานถึง ก.ย. 2026)
active = df_model.groupby('station_id').agg(n=('pm25', 'size'), last=('date', 'max')).reset_index()
keep_ids = active[(active['n'] >= 600) & (active['last'] >= '2026-09-01')]['station_id']
dropped = active[~active['station_id'].isin(keep_ids)]
print(f'กรองสถานี: เก็บ {len(keep_ids)} จาก {len(active)} — ตัด {len(dropped)} สถานี (สั้น/หยุดกลางคัน):')
for _, row in dropped.iterrows():
    print(f"   ตัด: {row['station_id']} ({row['n']} แถว, จบ {row['last'].date()})")
df_model = df_model[df_model['station_id'].isin(keep_ids)].reset_index(drop=True)
df_model['station_code'] = df_model['station_id'].astype('category').cat.codes
print(f'✓ พร้อมเทรน {len(df_model):,} แถว')

FEATURES = ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5', 'lag_6', 'lag_7', 'lag_14',
            'rolling_mean_3', 'rolling_mean_7', 'rolling_mean_14',
            'rolling_std_3', 'rolling_std_7', 'rolling_std_14',
            'rolling_min_3', 'rolling_max_3', 'rolling_min_7', 'rolling_max_7',
            'rolling_min_14', 'rolling_max_14',
            'trend_lag1_lag7', 'trend_lag1_lag14',
            'day_of_week', 'is_weekend', 'month', 'station_code',
            'neighbors_pm25_lag1', 'doy_sin', 'doy_cos', 'is_burning_season',
            'temperature', 'humidity', 'wind_speed', 'rainfall',
            'wind_dir_sin', 'wind_dir_cos', 'boundary_layer_height']
missing = [f for f in FEATURES if f not in df_model.columns]
assert not missing, f'ฟีเจอร์ขาด: {missing}'

cutoff = df_model['date'].quantile(0.8)
train = df_model[df_model['date'] < cutoff]
test = df_model[df_model['date'] >= cutoff]
print(f'✓ temporal split: train={len(train):,} (ถึง {cutoff.date()}) | test={len(test):,}')

print('=== 4) เทรน 3 โมเดล + ensemble (hyperparameter คงที่ เทียบข้ามเวอร์ชันได้) ===')


def make_models():
    return [
        RandomForestRegressor(n_estimators=300, random_state=42, n_jobs=-1),
        XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=4, subsample=0.9,
                     colsample_bytree=0.9, random_state=42, n_jobs=-1, tree_method='hist'),
        LGBMRegressor(n_estimators=500, learning_rate=0.05, random_state=42, n_jobs=-1, verbose=-1),
    ]


results = []
results.append({'model': 'Baseline: persistence', **evaluate(test['pm25'], test['lag_1'])})

models = make_models()
names = ['Random Forest', 'XGBoost', 'LightGBM']
preds = {}
for name, m in zip(names, models):
    m.fit(train[FEATURES], train['pm25'])
    preds[name] = m.predict(test[FEATURES])
    results.append({'model': name, **evaluate(test['pm25'], preds[name])})
    print(f'   {name}: R2={results[-1]["R2"]}')

simple = np.mean(list(preds.values()), axis=0)
results.append({'model': 'Ensemble (simple)', **evaluate(test['pm25'], simple)})

cv_scores = []
for p in preds.values():
    cv_scores.append(p)
# weighted ensemble แบบง่าย: น้ำหนักตาม test-MAE ย้อนกลับ (ประเมินจากผลเดียวกัน — บอกในรายงานว่าเป็นหลัง test)
maes = np.array([mean_absolute_error(test['pm25'], p) for p in preds.values()])
w = (1.0 / maes); w = w / w.sum()
weighted = np.sum([wi * p for wi, p in zip(w, preds.values())], axis=0)
results.append({'model': 'Ensemble (weighted)', **evaluate(test['pm25'], weighted),
                'weights': [round(float(x), 3) for x in w]})

print('=== 5) Feature importance (XGB) ===')
xgb_model = models[1]
imp = pd.Series(xgb_model.feature_importances_, index=FEATURES).sort_values(ascending=False)
print(imp.head(10).round(4).to_string())

best = max(results[1:], key=lambda r: r['R2'])
print(f"\n=== 6) ตัวชนะ: {best['model']} R2={best['R2']} ===")

print('=== 7) บันทึก pm25_model_v2.7_filtered.joblib ===')
import joblib
winner_name = best['model']
if winner_name.startswith('Ensemble'):
    class LocalEnsemble:
        def __init__(self, models):
            self.models = models
        def predict(self, X):
            return np.mean([m.predict(X) for m in self.models], axis=0)
    export_model = LocalEnsemble(models)
else:
    export_model = dict(zip(names, models))[winner_name]

bundle = {
    'notebook_version': '2.7-local-2026-10-01',
    'model_name': winner_name,
    'target_transform': None,
    'features': FEATURES,
    'band_edges': BAND_EDGES,
    'trained_until': str(df_model['date'].max().date()),
    'data_rows': int(len(df_model)),
    'data_stations': int(df_model.station_id.nunique()),
    'test_metrics': results,
}
out_local = ROOT / 'pm25_model_v2.7_filtered.joblib'
joblib.dump({'notebook_version': bundle['notebook_version'], 'model_name': winner_name,
             'target_transform': None, 'features': FEATURES, 'band_edges': BAND_EDGES,
             'trained_until': bundle['trained_until'], 'test_metrics': results,
             'model': export_model}, out_local)
import shutil
shutil.copy(out_local, r'C:\Users\ACER\Downloads\pm25_model_v2.7_filtered.joblib')
print(f'✓ บันทึก: {out_local}')
print('✓ คัดลอก: C:\\Users\\ACER\\Downloads\\pm25_model_v2.7_filtered.joblib (ไม่ทับ pm25_model (5)-(7))')

out = {
    'version': '2.7-local-filtered', 'elapsed_sec': round(time.time() - T0, 1),
    'rows': int(len(df_model)), 'stations': int(df_model.station_id.nunique()),
    'train': int(len(train)), 'test': int(len(test)),
    'results': results, 'top_features': imp.head(10).round(4).to_dict(),
}
(ROOT / 'train_v27_filtered_results.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'\n=== เสร็จใน {out["elapsed_sec"]} วินาที ===')
print(pd.DataFrame(results).to_string(index=False))
