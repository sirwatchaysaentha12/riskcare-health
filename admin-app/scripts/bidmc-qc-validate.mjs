// BIDMC Track A — QC + Signal-processing Validation (ตาม BIDMC-EVALUATION-SPEC.md)
// ใช้ computeBreathingRate เดิม (ไม่แก้พารามิเตอร์) กับ RESP (impedance) เทียบ manual breath annotations
// รัน: node scripts/bidmc-qc-validate.mjs
// Output: validation summary (stdout) + ผลดิบ JSON ไปที่ research-data/bidmc/validation-results.json (นอก Git)
// NOTE (Phase 20): ไฟล์ต้นฉบับถูกลบโดย actor คู่ขนานก่อนเคยถูก commit — ไฟล์นี้กู้คืนจาก session record เนื้อหาตรงกัน
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { computeBreathingRate } from '../frontend/src/utils/breathingRate.js'
import { computeAgreementMetrics, splitByParticipant, assertNoParticipantLeakage } from '../frontend/src/utils/validationMetrics.js'

const DATA_DIR = 'C:\\Users\\ACER\\research-data\\bidmc\\bidmc_csv'
const FS = 125 // Hz
const WIN_SEC = 30
const SAMPLES_PER_WIN = FS * WIN_SEC

// ---------- โหลดรายการไฟล์ ----------
const subjects = Array.from({ length: 53 }, (_, i) => String(i + 1).padStart(2, '0'))
const missing = subjects.flatMap((s) =>
  ['Signals', 'Breaths', 'Numerics']
    .filter((kind) => !existsSync(path.join(DATA_DIR, `bidmc_${s}_${kind}.csv`)))
    .map((kind) => `bidmc_${s}_${kind}.csv`),
)
if (missing.length) {
  console.log(`MISSING_FILES: ${missing.join(', ')}`)
  process.exit(1)
}

// ---------- QC ----------
const qc = { subjects: 53, duplicateRecordings: [], missingAnnotations: [], invalidRrSubjects: [], samplingIrregular: [], signalDropout: [], participantIds: subjects.length, unitNotes: [] }
const hashes = new Map()

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((line) => line.split(','))
  return { header, rows }
}

for (const s of subjects) {
  const signalsText = readFileSync(path.join(DATA_DIR, `bidmc_${s}_Signals.csv`), 'utf8')
  const hash = createHash('sha256').update(signalsText).digest('hex')
  if (hashes.has(hash)) qc.duplicateRecordings.push(`${s} == ${hashes.get(hash)}`)
  hashes.set(hash, s)

  const breathsText = readFileSync(path.join(DATA_DIR, `bidmc_${s}_Breaths.csv`), 'utf8')
  const breathRows = breathsText.trim().split(/\r?\n/).slice(1).filter(Boolean)
  if (breathRows.length === 0) qc.missingAnnotations.push(s)

  const numerics = parseCsv(readFileSync(path.join(DATA_DIR, `bidmc_${s}_Numerics.csv`), 'utf8'))
  const qcRespCol = numerics.header.findIndex((h) => /resp/i.test(h))
  if (qcRespCol === -1) qc.invalidRrSubjects.push(`${s}:no_resp_column`)
  else {
    const values = numerics.rows.map((r) => Number(r[qcRespCol])).filter(Number.isFinite)
    if (values.some((v) => v < 0 || v > 60)) qc.invalidRrSubjects.push(`${s}:rr_out_of_range`)
  }

  const signals = parseCsv(signalsText)
  const timeCol = signals.header.findIndex((h) => /time/i.test(h))
  const times = signals.rows.map((r) => Number(r[timeCol]))
  // sampling rate: ตรวจ median ของ delta ≈ 8ms (125 Hz)
  const deltas = []
  for (let i = 1; i < Math.min(times.length, 3000); i++) deltas.push(times[i] - times[i - 1])
  deltas.sort((a, b) => a - b)
  const medianDelta = deltas[Math.floor(deltas.length / 2)]
  if (Math.abs(medianDelta - 1 / FS) > 0.002) qc.samplingIrregular.push(`${s}:medianDelta=${medianDelta}`)
  // signal dropout: ช่วงเวลาที่ข้าม >1s หรือค่า RESP ว่าง
  const respCol = signals.header.findIndex((h) => /resp/i.test(h))
  let gaps = 0
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > 1 || !signals.rows[i][respCol]) gaps++
  }
  if (gaps > 0) qc.signalDropout.push(`${s}:${gaps}gaps`)
}

console.log('QC:', JSON.stringify({
  subjects: qc.subjects, participantIds: qc.participantIds,
  duplicateRecordings: qc.duplicateRecordings.length, missingAnnotations: qc.missingAnnotations.length,
  invalidRrSubjects: qc.invalidRrSubjects.length, samplingIrregular: qc.samplingIrregular.length,
  signalDropoutSubjects: qc.signalDropout.length,
}))

// ---------- Split ตาม participant ----------
const records = subjects.map((s) => ({ participantId: `bidmc_${s}` }))
const split = splitByParticipant(records, { trainRatio: 0.6, validationRatio: 0.2, seed: 2026 })
const participantSplit = {}
for (const [name, rows] of Object.entries(split.splits)) {
  for (const row of rows) participantSplit[row.participantId] = name
}
assertNoParticipantLeakage(split.splits)
console.log('SPLIT_COUNTS:', JSON.stringify(split.participantCounts))

// ---------- Evaluation ----------
const pairsPrimary = [] // reference = manual breath count
const pairsSecondary = [] // reference = numerics RR (impedance-derived)
const perRecord = []

for (const s of subjects) {
  const signals = parseCsv(readFileSync(path.join(DATA_DIR, `bidmc_${s}_Signals.csv`), 'utf8'))
  const timeCol = signals.header.findIndex((h) => /time/i.test(h))
  const respCol = signals.header.findIndex((h) => /resp/i.test(h))
  const times = signals.rows.map((r) => Number(r[timeCol]))
  const resp = signals.rows.map((r) => Number(r[respCol]))

  const breathRows = readFileSync(path.join(DATA_DIR, `bidmc_${s}_Breaths.csv`), 'utf8').trim().split(/\r?\n/).slice(1).filter(Boolean)
  const breathsAnn1 = breathRows.map((r) => Number(r.split(',')[0]))
  const breathsAnn2 = breathRows.map((r) => Number(r.split(',')[1]))

  const numerics = parseCsv(readFileSync(path.join(DATA_DIR, `bidmc_${s}_Numerics.csv`), 'utf8'))
  const nTimeCol = numerics.header.findIndex((h) => /time/i.test(h))
  const nRespCol = numerics.header.findIndex((h) => /resp/i.test(h))
  const numericsRows = numerics.rows.map((r) => ({ t: Number(r[nTimeCol]), rr: Number(r[nRespCol]) }))

  let ok = 0, abstained = 0, failed = 0
  const nWindows = Math.floor(times.length / SAMPLES_PER_WIN)
  for (let w = 0; w < nWindows; w++) {
    const startIdx = w * SAMPLES_PER_WIN
    const t0 = times[startIdx]
    const t1 = t0 + WIN_SEC
    // reference primary: จำนวน breath (ann1) ที่ sample index อยู่ในหน้าต่าง × 2
    const startSample = Math.round(t0 * FS)
    const endSample = startSample + SAMPLES_PER_WIN
    const refCount1 = breathsAnn1.filter((idx) => idx >= startSample && idx < endSample).length
    const refCount2 = breathsAnn2.filter((idx) => idx >= startSample && idx < endSample).length
    const rrReference = refCount1 * 2
    const refValid = rrReference >= 6 && refCount1 > 0

    // reference secondary: median numerics RR ในหน้าต่าง
    const nValues = numericsRows.filter((row) => row.t >= t0 && row.t < t1 && Number.isFinite(row.rr)).map((row) => row.rr)
    const rrNumerics = nValues.length ? [...nValues].sort((a, b) => a - b)[Math.floor(nValues.length / 2)] : null

    // algorithm: computeBreathingRate บน RESP ของหน้าต่าง
    const samples = []
    for (let i = startIdx; i < startIdx + SAMPLES_PER_WIN; i++) {
      if (Number.isFinite(times[i]) && Number.isFinite(resp[i])) samples.push({ t: (times[i] - t0) * 1000, y: resp[i] })
    }
    let measured = null
    let outcome = 'abstained'
    try {
      const result = computeBreathingRate(samples)
      if (result?.bpm != null && result.bpm >= 6 && result.bpm <= 40) {
        measured = result.bpm
        outcome = 'ok'
        ok++
      } else if (result?.bpm != null) {
        outcome = 'failed' // bpm นอกช่วง 6-40 (plausibility) = ค่าใช้ไม่ได้
        failed++
      } else {
        abstained++
      }
    } catch {
      failed++
    }

    const pair = {
      participantId: `bidmc_${s}`,
      outcome,
      reference: refValid ? rrReference : null,
      measured,
    }
    if (refValid) pairsPrimary.push(pair)
    const secPair = { ...pair, reference: rrNumerics != null && rrNumerics >= 6 ? rrNumerics : null }
    if (Number.isFinite(secPair.reference) && Number.isFinite(secPair.measured)) pairsSecondary.push(secPair)
  }
  perRecord.push({ subject: s, windows: nWindows, ok, abstained, failed })
}

// ---------- Metrics ----------
const primary = computeAgreementMetrics(pairsPrimary, { unit: 'ครั้ง/นาที', acceptableError: 2, seed: 42 })
const secondary = computeAgreementMetrics(pairsSecondary, { unit: 'ครั้ง/นาที', acceptableError: 2, seed: 42 })

// per-split (primary)
const perSplit = {}
for (const splitName of ['train', 'validation', 'test']) {
  const rows = split.splits[splitName].map((r) => r.participantId)
  const subset = pairsPrimary.filter((pair) => rows.includes(pair.participantId))
  perSplit[splitName] = computeAgreementMetrics(subset, { unit: 'ครั้ง/นาที', acceptableError: 2, seed: 42 })
}

writeFileSync(
  'C:\\Users\\ACER\\research-data\\bidmc\\validation-results.json',
  JSON.stringify({ generatedAt: new Date().toISOString(), qc, splitCounts: split.participantCounts, primary, secondary, perSplit, perRecord }, null, 2),
)

console.log('PRIMARY (manual breath annotations):', JSON.stringify(primary, null, 1))
console.log('SECONDARY (numerics RR median):', JSON.stringify({ computed: secondary.computed, mae: secondary.mae, meanBias: secondary.meanBias, n: secondary.n, nUsed: secondary.nUsed }, null, 1))
console.log('PER_SPLIT_MAE:', JSON.stringify(Object.fromEntries(Object.entries(perSplit).map(([k, v]) => [k, v.computed ? v.mae : v.reason]))))
