import type { SupabaseClient } from '@supabase/supabase-js'
import type { VocabWord } from './vocab'

// Словарь репетитора: чтение и правка слов, просьбы учеников, сводка для «Обзора».
// Работает с таблицами напрямую — доступ ограничен RLS «только свои строки».

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const WORD_COLS = 'id, word, pos, definition, translation, connotation, contexts, confusables, deck, rank, forms'

/** Все слова словаря по порядку введения (читает страницами: сервер отдаёт не больше 1000 строк). */
export async function listVocabWords(sb: SupabaseClient): Promise<VocabWord[]> {
  const PAGE = 1000
  const out: VocabWord[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = check(
      await sb.from('vocab_words').select(WORD_COLS).order('rank').order('word').range(from, from + PAGE - 1),
    ) as VocabWord[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

export async function saveVocabWord(sb: SupabaseClient, word: VocabWord): Promise<void> {
  check(await sb.from('vocab_words').upsert(word))
}

/** Удаляет слово вместе с прогрессом учеников по нему. */
export async function deleteVocabWord(sb: SupabaseClient, id: string): Promise<void> {
  check(await sb.from('vocab_words').delete().eq('id', id))
}

export interface VocabRequest {
  id: string
  studentId: string
  text: string
}

/** Слова, которые ученики просили добавить (кликнули в разборе, а в словаре их нет). */
export async function listVocabRequests(sb: SupabaseClient): Promise<VocabRequest[]> {
  const rows = check(await sb.from('vocab_requests').select('id, student_id, text').order('created_at')) as {
    id: string
    student_id: string
    text: string
  }[]
  return rows.map((r) => ({ id: r.id, studentId: r.student_id, text: r.text }))
}

/** Просьба выполнена: слово ставится в очередь ученика, просьба удаляется. */
export async function fulfilVocabRequest(sb: SupabaseClient, request: VocabRequest, wordId: string): Promise<void> {
  check(
    await sb
      .from('vocab_student_words')
      .upsert({ student_id: request.studentId, word_id: wordId, source: 'tap' }, { onConflict: 'student_id,word_id', ignoreDuplicates: true }),
  )
  check(await sb.from('vocab_requests').delete().eq('id', request.id))
}

export interface VocabOverviewRow {
  student_id: string
  last_reviewed_at: string | null
  /** Дней с тренировкой за последние 7 */
  active_days: number
  started: number
  known: number
  due: number
  queued: number
}

export async function fetchVocabOverview(sb: SupabaseClient): Promise<VocabOverviewRow[]> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return check(await sb.rpc('vocab_overview', { p_tz: tz })) as VocabOverviewRow[]
}
