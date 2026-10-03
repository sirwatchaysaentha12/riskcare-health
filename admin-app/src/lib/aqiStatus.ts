type AqiRange = {
  max: number
  tone: 'green' | 'lime' | 'yellow' | 'orange' | 'red'
  textColor: string
  background: string
}

export const AQI_RANGES: AqiRange[] = [
  { max: 50, tone: 'green', textColor: '#FFFFFF', background: '#10B981' },
  { max: 100, tone: 'lime', textColor: '#1E293B', background: '#A3E635' },
  { max: 150, tone: 'yellow', textColor: '#1E293B', background: '#FACC15' },
  { max: 200, tone: 'orange', textColor: '#FFFFFF', background: '#F97316' },
  { max: Infinity, tone: 'red', textColor: '#FFFFFF', background: '#EF4444' },
]

const PM25_BREAKPOINTS: [number, number, number, number][] = [
  [0, 9, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
]

export function pm25ToAqi(pm25Value: number): number | null {
  const pm25 = Number(pm25Value)
  if (!Number.isFinite(pm25) || pm25 < 0) return null
  const [lowC, highC, lowI, highI] = PM25_BREAKPOINTS.find(
    ([low, high]) => pm25 >= low && pm25 <= high,
  ) || PM25_BREAKPOINTS.at(-1)!
  return Math.round(((highI - lowI) / (highC - lowC)) * (Math.min(pm25, highC) - lowC) + lowI)
}

function getAqiTone(pm25Value: number): AqiRange['tone'] | 'pending' {
  const aqi = pm25ToAqi(pm25Value)
  if (aqi === null) return 'pending'
  return AQI_RANGES.find((range) => aqi <= range.max)?.tone || 'red'
}

export function getAqiEmoji(pm25Value: number): string {
  switch (getAqiTone(pm25Value)) {
    case 'green': return '\u{1F642}'
    case 'lime': return '\u{1F610}'
    case 'yellow': return '\u{1F610}'
    case 'orange': return '\u{1F641}'
    case 'red': return '\u{1F61F}'
    default: return '-'
  }
}

export function getAqiColorClass(pm25Value: number): string {
  switch (getAqiTone(pm25Value)) {
    case 'green': return 'bg-emerald-500 text-white'
    case 'lime': return 'bg-lime-400 text-slate-900'
    case 'yellow': return 'bg-yellow-400 text-slate-900'
    case 'orange': return 'bg-orange-500 text-white'
    case 'red': return 'bg-red-500 text-white'
    default: return 'bg-slate-200 text-slate-600'
  }
}
