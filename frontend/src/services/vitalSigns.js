// Service สำหรับสัญญาณที่ 2 (vitallens rPPG) ของระบบประเมินความเสี่ยงโรคทางเดินหายใจ
// เรียก /api/vital-signs (vite proxy → admin-app :3000) — วิดีโอใบหน้า → HR/SpO2 โดยประมาณ
// คืนค่าตามรูปแบบ { ok, method, vitals: { hr, rr?, spo2? } } หรือ { ok: false, error }

const VITAL_SIGNS_ENDPOINT = '/api/vital-signs'

export async function analyzeVitalSigns(videoBlob, { signal } = {}) {
  if (!(videoBlob instanceof Blob) || videoBlob.size === 0) {
    return { ok: false, error: 'no video data', stage: 'client' }
  }
  const formData = new FormData()
  const extension = videoBlob.type?.includes('mp4') ? 'mp4' : 'webm'
  formData.append('video', videoBlob, `capture.${extension}`)
  try {
    const response = await fetch(VITAL_SIGNS_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal,
    })
    if (response.status === 413) {
      return { ok: false, error: 'วิดีโอใหญ่เกิน 60MB', stage: 'client' }
    }
    if (!response.ok) {
      return { ok: false, error: `vital-signs API ตอบ ${response.status}`, stage: 'client' }
    }
    return await response.json()
  } catch (error) {
    return { ok: false, error: error?.message || 'เรียก vital-signs API ไม่สำเร็จ', stage: 'client' }
  }
}

/** ดึงค่า HR/SpO2/RR ตัวเลขล้วนจากผล vitallens (null เมื่อไม่มี) */
export function extractNumericVitals(result) {
  const vitals = result?.ok ? result.vitals || {} : {}
  return {
    hrBpm: typeof vitals.hr?.value === 'number' ? vitals.hr.value : null,
    spo2Percent: typeof vitals.spo2?.value === 'number' ? vitals.spo2.value : null,
    rrFromVitals: typeof vitals.rr?.value === 'number' ? vitals.rr.value : null,
    hrConfidence: typeof vitals.hr?.confidence === 'number' ? vitals.hr.confidence : null,
  }
}
