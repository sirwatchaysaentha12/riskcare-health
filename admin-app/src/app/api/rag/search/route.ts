import { NextRequest, NextResponse } from 'next/server'
import { searchRag, knowledgeVersion } from '@/lib/ragRepository'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// RAG ครึ่งแรก: ค้นคลังความรู้ (ยังไม่มี LLM — คืนชิ้นข้อมูลอ้างอิงให้ UI แสดงเอง)
// ครึ่งหลัง (LLM สร้างคำตอบ) จะต่อจาก endpoint นี้เมื่อมี GEMINI_API_KEY
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const query = params.get('q')?.trim() || ''
  const rawLimit = params.get('limit')
  const parsedLimit = rawLimit === null ? 5 : Number(rawLimit)

  if (query.length < 2) {
    return NextResponse.json(
      { success: false, error: 'QUERY_REQUIRED', message: 'กรุณาระบุคำถาม q อย่างน้อย 2 ตัวอักษร' },
      { status: 400, headers: CORS_HEADERS },
    )
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10) {
    return NextResponse.json(
      { success: false, error: 'INVALID_LIMIT', message: 'limit ต้องเป็นจำนวนเต็ม 1 ถึง 10' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  try {
    // ยังไม่มีแหล่ง embedding ของคำถามฝั่ง Node → searchRag จะใช้โหมด keyword
    // (เมื่อครึ่งหลังเพิ่ม embedding จาก Gemini ก็ส่ง queryEmbedding เข้าตัวเดียวกันได้ทันที)
    const { mode, chunks } = await searchRag(query, undefined, parsedLimit)
    return NextResponse.json({
      success: true,
      mode,
      knowledgeVersion: knowledgeVersion(),
      count: chunks.length,
      results: chunks,
    }, { headers: CORS_HEADERS })
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : 'RAG_SEARCH_FAILED'
    return NextResponse.json(
      { success: false, error: code, message: 'ค้นคลังความรู้ไม่สำเร็จ' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
