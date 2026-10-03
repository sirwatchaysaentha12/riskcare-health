const EPSILON = 1e-10

function finiteValues(values) {
  return values.filter((value) => Number.isFinite(value))
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function standardDeviation(values) {
  if (!values.length) return null
  const average = mean(values)
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)))
}

function validRuns(series) {
  const runs = []
  let start = -1
  for (let index = 0; index <= series.length; index += 1) {
    if (index < series.length && Number.isFinite(series[index])) {
      if (start < 0) start = index
    } else if (start >= 0) {
      runs.push({ start, values: series.slice(start, index) })
      start = -1
    }
  }
  return runs
}

function interpolateAt(values, position) {
  const left = Math.floor(position)
  const right = Math.ceil(position)
  if (left < 0 || right >= values.length) return null
  if (left === right) return values[left]
  const fraction = position - left
  return values[left] + (values[right] - values[left]) * fraction
}

/** Resample timestamped values onto a uniform grid; long gaps remain null. */
export function resampleSignal(series, actualFps, targetFps) {
  if (!Array.isArray(series) || series.length < 2 || !Number.isFinite(targetFps) || targetFps <= 0) {
    return { series: [], fs: Number.isFinite(targetFps) && targetFps > 0 ? targetFps : 0 }
  }
  const samples = series
    .filter((sample) => sample && Number.isFinite(sample.tMs))
    .map((sample) => ({ tMs: sample.tMs, value: Number.isFinite(sample.value) ? sample.value : null }))
    .sort((a, b) => a.tMs - b.tMs)
  const deltas = samples.slice(1).map((sample, index) => sample.tMs - samples[index].tMs).filter((delta) => delta > 0)
  if (deltas.length === 0) return { series: [], fs: targetFps }
  const measuredFps = 1000 / (mean(deltas) || (1000 / (actualFps || targetFps)))
  const start = samples[0].tMs
  const end = samples[samples.length - 1].tMs
  const count = Math.floor(((end - start) / 1000) * targetFps) + 1
  if (!Number.isFinite(count) || count < 2 || count > 1_000_000) return { series: [], fs: targetFps }
  const output = []
  let cursor = 0
  for (let index = 0; index < count; index += 1) {
    const timestamp = start + (index * 1000) / targetFps
    while (cursor < samples.length - 2 && samples[cursor + 1].tMs < timestamp) cursor += 1
    const left = samples[cursor]
    const right = samples[Math.min(cursor + 1, samples.length - 1)]
    const gap = right.tMs - left.tMs
    const maxGapMs = Math.max(2000 / measuredFps, 2000 / targetFps)
    if (gap <= 0 || gap > maxGapMs || left.value === null || right.value === null) {
      output.push(null)
      continue
    }
    const fraction = Math.max(0, Math.min(1, (timestamp - left.tMs) / gap))
    output.push(left.value + (right.value - left.value) * fraction)
  }
  return { series: output, fs: targetFps }
}

/** Remove a least-squares linear trend while retaining missing samples. */
export function detrend(series) {
  if (!Array.isArray(series)) return []
  const points = series.map((value, index) => ({ index, value })).filter((point) => Number.isFinite(point.value))
  if (points.length < 2) return series.map((value) => (Number.isFinite(value) ? 0 : null))
  const xMean = mean(points.map((point) => point.index))
  const yMean = mean(points.map((point) => point.value))
  const denominator = points.reduce((sum, point) => sum + (point.index - xMean) ** 2, 0)
  const slope = denominator > 0
    ? points.reduce((sum, point) => sum + (point.index - xMean) * (point.value - yMean), 0) / denominator
    : 0
  const intercept = yMean - slope * xMean
  return series.map((value, index) => (Number.isFinite(value) ? value - (intercept + slope * index) : null))
}

function biquad(values, fs, cutoff, kind) {
  const omega = (2 * Math.PI * cutoff) / fs
  const cosine = Math.cos(omega)
  const alpha = Math.sin(omega) / Math.SQRT2 // Butterworth Q for a second-order section.
  let b0; let b1; let b2
  if (kind === 'lowpass') {
    b0 = (1 - cosine) / 2; b1 = 1 - cosine; b2 = b0
  } else {
    b0 = (1 + cosine) / 2; b1 = -(1 + cosine); b2 = b0
  }
  const a0 = 1 + alpha
  const a1 = -2 * cosine
  const a2 = 1 - alpha
  b0 /= a0; b1 /= a0; b2 /= a0
  const normalizedA1 = a1 / a0
  const normalizedA2 = a2 / a0
  const output = new Array(values.length).fill(null)
  let x1 = 0; let x2 = 0; let y1 = 0; let y2 = 0
  for (let index = 0; index < values.length; index += 1) {
    const x0 = values[index]
    if (!Number.isFinite(x0)) {
      x1 = 0; x2 = 0; y1 = 0; y2 = 0
      continue
    }
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - normalizedA1 * y1 - normalizedA2 * y2
    output[index] = Number.isFinite(y0) ? y0 : null
    x2 = x1; x1 = x0; y2 = y1; y1 = y0
  }
  return output
}

/** Butterworth-compatible high-pass and low-pass sections; missing spans stay missing. */
export function bandpassFilter(series, fs, low = 0.1, high = 1.0, order = 4) {
  if (!Array.isArray(series) || !Number.isFinite(fs) || fs <= 0 || low <= 0 || high <= low || high >= fs / 2) {
    return Array.isArray(series) ? series.map(() => null) : []
  }
  const sections = Math.max(1, Math.ceil(order / 2))
  let output = series.map((value) => (Number.isFinite(value) ? value : null))
  for (let section = 0; section < sections; section += 1) output = biquad(output, fs, low, 'highpass')
  for (let section = 0; section < sections; section += 1) output = biquad(output, fs, high, 'lowpass')
  return output
}

function localExtrema(series, fs) {
  const values = series.map((value) => (Number.isFinite(value) ? value : null))
  const scale = standardDeviation(finiteValues(values)) || 0
  const threshold = Math.max(scale * 0.08, EPSILON)
  const minDistance = Math.max(1, Math.floor(fs * 0.8))
  const peaks = []
  const valleys = []
  for (let index = 1; index < values.length - 1; index += 1) {
    if (![values[index - 1], values[index], values[index + 1]].every(Number.isFinite)) continue
    if (values[index] >= values[index - 1] && values[index] > values[index + 1]) peaks.push(index)
    if (values[index] <= values[index - 1] && values[index] < values[index + 1]) valleys.push(index)
  }
  const suppress = (candidates, isPeak) => {
    const selected = []
    for (const candidate of candidates) {
      const prior = selected[selected.length - 1]
      if (prior === undefined || candidate - prior >= minDistance) selected.push(candidate)
      else if ((isPeak && values[candidate] > values[prior]) || (!isPeak && values[candidate] < values[prior])) selected[selected.length - 1] = candidate
    }
    return selected
  }
  return { peaks: suppress(peaks, true), valleys: suppress(valleys, false), threshold }
}

/** Find candidate visible motion cycles, not clinical respiratory events. */
export function detectBreaths(series, fs) {
  if (!Array.isArray(series) || !Number.isFinite(fs) || fs <= 0) return []
  const { peaks, valleys, threshold } = localExtrema(series, fs)
  const breaths = []
  for (let index = 0; index < peaks.length - 1; index += 1) {
    const peakIdx = peaks[index]
    const nextPeak = peaks[index + 1]
    const startIdx = valleys.filter((valley) => valley < peakIdx && valley >= (breaths.at(-1)?.endIdx ?? 0)).at(-1)
    const endIdx = valleys.find((valley) => valley > peakIdx && valley < nextPeak)
    if (startIdx === undefined || endIdx === undefined || endIdx <= peakIdx) continue
    const localMin = Math.min(...series.slice(startIdx, endIdx + 1).filter(Number.isFinite))
    const amplitude = series[peakIdx] - localMin
    if (!Number.isFinite(amplitude) || amplitude < threshold) continue
    breaths.push({
      startIdx,
      peakIdx,
      endIdx,
      tInsp: (peakIdx - startIdx) / fs,
      tExp: (endIdx - peakIdx) / fs,
      amplitude,
      cycleSec: (nextPeak - peakIdx) / fs,
    })
  }
  return breaths
}

export function computeRR(breaths, durationSec) {
  const cycles = Array.isArray(breaths)
    ? breaths.map((breath) => breath?.cycleSec ?? (breath?.tInsp + breath?.tExp)).filter((value) => Number.isFinite(value) && value > 0)
    : []
  if (!cycles.length || !Number.isFinite(durationSec) || durationSec <= 0) {
    return { rrMean: null, rrStd: null, rrMin: null, rrMax: null }
  }
  const rates = cycles.map((cycle) => 60 / cycle)
  return {
    rrMean: mean(rates),
    rrStd: standardDeviation(rates),
    rrMin: Math.min(...rates),
    rrMax: Math.max(...rates),
  }
}

export function computeDutyCycle(breaths) {
  const cycles = Array.isArray(breaths) ? breaths.filter((breath) => Number.isFinite(breath?.tInsp) && Number.isFinite(breath?.tExp) && breath.tInsp + breath.tExp > 0) : []
  if (!cycles.length) return null
  return mean(cycles.map((breath) => breath.tInsp / (breath.tInsp + breath.tExp)))
}

export function computeVariability(breaths) {
  const durations = Array.isArray(breaths) ? breaths.map((breath) => breath?.cycleSec ?? breath?.tInsp + breath?.tExp).filter((value) => Number.isFinite(value) && value > 0) : []
  if (durations.length < 2) return null
  return Math.min(1, (standardDeviation(durations) || 0) / (mean(durations) || 1))
}

function windowAmplitude(values, start, end) {
  const section = finiteValues(values.slice(start, end))
  if (section.length < 2) return null
  const average = mean(section)
  return Math.sqrt(mean(section.map((value) => (value - average) ** 2)))
}

/** Reports candidate low-motion intervals only; thresholds are not clinical criteria. */
export function detectApneaHypopnea(series, fs, breaths = []) {
  if (!Array.isArray(series) || !Number.isFinite(fs) || fs <= 0 || series.length < fs * 6) {
    return { apneaCount: null, hypopneaCount: null }
  }
  const windowSize = Math.max(1, Math.round(fs))
  const amplitudes = []
  for (let start = 0; start < series.length; start += windowSize) {
    amplitudes.push({ start, end: Math.min(series.length, start + windowSize), amplitude: windowAmplitude(series, start, Math.min(series.length, start + windowSize)) })
  }
  const baseline = mean(amplitudes.map((item) => item.amplitude).filter((value) => Number.isFinite(value) && value > EPSILON))
    ?? mean((breaths || []).map((breath) => breath?.amplitude).filter((value) => Number.isFinite(value) && value > EPSILON))
  if (baseline === null) return { apneaCount: 0, hypopneaCount: 0 }
  const candidateWindows = amplitudes.filter((item) => item.amplitude !== null && item.amplitude < baseline * 0.12)
  let apneaCount = 0
  let hypopneaCount = 0
  let runStart = null
  let runEnd = null
  const flush = () => {
    if (runStart === null || runEnd === null) return
    const duration = (runEnd - runStart) / fs
    if (duration >= 10) apneaCount += 1
    else if (duration >= 3) hypopneaCount += 1
    runStart = null; runEnd = null
  }
  for (const item of amplitudes) {
    const isLow = item.amplitude !== null && item.amplitude < baseline * 0.12
    if (isLow && (runEnd === null || item.start <= runEnd)) {
      if (runStart === null) runStart = item.start
      runEnd = item.end
    } else {
      flush()
    }
  }
  flush()
  return { apneaCount, hypopneaCount }
}

function bandEnergyRatio(series, fs) {
  const values = finiteValues(series)
  if (values.length < 4) return null
  const centered = values.map((value) => value - (mean(values) || 0))
  const total = centered.reduce((sum, value) => sum + value * value, 0)
  if (total <= EPSILON) return 0
  const n = Math.min(centered.length, 4096)
  let inBand = 0
  for (let bin = 1; bin < Math.floor(n / 2); bin += 1) {
    const frequency = (bin * fs) / n
    if (frequency < 0.1 || frequency > 1.0) continue
    let real = 0; let imaginary = 0
    for (let index = 0; index < n; index += 1) {
      const angle = (2 * Math.PI * bin * index) / n
      real += centered[index] * Math.cos(angle)
      imaginary -= centered[index] * Math.sin(angle)
    }
    inBand += real * real + imaginary * imaginary
  }
  let allBins = 0
  for (let bin = 1; bin < Math.floor(n / 2); bin += 1) {
    let real = 0; let imaginary = 0
    for (let index = 0; index < n; index += 1) {
      const angle = (2 * Math.PI * bin * index) / n
      real += centered[index] * Math.cos(angle)
      imaginary -= centered[index] * Math.sin(angle)
    }
    allBins += real * real + imaginary * imaginary
  }
  return allBins > EPSILON ? Math.max(0, Math.min(1, inBand / allBins)) : 0
}

export function computeSignalQuality(series, fs, breaths = []) {
  if (!Array.isArray(series) || !Number.isFinite(fs) || fs <= 0 || series.length < Math.max(8, fs * 3)) return null
  const missingRatio = 1 - finiteValues(series).length / series.length
  const energyRatio = bandEnergyRatio(series, fs)
  if (energyRatio === null) return null
  const amplitudes = (breaths || []).map((breath) => breath?.amplitude).filter((value) => Number.isFinite(value) && value > 0)
  const regularity = amplitudes.length > 1
    ? Math.max(0, 1 - Math.min(1, (standardDeviation(amplitudes) || 0) / (mean(amplitudes) || 1)))
    : 0
  return Math.max(0, Math.min(1, energyRatio * (0.75 + 0.25 * regularity) * (1 - missingRatio)))
}

function emptyRoiResult(reason) {
  return {
    respiratory_rate: null,
    respiratory_rate_std: null,
    respiratory_rate_min: null,
    respiratory_rate_max: null,
    duty_cycle: null,
    variability: null,
    apnea_count: null,
    hypopnea_count: null,
    signal_quality: null,
    breaths: [],
    duration_sec: Number.isFinite(reason.durationSec) ? reason.durationSec : null,
    unavailable_reason: { chest: reason.message },
    multi_roi: {
      chest_neck_phase_diff_sec: null,
      chest_abdomen_phase_diff_sec: null,
      left_right_asymmetry: null,
      unavailable_reason: 'Requires synchronized, independently measured ROIs.',
    },
  }
}

export function extractFeatures(rois = {}, durationSec) {
  const chest = Array.isArray(rois?.chest) ? rois.chest : []
  if (chest.length < 8) return emptyRoiResult({ durationSec, message: 'Insufficient chest ROI samples.' })
  const deltas = chest.slice(1).map((sample, index) => sample.tMs - chest[index].tMs).filter((delta) => Number.isFinite(delta) && delta > 0)
  if (deltas.length < 2) return emptyRoiResult({ durationSec, message: 'Insufficient timestamp information.' })
  const measuredFps = 1000 / (mean(deltas) || 1)
  const targetFps = Math.min(15, measuredFps)
  const resampled = resampleSignal(chest, measuredFps, targetFps)
  const processed = bandpassFilter(detrend(resampled.series), resampled.fs)
  const breaths = detectBreaths(processed, resampled.fs)
  const rr = computeRR(breaths, durationSec)
  const motionPause = detectApneaHypopnea(processed, resampled.fs, breaths)
  const availableRois = ['chest', 'neck', 'abdomen'].filter((key) => Array.isArray(rois[key]) && rois[key].length > 0)
  const unavailableReason = availableRois.length < 2 ? 'At least two independently measured ROIs are required.' : null
  return {
    respiratory_rate: rr.rrMean,
    respiratory_rate_std: rr.rrStd,
    respiratory_rate_min: rr.rrMin,
    respiratory_rate_max: rr.rrMax,
    duty_cycle: computeDutyCycle(breaths),
    variability: computeVariability(breaths),
    apnea_count: motionPause.apneaCount,
    hypopnea_count: motionPause.hypopneaCount,
    signal_quality: computeSignalQuality(processed, resampled.fs, breaths),
    breaths,
    duration_sec: Number.isFinite(durationSec) ? durationSec : null,
    unavailable_reason: unavailableReason ? { multi_roi: unavailableReason } : {},
    multi_roi: {
      chest_neck_phase_diff_sec: null,
      chest_abdomen_phase_diff_sec: null,
      left_right_asymmetry: null,
      unavailable_reason: unavailableReason,
    },
  }
}
