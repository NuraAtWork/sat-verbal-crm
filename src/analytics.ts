import type { SupabaseClient } from '@supabase/supabase-js'
import { SKILLS } from './sat'
import type { Assignment, Material } from './types'

// Аналитика по навыкам из результатов сданных заданий (только облачный режим).
//
// Навык вопроса: собственное поле вопроса (`skill: string` или `skills: [один]`), иначе — навык сета,
// если он у сета ровно один. Вопросы без однозначного навыка в разбивку по навыкам не попадают,
// но учитываются в общей точности и показываются отдельным числом.

/** Минимум вопросов по навыку, чтобы делать выводы (≈ половина сета). */
export const MIN_SAMPLE = 10
/** Точность ниже — «слабый навык» (при достаточной выборке). */
export const WEAK_BELOW = 0.7
/** Точность от этого значения — «сильный навык». */
export const STRONG_FROM = 0.85
/** Динамика: минимум вопросов в ранней и в поздней половине. */
export const TREND_MIN_HALF = 5
/** Динамика: изменение меньше этого (в долях) считается «без изменений». */
export const TREND_FLAT = 0.1

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { Easy: 'Лёгкие', Medium: 'Средние', Hard: 'Сложные' }

export interface Tally {
  total: number
  correct: number
  skipped: number
  timeSec: number
}

export interface Trend {
  early: number
  late: number
  earlyN: number
  lateN: number
  /** late − early, в долях */
  delta: number
  direction: 'up' | 'down' | 'flat'
}

/** none — не решал; few — мало данных; weak / ok / strong — при выборке ≥ MIN_SAMPLE. */
export type SkillLevel = 'none' | 'few' | 'weak' | 'ok' | 'strong'

export interface SkillStats extends Tally {
  skillId: string
  byDifficulty: Record<Difficulty, Tally>
  level: SkillLevel
  trend: Trend | null
  /** Сколько сданных заданий затронули навык */
  assignments: number
}

export interface Analytics {
  /** Сданных заданий с результатами */
  submitted: number
  overall: Tally
  overallByDifficulty: Record<Difficulty, Tally>
  overallTrend: Trend | null
  skills: Map<string, SkillStats>
  /** Вопросов без однозначного навыка (не вошли в разбивку) */
  unattributed: number
}

/** Минимум данных о вопросе, нужный для аналитики (без текста вопросов). */
export interface QuestionMeta {
  n: number
  difficulty?: string
  /** Навык самого вопроса (может появиться у пробных тестов) */
  skill?: string
  skills?: string[]
}

export interface SetMeta {
  id: string
  skills: string[]
  questions: QuestionMeta[]
}

export const emptyTally = (): Tally => ({ total: 0, correct: 0, skipped: 0, timeSec: 0 })
const emptyByDifficulty = (): Record<Difficulty, Tally> => ({
  Easy: emptyTally(),
  Medium: emptyTally(),
  Hard: emptyTally(),
})

export const accuracy = (t: Tally): number | null => (t.total ? t.correct / t.total : null)
export const skipRate = (t: Tally): number | null => (t.total ? t.skipped / t.total : null)
export const avgTime = (t: Tally): number | null => (t.total ? t.timeSec / t.total : null)

const SKILL_IDS = new Set(SKILLS.map((s) => s.id))

function normDifficulty(raw: unknown): Difficulty | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  return DIFFICULTIES.find((d) => d.toLowerCase() === v) ?? null
}

/** Однозначный навык из списка: ровно один известный id, иначе null. */
function single(list: unknown): string | null {
  if (!Array.isArray(list)) return null
  const ids = [...new Set(list.filter((x): x is string => typeof x === 'string' && SKILL_IDS.has(x)))]
  return ids.length === 1 ? ids[0] : null
}

export function questionSkill(q: QuestionMeta | undefined, setSkills: string[]): string | null {
  if (q) {
    if (typeof q.skill === 'string' && SKILL_IDS.has(q.skill)) return q.skill
    const own = single(q.skills)
    if (own) return own
  }
  return single(setSkills)
}

function add(t: Tally, correct: boolean, skipped: boolean, time: number) {
  t.total += 1
  if (correct) t.correct += 1
  if (skipped) t.skipped += 1
  t.timeSec += Number.isFinite(time) ? Math.max(0, time) : 0
}

/** Ранние задания против поздних (по дате сдачи), делим по половине объёма вопросов. */
function trendOf(perAssignment: Tally[]): Trend | null {
  const items = perAssignment.filter((t) => t.total > 0)
  if (items.length < 2) return null
  const totalN = items.reduce((s, t) => s + t.total, 0)
  const early = emptyTally()
  const late = emptyTally()
  let seen = 0
  items.forEach((t, i) => {
    // Первое задание всегда раннее, последнее — всегда позднее.
    const isEarly = i === 0 || (i < items.length - 1 && seen + t.total / 2 <= totalN / 2)
    const dst = isEarly ? early : late
    dst.total += t.total
    dst.correct += t.correct
    seen += t.total
  })
  if (early.total < TREND_MIN_HALF || late.total < TREND_MIN_HALF) return null
  const e = early.correct / early.total
  const l = late.correct / late.total
  const delta = l - e
  return {
    early: e,
    late: l,
    earlyN: early.total,
    lateN: late.total,
    delta,
    direction: Math.abs(delta) < TREND_FLAT ? 'flat' : delta > 0 ? 'up' : 'down',
  }
}

function levelOf(t: Tally): SkillLevel {
  if (t.total === 0) return 'none'
  if (t.total < MIN_SAMPLE) return 'few'
  const acc = t.correct / t.total
  return acc < WEAK_BELOW ? 'weak' : acc >= STRONG_FROM ? 'strong' : 'ok'
}

/**
 * Считает аналитику по сданным заданиям.
 * sets — метаданные сетов (вопросы без текста); fallbackSkills — навыки сета из материалов,
 * если сет не загрузился.
 */
export function computeAnalytics(
  assignments: Assignment[],
  sets: Map<string, SetMeta>,
  fallbackSkills: (setId: string) => string[] = () => [],
): Analytics {
  const done = assignments
    .filter((a) => a.submittedAt && a.results && a.results.length > 0)
    .sort((a, b) => (a.submittedAt! < b.submittedAt! ? -1 : 1))

  const overall = emptyTally()
  const overallByDifficulty = emptyByDifficulty()
  const overallPer: Tally[] = []
  const skillTally = new Map<string, Tally>()
  const skillDiff = new Map<string, Record<Difficulty, Tally>>()
  const skillPer = new Map<string, Tally[]>()
  let unattributed = 0

  for (const a of done) {
    const meta = sets.get(a.setId)
    const setSkills = meta?.skills ?? fallbackSkills(a.setId)
    const byN = new Map((meta?.questions ?? []).map((q) => [q.n, q]))
    const thisAll = emptyTally()
    const thisSkill = new Map<string, Tally>()

    for (const r of a.results!) {
      const q = byN.get(r.n)
      const skipped = !r.answer
      const correct = !!r.is_correct
      const time = Number(r.time_sec) || 0
      const diff = normDifficulty(q?.difficulty)
      add(overall, correct, skipped, time)
      add(thisAll, correct, skipped, time)
      if (diff) add(overallByDifficulty[diff], correct, skipped, time)

      const skill = questionSkill(q, setSkills)
      if (!skill) {
        unattributed += 1
        continue
      }
      if (!skillTally.has(skill)) {
        skillTally.set(skill, emptyTally())
        skillDiff.set(skill, emptyByDifficulty())
        skillPer.set(skill, [])
      }
      add(skillTally.get(skill)!, correct, skipped, time)
      if (diff) add(skillDiff.get(skill)![diff], correct, skipped, time)
      if (!thisSkill.has(skill)) thisSkill.set(skill, emptyTally())
      add(thisSkill.get(skill)!, correct, skipped, time)
    }

    overallPer.push(thisAll)
    for (const [skill, t] of thisSkill) skillPer.get(skill)!.push(t)
  }

  const skills = new Map<string, SkillStats>()
  for (const s of SKILLS) {
    const t = skillTally.get(s.id) ?? emptyTally()
    const per = skillPer.get(s.id) ?? []
    skills.set(s.id, {
      ...t,
      skillId: s.id,
      byDifficulty: skillDiff.get(s.id) ?? emptyByDifficulty(),
      level: levelOf(t),
      trend: trendOf(per),
      assignments: per.length,
    })
  }

  return {
    submitted: done.length,
    overall,
    overallByDifficulty,
    overallTrend: trendOf(overallPer),
    skills,
    unattributed,
  }
}

// --- Что задать дальше ----------------------------------------------------------

export interface Recommendation {
  skillId: string
  material: Material
  reason: string
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/**
 * До `count` сетов по самым слабым навыкам, которые ученик ещё не получал (по одному на навык).
 * Порядок навыков: слабые (по возрастанию точности) → мало данных → не решал → средние.
 * Сильные навыки не предлагаются.
 */
export function recommendSets(
  analytics: Analytics,
  materials: Material[],
  assignedSetIds: Set<string>,
  count = 3,
): Recommendation[] {
  const stats = [...analytics.skills.values()]
  const byAcc = (a: SkillStats, b: SkillStats) => a.correct / a.total - b.correct / b.total
  const ordered = [
    ...stats.filter((s) => s.level === 'weak').sort(byAcc),
    ...stats.filter((s) => s.level === 'few').sort(byAcc),
    ...stats.filter((s) => s.level === 'none'),
    ...stats.filter((s) => s.level === 'ok').sort(byAcc),
  ]

  const candidates = materials
    .filter((m) => m.setId && !assignedSetIds.has(m.setId))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }))

  const out: Recommendation[] = []
  for (const s of ordered) {
    if (out.length >= count) break
    const m = candidates.find((c) => single(c.skills) === s.skillId)
    if (!m) continue
    const reason =
      s.level === 'none'
        ? 'ещё не решал'
        : s.level === 'few'
          ? `мало данных: ${s.correct}/${s.total}`
          : `точность ${pct(s.correct / s.total)} на ${s.total} вопр.`
    out.push({ skillId: s.skillId, material: m, reason })
  }
  return out
}

// --- Загрузка метаданных сетов ---------------------------------------------------

/** Кэш на время сессии: id сета → навыки и (номер, сложность, навык) вопросов. */
const metaCache = new Map<string, SetMeta>()

function toMeta(row: { id: string; skills: unknown; questions: unknown }): SetMeta {
  const qs = Array.isArray(row.questions) ? (row.questions as Record<string, unknown>[]) : []
  return {
    id: row.id,
    skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
    questions: qs.map((q) => ({
      n: Number(q.n),
      difficulty: typeof q.difficulty === 'string' ? q.difficulty : undefined,
      skill: typeof q.skill === 'string' ? q.skill : undefined,
      skills: Array.isArray(q.skills) ? (q.skills as string[]) : undefined,
    })),
  }
}

/** Метаданные нужных сетов: из кэша, недостающие — одним запросом. Текст вопросов не хранится. */
export async function loadSetMeta(sb: SupabaseClient, ids: string[]): Promise<Map<string, SetMeta>> {
  const missing = [...new Set(ids)].filter((id) => !metaCache.has(id))
  if (missing.length) {
    const res = await sb.from('question_sets').select('id, skills, questions').in('id', missing)
    if (res.error) throw new Error(res.error.message)
    for (const row of res.data ?? []) {
      const meta = toMeta(row as { id: string; skills: unknown; questions: unknown })
      metaCache.set(meta.id, meta)
    }
  }
  const out = new Map<string, SetMeta>()
  for (const id of ids) {
    const m = metaCache.get(id)
    if (m) out.set(id, m)
  }
  return out
}

/** Сбросить кэш (например, после редактирования сета). */
export function clearSetMetaCache(id?: string) {
  if (id) metaCache.delete(id)
  else metaCache.clear()
}
