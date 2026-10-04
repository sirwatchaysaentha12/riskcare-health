# -*- coding: utf-8 -*-
"""
Evaluation หลัก: Accuracy@±2 µg/m³ ด้วย rolling-origin backtest (ห้าม random split)
Protocol: origin ทุกไตรมาส (2025-07 → 2026-07) — train expanding บนข้อมูลก่อน origin
เท่านั้น → ทำนาย 3 วันถัดไปทุกสถานี → รวม error ต่อ horizon
Metric หลัก: Accuracy@±2 = share(|pred-actual| <= 2) · รายงาน MAE/RMSE/MedianAE/Bias/N ควบคู่
"""
import sys
sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import HistGradientBoostingRegressor

CSV = Path(r"C:\Users\ACER\projectweb\data\vertex\pm25_daily_vertex.csv")
OUT = Path(r"C:\Users\ACER\projectweb\data\vertex\accuracy_at_2_results.json")

df = pd.read_csv(CSV)
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values(["location_id", "timestamp"])

# ── feature builders (สองชุด: base = เหมือน production, ext = เพิ่ม ROC/median/30w) ──
def make_features(s, extended=False):
    f = pd.DataFrame(index=s.index)
    for k in [1, 2, 3, 4, 5, 6, 7, 14]:
        f[f"lag_{k}"] = s.shift(k - 1)  # lag_1 = ค่าวัน origin เอง
    for w in [3, 7, 14]:
        f[f"roll_mean_{w}"] = s.rolling(w).mean()
        f[f"roll_std_{w}"] = s.rolling(w).std()
    for w in [3, 7]:
        f[f"roll_min_{w}"] = s.rolling(w).min()
        f[f"roll_max_{w}"] = s.rolling(w).max()
    if extended:
        f["roc_1"] = s.diff(1)          # rate of change 1 วัน
        f["roc_7"] = s.diff(7)
        f["roll_median_7"] = s.rolling(7).median()
        f["roll_mean_30"] = s.rolling(30).mean()
        f["roll_std_30"] = s.rolling(30).std()
        f["momentum_3_7"] = s.rolling(3).mean() - s.rolling(7).mean()
    f["day_of_week"] = f.index.dayofweek
    f["month"] = f.index.month
    f["is_high_season"] = f["month"].isin([12, 1, 2, 3]).astype(int)
    return f

ORIGINS = ["2025-07-01", "2025-10-01", "2026-01-01", "2026-04-01", "2026-07-01"]
PERIOD_NAME = {"2025-07-01": "2025Q3 (low)", "2025-10-01": "2025Q4 (ต้นฤดู)", "2026-01-01": "2026Q1 (high)", "2026-04-01": "2026Q2 (low)", "2026-07-01": "2026Q3 (low)"}

series = {sid: g.set_index("timestamp")["pm25"].asfreq("D") for sid, g in df.groupby("location_id")}

def metrics(y, p):
    y, p = np.asarray(y, float), np.asarray(p, float)
    m = np.isfinite(y) & np.isfinite(p)
    y, p = y[m], p[m]
    if not len(p):
        return None
    e = y - p
    return {"N": int(len(e)),
            "Acc2": round(100 * float((np.abs(e) <= 2).mean()), 1),
            "Acc5": round(100 * float((np.abs(e) <= 5).mean()), 1),
            "MAE": round(float(np.abs(e).mean()), 2),
            "RMSE": round(float(np.sqrt((e ** 2).mean())), 2),
            "MedianAE": round(float(np.median(np.abs(e))), 2),
            "Bias": round(float(e.mean()), 2)}

def baseline_preds(s, origin, h):
    """baseline ทั้งหมด: ทำนายวัน origin+h โดยใช้ข้อมูล ≤ origin"""
    past = s[s.index <= pd.Timestamp(origin)].dropna()
    if not len(past):
        return {}
    last, ma3, ma7 = past.iloc[-1], past.tail(3).mean(), past.tail(7).mean()
    d = pd.Timestamp(origin) + pd.Timedelta(days=h)
    prod = max(0.0, 0.7 * last + 0.3 * (past.tail(7).mean()))
    return {d: {"persistence": last, "ma3": ma3, "prod_blend": prod}}

# ── backtest ──
COLLECT = {}  # (variant, horizon) -> list[(y, p, station, period)]
SEEN_BASE = set()  # sanity: (station, target_date, horizon) ห้ามซ้ำ (baseline รันครั้งเดียว)
for origin in ORIGINS:
    o_ts = pd.Timestamp(origin)
    for h in [1, 2, 3]:
        # รวม actual + baseline ต่อสถานี
        for sid, s in series.items():
            bp = baseline_preds(s, origin, h)
            for d, preds in bp.items():
                # sanity: target ต้องอยู่หลัง origin เสมอ (feature ใช้ข้อมูล ≤ origin)
                assert d > o_ts, f"sanity fail: target {d} ไม่ได้อยู่หลัง origin {origin}"
                actual = s.get(d, np.nan)
                if not np.isfinite(actual):
                    continue
                key = (str(sid), str(d.date()), h)
                assert key not in SEEN_BASE, f"sanity fail: duplicate baseline sample {key}"
                SEEN_BASE.add(key)
                for bname, bval in preds.items():
                    assert np.isfinite(bval), f"sanity fail: baseline ไม่ finite {bname} {sid} {d}"
                    COLLECT.setdefault((f"base:{bname}", h), []).append((actual, bval, sid, origin))

# ML ต่อ origin (train expanding ก่อน origin) — 2 feature sets
for extended in [False, True]:
    SEEN_ML = set()  # sanity ต่อ feature-set (ML สองชุดใช้ test window เดียวกัน — ซ้ำข้ามชุดคาดหมาย)
    vname = "ext" if extended else "ml_base"
    for origin in ORIGINS:
        o_ts = pd.Timestamp(origin)
        feats_all, targets = [], []
        # สร้าง feature/target รวมทุกสถานี (target = pm25 ที่ d+h, ใช้เฉพาะข้อมูล ≤ origin)
        for sid, s in series.items():
            s_tr = s[s.index < o_ts].dropna()
            if len(s_tr) < 30:
                continue
            f = make_features(s_tr, extended)
            for h in [1, 2, 3]:
                pass
            feats_all.append((sid, s_tr, f))
        for h in [1, 2, 3]:
            X_rows, y_rows, meta, train_dates = [], [], [], []
            for sid, s_tr, f in feats_all:
                y = s_tr.shift(-h)
                for d in f.index:
                    if pd.isna(y.get(d, np.nan)) or d >= o_ts - pd.Timedelta(days=1):
                        continue
                    row = f.loc[d]
                    if row.isna().all():
                        continue
                    X_rows.append(row.values)
                    y_rows.append(y[d])
                    meta.append(sid)
                    train_dates.append(d)
            if len(X_rows) < 500:
                continue
            X, y = pd.DataFrame(X_rows, columns=make_features(s_tr, extended).columns), np.array(y_rows)
            # sanity: วัน feature ทุกแถว < origin (train ไม่เหยียบช่วง test/origin) และ target = origin+h > origin
            assert max(train_dates) < o_ts, f"sanity fail: train feature แตะช่วง origin ที่ {origin} (max={max(train_dates)})"
            assert len(X) == len(y) == len(train_dates)
            model = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.06, l2_regularization=1.0, random_state=42)
            model.fit(X, y)
            # ทำนาย 3 วันถัดจาก origin: features ณ วัน origin ล่าสุดของแต่ละสถานี (ข้อมูล ≤ origin)
            for sid, s in series.items():
                s_full = s[s.index <= o_ts].dropna()
                if len(s_full) < 30:
                    continue
                f_full = make_features(s_full, extended)
                d_last = s_full.index.max()
                if d_last not in f_full.index:
                    continue
                # sanity: origin feature ต้องใช้ข้อมูล ≤ origin (สร้างจาก s_full ที่ตัดไว้แล้ว)
                assert d_last <= o_ts, f"sanity fail: predict feature {d_last} เกิน origin {origin}"
                pred = float(model.predict(f_full.loc[[d_last], f_full.columns])[0])
                blend_lag = float(f_full.loc[d_last, "lag_1"]) if np.isfinite(f_full.loc[d_last, "lag_1"]) else pred
                blended = max(0.0, 0.5 * pred + 0.5 * blend_lag)
                d_t = o_ts + pd.Timedelta(days=h)
                assert d_t > o_ts, "sanity fail: target ไม่ได้อยู่หลัง origin"
                actual = s.get(d_t, np.nan)
                if np.isfinite(actual):
                    key = (str(sid), str(d_t.date()), h)
                    assert key not in SEEN_ML, f"sanity fail: duplicate ML sample {key}"
                    SEEN_ML.add(key)
                    COLLECT.setdefault((f"{vname}:blend50", h), []).append((actual, blended, sid, origin))

# sanity: จำนวนตัวอย่างของ baseline ต้องเท่ากันทุกตัวใน horizon เดียวกัน + รายงานทุก variant
for h in [1, 2, 3]:
    counts = {v: len(pairs) for (v, hh), pairs in COLLECT.items() if hh == h}
    base_counts = {v: c for v, c in counts.items() if v.startswith("base:")}
    assert len(set(base_counts.values())) == 1, f"sanity fail: baseline N ไม่ตรงกัน {base_counts}"
    print(f"sanity ok — h{h}: N ต่อ variant = {counts}")

# ── สรุปผล ──
def agg(pairs, by=None):
    out = {}
    groups = {}
    for y, p, sid, origin in pairs:
        key = by(y, p, sid, origin) if by else "all"
        groups.setdefault(key, []).append((y, p))
    for k, v in sorted(groups.items()):
        ys = [a for a, b in v]
        ps = [b for a, b in v]
        m = metrics(ys, ps)
        if m:
            out[k] = m
    return out

results = {}
for (variant, h), pairs in sorted(COLLECT.items()):
    results.setdefault(f"h{h}", {})[variant] = {
        "all": agg(pairs),
        "by_period": agg(pairs, by=lambda y, p, sid, o: PERIOD_NAME[o]),
        "by_station": agg(pairs, by=lambda y, p, sid, o: sid),
    }

joblib.dump(results, OUT.with_suffix(".joblib"))
# เขียนผลเป็น JSON จริง (อ่านได้จากเครื่องอื่น)
import json
OUT.with_suffix(".json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
print("บันทึกผล:", OUT.with_suffix(".json"))

# ── median daily change ของ actual ต่อช่วง (context ของ ±2) ──
print("\n===== median daily change ของ actual (origin → origin+h) ต่อช่วง =====")
for origin in ORIGINS:
    o_ts = pd.Timestamp(origin)
    line = f"{PERIOD_NAME[origin]}: "
    for h in [1, 2, 3]:
        changes = []
        for sid, s in series.items():
            a0, a1 = s.get(o_ts, np.nan), s.get(o_ts + pd.Timedelta(days=h), np.nan)
            if np.isfinite(a0) and np.isfinite(a1):
                changes.append(abs(a1 - a0))
        c = np.array(changes)
        line += f"h{h}: med|Δ|={np.median(c):.2f} (n={len(c)}) "
    print(line)

# ── ตารางหลัก: รวมทุก origin ──
print("\n===== Accuracy@±2 — รวมทุก origin/สถานี (N ≈ 33×5 origin) =====")
print(f"{'variant':28} {'h1 ±2%':>7} {'h1 MAE':>7} | {'h2 ±2%':>7} {'h2 MAE':>7} | {'h3 ±2%':>7} {'h3 MAE':>7}")
for v in sorted({k[0] for k in COLLECT}):
    row = [v]
    for h in [1, 2, 3]:
        m = results[f"h{h}"].get(v, {}).get("all", {})
        row += [f"{m.get('Acc2','-')}", f"{m.get('MAE','-')}"]
    print(f"{row[0]:28} {row[1]:>7} {row[2]:>7} | {row[3]:>7} {row[4]:>7} | {row[5]:>7} {row[6]:>7}")

# ── ทฤษฎีเพดาน: distribution ของ |Δpm25| วันต่อวัน (ส่วนที่พยากรณ์ไม่ได้ด้วย persistence) ──
diffs = []
for sid, s in series.items():
    s2 = s.dropna()
    diffs.extend(np.abs(s2.diff(1).dropna()).values)
diffs = np.array(diffs)
print(f"\nเพดานทางสถิติ: |Δ pm25| วันต่อวัน (ทั้งชุด n={len(diffs)})")
print(f"  median |Δ| = {np.median(diffs):.2f} · P75 = {np.percentile(diffs,75):.2f} · P90 = {np.percentile(diffs,90):.2f}")
print(f"  share(|Δ| ≤ 2) = {100*(diffs<=2).mean():.1f}%  ← persistence สมบูรณ์แบบก็ทำได้แค่นี้ (เพดาน ±2)")
