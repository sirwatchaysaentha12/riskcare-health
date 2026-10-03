# ===== เทียบ Ensemble (v2.8) vs Persistence แยกฤดู — วางเป็น cell สุดท้ายของ notebook =====
# ใช้ test ชุดเดิมของ notebook (cutoff = quantile 0.8) — ไม่มี TODO, ไม่ต้องโหลดอะไรเพิ่ม
# persistence = X_te['lag_1'] = ค่าเมื่อวานของสถานีเดียวกัน (notebook สร้างด้วย shift(1) กัน leakage แล้ว)
# ใช้ได้ทั้ง ensemble_model และ weighted_ensemble ที่สร้างไว้ใน cell 13

import pandas as pd
import numpy as np

ev = pd.DataFrame({
    'date': pd.to_datetime(test['date'].values),
    'y': np.asarray(y_te, float),
    'persistence': np.asarray(X_te['lag_1'], float),
    'ensemble': np.asarray(ensemble_model.predict(X_te), float),
    'weighted': np.asarray(weighted_ensemble.predict(X_te), float),
})
ev['season'] = ev['date'].dt.month.isin([12, 1, 2, 3]).map({True: 'high (ธ.ค.-มี.ค.)', False: 'low (เม.ย.-พ.ย.)'})

def season_report(g, name):
    e_ens = np.abs(g['y'] - g['ensemble'])
    e_w = np.abs(g['y'] - g['weighted'])
    e_per = np.abs(g['y'] - g['persistence'])
    return {
        'window': name, 'n': len(g),
        'MAE_ensemble': round(e_ens.mean(), 2),
        'MAE_weighted': round(e_w.mean(), 2),
        'MAE_persistence': round(e_per.mean(), 2),
        '±5%_ensemble': round(100 * (e_ens <= 5).mean(), 1),
        '±5%_weighted': round(100 * (e_w <= 5).mean(), 1),
        '±5%_persistence': round(100 * (e_per <= 5).mean(), 1),
    }

rows = [season_report(ev, 'test ทั้งหมด')] + [season_report(g, s) for s, g in ev.groupby('season')]
table = pd.DataFrame(rows)
print(table.to_string(index=False))

# เกณฑ์ตัดสิน (นับเฉพาะช่วง "high" เพราะ persistence ชนะง่ายในช่วง low):
#  ถ้า MAE_ensemble < MAE_persistence และ ±5%_ensemble > ±5%_persistence ในช่วง high
#  → โมเดล ML ชนะจริง คุ้มที่จะ integrate
# ถ้าแพ้ในช่วง high → คง baseline (ระบบเว็บใช้อยู่แล้ว MAE 1.99/±5 94% ที่พรุ่งนี้)
table.to_csv('colab_vs_persistence_results.csv', index=False)
print('\nบันทึกผลไว้ที่ colab_vs_persistence_results.csv — ดาวน์โหลดกลับมาให้ AI ทำตารางเปรียบเทียบสุดท้าย')
