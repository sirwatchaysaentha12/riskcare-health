# -*- coding: utf-8 -*-
"""สร้าง rag_embedding_colab.ipynb — RAG ครึ่งแรก: สร้าง embedding คลังความรู้บน Colab (ไม่ต้องมี API key)"""
import json

knowledge = json.load(open(r"C:\Users\ACER\projectweb\admin-app\src\data\rag-knowledge.json", encoding="utf-8"))
chunks_json = json.dumps(knowledge["chunks"], ensure_ascii=False, indent=1)
N = len(knowledge["chunks"])

cells = []

def md(src):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": src.splitlines(keepends=True)})

def code(src):
    cells.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
                  "source": src.splitlines(keepends=True)})

md(f'''# RAG ครึ่งแรก — สร้าง embedding คลังความรู้ (บน Colab)

> 🏷️ **RAG Embedding เวอร์ชัน 1.0** · 28 ก.ย. 2026 · คลังความรู้ {N} ชิ้น (เกณฑ์ กสม. 2566 + เอกสารวิจัยของโปรเจกต์) · โมเดล paraphrase-multilingual-MiniLM-L12-v2 (384 มิติ, รองรับภาษาไทย) · **ไม่ต้องใช้ API key อะไรเลย** — ใช้ Colab Secrets ตัวเดิมกับ notebook PM2.5

**ต้องทำก่อนรัน (ครั้งเดียว):** ไป Supabase Dashboard → SQL Editor → วางและ Run ไฟล์
`admin-app/supabase/migrations/20260928120000_create_rag_documents.sql`
(สร้างตาราง `rag_documents` + ฟังก์ชันค้น `match_rag_documents`) — ถ้ายังไม่รัน cell ตรวจตารางด้านล่างจะหยุดและบอกวิธีแก้เป็นไทย

เสร็จแล้วระบบค้นความใกล้เคียงเชิงความหมายใช้งานได้ทันทีผ่าน `searchRag()` ในแอป (ครึ่งหลัง = ต่อ LLM ตอบคำถาม)''')

code('''# ✈️ Pre-flight: เช็ค Colab Secrets (ตัวเดียวกับ notebook PM2.5) + ประกาศเวอร์ชัน
from google.colab import userdata

print('🏷️ rag_embedding_colab.ipynb — RAG Embedding เวอร์ชัน 1.0 · 28 ก.ย. 2026')

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
        'วิธีแก้: กุญแจ 🔑 ซ้ายมือ → เปิดสวิตช์ Notebook access ของ Secrets ทั้งสองตัว '
        '(ค่าตั้งไว้แล้วจาก notebook PM2.5 ไม่ต้องพิมพ์ใหม่)'
    )
print('Secrets ครบ — เริ่มได้เลย!')''')

code('''!pip install -q sentence-transformers supabase
print('Setup complete!')''')

code('''# 🗄️ ตรวจว่าตาราง rag_documents ถูกสร้างแล้ว (ต้องรัน SQL migration ก่อน 1 ครั้ง)
from supabase import create_client
from google.colab import userdata

supabase = create_client(userdata.get('SUPABASE_URL'), userdata.get('SUPABASE_SERVICE_KEY'))
try:
    res = supabase.table('rag_documents').select('id', count='exact').execute()
    existing = res.count or 0
    print(f'✓ ตาราง rag_documents พร้อม (มีข้อมูลอยู่ {existing} แถว — จะ upsert ทับ)')
except Exception as e:
    raise SystemExit(
        '⛔ ยังไม่พบตาราง rag_documents\\n'
        'วิธีแก้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ '
        'admin-app/supabase/migrations/20260928120000_create_rag_documents.sql → Run '
        'แล้วกลับมารัน cell นี้ใหม่\\n'
        f'(รายละเอียด error: {str(e)[:200]})'
    )''')

code(f'''# 📚 คลังความรู้ {N} ชิ้น (ฝังมาในไฟล์เดียวกัน — แหล่งเดียวกับ src/data/rag-knowledge.json)
import json

KNOWLEDGE = json.loads(r"""{chunks_json}""")
print(f'คลังความรู้: {{len(KNOWLEDGE)}} chunks')
for c in KNOWLEDGE[:3]:
    print(' •', c['id'], '—', c['title'][:50])''')

code('''# 🧮 สร้าง embedding (โหลดโมเดลครั้งแรก ~470 MB บน Colab — เร็วกว่ารันในเครื่อง)
from sentence_transformers import SentenceTransformer

MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'
model = SentenceTransformer(MODEL_NAME)

texts = [f"{c['title']}\\n{c['content']}" for c in KNOWLEDGE]
vectors = model.encode(texts, normalize_embeddings=True)
print(f'สร้าง embedding แล้ว {vectors.shape[0]} chunks × {vectors.shape[1]} มิติ')
assert vectors.shape[1] == 384, 'มิติไม่ตรงกับคอลัมน์ vector(384) ใน Supabase' ''')

code('''# ⬆️ Upsert ลงตาราง rag_documents (ทีละ 50 แถว)
rows = [{
    'id': c['id'],
    'title': c['title'],
    'content': c['content'],
    'source': c['source'],
    'tags': c.get('tags', []),
    'embedding': '[' + ','.join(f'{v:.6f}' for v in vec) + ']',
} for c, vec in zip(KNOWLEDGE, vectors)]

for start in range(0, len(rows), 50):
    batch = rows[start:start + 50]
    supabase.table('rag_documents').upsert(batch).execute()
    print(f'  upsert แล้ว {min(start + 50, len(rows))}/{len(rows)}')

print('เสร็จ! คลังความรู้พร้อมให้ค้นแบบ vector')''')

code('''# 🧪 Smoke test: ค้นจริงด้วยคำถามตัวอย่าง — ผลที่ออกมาคือหลักฐานว่า RAG ครึ่งแรกใช้ได้
sample_queries = [
    'วันนี้ฝุ่น 45 เด็กเล็กออกไปเล่นนอกบ้านได้ไหม',
    'ระบบตรวจการหายใจผ่านกล้องใช้หลักการอะไร',
    'PM2.5 กี่ระดับ แต่ละระดับเรียกว่าอะไร',
]

for q in sample_queries:
    q_vec = model.encode([q], normalize_embeddings=True)[0]
    res = supabase.rpc('match_rag_documents', {
        'query_embedding': '[' + ','.join(f'{v:.6f}' for v in q_vec) + ']',
        'match_count': 3,
    }).execute()
    print(f'\\nถาม: {q}')
    for row in res.data:
        print(f"  {row['similarity']:.3f}  {row['id']} — {row['title'][:60]}")''')

nb = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
        "colab": {"provenance": [], "name": "rag_embedding_colab.ipynb"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
        "language_info": {"name": "python"},
    },
    "cells": cells,
}

out_path = r"C:\Users\ACER\projectweb\notebooks\rag_embedding_colab.ipynb"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)
print("written:", out_path, "| cells:", len(cells), "| chunks embedded:", N)
