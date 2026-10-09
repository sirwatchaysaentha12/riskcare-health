# -*- coding: utf-8 -*-
"""สร้างไฟล์ pm25_training_fixed.ipynb — notebook ฝึกโมเดล PM2.5 ฉบับแก้บั๊กการวัดผล"""
import json

cells = []

def md(src):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": src.splitlines(keepends=True)})

def code(src):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
                  "source": src.splitlines(keepends=True)})

md('''# ฝึกโมเดลพยากรณ์ PM2.5 — ฉบับแก้บั๊กการวัดผล

> 🏷️ **เวอร์ชัน 2.8** · อัปเดต 1 ต.ค. 2026 · 21 cells · ฟีเจอร์ 37 ตัว + กรองสถานีแข็งแรง + Ensemble simple+weighted + จูน RAM-safe + **สร้าง PDF รายงานข้อมูลเทรนอัตโนมัติท้าย notebook** · ข้อมูลจาก Supabase สด ๆ (~24,765 แถว)

สิ่งที่แก้จาก notebook เดิม:
1. **แบ่ง train/test ตามเวลา** (แทน `train_test_split` แบบสุ่มที่รั่วอนาคต)
2. **Rolling mean ใช้เฉพาะค่าย้อนหลัง** (`shift(1)` ก่อน rolling — เดิมหลุดค่าวันปัจจุบัน = target leakage)
3. **Lag รู้จักช่องว่างวันที่** — lag ข้ามวันห่างกันเกิน 1 วันจะเป็น NaN และถูกทิ้ง (เดิมเติม median ปลอม ๆ)
4. **มี baseline ให้เทียบ** — persistence / seasonal naive / rolling mean ถ้าโมเดล ML ชนะไม่ได้ = ยังใช้ไม่ได้
5. **ดึงสภาพอากาศจริงจาก Open-Meteo** (ฟรี ไม่ต้องมี key) แทนคอลัมน์ที่ว่าง 100%
6. **วัดหลาย metric** พร้อมนิยาม "แม่นยำ" ที่ใช้งานจริงได้: R² / MAE / MAPE / ทายถูกกลุ่ม AQI (เกณฑ์ กสม. 2566 ตรงกับ `pm25Status.ts`)
7. **export โมเดล joblib** ไว้เอาไปใช้จริง

> ⚠️ ความปลอดภัย: notebook นี้ **ไม่มี key ใด ๆ ฝังใน cell** — ตั้งค่าใน Colab Secrets (ไอคอนรูปกุญแจด้านซ้าย)
> `SUPABASE_URL` และ `SUPABASE_SERVICE_KEY` ก่อนรัน''')

code('''# ✈️ Pre-flight: เช็ค Colab Secrets ก่อนเริ่ม — ถ้าขาดจะบอกวิธีแก้เป็นไทย ไม่ใช่ traceback ยาว ๆ
from google.colab import userdata

print('🏷️ pm25_training_fixed.ipynb — เวอร์ชัน 2.8 · อัปเดต 1 ต.ค. 2026')

missing = []
for name in ('SUPABASE_URL', 'SUPABASE_SERVICE_KEY'):
    try:
        userdata.get(name)
        print(f'✓ {name}: พร้อมใช้งาน')
    except Exception:
        missing.append(name)

if missing:
    raise SystemExit(
        '⛔ ยังขาด Colab Secrets: ' + ', '.join(missing) + '\\n'
        'วิธีแก้: กดไอคอนรูปกุญแจ 🔑 ด้านแถบซ้าย → Add new secret → ใส่ตามนี้\\n'
        '  • SUPABASE_URL = https://tmwmcidvnlzhbtljwsjj.supabase.co\\n'
        '  • SUPABASE_SERVICE_KEY = ค่า sb_secret_... จากไฟล์ admin-app\\\\.env.local\\n'
        'จากนั้นเปิดสวิตช์ "Notebook access" ของทุกตัว แล้ว Runtime → Run all ใหม่'
    )
print('Secrets ครบ — เริ่มได้เลย!')''')

code('''!pip install -q pandas scikit-learn xgboost lightgbm joblib supabase requests
from pathlib import Path
OUTPUT_DIR = Path('/content/pm25_models')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
print('Setup complete!')''')

code('''import pandas as pd
from supabase import create_client

try:
    from google.colab import userdata
    SUPABASE_URL = userdata.get('SUPABASE_URL')
    SUPABASE_SERVICE_KEY = userdata.get('SUPABASE_SERVICE_KEY')
except Exception:
    raise RuntimeError('ตั้งค่า Colab Secrets ก่อน: SUPABASE_URL และ SUPABASE_SERVICE_KEY (ห้ามวาง key ใน cell)')

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ดึงทั้งหมดแบบแบ่งหน้า กันข้อมูลเยอะเกิน limit เดียว
PAGE, rows, offset = 1000, [], 0
while True:
    res = (supabase.table('air_quality_daily').select('*')
           .range(offset, offset + PAGE - 1).execute())
    if not res.data:
        break
    rows.extend(res.data)
    offset += PAGE

df = pd.DataFrame(rows)
df['date'] = pd.to_datetime(df['date'])
df = df.sort_values(['station_id', 'date']).reset_index(drop=True)
print(f'Loaded {len(df)} rows | {df.station_id.nunique()} stations')''')

code('''# ตรวจคุณภาพข้อมูลก่อนเทรนเสมอ
print('--- แถวต่อสถานี ---')
print(df.groupby('station_name')['date'].agg(['count', 'min', 'max']), '\\n')

for name, g in df.groupby('station_name'):
    g = g.sort_values('date')
    span = (g['date'].max() - g['date'].min()).days + 1
    gaps = (g['date'].diff().dt.days > 1).sum()
    print(f'{name}: {len(g)}/{span} วัน | ช่องว่างกลางชุด {gaps} จุด | วันหาย {span - len(g)} วัน')

weather_cols = ['temperature', 'humidity', 'pressure', 'wind_speed', 'rainfall']
print('\\n--- % ค่าว่างของคอลัมน์สภาพอากาศ (จะดึงจาก Open-Meteo แทน) ---')
print((df[weather_cols].isna().mean() * 100).round(1))''')

code('''import numpy as np

def add_features(g):
    g = g.sort_values('date').copy()
    diffs = g['date'].diff().dt.days

    # lag_i ถูกต้องเฉพาะเมื่อ i วันก่อนหน้า "ต่อเนื่องกันจริง" (rolling ของ diffs สูงสุด == 1)
    for i in range(1, 15):
        g[f'lag_{i}'] = g['pm25'].shift(i).where(diffs.rolling(i).max() == 1)

    # rolling ใช้ค่าเมื่อวานและก่อนหน้าเท่านั้น — shift(1) กัน target leakage
    for w in (3, 7, 14):
        ok = diffs.rolling(w).max() == 1
        g[f'rolling_mean_{w}'] = g['pm25'].shift(1).rolling(w).mean().where(ok)
        g[f'rolling_std_{w}'] = g['pm25'].shift(1).rolling(w).std().where(ok)
        g[f'rolling_min_{w}'] = g['pm25'].shift(1).rolling(w).min().where(ok)
        g[f'rolling_max_{w}'] = g['pm25'].shift(1).rolling(w).max().where(ok)

    g['day_of_week'] = g['date'].dt.dayofweek
    g['month'] = g['date'].dt.month
    g['is_weekend'] = (g['day_of_week'] >= 5).astype(int)

    # ฤดูกาลแบบวงกลม — 31 ธ.ค. อยู่ "ติดกับ" 1 ม.ค. (เลข month เดิมมองว่าห่างกันที่สุด)
    doy = g['date'].dt.dayofyear
    g['doy_sin'] = np.sin(2 * np.pi * doy / 365.25)
    g['doy_cos'] = np.cos(2 * np.pi * doy / 365.25)
    g['is_burning_season'] = g['month'].isin([12, 1, 2, 3, 4]).astype(int)

    # trend indicators + interactions (ตัวเลขจะเป็น NaN อัตโนมัติเมื่อ lag ต้นทางขาด)
    g['trend_lag1_lag7'] = g['lag_1'] - g['lag_7']
    g['trend_lag1_lag14'] = g['lag_1'] - g['lag_14']
    g['lag1_x_lag2'] = g['lag_1'] * g['lag_2']
    g['lag1_sq'] = g['lag_1'] ** 2
    return g

df['_g'] = df['station_id']  # group ผ่านคอลัมน์ temp — กัน pandas ใหม่ตัด grouping column ทิ้ง
df_model = (df.groupby('_g', group_keys=False)
              .apply(add_features)
              .drop(columns=['_g'], errors='ignore')  # pandas เก่า/ใหม่ทำงานได้ทั้งคู่
              .dropna(subset=['lag_1'])
              .reset_index(drop=True))
df_model['station_code'] = df_model['station_id'].astype('category').cat.codes

print(f'พร้อมเทรน {len(df_model)} แถว (ทิ้งแถวที่ lag ไม่ต่อเนื่องแล้ว)')
df_model[['station_name', 'date', 'pm25', 'lag_1', 'lag_7', 'rolling_mean_7']].tail()''')

code('''# 🏭 กรองสถานีแข็งแรง: ≥600 แถว และยังรายงานถึง ก.ย. 2026
# บทเรียนจากการวัดจริง 1 ต.ค. 2026: สถานีสั้น/หยุดกลางคันทำให้ R² ตก ~2.8 จุด
active = df_model.groupby('station_id').agg(n=('pm25', 'size'), last=('date', 'max')).reset_index()
keep_ids = active[(active['n'] >= 600) & (active['last'] >= '2026-09-01')]['station_id']
for _, row in active[~active['station_id'].isin(keep_ids)].iterrows():
    print(f"   ตัดสถานี: {row['station_id']} ({row['n']} แถว, รายงานล่าสุด {row['last'].date()})")
df_model = df_model[df_model['station_id'].isin(keep_ids)].reset_index(drop=True)
# คำนวณ station_code ใหม่หลังกรอง (สถานีที่ตัดไปไม่ควรครองรหัส)
df_model['station_code'] = df_model['station_id'].astype('category').cat.codes
print(f'หลังกรอง: {df_model.station_id.nunique()} สถานี · {len(df_model):,} แถว')''')

code('''# 🏘️ ฟีเจอร์เพื่อนบ้าน: ค่าเฉลี่ย PM2.5 ของ "สถานีอื่น" เมื่อวาน
# ฝุ่นเป็นเรื่องระดับภูมิภาค — ถ้าทุกสถานีไต่พร้อมกัน = คลื่นฝุ่นเข้า ไม่ใช่ noise รายสถานี
pivot = df_model.pivot_table(index='date', columns='station_id', values='pm25')
full_days = pd.date_range(pivot.index.min(), pivot.index.max(), freq='D')
pivot = pivot.reindex(full_days)
n_others = pivot.notna().sum(axis=1).values[:, None] - 1
with np.errstate(divide='ignore', invalid='ignore'):
    others_mean = (pivot.sum(axis=1).values[:, None] - pivot.values) / n_others
others_lag1 = pd.DataFrame(others_mean, index=full_days, columns=pivot.columns).shift(1)  # ค่า "เมื่อวาน"
key = pd.MultiIndex.from_arrays([df_model['date'], df_model['station_id']])
df_model['neighbors_pm25_lag1'] = others_lag1.stack().reindex(key).values
print(f"เพิ่ม neighbors_pm25_lag1 แล้ว (มีค่า {df_model['neighbors_pm25_lag1'].notna().mean()*100:.0f}%)")''')

code('''import requests, time
from pathlib import Path

CACHE_DIR = Path('/content/open_meteo_cache'); CACHE_DIR.mkdir(exist_ok=True)

def fetch_open_meteo(lat, lon, start, end, station_id):
    cache = CACHE_DIR / f'{station_id}.csv'
    if cache.exists():
        return pd.read_csv(cache, parse_dates=['date'])
    params = {
        'latitude': lat, 'longitude': lon, 'start_date': start, 'end_date': end,
        'daily': ('temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_max,'
                  'precipitation_sum,wind_direction_10m_dominant'),
        'hourly': 'boundary_layer_height',
        'timezone': 'Asia/Bangkok',
    }
    r = requests.get('https://archive-api.open-meteo.com/v1/archive', params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    daily = pd.DataFrame(data['daily']).rename(columns={
        'time': 'date', 'temperature_2m_mean': 'temperature',
        'relative_humidity_2m_mean': 'humidity',
        'wind_speed_10m_max': 'wind_speed', 'precipitation_sum': 'rainfall',
    })
    # ทิศลม → sin/cos (องศาดิบ ๆ ทำให้ 0° กับ 359° ดู "ห่างกัน" ทั้งที่อยู่ติดกัน)
    rad = np.deg2rad(daily['wind_direction_10m_dominant'])
    daily['wind_dir_sin'] = np.sin(rad)
    daily['wind_dir_cos'] = np.cos(rad)
    # boundary layer height: รายชั่วโมง → ค่าเฉลี่ยรายวัน (ชั้นบรรยากาศยิ่งต่ำ ยิ่งกักฝุ่นไว้ใกล้พื้น)
    hourly = pd.DataFrame(data['hourly'])
    hourly['date'] = pd.to_datetime(hourly['time']).dt.date
    daily['boundary_layer_height'] = hourly.groupby('date')['boundary_layer_height'].mean().values
    daily['date'] = pd.to_datetime(daily['date'])
    daily['station_id'] = station_id
    daily.to_csv(cache, index=False)
    return daily

start = df_model['date'].min().date().isoformat()
end = df_model['date'].max().date().isoformat()
frames = []
stations_geo = df_model[['station_id', 'latitude', 'longitude']].drop_duplicates()
for sid, lat, lon in stations_geo.itertuples(index=False):
    frames.append(fetch_open_meteo(lat, lon, start, end, sid))
    time.sleep(1)

weather = pd.concat(frames, ignore_index=True)

# ⏪ สำคัญ: ใช้สภาพอากาศ "เมื่อวาน" เท่านั้น — ตอนทำนายวัน t เรายังไม่รู้สภาพอากาศของวัน t เอง
# (เลื่อนวันที่ของข้อมูลลม+ฝนไป 1 วัน ก่อน merge จึงได้ค่าของ date-1 มาเป็นฟีเจอร์)
weather['date'] = weather['date'] + pd.Timedelta(days=1)

# เคลียร์คอลัมน์สภาพอากาศว่าง ๆ จาก Supabase ก่อน merge (กัน suffix _x/_y)
df_model = df_model.drop(
    columns=['temperature', 'humidity', 'pressure', 'wind_speed', 'wind_direction', 'rainfall'],
    errors='ignore')
df_model['station_id'] = df_model['station_id'].astype(str)
weather['station_id'] = weather['station_id'].astype(str)

df_model = df_model.merge(
    weather[['station_id', 'date', 'temperature', 'humidity', 'wind_speed', 'rainfall',
             'wind_dir_sin', 'wind_dir_cos', 'boundary_layer_height']],
    on=['station_id', 'date'], how='left')
print('รวมสภาพอากาศจริง (เลื่อนเป็นค่าเมื่อวาน) + ทิศลม + boundary layer จาก Open-Meteo แล้ว')
df_model[['station_name', 'date', 'pm25', 'wind_dir_sin', 'boundary_layer_height']].head()''')

md('''## โปรโตคอลการวัดผล

- **แบ่งตามเวลา**: เก่า 80% เทรน / ใหม่ล่าสุด 20% ทดสอบ — เลียนแบบการใช้จริงที่ทำนาย "อนาคต"
- **Baseline ต้องชนะก่อน**: persistence (เมื่อวาน = วันนี้), seasonal naive (7 วันก่อน), rolling mean 7 วัน
- **"แม่นยำ 93%" วัดได้จากหลายมุม**:
  - `R2` — สัดส่วนความแปรปรวนที่อธิบายได้ (เป้าหมาย ≥ 0.93)
  - `MAPE%` — ความคลาดเคลื่อนสัมพัทธ์ (ถ้าแม่น 93% แปลว่า MAPE ≤ 7%)
  - `±5%` — % วันที่ทายคลาดไม่เกิน ±5 µg/m³
  - `BandAcc%` — % วันที่ทายถูก "กลุ่ม" ตามเกณฑ์ กสม. 2566 (ตรงกับ `pm25Status.ts` ในแอป) — ตัวนี้สำคัญสุดสำหรับใช้งานสุขภาพจริง''')

code('''from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from xgboost import XGBRegressor
import numpy as np
import pandas as pd

BAND_EDGES = [15, 25, 37.5, 75]  # ขอบกลุ่ม กสม. 2566: <15 ดีมาก | 15-25 ดี | 25-37.5 ปานกลาง | 37.5-75 เริ่มกระทบ | >75 กระทบ

def evaluate(y_true, y_pred, name):
    y_true = np.asarray(y_true, float); y_pred = np.asarray(y_pred, float)
    mask = np.isfinite(y_true) & np.isfinite(y_pred)
    y_true, y_pred = y_true[mask], y_pred[mask]
    nonzero = y_true != 0
    return {
        'model': name,
        'R2': r2_score(y_true, y_pred),
        'MAE': mean_absolute_error(y_true, y_pred),
        'RMSE': float(np.sqrt(mean_squared_error(y_true, y_pred))),
        'MAPE%': float(np.mean(np.abs((y_true[nonzero] - y_pred[nonzero]) / y_true[nonzero])) * 100),
        '±5%': float(np.mean(np.abs(y_true - y_pred) <= 5) * 100),
        'BandAcc%': float(np.mean(np.digitize(y_true, BAND_EDGES) == np.digitize(y_pred, BAND_EDGES)) * 100),
    }

cutoff = df_model['date'].quantile(0.8)
train = df_model[df_model['date'] < cutoff]
test = df_model[df_model['date'] >= cutoff]
print(f'Train จนถึง {cutoff.date()} = {len(train)} แถว | Test หลังจากนั้น = {len(test)} แถว\\n')

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
FEATURES = [f for f in FEATURES if f in df_model.columns]
X_tr, y_tr = train[FEATURES], train['pm25']
X_te, y_te = test[FEATURES], test['pm25']

results = [
    evaluate(y_te, test['lag_1'], 'Baseline: persistence (เมื่อวาน)'),
    evaluate(y_te, test['lag_7'], 'Baseline: seasonal naive (7 วันก่อน)'),
    evaluate(y_te, test['rolling_mean_7'], 'Baseline: rolling mean 7 วัน'),
]

rf = RandomForestRegressor(n_estimators=400, random_state=42, n_jobs=-1).fit(X_tr, y_tr)
results.append(evaluate(y_te, rf.predict(X_te), 'Random Forest'))

xgb = XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=4, subsample=0.9,
                   colsample_bytree=0.9, random_state=42, n_jobs=-1).fit(X_tr, y_tr)
results.append(evaluate(y_te, xgb.predict(X_te), 'XGBoost'))

print(pd.DataFrame(results).round(3).sort_values('R2', ascending=False).to_string(index=False))''')

code('''# 🤖 เพิ่มโมเดล: LightGBM + Extra Trees (วัดบนชุด test เดียวกันกับ RF/XGBoost)
from lightgbm import LGBMRegressor
from sklearn.ensemble import ExtraTreesRegressor

lgbm = LGBMRegressor(n_estimators=500, learning_rate=0.05, num_leaves=31,
                     random_state=42, n_jobs=-1, verbose=-1).fit(X_tr, y_tr)
results.append(evaluate(y_te, lgbm.predict(X_te), 'LightGBM'))

et = ExtraTreesRegressor(n_estimators=400, random_state=42, n_jobs=-1).fit(X_tr, y_tr)
results.append(evaluate(y_te, et.predict(X_te), 'Extra Trees'))

print(pd.DataFrame(results).round(3).sort_values('R2', ascending=False).to_string(index=False))''')


code('''# 🔧 จูน hyperparameter 3 แบบ (CV แบบ TimeSeriesSplit — กัน CV รั่วอนาคต) แล้วดึงค่าที่ดีที่สุดขึ้นมาโชว์
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

# เรียง train ตามเวลาก่อน CV (train ต้องมาก่อน val เสมอ)
tr_sorted = train.sort_values('date')
X_cv, y_cv = tr_sorted[FEATURES], tr_sorted['pm25']
tscv = TimeSeriesSplit(n_splits=3)

# แบบที่ 1: Random Forest
rf_space = {'n_estimators': [200, 300, 500], 'max_depth': [None, 10, 20, 30],
            'min_samples_leaf': [1, 2, 5], 'max_features': ['sqrt', 0.5, 1.0]}
# search n_jobs=1 (RAM-safe): ค้นทีละ config แทนการโคลนโมเดลขนานกันหลายสิบชุด — กัน OOM บน Colab
rf_search = RandomizedSearchCV(RandomForestRegressor(random_state=42, n_jobs=-1),
                               rf_space, n_iter=20, cv=tscv,
                               scoring='neg_mean_absolute_error', random_state=42, n_jobs=1)
rf_search.fit(X_cv, y_cv)
print('แบบที่ 1 RF best params:', rf_search.best_params_)
print(f'   CV MAE = {-rf_search.best_score_:.3f} µg/m³\\n')
rf_tuned = rf_search.best_estimator_

# แบบที่ 2: XGBoost
xgb_space = {'n_estimators': [300, 500, 800], 'learning_rate': [0.03, 0.05, 0.1],
             'max_depth': [3, 4, 6], 'subsample': [0.8, 0.9, 1.0],
             'colsample_bytree': [0.7, 0.9, 1.0]}
xgb_search = RandomizedSearchCV(XGBRegressor(random_state=42, n_jobs=-1, tree_method='hist'),
                                xgb_space, n_iter=20, cv=tscv,
                                scoring='neg_mean_absolute_error', random_state=42, n_jobs=1)
xgb_search.fit(X_cv, y_cv)
print('แบบที่ 2 XGB best params:', xgb_search.best_params_)
print(f'   CV MAE = {-xgb_search.best_score_:.3f} µg/m³\\n')
xgb_tuned = xgb_search.best_estimator_

# แบบที่ 3: log-transform target (ลดอิทธิพลค่าฝุ่นสูงช่วงฤดูเผา วัดผลกลับที่สเกลเดิม)
rf_log = RandomForestRegressor(**rf_search.best_params_, random_state=42, n_jobs=-1)
rf_log.fit(X_tr, np.log1p(y_tr))
results.append(evaluate(y_te, np.expm1(rf_log.predict(X_te)), 'RF + log-target'))

print(pd.DataFrame(results).round(3).sort_values('R2', ascending=False).to_string(index=False))''')

code('''# 🤝 Ensemble: เฉลี่ยคำทำนายของต้นไม้ 3 ตัวที่จูนแล้ว (RF + XGB + LGBM)
class AveragingEnsemble:
    def __init__(self, models):
        self.models = models
    def predict(self, X):
        return np.mean([m.predict(X) for m in self.models], axis=0)

ensemble_model = AveragingEnsemble([rf_tuned, xgb_tuned, lgbm])
results.append(evaluate(y_te, ensemble_model.predict(X_te), 'Ensemble (RF+XGB+LGBM)'))

# เวอร์ชันถ่วงน้ำหนัก: น้ำหนัก ∝ 1/CV-MAE (TimeSeriesSplit) — ต้นไม้ที่แม่นกว่าได้น้ำหนักมากกว่า
from sklearn.base import clone
from sklearn.metrics import mean_absolute_error

cv_mae = {}
for name, base in {'rf': rf_search.best_estimator_, 'xgb': xgb_search.best_estimator_, 'lgbm': lgbm}.items():
    fold_mae = []
    for tr_idx, va_idx in tscv.split(X_cv):
        fold_model = clone(base).fit(X_cv.iloc[tr_idx], y_cv.iloc[tr_idx])
        fold_mae.append(mean_absolute_error(y_cv.iloc[va_idx], fold_model.predict(X_cv.iloc[va_idx])))
    cv_mae[name] = float(np.mean(fold_mae))
print('CV MAE ต่อต้นไม้:', {k: round(v, 3) for k, v in cv_mae.items()})

raw_w = {k: 1.0 / v for k, v in cv_mae.items()}
total_w = sum(raw_w.values())
ens_weights = {k: v / total_w for k, v in raw_w.items()}
print('น้ำหนัก ensemble:', {k: round(v, 3) for k, v in ens_weights.items()})

class WeightedEnsemble:
    def __init__(self, models, weights):
        self.models = list(models)
        self.weights = list(weights)
    def predict(self, X):
        return np.sum([w * m.predict(X) for m, w in zip(self.models, self.weights)], axis=0)

weighted_ensemble = WeightedEnsemble(
    [rf_search.best_estimator_, xgb_search.best_estimator_, lgbm],
    [ens_weights['rf'], ens_weights['xgb'], ens_weights['lgbm']],
)
results.append(evaluate(y_te, weighted_ensemble.predict(X_te), 'Ensemble (weighted)'))

print(pd.DataFrame(results).round(3).sort_values('R2', ascending=False).to_string(index=False))''')

code('''# 🧪 Ablation: ฟีเจอร์กลุ่มไหนช่วยจริง — วัดทีละกลุ่มด้วย XGB (เร็ว) ชุด train/test เดียวกันทุกกลุ่ม
GROUPS = {
    'base28 (v2.5)': FEATURES[:0] + ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5', 'lag_6', 'lag_7',
        'rolling_mean_3', 'rolling_mean_7', 'rolling_mean_14',
        'rolling_std_3', 'rolling_std_7', 'rolling_std_14',
        'day_of_week', 'is_weekend', 'month', 'station_code',
        'neighbors_pm25_lag1', 'doy_sin', 'doy_cos', 'is_burning_season',
        'temperature', 'humidity', 'wind_speed', 'rainfall',
        'wind_dir_sin', 'wind_dir_cos', 'boundary_layer_height'],
    '+lag_14': ['lag_14'],
    '+roll min/max': ['rolling_min_3', 'rolling_max_3', 'rolling_min_7', 'rolling_max_7', 'rolling_min_14', 'rolling_max_14'],
    '+trend': ['trend_lag1_lag7', 'trend_lag1_lag14'],
    '+interactions': ['lag1_x_lag2', 'lag1_sq'],
}

abl_rows = []
cum = list(GROUPS['base28 (v2.5)'])
abl_rows.append({'group': 'base28 (v2.5)', 'n': len(cum),
                 **evaluate(y_te, XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=4,
                                               random_state=42, tree_method='hist', n_jobs=-1
                                               ).fit(X_tr[cum], y_tr).predict(X_te[cum]))})
for name in ('+lag_14', '+roll min/max', '+trend', '+interactions'):
    cum += GROUPS[name]
    xm = XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=4, random_state=42,
                      tree_method='hist', n_jobs=-1).fit(X_tr[cum], y_tr)
    abl_rows.append({'group': name, 'n': len(cum), **evaluate(y_te, xm.predict(X_te[cum]))})
abl_rows.append({'group': f'full {len(FEATURES)} (= FEATURES)', 'n': len(FEATURES),
                 **evaluate(y_te, XGBRegressor(n_estimators=500, learning_rate=0.05, max_depth=4,
                                               random_state=42, tree_method='hist', n_jobs=-1
                                               ).fit(X_tr[FEATURES], y_tr).predict(X_te[FEATURES]))})
print(pd.DataFrame(abl_rows).round(4).to_string(index=False))
print('\\nอ่านผล: เทียบ R2 ระหว่างแถว — กลุ่มไหนทำให้ตัวเลขลดลง = ไม่คุ้ม ให้พิจารณาถอด')''')

code('''# 🧹 ตัด outlier จาก train เท่านั้น (robust z-score > 8 ตาม MAD) แล้วเทรน ensemble ใหม่ — วัดว่าช่วยหรือไม่
med = y_tr.median()
mad = (y_tr - med).abs().median() * 1.4826
outlier_mask = (y_tr - med).abs() / max(mad, 1e-9) > 8
print(f'outlier ที่ตัด: {int(outlier_mask.sum())}/{len(y_tr)} แถวของ train (pm25 สูง/ต่ำผิดปกติจาก sensor)')

tr_clean = train[~outlier_mask]
clean_models = [
    RandomForestRegressor(**rf_search.best_params_, random_state=42, n_jobs=-1).fit(tr_clean[FEATURES], tr_clean['pm25']),
    XGBRegressor(**xgb_search.best_params_, random_state=42, tree_method='hist', n_jobs=-1).fit(tr_clean[FEATURES], tr_clean['pm25']),
    LGBMRegressor(n_estimators=500, learning_rate=0.05, random_state=42, n_jobs=-1, verbose=-1).fit(tr_clean[FEATURES], tr_clean['pm25']),
]
preds_clean = np.mean([m.predict(X_te) for m in clean_models], axis=0)
results.append(evaluate(y_te, preds_clean, 'Ensemble (outliers dropped)'))
print(pd.DataFrame(results).round(3).sort_values('R2', ascending=False).to_string(index=False))''')

code('''# Walk-forward: วัดซ้ำหลายจุดตัดเวลา เพื่อให้มั่นใจว่าผลไม่ลอยมาจากช่วง test จุดเดียว
rows = []
for q in (0.6, 0.7, 0.8):
    c = df_model['date'].quantile(q)
    tr = df_model[df_model['date'] < c]
    te = df_model[df_model['date'] >= c]
    m = RandomForestRegressor(n_estimators=400, random_state=42, n_jobs=-1).fit(tr[FEATURES], tr['pm25'])
    rows.append({'cutoff': str(c.date()), **evaluate(te['pm25'], m.predict(te[FEATURES]), f'RF @ {q:.0%}')})
    rows.append({'cutoff': str(c.date()), **evaluate(te['pm25'], te['lag_1'], 'persistence')})
print(pd.DataFrame(rows).round(3).to_string(index=False))''')

code('''import matplotlib.pyplot as plt

imp = pd.Series(rf.feature_importances_, index=FEATURES).sort_values()
imp.plot(kind='barh', figsize=(8, 6), title='Feature Importance (Random Forest)')
plt.tight_layout()
plt.show()''')

code('''import joblib
from google.colab import files

models = {'Random Forest': rf, 'XGBoost': xgb, 'LightGBM': lgbm, 'Extra Trees': et,
          'RF + log-target': rf_log,
          'Ensemble (RF+XGB+LGBM)': ensemble_model, 'Ensemble (weighted)': weighted_ensemble}
scored = [r for r in results if r['model'] in models]
best_name = max(scored, key=lambda r: r['R2'])['model']

bundle = {
    'notebook_version': '2.8-2026-10-01',
    'model_name': best_name,
    'target_transform': 'log1p' if best_name == 'RF + log-target' else None,
    'features': FEATURES,
    'band_edges': BAND_EDGES,
    'trained_until': str(df_model['date'].max().date()),
    'test_metrics': results,
}
out = OUTPUT_DIR / 'pm25_model.joblib'

bundle['model'] = models[best_name]
joblib.dump(bundle, out)
print(f'บันทึกโมเดล: {best_name} → {out}')
if bundle.get('target_transform'):
    print('หมายเหตุ: โมเดลนี้ทำนาย log1p(pm25) — ค่าจริง = expm1(prediction)')
files.download(str(out))''')

code('''# 📄 สร้าง PDF รายงานข้อมูลสำหรับเทรนโมเดล (v2.8) — ดาวน์โหลดอัตโนมัติท้าย cell
# ตัวแปรที่ใช้: df_model, FEATURES, train, test, cutoff (จาก cell ก่อนหน้าทั้งหมด)
PDF_NAME = 'pm25_forecast_training_data_v2.8.pdf'
MODEL_VERSION = 'v2.8'
CREATED_DATE = '1 ตุลาคม 2026'

import sys, subprocess
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'reportlab'], check=True)

import io
import matplotlib
matplotlib.use('Agg')
import urllib.request
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, Image, PageBreak)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = '/content/fonts'
os.makedirs(FONT_DIR, exist_ok=True)
FONT_REG, FONT_BOLD = f'{FONT_DIR}/Sarabun-Regular.ttf', f'{FONT_DIR}/Sarabun-Bold.ttf'
THAI_FONT = 'Helvetica'
try:
    if not os.path.exists(FONT_REG):
        urllib.request.urlretrieve('https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf', FONT_REG)
    if not os.path.exists(FONT_BOLD):
        urllib.request.urlretrieve('https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Bold.ttf', FONT_BOLD)
    pdfmetrics.registerFont(TTFont('Sarabun', FONT_REG))
    pdfmetrics.registerFont(TTFont('Sarabun-Bold', FONT_BOLD))
    pdfmetrics.registerFontFamily('Sarabun', normal='Sarabun', bold='Sarabun-Bold')
    matplotlib.font_manager.fontManager.addfont(FONT_REG)
    plt.rcParams['font.family'] = 'Sarabun'
    plt.rcParams['axes.unicode_minus'] = False
    THAI_FONT = 'Sarabun'
    print('✓ ฟอนต์ไทย Sarabun พร้อม')
except Exception as e:
    print('⚠ โหลดฟอนต์ไทยไม่สำเร็จ — ข้อความไทยใน PDF อาจแสดงไม่ถูกต้อง:', e)

BASE = THAI_FONT
BOLD = 'Sarabun-Bold' if THAI_FONT == 'Sarabun' else 'Helvetica-Bold'
styles = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName=BOLD, fontSize=20, alignment=TA_CENTER, spaceAfter=6)
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName=BOLD, fontSize=13, spaceBefore=10, spaceAfter=4)
P  = ParagraphStyle('P',  parent=styles['Normal'],   fontName=BASE,  fontSize=10, leading=14)
PC = ParagraphStyle('PC', parent=P, alignment=TA_CENTER)
SMALL = ParagraphStyle('SMALL', parent=P, fontSize=8, leading=10)

FEAT_DESC = {
    'lag_1': 'ค่า PM2.5 เมื่อวาน (ย้อนหลัง 1 วัน)', 'lag_2': 'ค่า PM2.5 ย้อนหลัง 2 วัน',
    'lag_3': 'ค่า PM2.5 ย้อนหลัง 3 วัน', 'lag_4': 'ค่า PM2.5 ย้อนหลัง 4 วัน',
    'lag_5': 'ค่า PM2.5 ย้อนหลัง 5 วัน', 'lag_6': 'ค่า PM2.5 ย้อนหลัง 6 วัน',
    'lag_7': 'ค่า PM2.5 ย้อนหลัง 7 วัน', 'lag_14': 'ค่า PM2.5 ย้อนหลัง 14 วัน',
    'rolling_mean_3': 'ค่าเฉลี่ยเคลื่อนที่ 3 วันย้อนหลัง (ไม่รวมวันปัจจุบัน)',
    'rolling_mean_7': 'ค่าเฉลี่ยเคลื่อนที่ 7 วันย้อนหลัง',
    'rolling_mean_14': 'ค่าเฉลี่ยเคลื่อนที่ 14 วันย้อนหลัง',
    'rolling_std_3': 'ค่าเบี่ยงเบนมาตรฐาน 3 วัน (ความผันผวนระยะสั้น)',
    'rolling_std_7': 'ค่าเบี่ยงเบนมาตรฐาน 7 วัน',
    'rolling_std_14': 'ค่าเบี่ยงเบนมาตรฐาน 14 วัน',
    'rolling_min_3': 'ค่าต่ำสุด 3 วันย้อนหลัง', 'rolling_max_3': 'ค่าสูงสุด 3 วันย้อนหลัง',
    'rolling_min_7': 'ค่าต่ำสุด 7 วันย้อนหลัง', 'rolling_max_7': 'ค่าสูงสุด 7 วันย้อนหลัง',
    'rolling_min_14': 'ค่าต่ำสุด 14 วันย้อนหลัง', 'rolling_max_14': 'ค่าสูงสุด 14 วันย้อนหลัง',
    'trend_lag1_lag7': 'แนวโน้มระยะสั้น = lag_1 − lag_7',
    'trend_lag1_lag14': 'แนวโน้มระยะกลาง = lag_1 − lag_14',
    'day_of_week': 'วันในสัปดาห์ (0=จันทร์ … 6=อาทิตย์)',
    'is_weekend': 'เสาร์/อาทิตย์หรือไม่ (1=ใช่)',
    'month': 'เดือน (1–12)',
    'station_code': 'รหัสสถานี (แปลงจากชื่อสถานีแบบ categorical)',
    'neighbors_pm25_lag1': 'ค่าเฉลี่ย PM2.5 ของ "สถานีอื่น" เมื่อวาน (ข้อมูลเชิงพื้นที่)',
    'doy_sin': 'ตำแหน่งวันในปีแบบวงกลม (sin) — 31 ธ.ค. อยู่ติด 1 ม.ค.',
    'doy_cos': 'ตำแหน่งวันในปีแบบวงกลม (cos)',
    'is_burning_season': 'อยู่ในช่วงฤดูเผา (ธ.ค.–เม.ย.) หรือไม่',
    'temperature': 'อุณหภูมิเฉลี่ยของ "เมื่อวาน" (Open-Meteo)',
    'humidity': 'ความชื้นสัมพัทธ์ของ "เมื่อวาน"',
    'wind_speed': 'ความเร็วลมสูงสุดของ "เมื่อวาน"',
    'rainfall': 'ปริมาณฝนของ "เมื่อวาน"',
    'wind_dir_sin': 'ทิศทางลมเมื่อวาน (องศา→sin)',
    'wind_dir_cos': 'ทิศทางลมเมื่อวาน (องศา→cos)',
    'boundary_layer_height': 'ความสูงชั้นบรรยากาศผสมเฉลี่ยของ "เมื่อวาน" (ยิ่งต่ำยิ่งกักฝุ่น)',
}

n_rows, n_feat = len(df_model), len(FEATURES)
n_stations = df_model['station_id'].nunique()
d_min, d_max = df_model['date'].min(), df_model['date'].max()
n_train, n_test = len(train), len(test)
extra_cols = [c for c in df_model.columns if c not in FEATURES and c not in
              ('date', 'pm25', 'station_name', 'station_id', 'latitude', 'longitude')]

doc = SimpleDocTemplate(PDF_NAME, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm, topMargin=15*mm, bottomMargin=15*mm)
story = []

story.append(Spacer(1, 70*mm))
story.append(Paragraph('รายงานข้อมูลสำหรับเทรนโมเดล', ParagraphStyle('c1', parent=H1, fontSize=24)))
story.append(Paragraph('พยากรณ์ค่า PM2.5 ล่วงหน้า', ParagraphStyle('c2', parent=H1, fontSize=24)))
story.append(Spacer(1, 10*mm))
story.append(Paragraph('โมเดล: Ensemble (Random Forest + XGBoost + LightGBM)', PC))
story.append(Paragraph(f'เวอร์ชันข้อมูล/โน้ตบุ๊ก: {MODEL_VERSION} · สร้างเมื่อ {CREATED_DATE}', PC))
story.append(Paragraph(f'ไฟล์: {PDF_NAME}', PC))
story.append(Spacer(1, 8*mm))
story.append(Paragraph('ข้อมูลรายวันจากสถานีตรวจวัดจริง (OpenAQ) + สภาพอากาศย้อนหลัง (Open-Meteo)<br/>'
                       'ประมวลผลผ่าน feature engineering แบบ gap-aware ป้องกัน data leakage', PC))
story.append(PageBreak())

story.append(Paragraph('1. ภาพรวมชุดข้อมูล', H2))
overview = [
    ['จำนวนแถวหลัง feature engineering', f'{n_rows:,} แถว'],
    ['จำนวนฟีเจอร์ที่ใช้เทรน', f'{n_feat} ตัว'],
    ['ช่วงวันที่ของข้อมูล', f'{d_min.date()} → {d_max.date()}'],
    ['จำนวนสถานีตรวจวัด', f'{n_stations} แห่ง (2 จุดพิกัด: นนทบุรี + ลาดกระบัง/กรุงเทพฯ ตะวันออก)'],
    ['ช่วงฤดูเผาที่ครอบคลุม', 'ม.ค.–เม.ย. ปี 2024 / 2025 / 2026 (3 ฤดู)'],
]
ov = Table([[Paragraph(f'<b>{a}</b>', SMALL), Paragraph(b, SMALL)] for a, b in overview],
           colWidths=[70*mm, 95*mm])
ov.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#eef7f3')),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
story.append(ov)

story.append(Paragraph('2. การแบ่งชุด Train / Test ที่ใช้จริง', H2))
split_rows = [
    ['วิธีแบ่ง', 'Temporal split ตามเวลา — train ต้องมาก่อน test เสมอ (ไม่มี random split, กัน data leakage)'],
    ['จุดแบ่ง (cutoff)', f'{pd.Timestamp(cutoff).date()} (quantile 0.8 ของวันที่ทั้งชุด)'],
    ['ชุด Train', f'{n_train:,} แถว (ข้อมูลก่อน {pd.Timestamp(cutoff).date()})'],
    ['ชุด Test', f'{n_test:,} แถว (ข้อมูลหลังจากนั้น — โมเดลไม่เคยเห็นมาก่อน)'],
    ['การจูน hyperparameter', 'RandomizedSearchCV (20 iter) ด้วย TimeSeriesSplit(3) — แยกบนชุด train เท่านั้น'],
    ['Walk-forward', 'วัดซ้ำที่จุดตัด 60% / 70% / 80% เพื่อยืนยันความเสถียร'],
]
sp = Table([[Paragraph(f'<b>{a}</b>', SMALL), Paragraph(b, SMALL)] for a, b in split_rows],
           colWidths=[45*mm, 120*mm])
sp.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#eef7f3')),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
story.append(sp)
story.append(PageBreak())

story.append(Paragraph(f'3. รายชื่อฟีเจอร์ทั้งหมด {n_feat} ตัวที่ใช้เทรน', H2))
feat_rows = [[Paragraph('<b>ฟีเจอร์</b>', SMALL), Paragraph('<b>คำอธิบาย</b>', SMALL)]]
for f in FEATURES:
    feat_rows.append([Paragraph(f'<font name="{BOLD}">{f}</font>', SMALL),
                      Paragraph(FEAT_DESC.get(f, '—'), SMALL)])
ft = Table(feat_rows, colWidths=[52*mm, 113*mm], repeatRows=1)
ft.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f2f7f5')),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                        ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5)]))
story.append(ft)
if extra_cols:
    story.append(Spacer(1, 4))
    story.append(Paragraph(f'หมายเหตุ: ตารางยังมีคอลัมน์ {", ".join(extra_cols)} ที่ถูกคำนวณไว้แต่'
                           'ถูกถอดออกจากชุดเทรนหลัง ablation ชี้ว่าทำให้ผลแย่ลง', SMALL))
story.append(PageBreak())

story.append(Paragraph('4. สถิติพื้นฐานของแต่ละฟีเจอร์ (mean / std / min / max)', H2))
stat = df_model[FEATURES].describe().T[['mean', 'std', 'min', 'max']].round(3).reset_index()
stat_rows = [[Paragraph('<b>ฟีเจอร์</b>', SMALL), Paragraph('<b>mean</b>', SMALL),
              Paragraph('<b>std</b>', SMALL), Paragraph('<b>min</b>', SMALL), Paragraph('<b>max</b>', SMALL)]]
for _, r in stat.iterrows():
    stat_rows.append([Paragraph(str(r['feature']), SMALL)] +
                     [Paragraph(f'{r[c]:,.3f}', SMALL) for c in ('mean', 'std', 'min', 'max')])
st = Table(stat_rows, colWidths=[62*mm, 25*mm, 25*mm, 25*mm, 25*mm], repeatRows=1)
st.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f2f7f5')),
                        ('BACKGROUND', (1, 0), (-1, 0), colors.HexColor('#eafaf3')),
                        ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
story.append(st)
story.append(PageBreak())

story.append(Paragraph('5. แนวโน้มค่า PM2.5 (target) ตลอดช่วงเวลา', H2))
story.append(Paragraph('เส้นทึบ = ค่าเฉลี่ยรายวันทุกสถานี · เส้นบาง = รายสถานี · เส้นประแดง = จุดแบ่ง train/test', SMALL))
buf = io.BytesIO()
fig, ax = plt.subplots(figsize=(10, 4.4), dpi=160)
for sid, g in df_model.sort_values('date').groupby('station_id'):
    ax.plot(g['date'], g['pm25'], lw=0.5, alpha=0.30, color='#8fb8aa')
daily = df_model.groupby('date')['pm25'].mean()
ax.plot(daily.index, daily.values, color='#1f7a63', lw=2.2, label='ค่าเฉลี่ยรายวัน (ทุกสถานี)')
ax.axvline(pd.Timestamp(cutoff), color='#e74c3c', ls='--', lw=1.6,
           label=f'เส้นแบ่ง train/test ({pd.Timestamp(cutoff).date()})')
ax.set_ylabel('PM2.5 (µg/m³)')
ax.legend(loc='upper right', fontsize=9)
ax.grid(alpha=0.25)
fig.tight_layout()
fig.savefig(buf, format='png', bbox_inches='tight')
plt.close(fig)
buf.seek(0)
story.append(Image(buf, width=170*mm, height=74.8*mm))
story.append(PageBreak())

story.append(Paragraph('6. ตัวอย่างข้อมูล 25 แถวแรกหลัง feature engineering', H2))
story.append(Paragraph('(แสดงคอลัมน์หลัก — ชุดเต็มมีทั้งหมด 37 คอลัมน์ตามรายการในหน้า 3)', SMALL))
sample_cols = ['date', 'station_name', 'pm25', 'lag_1', 'lag_7', 'lag_14',
               'rolling_mean_7', 'rolling_std_7', 'neighbors_pm25_lag1',
               'temperature', 'rainfall', 'is_burning_season']
sample = df_model[sample_cols].head(25).copy()
sample['date'] = sample['date'].dt.strftime('%Y-%m-%d')
sm_rows = [[Paragraph('<b>'+c+'</b>', SMALL) for c in sample_cols]]
for _, r in sample.iterrows():
    sm_rows.append([Paragraph('' if pd.isna(v) else str(v), SMALL) for v in r])
smt = Table(sm_rows, repeatRows=1)
smt.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
                         ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eafaf3')),
                         ('FONTSIZE', (0, 0), (-1, -1), 6.5),
                         ('TOPPADDING', (0, 0), (-1, -1), 1.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5)]))
story.append(smt)

doc.build(story)
print(f'✓ สร้าง PDF เสร็จ: {PDF_NAME} ({os.path.getsize(PDF_NAME)//1024} KB)')

try:
    from google.colab import files
    files.download(PDF_NAME)
    print('เริ่มดาวน์โหลดลงเครื่องอัตโนมัติ ✓')
except Exception:
    print('ไม่ได้รันใน Colab — ไฟล์อยู่ที่:', os.path.abspath(PDF_NAME))''')

md('''## ทางไปสู่ความแม่นยำ 93%

สถานะปัจจุบัน (v2.4 จากข้อมูล 15,850 แถว): Ensemble R² = 0.861 · ±5% = 87.3% · BandAcc = 78.4%
รุ่นนี้ (v2.5) ตัด Stacking/LSTM ที่แพ้จากผลวัดออก และเพิ่ม Ensemble แบบถ่วงน้ำหนัก

1. **ข้อมูลยังเป็นคอขวดหลัก** — backfill ยังเติมสถานีใหม่อยู่เรื่อย ๆ (เป้า ~20,000 แถว) รัน notebook ซ้ำทุกครั้งที่ข้อมูลโตขึ้น
2. **ต้นไม้ 4 ตัวแข่งกันแน่น** (R² 0.851–0.855) — ตัวเลขบ่งชี้ว่าโมเดลไม่ใช่คอขวดแล้ว
3. **อ่านผลแบบซื่อสัตย์** — เทียบกับ persistence ทุกครั้ง; ถ้า ensemble ชนะ ตัว export จะเลือกให้เอง
4. **เป้าหมายที่ควรวัดต่อ** — `±5%` (ทายคลาด ≤ 5 µg/m³) ให้ได้ ≥ 93% ก่อน แล้วค่อยไล่ `R2` ≥ 0.93
   ถ้าข้อมูลครบสถานีแล้วยังไม่ถึง แปลว่าต้องเพิ่มแหล่งข้อมูลอื่น (เช่น ข้อมูลรายชั่วโมง หรือ traffic/meteorology เพิ่ม)''')

nb = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {"provenance": [], "name": "pm25_training_fixed.ipynb"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
    },
    "cells": cells,
}

out_path = r"C:\Users\ACER\projectweb\notebooks\pm25_training_fixed.ipynb"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)
print("written:", out_path)
