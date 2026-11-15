import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignment, QuestionResult, QuestionSet, SetQuestion } from './types'

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
})

export async function listAssignments(sb: SupabaseClient, studentId: string): Promise<Assignment[]> {
  const data = check(
    await sb
      .from('assignments')
      .select(ASSIGNMENT_COLS)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
  )
  return (data as AssignmentRow[]).map(rowToAssignment)
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
