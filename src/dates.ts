/** Сегодняшняя дата в локальном часовом поясе, формат YYYY-MM-DD. */
export function today(): string {
  return toIsoDate(new Date())
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** «17 дек.»; год — только если он не текущий: «14 янв. 2027» (без канцелярского «г.»). */
export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = parseIso(iso)
  const otherYear = d.getFullYear() !== new Date().getFullYear()
  return d
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(otherYear && { year: 'numeric' }) })
    .replace(/\s*г\.$/, '')
}

/** То же для момента времени (ISO с часами) — по локальной дате. */
export function formatTimestamp(ts: string): string {
  return ts ? formatDate(toIsoDate(new Date(ts))) : '—'
}

/** Сколько дней от сегодня до даты (отрицательное — дата в прошлом). */
export function daysUntil(iso: string): number {
  const ms = parseIso(iso).getTime() - parseIso(today()).getTime()
  return Math.round(ms / 86_400_000)
}

/** Русское склонение: plural(5, 'тест', 'теста', 'тестов') → 'тестов'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export function pluralDays(n: number): string {
  return plural(n, 'день', 'дня', 'дней')
}

export function describeExam(iso: string): string {
  if (!iso) return '—'
  const n = daysUntil(iso)
  if (n === 0) return 'сегодня'
  if (n > 0) return `через ${n} ${pluralDays(n)}`
  return `прошёл ${-n} ${pluralDays(n)} назад`
}
