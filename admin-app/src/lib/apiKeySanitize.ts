// Pure sanitizer for the OpenAQ API key. No imports so `node --test` can run it standalone.
export type ApiKeySanitizeResult = { ok: true; apiKey: string } | { ok: false; status: 'empty' | 'malformed' }

// วงเล็บมุม < > และช่องว่างมักติดมาจากการคัดลอก key จากหน้าเว็บ/เอกสาร
// และทำให้ OpenAQ ตอบ 401 Invalid credentials (เคยเกิดจริง 2026-09-24 — docs/openaq-401-fix.md)
export function sanitizeApiKey(raw: string): ApiKeySanitizeResult {
  const apiKey = raw.trim().replace(/^<+/, '').replace(/>+$/, '').trim()
  if (!apiKey) return { ok: false, status: 'empty' }
  if (/[\u0000-\u001f\u007f<>]/.test(apiKey) || /^[`'"].*[`'"]$/.test(apiKey)) {
    return { ok: false, status: 'malformed' }
  }
  return { ok: true, apiKey }
}
