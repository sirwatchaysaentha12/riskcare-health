# Colab v2.7 — Holdout Evaluation Cell (เทียบกับ baseline บนช่วงเดียวกัน)

เป้าหมาย: ตัดสิน "โมเดล Colab v2.7 vs persistence" ด้วย **holdout ชุดเดียวกัน** (ห้ามเทียบข้าม window)

## ช่วงทดสอบที่กำหนด (2 ช่วง)

| Window | วันที่ | ทำไม |
|---|---|---|
| ฤดูฝุ่นต่ำ | 2026-07-01 → 2026-09-30 | ตรงกับ baseline eval ที่รายงานไว้ (persistence ±5 = 93%) |
| **ฤดูฝุ่นสูง** | **2025-12-01 → 2026-03-31** | ช่วงที่โมเดลมีที่ว่างชนะจริง — persistence ±5 เหลือแค่ **51%** (MAE 6.59) |

## ผล persistence บนช่วงเดียวกัน (ใช้เป็นเกณฑ์ผ่าน)

| Window | persistence MAE | ±5 | ±10 |
|---|---|---|---|
| ต่ำ (ก.ค.–ก.ย. 69) | 1.99 | 93% | 99% |
| **สูง (ธ.ค. 68–มี.ค. 69)** | **6.59** | **51%** | **78%** |

## Cell ที่วางต่อท้าย notebook v2.7

ปรับ 3 จุดที่มี `# TODO` ให้ตรงกับตัวแปรใน notebook ของคุณ (ชื่อ df / ฟังก์ชันทำนายของ ensemble):

```python
# ===== Holdout evaluation: Colab v2.7 vs persistence (same windows) =====
import pandas as pd, numpy as np

WINDOWS = {"low_2026Jul-Sep": ("2026-07-01", "2026-09-30"),
           "high_2025Dec-2026Mar": ("2025-12-01", "2026-03-31")}

# TODO 1: df = DataFrame ของคุณที่มีคอลัมน์ ['date','station_id','pm25'] (ค่ารายวัน observed)
# TODO 2: แทนฟังก์ชันนี้ด้วยวิธีทำนายของ ensemble v2.7 ของคุณ
#         รับ DataFrame history (ข้อมูล "ก่อนหน้า" target_date เท่านั้น) + target_date + station_id
#         คืนค่า pm25 พรุ่งนี้ (h=1)
def model_predict(history: pd.DataFrame, target_date: str, station_id) -> float | None:
    raise NotImplementedError("ใส่การเรียกโมเดล v2.7 ของคุณที่นี่")

def persistence_predict(history: pd.DataFrame, target_date: str, station_id) -> float | None:
    h = history[history.station_id == station_id].sort_values("date")
    return float(h.iloc[-1].pm25) if len(h) else None

def evaluate(predict_fn, window):
    frm, to = pd.Timestamp(window[0]), pd.Timestamp(window[1])
    errs = []
    for sid, g in df.groupby("station_id"):
        g = g.sort_values("date")
        for i in range(1, len(g)):
            t = pd.Timestamp(g.iloc[i].date)
            if not (frm <= t <= to):
                continue
            history = g[g.date < t]           # ข้อมูลก่อนวันทำนายเท่านั้น (no leakage)
            p = predict_fn(history, str(t.date()), sid)
            if p is not None and np.isfinite(p):
                errs.append(abs(g.iloc[i].pm25 - p))
    a = np.array(errs)
    return {"n": len(a), "MAE": round(a.mean(), 2),
            "±5%": round(100 * (a <= 5).mean(), 1), "±10%": round(100 * (a <= 10).mean(), 1)}

for name, w in WINDOWS.items():
    print(name, "persistence:", evaluate(persistence_predict, w))
    print(name, "v2.7       :", evaluate(model_predict, w))
# เกณฑ์: v2.7 ต้องมี MAE ต่ำกว่า และ ±5% สูงกว่า persistence ใน "ทั้งสอง" window จึงใช้จริง
```

## กติกา

- ห้ามให้ `model_predict` เห็นข้อมูล ≥ target_date (no leakage) — cell นี้ตัดไว้ให้แล้ว
- ห้ามใส่ API key/credential ลง notebook ที่จะแชร์กรรมการ
- ผลที่ได้นำมาใส่ `data/vertex/COMPARISON_REPORT.md` เพื่อตัดสินใจเฟสถัดไป
