import type { SupabaseClient } from '@supabase/supabase-js'

// Кабинет ученика: постоянная ссылка #/me/<token> без входа. Схема и функция student_home —
// блок «Кабинет ученика» в supabase/schema.sql.

export interface PortalAssignment {
  token: string
  title: string
  kind: 'set' | 'test'
  questions: number
  /** Суммарное время модулей теста, мин (у обычного сета — null) */
  minutes: number | null
  due_date: string | null
  created_at: string
  started_at: string | null
  submitted_at: string | null
  correct_count: number | null
  total_count: number | null
  /** Оценка балла R&W по тесту (грубая) */
  score_estimate: number | null
}

export interface PortalVocab {
  token: string
  /** Слов ждут повторения */
  due: number
  started: number
  known: number
  /** Ответов в тренере за сегодня */
  reviews_today: number
}

export interface PortalLesson {
  date: string
  duration_min: number
  topics: string[]
  homework: string
  /** Из конструктора урока; у старых уроков пусто */
  title?: string
  goals?: string
  success?: string
  theory?: string
}

export interface PortalHome {
  student: string | null
  exam_date: string | null
  baseline_score: number | null
  target_score: number | null
  /** Новые — первыми */
  assignments: PortalAssignment[]
  /** Прошедшие уроки, новые первыми */
  lessons: PortalLesson[]
  lessons_count: number
  /** Точность по навыкам в сданных заданиях: id навыка → счётчики */
  skills: Record<string, { total: number; correct: number; time_sec: number }>
  /** Сколько уроков было по навыку: id навыка → число */
  topics: Record<string, number>
  /** По возрастанию даты */
  scores: { date: string; source: string; score: number }[]
  /** null — тренер слов не включён */
  vocab: PortalVocab | null
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Содержимое кабинета по токену; null — ссылка не найдена. */
export async function fetchPortalHome(sb: SupabaseClient, token: string): Promise<PortalHome | null> {
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  const data = check(await sb.rpc('student_home', { p_token: token, p_day_start: day.toISOString() }))
  if (!data) return null
  // поля, которых нет в старой версии функции student_home
  const h = data as PortalHome
  return { ...h, lessons: h.lessons ?? [], skills: h.skills ?? {} }
}

// --- Репетитор ---------------------------------------------------------------------

/** Токен кабинета ученика; null — кабинет не открыт. */
export async function getPortalToken(sb: SupabaseClient, studentId: string): Promise<string | null> {
  const data = check(await sb.from('student_portals').select('token').eq('student_id', studentId).maybeSingle())
  return (data as { token: string } | null)?.token ?? null
}

export async function createPortal(sb: SupabaseClient, studentId: string): Promise<string> {
  const data = check(await sb.from('student_portals').insert({ student_id: studentId }).select('token').single())
  return (data as { token: string }).token
}

/** Закрывает кабинет: старая ссылка перестаёт работать. */
export async function deletePortal(sb: SupabaseClient, studentId: string): Promise<void> {
  check(await sb.from('student_portals').delete().eq('student_id', studentId))
}

/** Постоянная ссылка ученика на кабинет. */
export function portalUrl(token: string): string {
  const base = window.location.href.split('#')[0]
  return `${base}#/me/${token}`
}

// --- Возврат в кабинет со страниц задания и словаря ---------------------------------

const KEY = 'sat-verbal-crm:portal'

/** Запоминает кабинет на время вкладки, чтобы страницы задания и словаря показали ссылку назад. */
export function rememberPortal(token: string) {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // без sessionStorage ссылки «в кабинет» просто не будет
  }
}

/** Адрес кабинета, из которого ученик пришёл в этой вкладке; null — пришёл по прямой ссылке. */
export function portalBackHref(): string | null {
  try {
    const token = sessionStorage.getItem(KEY)
    return token && /^([0-9a-f]{64}|demo)$/.test(token) ? `#/me/${token}` : null
  } catch {
    return null
  }
}
