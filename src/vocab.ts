import type { SupabaseClient } from '@supabase/supabase-js'

// Тренер словаря (Words in Context): типы, логика упражнений и запросы в Supabase.
// Схема и правила ступеней — блок «Тренер словаря» в supabase/schema.sql.

/** Маркер пропуска в тексте контекста. */
export const BLANK = '____'
/** За столько дней до экзамена тренер перестаёт вводить новые слова (то же число — в vocab_session, SQL). */
export const EXAM_QUIET_DAYS = 2

export interface VocabContext {
  /** Предложение или отрывок с пропуском (BLANK) на месте слова */
  text: string
  /** Форма слова для пропуска, если отличается от заглавной (corroborates vs corroborate) */
  answer?: string
  /** Неверные варианты — близкие по смыслу слова */
  distractors: string[]
  /** Почему подходит именно это слово */
  note?: string
}

export type Connotation = '' | 'positive' | 'negative' | 'neutral'

export interface VocabWord {
  id: string
  word: string
  /** noun / verb / adj / adv или пусто */
  pos: string
  definition: string
  translation: string
  connotation: Connotation
  contexts: VocabContext[]
  confusables: string[]
  deck: string
  /** Порядок введения новых слов (меньше — раньше) */
  rank?: number
  /** Формы слова в нижнем регистре: по ним слово узнают в вариантах ответа и в тексте */
  forms?: string[]
}

/** Слово в сессии ученика вместе с его прогрессом. */
export interface SessionWord extends VocabWord {
  stage: number
  reps: number
}

export interface PoolWord {
  word: string
  pos: string
  definition: string
}

export interface GlossaryEntry {
  word: string
  definition: string
  translation: string
}

export interface VocabSession {
  student: string | null
  new_per_day: number
  /** Слова, которые пора повторить */
  due: SessionWord[]
  /** Новые слова на сегодня */
  fresh: VocabWord[]
  /** Случайные слова словаря — материал для неверных вариантов */
  pool: PoolWord[]
  /** Значения слов-дистракторов по форме в нижнем регистре — для пояснений после ответа */
  glossary?: Record<string, GlossaryEntry>
  stats: { total: number; started: number; known: number; reviews_today: number; streak: number }
}

export type ExerciseKind = 'meaning' | 'cloze' | 'reverse' | 'type'

export const MAX_STAGE = 7
/** Со скольки ступеней слово считается выученным */
export const KNOWN_STAGE = 5
/** Через сколько дней показывать слово на ступени (индекс = ступень) */
export const STAGE_DAYS = [0, 0, 1, 3, 7, 16, 35, 70]

/** С этой ступени ученик вписывает слово сам, без вариантов */
export const TYPE_STAGE = 5

/** С этой ступени в упражнении с пропуском варианты открываются только после «подумай сам» */
export const PREDICT_STAGE = 3

/** Ступень после ответа — то же правило, что в SQL-функции vocab_review. */
export function nextStage(stage: number, correct: boolean): number {
  if (correct) return Math.min(MAX_STAGE, stage + 1)
  return stage <= 3 ? 1 : stage - 2
}

// --- Упражнения --------------------------------------------------------------------

export interface Exercise {
  kind: ExerciseKind
  /** meaning — само слово; reverse — определение; cloze — текст с пропуском */
  prompt: string
  options: string[]
  /** Индекс верного варианта */
  answer: number
  note?: string
  /** Сначала показать текст без вариантов: ученик сам прикидывает слово */
  predict?: boolean
  /** Для kind = 'type': что нужно вписать и подсказка (первая буква и длина) */
  expected?: string
  hint?: string
  /** Для kind = 'type': prompt — текст с пропуском (иначе — определение слова) */
  context?: boolean
}

/** Подсказка для ввода: «c… (11 букв)» или «c… (2 слова)». */
function typeHint(expected: string): string {
  const words = expected.trim().split(/\s+/)
  const size =
    words.length > 1
      ? `${words.length} ${plural(words.length, 'слово', 'слова', 'слов')}`
      : `${expected.length} ${plural(expected.length, 'буква', 'буквы', 'букв')}`
  return `${expected[0]}… (${size})`
}

const normTyped = (s: string) => norm(s).replace(/\s+/g, ' ').replace(/^(a|an|the|to) /, '')

/** Расстояние Левенштейна не больше 1 (одна опечатка). */
function oneTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  let x = a.length - 1
  let y = b.length - 1
  while (x >= i && y >= i && a[x] === b[y]) {
    x--
    y--
  }
  return x - i + 1 <= 1 && y - i + 1 <= 1
}

export type TypedVerdict = 'exact' | 'close' | 'wrong'

/** Проверка вписанного слова: подходит форма из контекста или начальная; одна опечатка — «почти». */
export function checkTyped(input: string, expected: string, word: string): TypedVerdict {
  const typed = normTyped(input)
  const targets = [normTyped(expected), normTyped(word)]
  if (targets.includes(typed)) return 'exact'
  return targets.some((t) => t.length >= 5 && oneTypo(typed, t)) ? 'close' : 'wrong'
}

/** Детерминированный генератор: один и тот же seed даёт один и тот же порядок вариантов. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const norm = (s: string) => s.trim().toLowerCase()

export const usableContexts = (w: VocabWord): VocabContext[] =>
  (w.contexts ?? []).filter((c) => c.text.includes(BLANK) && c.distractors.length > 0)

/** До трёх неверных вариантов из запаса слов: сначала той же части речи. */
function pickOthers(w: VocabWord, pool: PoolWord[], field: 'word' | 'definition', rand: () => number): string[] {
  const seen = new Set([norm(w[field])])
  const out: string[] = []
  const candidates = shuffled(
    pool.filter((p) => norm(p.word) !== norm(w.word)),
    rand,
  ).sort((a, b) => Number(b.pos === w.pos) - Number(a.pos === w.pos))
  for (const p of candidates) {
    const value = p[field]
    if (!value || seen.has(norm(value))) continue
    seen.add(norm(value))
    out.push(value)
    if (out.length === 3) break
  }
  return out
}

function withOptions(kind: ExerciseKind, prompt: string, right: string, wrong: string[], rand: () => number, note?: string): Exercise {
  const options = shuffled([right, ...wrong], rand)
  return { kind, prompt, options, answer: options.indexOf(right), note }
}

/**
 * Упражнение для слова: на первой ступени — «слово → значение», дальше — пропуск в контексте
 * (контексты чередуются по числу повторений); если контекстов нет — «значение → слово».
 * С TYPE_STAGE вариантов нет: слово нужно вписать.
 */
export function buildExercise(w: VocabWord, stage: number, reps: number, pool: PoolWord[], seed: number): Exercise {
  const rand = rng(seed)
  if (stage <= 1) {
    return withOptions('meaning', w.word, w.definition, pickOthers(w, pool, 'definition', rand), rand)
  }
  const contexts = usableContexts(w)
  if (stage >= TYPE_STAGE) {
    const c = contexts.length ? contexts[reps % contexts.length] : undefined
    const expected = c?.answer?.trim() || w.word
    return {
      kind: 'type',
      prompt: c ? c.text : w.definition,
      options: [],
      answer: -1,
      note: c?.note,
      expected,
      hint: typeHint(expected),
      context: Boolean(c),
    }
  }
  if (contexts.length) {
    const c = contexts[reps % contexts.length]
    const right = c.answer?.trim() || w.word
    const wrong = c.distractors.filter((d) => norm(d) !== norm(right)).slice(0, 3)
    return { ...withOptions('cloze', c.text, right, wrong, rand, c.note), predict: stage >= PREDICT_STAGE }
  }
  return withOptions('reverse', w.definition, w.word, pickOthers(w, pool, 'word', rand), rand)
}

// --- Файл импорта ------------------------------------------------------------------

/** Приводит запись из файла импорта к VocabWord; null — если нет слова или определения. */
export function parseVocabWord(value: unknown): VocabWord | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
  const strs = (x: unknown) => (Array.isArray(x) ? x.map(str).filter(Boolean) : [])
  const id = str(v.id)
  const word = str(v.word)
  const definition = str(v.definition)
  if (!id || !word || !definition) return null
  const connotation = str(v.connotation)
  const contexts: VocabContext[] = (Array.isArray(v.contexts) ? v.contexts : []).flatMap((c: unknown) => {
    if (!c || typeof c !== 'object') return []
    const r = c as Record<string, unknown>
    const text = str(r.text)
    if (!text.includes(BLANK)) return []
    return [{ text, distractors: strs(r.distractors), ...(str(r.answer) && { answer: str(r.answer) }), ...(str(r.note) && { note: str(r.note) }) }]
  })
  return {
    id,
    word,
    pos: str(v.pos),
    definition,
    translation: str(v.translation),
    connotation: connotation === 'positive' || connotation === 'negative' || connotation === 'neutral' ? connotation : '',
    contexts,
    confusables: strs(v.confusables),
    deck: str(v.deck),
    rank: typeof v.rank === 'number' && Number.isFinite(v.rank) ? Math.round(v.rank) : 0,
    forms: [...new Set([word, ...strs(v.forms)].map((f) => f.toLowerCase()))],
  }
}

// --- Supabase ----------------------------------------------------------------------

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Загружает слова пачками (upsert по id). */
export async function uploadVocabWords(
  sb: SupabaseClient,
  words: VocabWord[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const CHUNK = 200
  for (let i = 0; i < words.length; i += CHUNK) {
    check(await sb.from('vocab_words').upsert(words.slice(i, i + CHUNK)))
    onProgress?.(Math.min(i + CHUNK, words.length), words.length)
  }
}

export interface VocabEnrollment {
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
const rowToEnrollment = (r: EnrollmentRow): VocabEnrollment => ({ id: r.id, token: r.token, newPerDay: r.new_per_day })

export async function getEnrollment(sb: SupabaseClient, studentId: string): Promise<VocabEnrollment | null> {
  const data = check(await sb.from('vocab_enrollments').select(ENROLLMENT_COLS).eq('student_id', studentId).maybeSingle())
  return data ? rowToEnrollment(data as EnrollmentRow) : null
}

export async function createEnrollment(sb: SupabaseClient, studentId: string): Promise<VocabEnrollment> {
  const data = check(await sb.from('vocab_enrollments').insert({ student_id: studentId }).select(ENROLLMENT_COLS).single())
  return rowToEnrollment(data as EnrollmentRow)
}

export async function setNewPerDay(sb: SupabaseClient, id: string, newPerDay: number): Promise<void> {
  check(await sb.from('vocab_enrollments').update({ new_per_day: newPerDay }).eq('id', id))
}

export interface VocabStats {
  words_total: number
  started: number
  known: number
  due: number
  last_reviewed_at: string | null
  /** Дни с активностью за две недели (YYYY-MM-DD) */
  days: { day: string; reviews: number; correct: number; intro: number; ms: number }[]
  hard: { word: string; lapses: number; stage: number }[]
  /** Личная очередь: слова из ошибок и кликов, которые тренер ещё не ввёл */
  queued?: { word: string; source: 'mistake' | 'tap' | 'tutor' }[]
  /** Слова, которых нет в словаре: ученик попросил добавить */
  requests?: { id: string; text: string }[]
}

export async function fetchVocabStats(sb: SupabaseClient, studentId: string): Promise<VocabStats> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return check(await sb.rpc('vocab_stats', { p_student_id: studentId, p_tz: tz })) as VocabStats
}

export async function deleteVocabRequest(sb: SupabaseClient, id: string): Promise<void> {
  check(await sb.from('vocab_requests').delete().eq('id', id))
}

/** Постоянная ссылка ученика на тренер. */
export function vocabUrl(token: string): string {
  const base = window.location.href.split('#')[0]
  return `${base}#/vocab/${token}`
}

// --- Ученик (без входа, по токену) -------------------------------------------------

/** Источник данных тренера: облако по токену или демо в браузере. */
export interface VocabBackend {
  session(): Promise<VocabSession | null>
  review(wordId: string, exercise: 'intro' | ExerciseKind, correct: boolean, ms: number): Promise<void>
}

/** Начало сегодняшнего дня по часам устройства. */
export function dayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function cloudBackend(sb: SupabaseClient, token: string): VocabBackend {
  return {
    async session() {
      const data = check(await sb.rpc('vocab_session', { p_token: token, p_day_start: dayStart().toISOString() }))
      return (data as VocabSession | null) ?? null
    },
    async review(wordId, exercise, correct, ms) {
      check(
        await sb.rpc('vocab_review', {
          p_token: token,
          p_word_id: wordId,
          p_exercise: exercise,
          p_correct: correct,
          p_ms: Math.max(0, Math.round(ms)),
        }),
      )
    },
  }
}

// --- Слово по клику в разборе задания ----------------------------------------------

export interface LookupResult {
  found: boolean
  word?: string
  pos?: string
  definition?: string
  translation?: string
  /** Слово уже в личной очереди ученика */
  queued?: boolean
  /** Слово уже изучается в тренере */
  learning?: boolean
  /** Слова нет в словаре, просьба добавить записана */
  requested?: boolean
}

/** Слово и его возможные начальные формы: corroborated → corroborate, studies → study. */
export function wordCandidates(raw: string): string[] {
  const t = raw.trim().toLowerCase().replace(/[’']s$/, '')
  const out = [t]
  const add = (suffix: string, ...endings: string[]) => {
    if (t.length > suffix.length + 2 && t.endsWith(suffix)) for (const e of endings) out.push(t.slice(0, -suffix.length) + e)
  }
  add('ies', 'y')
  add('ied', 'y')
  add('es', '', 'e')
  add('s', '')
  add('ed', '', 'e')
  add('d', '')
  add('ing', '', 'e')
  add('ly', '')
  return [...new Set(out)]
}

/** Ищет слово в словаре по токену сданного задания; add — поставить в очередь или попросить добавить. */
export async function lookupWord(sb: SupabaseClient, assignmentToken: string, text: string, add: boolean): Promise<LookupResult> {
  const data = check(
    await sb.rpc('vocab_lookup', { p_token: assignmentToken, p_candidates: wordCandidates(text), p_text: text, p_add: add }),
  )
  return data as LookupResult
}

/** 1 слово, 2 слова, 5 слов */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}
