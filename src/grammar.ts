import type { SupabaseClient } from '@supabase/supabase-js'
import { BLANK, dayStart, rng, shuffled } from './vocab'

// Тренер грамматики (Standard English Conventions; первый навык — Boundaries): типы, выбор
// упражнения и запросы в Supabase. Схема и правила ступеней — блок «Тренер грамматики» в
// supabase/schema.sql. Единица тренировки — правило; упражнения — свои предложения в формате SAT.

export { BLANK }

/** Вариант ответа: текст на месте пропуска, почему он верен или неверен, метка ловушки. */
export interface GrammarOption {
  text: string
  why: string
  /** Ловушка неверного варианта (ключ TRAPS); у верного — пусто */
  trap?: string
}

export interface GrammarItem {
  id: string
  /** Текст с пропуском (BLANK) */
  text: string
  options: GrammarOption[]
  /** Индекс верного варианта */
  answer: number
  /** Что слева и справа от пропуска (ключ STRUCTURES[skill]); пусто — шаг не показывается */
  structure?: string
  /** 1 — лёгкое, 2 — среднее, 3 — трудное */
  level: number
  /** Общий разбор после ответа */
  note?: string
}

export interface GrammarExample {
  text: string
  ok: boolean
  note?: string
}

export interface GrammarRule {
  id: string
  skill: string
  title: string
  summary: string
  /** Объяснение: абзацы через пустую строку */
  body: string
  examples: GrammarExample[]
  tip: string
  items: GrammarItem[]
  rank?: number
}

/** Правило к повторению вместе с прогрессом ученика. */
export interface SessionRule extends GrammarRule {
  stage: number
  reps: number
  /** id последних показанных упражнений, свежие первыми */
  recent: string[]
}

export interface GrammarSession {
  student: string | null
  new_per_day: number
  due: SessionRule[]
  fresh: GrammarRule[]
  stats: { total: number; started: number; known: number; reviews_today: number; streak: number }
}

/** intro — карточка правила; warmup — разминка после неё (ступень не меняет); cued — правило подписано; sat — как на экзамене */
export type GrammarExercise = 'intro' | 'warmup' | 'cued' | 'sat'

export const MAX_STAGE = 7
/** Со скольки ступеней правило считается освоенным */
export const KNOWN_STAGE = 5
/** Через сколько дней показывать правило на ступени (индекс = ступень) */
export const STAGE_DAYS = [0, 0, 1, 3, 7, 16, 35, 70]
/** С этой ступени правило не подписано, и сначала нужно определить структуру вокруг пропуска */
export const STRUCTURE_STAGE = 3

/** Ступень после ответа — то же правило, что в SQL-функции grammar_review (и у словаря). */
export function nextStage(stage: number, correct: boolean): number {
  if (correct) return Math.min(MAX_STAGE, stage + 1)
  return stage <= 3 ? 1 : stage - 2
}

export const SKILL_TITLES: Record<string, string> = {
  boundaries: 'Boundaries',
  'form-structure-sense': 'Form, Structure, and Sense',
  transitions: 'Transitions',
}

/** Варианты шага «что слева и справа от пропуска?» — по навыкам. */
export const STRUCTURES: Record<string, { id: string; label: string }[]> = {
  boundaries: [
    { id: 'two-clauses', label: 'Два полных предложения' },
    { id: 'partial', label: 'Полное предложение + неполная часть (оборот или зависимая часть)' },
    { id: 'explain', label: 'Полное предложение → пояснение, список или пример' },
    { id: 'insert', label: 'Вставка внутри предложения — её можно вычеркнуть' },
    { id: 'essential', label: 'Части, которые нельзя разделять (подлежащее и сказуемое, звание и имя…)' },
  ],
}

/** Ловушки: метка → как её назвать репетитору и ученику. */
export const TRAPS: Record<string, string> = {
  'comma-splice': 'Comma splice — одна запятая между полными предложениями',
  'run-on': 'Run-on — полные предложения слиты без знака или союз без запятой',
  fragment: 'Фрагмент — точка или «;» отрезают неполную часть',
  'missing-comma': 'Не хватает запятой (после вводной части или перед вставкой)',
  'missing-punct': 'Не хватает знака на границе (перед списком или пояснением)',
  'extra-punct': 'Лишний знак между частями, которые нельзя разделять',
  unpaired: 'Вставка открыта и не закрыта (или закрыта другим знаком)',
  'false-insert': 'Обязательная часть выделена как вставка',
  'that-comma': 'That после запятой: that-часть не выделяется запятыми',
  'semicolon-misuse': '«;» без полного предложения с одной из сторон',
  'colon-misuse': 'Двоеточие или тире после неполного предложения',
  'adverb-comma': 'Связка (however, therefore…) между предложениями — только с запятыми',
  'adverb-side': 'Связка отнесена не к тому предложению',
  'double-conj': 'Лишний союз или знак вместе с союзом',
  series: 'Перечисление разделено не теми знаками',
  question: 'Путаница прямого и косвенного вопроса',
}

export const trapLabel = (trap: string) => TRAPS[trap] ?? trap

// --- Упражнения --------------------------------------------------------------------

export interface Exercise {
  kind: Exclude<GrammarExercise, 'intro'>
  item: GrammarItem
  /** Варианты в порядке показа и индекс верного */
  options: GrammarOption[]
  answer: number
  /** Шаг «что слева и справа»: варианты и индекс верного */
  structure?: { options: { id: string; label: string }[]; answer: number }
}

/** Насколько упражнение подходит ступени: 0 — в самый раз. */
function levelMiss(level: number, stage: number): number {
  const want = stage <= 2 ? 1 : stage <= 4 ? 2 : 3
  return Math.abs((level || 2) - want)
}

/**
 * Выбирает упражнение правила: сначала ещё не виденные, затем подходящие ступени по трудности,
 * затем давно виденные. Упражнения этой сессии не повторяются, пока есть другие.
 */
export function pickItem(rule: GrammarRule, stage: number, recent: string[], used: Set<string>, seed: number): GrammarItem | null {
  const items = rule.items.filter((i) => i.options.length >= 2)
  if (!items.length) return null
  const fresh = items.filter((i) => !used.has(i.id))
  const pool = fresh.length ? fresh : items
  const rand = rng(seed)
  const key = (i: GrammarItem) => {
    const seen = recent.indexOf(i.id)
    return [seen === -1 ? 0 : 1, levelMiss(i.level, stage), seen === -1 ? 0 : recent.length - seen]
  }
  const ranked = shuffled(pool, rand).sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
  })
  return ranked[0]
}

export function buildExercise(rule: GrammarRule, item: GrammarItem, kind: Exercise['kind'], seed: number): Exercise {
  const rand = rng(seed)
  const order = shuffled(
    item.options.map((_, i) => i),
    rand,
  )
  const options = order.map((i) => item.options[i])
  const answer = order.indexOf(item.answer)
  const list = STRUCTURES[rule.skill]
  const structureAnswer = list && item.structure ? list.findIndex((s) => s.id === item.structure) : -1
  return {
    kind,
    item,
    options,
    answer,
    ...(kind === 'sat' && list && structureAnswer >= 0 && { structure: { options: list, answer: structureAnswer } }),
  }
}

/** Вид упражнения на ступени: до STRUCTURE_STAGE правило подписано. */
export const exerciseKind = (stage: number): 'cued' | 'sat' => (stage < STRUCTURE_STAGE ? 'cued' : 'sat')

// --- Файл импорта ------------------------------------------------------------------

/** Приводит запись из файла импорта к GrammarRule; null — если нет id, названия или упражнений. */
export function parseGrammarRule(value: unknown): GrammarRule | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
  const arr = (x: unknown) => (Array.isArray(x) ? x : [])
  const id = str(v.id)
  const title = str(v.title)
  if (!id || !title) return null
  const items: GrammarItem[] = arr(v.items).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    const text = str(r.text)
    const options = arr(r.options).flatMap((o: unknown) => {
      if (!o || typeof o !== 'object') return []
      const x = o as Record<string, unknown>
      const t = typeof x.text === 'string' ? x.text : ''
      return t.trim() ? [{ text: t, why: str(x.why), ...(str(x.trap) && { trap: str(x.trap) }) }] : []
    })
    const answer = typeof r.answer === 'number' ? Math.round(r.answer) : -1
    if (!str(r.id) || !text.includes(BLANK) || options.length < 2 || answer < 0 || answer >= options.length) return []
    const level = typeof r.level === 'number' ? Math.min(3, Math.max(1, Math.round(r.level))) : 2
    return [
      {
        id: str(r.id),
        text,
        options,
        answer,
        level,
        ...(str(r.structure) && { structure: str(r.structure) }),
        ...(str(r.note) && { note: str(r.note) }),
      },
    ]
  })
  if (!items.length) return null
  const examples: GrammarExample[] = arr(v.examples).flatMap((e: unknown) => {
    if (!e || typeof e !== 'object') return []
    const x = e as Record<string, unknown>
    return str(x.text) ? [{ text: str(x.text), ok: x.ok !== false, ...(str(x.note) && { note: str(x.note) }) }] : []
  })
  return {
    id,
    skill: str(v.skill) || 'boundaries',
    title,
    summary: str(v.summary),
    body: str(v.body),
    examples,
    tip: str(v.tip),
    items,
    rank: typeof v.rank === 'number' && Number.isFinite(v.rank) ? Math.round(v.rank) : 0,
  }
}

// --- Supabase ----------------------------------------------------------------------

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Загружает правила пачками (upsert по id). */
export async function uploadGrammarRules(
  sb: SupabaseClient,
  rules: GrammarRule[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const CHUNK = 20
  for (let i = 0; i < rules.length; i += CHUNK) {
    check(await sb.from('grammar_rules').upsert(rules.slice(i, i + CHUNK)))
    onProgress?.(Math.min(i + CHUNK, rules.length), rules.length)
  }
}

export interface GrammarEnrollment {
  id: string
  token: string
  newPerDay: number
}

interface EnrollmentRow {
  id: string
  token: string
  new_per_day: number
}

const ENROLLMENT_COLS = 'id, token, new_per_day'
const rowToEnrollment = (r: EnrollmentRow): GrammarEnrollment => ({ id: r.id, token: r.token, newPerDay: r.new_per_day })

export async function getGrammarEnrollment(sb: SupabaseClient, studentId: string): Promise<GrammarEnrollment | null> {
  const data = check(await sb.from('grammar_enrollments').select(ENROLLMENT_COLS).eq('student_id', studentId).maybeSingle())
  return data ? rowToEnrollment(data as EnrollmentRow) : null
}

export async function createGrammarEnrollment(sb: SupabaseClient, studentId: string): Promise<GrammarEnrollment> {
  const data = check(await sb.from('grammar_enrollments').insert({ student_id: studentId }).select(ENROLLMENT_COLS).single())
  return rowToEnrollment(data as EnrollmentRow)
}

export async function setGrammarNewPerDay(sb: SupabaseClient, id: string, newPerDay: number): Promise<void> {
  check(await sb.from('grammar_enrollments').update({ new_per_day: newPerDay }).eq('id', id))
}

export interface GrammarStats {
  rules_total: number
  started: number
  known: number
  due: number
  last_reviewed_at: string | null
  days: { day: string; reviews: number; correct: number; intro: number; ms: number }[]
  /** Все правила по порядку; у неначатых stage = null */
  rules: { id: string; skill: string; title: string; stage: number | null; due_at: string | null; lapses: number | null; reps: number | null }[]
  /** Ловушки за 30 дней */
  traps: { trap: string; n: number }[]
  /** Шаг «что слева и справа» за 30 дней */
  structure: { total: number; correct: number }
}

export async function fetchGrammarStats(sb: SupabaseClient, studentId: string): Promise<GrammarStats> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return check(await sb.rpc('grammar_stats', { p_student_id: studentId, p_tz: tz })) as GrammarStats
}

/** Постоянная ссылка ученика на тренер грамматики. */
export function grammarUrl(token: string): string {
  const base = window.location.href.split('#')[0]
  return `${base}#/grammar/${token}`
}

// --- Ученик (без входа, по токену) -------------------------------------------------

export interface GrammarAnswer {
  ruleId: string
  itemId: string
  exercise: GrammarExercise
  correct: boolean
  trap?: string
  /** Шаг «что слева и справа»: undefined — шага не было */
  structureOk?: boolean
  ms: number
}

/** Источник данных тренера: облако по токену или демо в браузере. */
export interface GrammarBackend {
  session(): Promise<GrammarSession | null>
  review(answer: GrammarAnswer): Promise<void>
}

export function grammarCloudBackend(sb: SupabaseClient, token: string): GrammarBackend {
  return {
    async session() {
      const data = check(await sb.rpc('grammar_session', { p_token: token, p_day_start: dayStart().toISOString() }))
      return (data as GrammarSession | null) ?? null
    },
    async review(a) {
      check(
        await sb.rpc('grammar_review', {
          p_token: token,
          p_rule_id: a.ruleId,
          p_item_id: a.itemId,
          p_exercise: a.exercise,
          p_correct: a.correct,
          p_trap: a.trap ?? null,
          p_structure_ok: a.structureOk ?? null,
          p_ms: Math.max(0, Math.round(a.ms)),
        }),
      )
    },
  }
}
