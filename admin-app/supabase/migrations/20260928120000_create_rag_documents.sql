-- RAG knowledge base — ครึ่งแรกของ RAG (คลังความรู้ + ระบบค้น) — v1.0 · 2026-09-28
-- วิธีใช้: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งหมด → Run
-- (ต้องรันก่อนสคริปต์ generate_rag_embeddings.py)

create extension if not exists vector;

create table if not exists public.rag_documents (
  id text primary key,
  title text not null,
  content text not null,
  source text not null,
  tags text[] not null default '{}',
  embedding vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- คลังความรู้นี้เป็นข้อมูลสาธารณะ (เกณฑ์ กสม. + เอกสารวิจัยของโปรเจกต์) จึงเปิดให้อ่านได้
alter table public.rag_documents enable row level security;

drop policy if exists "rag_documents_public_read" on public.rag_documents;
create policy "rag_documents_public_read"
  on public.rag_documents
  for select
  using (true);

-- index สำหรับค้นแบบความใกล้เคียงเชิงความหมาย (cosine)
drop index if exists rag_documents_embedding_hnsw;
create index rag_documents_embedding_hnsw
  on public.rag_documents using hnsw (embedding vector_cosine_ops);

-- ฟังก์ชันค้นด้วย vector — เรียกจากแอปผ่าน supabase.rpc('match_rag_documents', ...)
create or replace function public.match_rag_documents(
  query_embedding vector(384),
  match_count int default 5
)
returns table (
  id text,
  title text,
  content text,
  source text,
  similarity float
)
language sql
stable
as $$
  select d.id, d.title, d.content, d.source,
         1 - (d.embedding <=> query_embedding) as similarity
  from public.rag_documents d
  where d.embedding is not null
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
