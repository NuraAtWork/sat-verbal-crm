import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignment, ModuleAnswers, QuestionResult, QuestionSet, SetQuestion, TestModule } from './types'

// Работа с сетами вопросов и заданиями в Supabase. Без облака эти функции не вызываются.

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

// --- Репетитор -----------------------------------------------------------------

/** Проверка формата сета из файла импорта (минимальная: структура и согласованность ключа). */
export function isQuestionSet(value: unknown): value is QuestionSet {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.questions) &&
    Array.isArray(v.answers) &&
    v.questions.length === v.answers.length
  )
}

/** Загружает сеты пачками (upsert по id). onProgress(загружено, всего). */
export async function uploadQuestionSets(
  sb: SupabaseClient,
  sets: QuestionSet[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const CHUNK = 5
  for (let i = 0; i < sets.length; i += CHUNK) {
    const rows = sets.slice(i, i + CHUNK).map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle ?? '',
      skills: s.skills ?? [],
      questions: s.questions,
      answers: s.answers,
      // поля тестов — только у тестов, чтобы обычные сеты грузились и без новых колонок
      ...(s.kind === 'test' ? { kind: 'test', modules: s.modules ?? null, explanations: s.explanations ?? null } : {}),
    }))
    check(await sb.from('question_sets').upsert(rows))
    onProgress?.(Math.min(i + CHUNK, sets.length), sets.length)
  }
}

export async function fetchQuestionSet(sb: SupabaseClient, id: string): Promise<QuestionSet | null> {
  const data = check(
    await sb
      .from('question_sets')
      .select('id, title, subtitle, skills, questions, answers')
      .eq('id', id)
      .maybeSingle(),
  )
  return (data as QuestionSet | null) ?? null
}

interface AssignmentRow {
  id: string
  student_id: string
  set_id: string
  token: string
  due_date: string | null
  created_at: string
  started_at: string | null
  submitted_at: string | null
  duration_sec: number | null
  correct_count: number | null
  total_count: number | null
  results: QuestionResult[] | null
  score_estimate?: number | null
  module_answers?: ModuleAnswers[] | null
}

const ASSIGNMENT_COLS =
  'id, student_id, set_id, token, due_date, created_at, started_at, submitted_at, duration_sec, correct_count, total_count, results'

const rowToAssignment = (r: AssignmentRow): Assignment => ({
  id: r.id,
  studentId: r.student_id,
  setId: r.set_id,
  token: r.token,
  dueDate: r.due_date ?? '',
  createdAt: r.created_at,
  startedAt: r.started_at,
  submittedAt: r.submitted_at,
  durationSec: r.duration_sec,
  correctCount: r.correct_count,
  totalCount: r.total_count,
  results: r.results,
  scoreEstimate: r.score_estimate ?? null,
  moduleAnswers: r.module_answers ?? null,
})

export async function listAssignments(sb: SupabaseClient, studentId: string): Promise<Assignment[]> {
  const query = (cols: string) =>
    sb.from('assignments').select(cols).eq('student_id', studentId).order('created_at', { ascending: false })
  // колонки тестов появляются после SQL из блока «Пробные тесты»; без них — как раньше
  let res = await query(`${ASSIGNMENT_COLS}, ${TEST_ASSIGNMENT_COLS}`)
  if (res.error) res = await query(ASSIGNMENT_COLS)
  const data = check(res)
  return (data as unknown as AssignmentRow[]).map(rowToAssignment)
}

export async function createAssignment(
  sb: SupabaseClient,
  studentId: string,
  setId: string,
  dueDate: string,
): Promise<Assignment> {
  const data = check(
    await sb
      .from('assignments')
      .insert({ student_id: studentId, set_id: setId, due_date: dueDate || null })
      .select(ASSIGNMENT_COLS)
      .single(),
  )
  return rowToAssignment(data as AssignmentRow)
}

export async function deleteAssignment(sb: SupabaseClient, id: string): Promise<void> {
  check(await sb.from('assignments').delete().eq('id', id))
}

/** Ссылка, которую репетитор отправляет ученику. */
export function solveUrl(token: string): string {
  const base = window.location.href.split('#')[0]
  return `${base}#/solve/${token}`
}

// --- Ученик (без входа, по токену) -------------------------------------------------

export interface StudentAssignment {
  title: string
  student: string | null
  due_date: string | null
  questions: SetQuestion[]
  started_at: string | null
  submitted_at: string | null
  duration_sec: number | null
  correct_count: number | null
  total_count: number | null
  results: QuestionResult[] | null
}

export interface SubmitResult {
  submitted_at: string
  duration_sec: number
  correct_count: number
  total_count: number
  results: QuestionResult[]
}

export async function getAssignment(sb: SupabaseClient, token: string): Promise<StudentAssignment | null> {
  const data = check(await sb.rpc('get_assignment', { p_token: token }))
  return (data as StudentAssignment | null) ?? null
}

export async function startAssignment(sb: SupabaseClient, token: string): Promise<void> {
  check(await sb.rpc('start_assignment', { p_token: token }))
}

export async function submitAssignment(
  sb: SupabaseClient,
  token: string,
  answers: (string | null)[],
  times: number[],
): Promise<SubmitResult> {
  const data = check(
    await sb.rpc('submit_assignment', {
      p_token: token,
      p_answers: answers,
      p_times: times.map((t) => Math.max(0, Math.round(t))),
    }),
  )
  return data as SubmitResult
}

// --- Общее ---------------------------------------------------------------------

/** 754 → «12:34», 3723 → «1:02:03» */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—'
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

export function assignmentStatus(a: Assignment): { label: string; cls: string } {
  if (a.submittedAt) return { label: 'Сдано', cls: 'badge-active' }
  if (a.startedAt) return { label: 'Решает', cls: 'badge-paused' }
  return { label: 'Задано', cls: 'badge-lead' }
}

// --- Пробные тесты -------------------------------------------------------------------

const TEST_ASSIGNMENT_COLS = 'score_estimate, module_answers'

export const isTestSet = (s: { kind?: string | null } | null | undefined) => s?.kind === 'test'

/** Поля задания-теста, которые get_assignment отдаёт ученику (после SQL «Пробные тесты»). */
export interface StudentAssignment {
  kind?: 'set' | 'test'
  modules?: TestModule[] | null
  /** Начала открытых модулей по часам сервера */
  module_starts?: string[] | null
  modules_done?: number
  server_now?: string
  score_estimate?: number | null
  /** Только после сдачи */
  explanations?: string[] | null
}

export interface ModuleState {
  module_starts: string[]
  modules_done: number
  server_now: string
}

export interface TestSubmitResult {
  modules_done: number
  submitted_at: string | null
  duration_sec: number | null
  correct_count: number | null
  total_count: number | null
  results: QuestionResult[] | null
  score_estimate?: number | null
  explanations?: string[] | null
}

export async function startTestModule(sb: SupabaseClient, token: string, module: number): Promise<ModuleState> {
  const data = check(await sb.rpc('start_test_module', { p_token: token, p_module: module }))
  return data as ModuleState
}

export async function submitTestModule(
  sb: SupabaseClient,
  token: string,
  module: number,
  answers: (string | null)[],
  times: number[],
): Promise<TestSubmitResult> {
  const data = check(
    await sb.rpc('submit_test_module', {
      p_token: token,
      p_module: module,
      p_answers: answers,
      p_times: times.map((t) => Math.max(0, Math.round(t))),
    }),
  )
  return data as TestSubmitResult
}

/**
 * Грубая оценка балла R&W 200–800 по доле верных (та же таблица, что estimate_rw_score в SQL).
 * Не официальная шкала: реальный перевод зависит от сложности вопросов и адаптивности модуля 2.
 */
export function estimateRwScore(correct: number, total: number): number | null {
  if (!total) return null
  const xs = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1]
  const ys = [200, 240, 340, 440, 520, 600, 690, 760, 800]
  const f = Math.min(1, Math.max(0, correct / total))
  for (let i = 1; i < xs.length; i++) {
    if (f <= xs[i]) return Math.round((ys[i - 1] + ((ys[i] - ys[i - 1]) * (f - xs[i - 1])) / (xs[i] - xs[i - 1])) / 10) * 10
  }
  return 800
}
