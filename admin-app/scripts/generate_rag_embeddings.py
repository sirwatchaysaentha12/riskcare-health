# -*- coding: utf-8 -*-
"""RAG ครึ่งแรก — สร้าง embedding ให้คลังความรู้ แล้วบันทึกลงตาราง rag_documents ใน Supabase
v1.0 · 2026-09-28 · ไม่ต้องใช้ API key ใด ๆ (โมเดล embedding รันในเครื่อง)

วิธีใช้ (ตามลำดับ):
  1. รัน SQL ใน Supabase Dashboard → SQL Editor ก่อน:
     admin-app/supabase/migrations/20260928120000_create_rag_documents.sql
  2. ติดตั้งแพ็กเกจ: pip install sentence-transformers supabase
     (ครั้งแรกโมเดลจะถูกดาวน์โหลดลงเครื่อง ~470 MB ใช้เวลาสักครู่)
  3. รันจากโฟลเดอร์ admin-app:  python scripts/generate_rag_embeddings.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'  # รองรับภาษาไทย, 384 มิติ


def load_env() -> dict:
    env = {}
    env_file = ROOT / '.env.local'
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            env[key.strip()] = value.strip()
    return env


def main() -> None:
    from sentence_transformers import SentenceTransformer
    from supabase import create_client

    env = load_env()
    url = env.get('NEXT_PUBLIC_SUPABASE_URL') or env.get('SUPABASE_URL')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        raise SystemExit('ขาด SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน .env.local')

    knowledge_file = ROOT / 'src' / 'data' / 'rag-knowledge.json'
    data = json.loads(knowledge_file.read_text(encoding='utf-8'))
    chunks = data['chunks']
    expected_dim = data.get('embedding_dim')
    print(f'คลังความรู้ v{data.get("version")} — {len(chunks)} chunks')

    print(f'โหลดโมเดล embedding: {MODEL_NAME} (ดาวน์โหลดครั้งแรก ~470 MB โปรดรอ)')
    model = SentenceTransformer(MODEL_NAME)

    texts = [f"{chunk['title']}\n{chunk['content']}" for chunk in chunks]
    vectors = model.encode(texts, normalize_embeddings=True)
    dim = int(vectors.shape[1])
    if expected_dim and dim != expected_dim:
        raise SystemExit(f'ความยาว embedding ({dim}) ไม่ตรงกับคอลัมน์ vector({expected_dim}) — ตรวจ embedding_model ใน JSON')

    client = create_client(url, key)
    rows = []
    for chunk, vector in zip(chunks, vectors):
        rows.append({
            'id': chunk['id'],
            'title': chunk['title'],
            'content': chunk['content'],
            'source': chunk['source'],
            'tags': chunk.get('tags', []),
            'embedding': '[' + ','.join(f'{value:.6f}' for value in vector) + ']',
        })

    for start in range(0, len(rows), 50):
        batch = rows[start:start + 50]
        client.table('rag_documents').upsert(batch).execute()
        print(f'  upsert แล้ว {min(start + 50, len(rows))}/{len(rows)}')

    print(f'เสร็จ! บันทึก {len(rows)} chunks (dim={dim}) ลงตาราง rag_documents')
    print('ทดสอบค้นได้ที่แอปผ่าน searchRag() ใน src/lib/ragRepository.ts (โหมด vector)')


if __name__ == '__main__':
    main()
