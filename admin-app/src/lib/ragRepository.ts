// RAG retrieval — ครึ่งแรกของ RAG (คลังความรู้ + ระบบค้น ยังไม่มี LLM) — v1.0 · 2026-09-28
// ค้นได้ 2 โหมด:
//   1) vector  — ความใกล้เคียงเชิงความหมาย ผ่านฟังก์ชัน match_rag_documents
//                (ต้องรัน migration SQL และ scripts/generate_rag_embeddings.py ก่อน)
//   2) keyword — ให้คะแนนคำทับซ้อนใน JS (ใช้ได้ทันทีแม้ยังไม่ได้รัน embeddings)
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import knowledge from '../data/rag-knowledge.json'

export type RagChunk = {
  id: string
  title: string
  content: string
  source: string
  tags: string[]
  similarity?: number
}

export type RagSearchResult = {
  mode: 'vector' | 'keyword'
  chunks: RagChunk[]
}

let adminClient: SupabaseClient | undefined

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_SERVER_CONFIGURATION_MISSING')
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminClient
}

// คลังความรู้จากไฟล์ JSON (แหล่งความจริงเดียวกับที่สคริปต์ embedding ใช้)
export function loadKnowledgeChunks(): RagChunk[] {
  return knowledge.chunks as RagChunk[]
}

export function knowledgeVersion(): string {
  return knowledge.version
}

// โหมด 1: ค้นด้วย vector — ต้องมี embedding ในตาราง rag_documents แล้ว
export async function searchRagByVector(queryEmbedding: number[], matchCount = 5): Promise<RagChunk[]> {
  if (!queryEmbedding?.length) throw new Error('RAG_QUERY_EMBEDDING_REQUIRED')
  const client = getAdminClient()
  const vector = `[${queryEmbedding.join(',')}]`
  const { data, error } = await client.rpc('match_rag_documents', {
    query_embedding: vector,
    match_count: matchCount,
  })
  if (error) throw new Error(`RAG_VECTOR_SEARCH_FAILED:${error.message}`)
  return (data ?? []) as RagChunk[]
}

// โหมด 2: keyword fallback — นับคำจากคำถามที่ทับซ้อนกับ title/content/tags
export async function searchRagByKeywords(query: string, matchCount = 5): Promise<RagChunk[]> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('rag_documents')
    .select('id, title, content, source, tags')
  if (error) throw new Error(`RAG_KEYWORD_SEARCH_FAILED:${error.message}`)

  const terms = query
    .toLowerCase()
    .split(/[\s,?!/]+/)
    .filter((term) => term.length >= 2)
  const scored = (data ?? []).map((row) => {
    const tags = Array.isArray(row.tags) ? row.tags : []
    const haystack = `${row.title} ${row.content} ${tags.join(' ')}`.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (haystack.includes(term)) score += 1
    }
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      source: row.source,
      tags,
      similarity: terms.length ? score / terms.length : 0,
    } satisfies RagChunk
  })
  return scored
    .filter((row) => (row.similarity ?? 0) > 0)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, matchCount)
}

// จุดเรียกใช้หลัก: มี queryEmbedding → ใช้ vector; ถ้า vector ล้มเหลว → fallback keyword อัตโนมัติ
export async function searchRag(query: string, queryEmbedding?: number[], matchCount = 5): Promise<RagSearchResult> {
  if (queryEmbedding?.length) {
    try {
      const chunks = await searchRagByVector(queryEmbedding, matchCount)
      if (chunks.length) return { mode: 'vector', chunks }
    } catch {
      // ยังไม่มี embedding/ฟังก์ชัน — ตกไป keyword ด้านล่าง
    }
  }
  return { mode: 'keyword', chunks: await searchRagByKeywords(query, matchCount) }
}
