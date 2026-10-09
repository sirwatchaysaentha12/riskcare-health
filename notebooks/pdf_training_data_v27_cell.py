# ═══════════════════════════════════════════════════════════════════════════
# สร้าง PDF สรุปข้อมูลสำหรับเทรนโมเดลพยากรณ์ PM2.5 — v2.7 · 1 ต.ค. 2026
# รันใน Colab หลัง cell ฟีเจอร์ + กรองสถานี (ต้องมีตัวแปร: df_model, FEATURES,
# train, test, cutoff) — 1 cell จบ: ติดตั้ง reportlab → สร้าง PDF → ดาวน์โหลดอัตโนมัติ
# ─────────────────────────────────────────────────────────────────────────────
# ▼▼ บรรทัดที่อาจต้องแก้ให้ตรงกับชื่อตัวแปรจริงใน notebook (ค่าเริ่มต้น = ชื่อใน v2.7) ▼▼
DF           = df_model   # ← DataFrame หลัง feature engineering + กรองสถานีแข็งแรง
FEATURE_LIST = FEATURES   # ← รายชื่อฟีเจอร์ 37 ตัวที่ใช้ fit โมเดล
TRAIN_DF     = train      # ← ชุด train (temporal split)
TEST_DF      = test       # ← ชุด test
SPLIT_CUTOFF = cutoff     # ← วันที่แบ่ง train/test (Timestamp จาก quantile 0.8)
DATE_COL     = 'date'
TARGET_COL   = 'pm25'
STATION_COL  = 'station_name'
PDF_NAME     = 'pm25_forecast_training_data_v2.7.pdf'
MODEL_VERSION = 'v2.7'
CREATED_DATE  = '1 ตุลาคม 2026'
# ▲▲ จบส่วนที่อาจต้องแก้ ▲▲
# ═══════════════════════════════════════════════════════════════════════════

import sys, subprocess
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'reportlab'], check=True)

import io, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd, numpy as np
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

# ── ฟอนต์ไทย (Sarabun จาก Google Fonts ~250KB) — ถ้าโหลดไม่ได้ ข้อความไทยอาจเป็นกล่องว่าง
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

# ── คำอธิบายฟีเจอร์ทั้ง 37 ตัว (ภาษาไทย — ปรับข้อความได้ตามต้องการ)
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

# ── ภาพรวมตัวเลข
n_rows, n_feat = len(DF), len(FEATURE_LIST)
n_stations = DF['station_id'].nunique()
d_min, d_max = DF[DATE_COL].min(), DF[DATE_COL].max()
n_train, n_test = len(TRAIN_DF), len(TEST_DF)
extra_cols = [c for c in DF.columns if c not in FEATURE_LIST and c not in
              (DATE_COL, TARGET_COL, STATION_COL, 'station_id', 'latitude', 'longitude')]

# ── สร้าง PDF
doc = SimpleDocTemplate(PDF_NAME, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm, topMargin=15*mm, bottomMargin=15*mm)
story = []

# หน้าปก
story.append(Spacer(1, 70*mm))
story.append(Paragraph('รายงานข้อมูลสำหรับเทรนโมเดล', ParagraphStyle('c1', parent=H1, fontSize=24)))
story.append(Paragraph('พยากรณ์ค่า PM2.5 ล่วงหน้า', ParagraphStyle('c2', parent=H1, fontSize=24)))
story.append(Spacer(1, 10*mm))
story.append(Paragraph(f'โมเดล: Ensemble (Random Forest + XGBoost + LightGBM)', PC))
story.append(Paragraph(f'เวอร์ชันข้อมูล/โน้ตบุ๊ก: {MODEL_VERSION} · สร้างเมื่อ {CREATED_DATE}', PC))
story.append(Paragraph(f'ไฟล์: {PDF_NAME}', PC))
story.append(Spacer(1, 8*mm))
story.append(Paragraph('ข้อมูลรายวันจากสถานีตรวจวัดจริง (OpenAQ) + สภาพอากาศย้อนหลัง (Open-Meteo)<br/>'
                       'ประมวลผลผ่าน feature engineering แบบ gap-aware ป้องกัน data leakage', PC))
story.append(PageBreak())

# หน้า 2: ภาพรวม + train/test
story.append(Paragraph('1. ภาพรวมชุดข้อมูล', H2))
overview = [
    ['จำนวนแถวหลัง feature engineering', f'{n_rows:,} แถว'],
    ['จำนวนฟีเจอร์ที่ใช้เทรน', f'{n_feat} ตัว'],
    ['ช่วงวันที่ของข้อมูล', f'{d_min.date()} → {d_max.date()}'],
    ['จำนวนสถานีตรวจวัด', f'{n_stations} แห่ง (รัศมี 2 จุดพิกัด: นนทบุรี + ลาดกระบัง)'],
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
    ['จุดแบ่ง (cutoff)', f'{pd.Timestamp(SPLIT_CUTOFF).date()} (quantile 0.8 ของวันที่ทั้งชุด)'],
    ['ชุด Train', f'{n_train:,} แถว (ข้อมูลก่อน {pd.Timestamp(SPLIT_CUTOFF).date()})'],
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

# หน้า 3: รายชื่อฟีเจอร์ทั้งหมด
story.append(Paragraph(f'3. รายชื่อฟีเจอร์ทั้งหมด {n_feat} ตัวที่ใช้เทรน', H2))
feat_rows = [[Paragraph('<b>ฟีเจอร์</b>', SMALL), Paragraph('<b>คำอธิบาย</b>', SMALL)]
             for _ in [0]]
feat_rows = [[Paragraph('<b>ฟีเจอร์</b>', SMALL), Paragraph('<b>คำอธิบาย</b>', SMALL)]]
for f in FEATURE_LIST:
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

# หน้า 4: สถิติพื้นฐานของฟีเจอร์
story.append(Paragraph('4. สถิติพื้นฐานของแต่ละฟีเจอร์ (mean / std / min / max)', H2))
stat = DF[FEATURE_LIST].describe().T[['mean', 'std', 'min', 'max']].round(3).reset_index()
stat = stat.rename(columns={'index': 'feature'})
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

# หน้า 5: กราฟแนวโน้ม PM2.5
story.append(Paragraph('5. แนวโน้มค่า PM2.5 (target) ตลอดช่วงเวลา', H2))
story.append(Paragraph('เส้นทึบ = ค่าเฉลี่ยรายวันทุกสถานี · เส้นบาง = รายสถานี · เส้นประแดง = จุดแบ่ง train/test', SMALL))
buf = io.BytesIO()
fig, ax = plt.subplots(figsize=(10, 4.4), dpi=160)
for sid, g in DF.sort_values(DATE_COL).groupby('station_id'):
    ax.plot(g[DATE_COL], g[TARGET_COL], lw=0.5, alpha=0.30, color='#8fb8aa')
daily = DF.groupby(DATE_COL)[TARGET_COL].mean()
ax.plot(daily.index, daily.values, color='#1f7a63', lw=2.2, label='ค่าเฉลี่ยรายวัน (ทุกสถานี)')
ax.axvline(pd.Timestamp(SPLIT_CUTOFF), color='#e74c3c', ls='--', lw=1.6,
           label=f'เส้นแบ่ง train/test ({pd.Timestamp(SPLIT_CUTOFF).date()})')
ax.set_ylabel('PM2.5 (µg/m³)')
ax.legend(loc='upper right', fontsize=9)
ax.grid(alpha=0.25)
fig.tight_layout()
fig.savefig(buf, format='png', bbox_inches='tight')
plt.close(fig)
buf.seek(0)
story.append(Image(buf, width=170*mm, height=74.8*mm))
story.append(PageBreak())

# หน้า 6: ตัวอย่างข้อมูล 25 แถวหลัง feature engineering
story.append(Paragraph('6. ตัวอย่างข้อมูล 25 แถวแรกหลัง feature engineering', H2))
story.append(Paragraph('(แสดงคอลัมน์หลัก — ชุดเต็มมีทั้งหมด 37 คอลัมน์ตามรายการในหน้า 3)', SMALL))
sample_cols = [DATE_COL, STATION_COL, TARGET_COL, 'lag_1', 'lag_7', 'lag_14',
               'rolling_mean_7', 'rolling_std_7', 'neighbors_pm25_lag1',
               'temperature', 'rainfall', 'is_burning_season']
sample = DF[sample_cols].head(25).copy()
sample[DATE_COL] = sample[DATE_COL].dt.strftime('%Y-%m-%d')
header = [Paragraph('<b>'+c+'</b>', SMALL) for c in sample_cols]
sm_rows = [header]
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

# ── ดาวน์โหลดอัตโนมัติ (ใน Colab)
try:
    from google.colab import files
    files.download(PDF_NAME)
    print('เริ่มดาวน์โหลดลงเครื่องอัตโนมัติ ✓')
except Exception:
    print('ไม่ได้รันใน Colab — ไฟล์อยู่ที่:', os.path.abspath(PDF_NAME))
