// Validation Metrics Framework (Phase 4) — คำนวณเมตริกความสอดคล้อง (agreement) กับค่าอ้างอิง
// กฎเหล็ก:
//   - ไม่มี reference → ไม่คำนวณ (computed:false พร้อมเหตุผล) ห้ามสร้างตัวเลขสมมติ
//   - รายงาน n ที่ใช้จริง / missing / excluded เสมอ
//   - one-class (ไม่มี positive หรือ negative) → classification ไม่คำนวณ ไม่ปลอม 100%
//   - ข้อมูลข้ามบุคคล (leakage) → throw
//   - Dataset น้อย (<30) → exploratory = true (Unstable Estimate)
//   - Correlation ไม่ใช่ accuracy — ไม่คำนวณ correlation เป็นเมตริกความถูกต้อง
// Pure logic ไม่มี DOM/React — unit-testable with node --test

export const OUTCOME = { OK: 'ok', FAILED: 'failed', ABSTAINED: 'abstained' }

function assertValidUnit(unit) {
  if (typeof unit !== 'string' || unit.trim().length === 0) {
    throw new Error('invalid unit: ต้องระบุหน่วยของค่าอ้างอิง (เช่น "ครั้ง/นาที", "bpm", "%")')
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function sd(values) {
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1))
}

// PRNG แบบ deterministic (seed ได้) เพื่อ bootstrap CI ที่ทดสอบซ้ำได้
function seededRandom(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null
  const index = (sortedValues.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower)
}

function bootstrapCi(values, statistic, { runs = 1000, seed = 42, level = 0.95 } = {}) {
  if (values.length < 2) return null
  const random = seededRandom(seed)
  const stats = []
  for (let run = 0; run < runs; run++) {
    const sample = []
    for (let i = 0; i < values.length; i++) {
      sample.push(values[Math.floor(random() * values.length)])
    }
    stats.push(statistic(sample))
  }
  stats.sort((a, b) => a - b)
  const alpha = (1 - level) / 2
  return [percentile(stats, alpha), percentile(stats, 1 - alpha)]
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value
}

/**
 * Agreement metrics ระหว่างค่า app กับค่าอ้างอิง (RR/HR/SpO2)
 * @param {Array<{participantId: string, outcome?: 'ok'|'failed'|'abstained', reference: number|null, measured: number|null}>} pairs
 * @param {object} options
 * @param {string} options.unit               หน่วยของค่า (บังคับ — ไม่มี = throw)
 * @param {number} options.acceptableError    เกณฑ์ acceptable error ในหน่วยเดียวกัน (เช่น RR ±2)
 * @returns agreement metrics หรือ {computed:false, reason} เมื่อไม่มีข้อมูลเพียงพอ
 */
export function computeAgreementMetrics(pairs, { unit, acceptableError, bootstrapRuns = 1000, seed = 42 } = {}) {
  assertValidUnit(unit)
  if (!Array.isArray(pairs)) throw new Error('pairs ต้องเป็น array')
  if (pairs.length === 0) {
    return { computed: false, reason: 'empty dataset — ไม่มีคู่การวัด', unit, n: 0, nUsed: 0, nMissingReference: 0, nFailed: 0, nAbstained: 0 }
  }

  const total = pairs.length
  const nFailed = pairs.filter((pair) => pair.outcome === OUTCOME.FAILED).length
  const nAbstained = pairs.filter((pair) => pair.outcome === OUTCOME.ABSTAINED).length
  const usable = pairs.filter((pair) =>
    Number.isFinite(pair.reference) && Number.isFinite(pair.measured))
  const nMissingReference = pairs.filter((pair) => !Number.isFinite(pair.reference)).length

  const result = {
    computed: false,
    unit,
    n: total,
    nUsed: usable.length,
    nMissingReference,
    nFailed,
    nAbstained,
    failureRate: total ? round(nFailed / total) : null,
    abstentionRate: total ? round(nAbstained / total) : null,
  }

  if (usable.length === 0) {
    result.reason = nMissingReference === total
      ? 'all missing — ไม่มีค่าอ้างอิงที่ใช้ได้เลย'
      : 'no usable pairs — ไม่มีคู่ (reference, measured) ที่สมบูรณ์'
    return result
  }

  const errors = usable.map((pair) => pair.measured - pair.reference)
  const absErrors = errors.map(Math.abs)
  const biasCi = bootstrapCi(errors, (sample) => mean(sample), { runs: bootstrapRuns, seed })
  const maeCi = bootstrapCi(absErrors, (sample) => mean(sample), { runs: bootstrapRuns, seed })

  const meanBias = mean(errors)
  const sdDiff = errors.length >= 2 ? sd(errors) : null
  Object.assign(result, {
    computed: true,
    nUsed: usable.length,
    mae: round(mean(absErrors)),
    rmse: round(Math.sqrt(mean(errors.map((value) => value ** 2)))),
    meanBias: round(meanBias),
    medianAbsoluteError: round(median(absErrors)),
    blandAltman: {
      meanBias: round(meanBias),
      limitsOfAgreement: sdDiff !== null
        ? [round(meanBias - 1.96 * sdDiff), round(meanBias + 1.96 * sdDiff)]
        : null,
      note: 'Bland-Altman นี้เป็นระดับการวัดครั้งเดียว — การวัดซ้ำหลายครั้งต่อคนต้องใช้ repeated-measurement LoA ก่อนตีความจริง',
    },
    acceptableErrorPct: Number.isFinite(acceptableError)
      ? round(absErrors.filter((value) => value <= acceptableError).length / absErrors.length)
      : null,
    confidenceInterval: { mae95: maeCi && [round(maeCi[0]), round(maeCi[1])], meanBias95: biasCi && [round(biasCi[0]), round(biasCi[1])] },
    exploratory: usable.length < 30,
    exploratoryNote: usable.length < 30 ? 'n < 30 — Exploratory/Unstable Estimate ห้ามใช้เป็นข้อสรุป' : null,
  })
  return result
}

/**
 * Test-Retest Repeatability — ต้องมีช่วงเวลาระหว่างการวัดซ้ำที่เท่ากัน (±10%)
 * @param {Array<{participantId: string, first: number|null, second: number|null, intervalMs: number}>} repeats
 * @param {object} options { unit, expectedIntervalMs }
 */
export function computeTestRetestRepeatability(repeats, { unit, expectedIntervalMs } = {}) {
  assertValidUnit(unit)
  if (!Array.isArray(repeats) || repeats.length === 0) {
    return { computed: false, reason: 'empty dataset', unit }
  }
  const complete = repeats.filter((item) => Number.isFinite(item.first) && Number.isFinite(item.second))
  if (complete.length === 0) {
    return { computed: false, reason: 'all missing — ไม่มีคู่วัดซ้ำที่สมบูรณ์', unit, n: repeats.length, nUsed: 0 }
  }
  // sampling interval ต้องสม่ำเสมอ — ไม่เท่ากันเกิน 10% ของค่าที่คาดหวัง = ไม่คำนวณ
  const intervals = complete.map((item) => item.intervalMs).filter(Number.isFinite)
  if (!intervals.length) {
    return { computed: false, reason: 'missing intervals — ไม่ได้บันทึกช่วงเวลาระหว่างการวัดซ้ำ', unit, n: repeats.length, nUsed: complete.length }
  }
  if (Number.isFinite(expectedIntervalMs)) {
    const uneven = intervals.filter((interval) => Math.abs(interval - expectedIntervalMs) > expectedIntervalMs * 0.1).length
    if (uneven > 0) {
      return {
        computed: false,
        reason: `unequal sampling intervals — ${uneven}/${intervals.length} คู่มีช่วงห่างไม่ตรงเกณฑ์ ±10% ของ ${expectedIntervalMs}ms`,
        unit, n: repeats.length, nUsed: complete.length,
      }
    }
  }
  const diffs = complete.map((item) => item.second - item.first)
  const withinSubjectSd = sd(diffs)
  const repeatabilityCoefficient = 1.96 * Math.sqrt(2) * withinSubjectSd
  return {
    computed: true,
    unit,
    n: repeats.length,
    nUsed: complete.length,
    nExcluded: repeats.length - complete.length,
    withinSubjectSd: round(withinSubjectSd),
    repeatabilityCoefficient: round(repeatabilityCoefficient),
    meanDifference: round(mean(diffs)),
  }
}

/**
 * Classification metrics (การจัดกลุ่ม เช่น ปกติ/เฝ้าระวัง/ผิดปกติ)
 * @param {Array<{participantId: string, predicted: boolean, reference: boolean, predictedProbability?: number}>} records
 * ROC-AUC / Brier คำนวณเฉพาะเมื่อมี predictedProbability ที่มีความหมายเท่านั้น
 */
export function computeClassificationMetrics(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { computed: false, reason: 'empty dataset' }
  }
  const scored = records.filter((record) => typeof record.predicted === 'boolean' && typeof record.reference === 'boolean')
  if (!scored.length) {
    return { computed: false, reason: 'no scored records', n: records.length }
  }
  const tp = scored.filter((record) => record.predicted && record.reference).length
  const fp = scored.filter((record) => record.predicted && !record.reference).length
  const tn = scored.filter((record) => !record.predicted && !record.reference).length
  const fn = scored.filter((record) => !record.predicted && record.reference).length

  const result = {
    computed: true,
    n: scored.length,
    confusionMatrix: { tp, fp, tn, fn },
  }
  // one-class → ไม่คำนวณ (ไม่ปลอม 100%)
  result.sensitivity = tp + fn > 0 ? round(tp / (tp + fn)) : null
  result.specificity = tn + fp > 0 ? round(tn / (tn + fp)) : null
  result.ppv = tp + fp > 0 ? round(tp / (tp + fp)) : null
  result.npv = tn + fn > 0 ? round(tn / (tn + fn)) : null
  const oneClass = tp + fn === 0 || tn + fp === 0
  if (oneClass) {
    result.oneClassWarning = 'dataset มี class เดียว — sensitivity/specificity/PPV/NPV ตีความไม่ได้ (ดูค่า null)'
  }
  result.exploratory = scored.length < 30
  if (result.exploratory) result.exploratoryNote = 'n < 30 — Exploratory/Unstable Estimate'

  const withProbability = scored.filter((record) => Number.isFinite(record.predictedProbability))
  if (withProbability.length === scored.length && scored.length >= 2 && !oneClass) {
    // ROC-AUC แบบ rank (Mann-Whitney)
    const positives = withProbability.filter((record) => record.reference)
    const negatives = withProbability.filter((record) => !record.reference)
    let rankSum = 0
    for (const positive of positives) {
      for (const negative of negatives) {
        if (positive.predictedProbability > negative.predictedProbability) rankSum += 1
        else if (positive.predictedProbability === negative.predictedProbability) rankSum += 0.5
      }
    }
    result.rocAuc = round(rankSum / (positives.length * negatives.length))
    result.brierScore = round(mean(withProbability.map((record) =>
      (record.predictedProbability - (record.reference ? 1 : 0)) ** 2)))
    result.probabilityNote = 'ROC-AUC/Brier มีความหมายเฉพาะเมื่อ predictedProbability เป็นความน่าจะเป็นที่ calibrated — คะแนน rule-based ของระบบนี้ไม่ใช่ probability'
  }
  return result
}

/**
 * แบ่ง dataset ตาม "บุคคล" (ไม่ใช่ตามเฟรม/เรคคอร์ด) — กัน leakage
 * @param {Array<{participantId: string}>} records
 * @param {object} options { trainRatio=0.6, validationRatio=0.2, seed=42 }
 */
export function splitByParticipant(records, { trainRatio = 0.6, validationRatio = 0.2, seed = 42 } = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('empty dataset — แบ่ง split ไม่ได้')
  const participants = [...new Set(records.map((record) => record.participantId))]
  if (participants.length < 3) {
    throw new Error(`ผู้เข้าร่วมน้อยกว่า 3 คน (${participants.length}) — แบ่ง train/validation/test ตามบุคคลไม่ได้`)
  }
  const random = seededRandom(seed)
  // Fisher-Yates shuffle
  for (let i = participants.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[participants[i], participants[j]] = [participants[j], participants[i]]
  }
  const trainCount = Math.max(1, Math.round(participants.length * trainRatio))
  const valCount = Math.max(1, Math.round(participants.length * validationRatio))
  const train = new Set(participants.slice(0, trainCount))
  const validation = new Set(participants.slice(trainCount, trainCount + valCount))
  const test = new Set(participants.slice(trainCount + valCount))

  const assign = (set) => records.filter((record) => set.has(record.participantId))
  const splits = { train: assign(train), validation: assign(validation), test: assign(test) }
  assertNoParticipantLeakage(splits)
  return {
    splits,
    participantCounts: { train: train.size, validation: validation.size, test: test.size },
    recordCounts: { train: splits.train.length, validation: splits.validation.length, test: splits.test.length },
  }
}

/** Leakage check — participant เดียวกันห้ามอยู่หลาย split (หลายเรคคอร์ดใน split เดียว = ปกติ; throw พร้อมรายชื่อ id ที่รั่ว) */
export function assertNoParticipantLeakage(splits) {
  const participantSplits = new Map()
  const leaks = new Set()
  for (const [splitName, records] of Object.entries(splits)) {
    for (const record of records) {
      const id = record.participantId
      if (!participantSplits.has(id)) participantSplits.set(id, new Set())
      participantSplits.get(id).add(splitName)
    }
  }
  for (const [id, splitNames] of participantSplits) {
    if (splitNames.size > 1) leaks.add(`${id} (${[...splitNames].join(' + ')})`)
  }
  if (leaks.size > 0) {
    throw new Error(`participant leakage — คนเดียวกันอยู่หลาย split: ${[...leaks].join(', ')}`)
  }
  return true
}
