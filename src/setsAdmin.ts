import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuestionSet } from './types'

// Редактор сетов: чтение строки сета целиком, создание, правка, удаление, учёт заданий.
// Только облачный режим.

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Строка question_sets как есть — со всеми колонками, в т.ч. незнакомыми редактору. */
export type SetRow = Record<string, unknown> & {
  id: string
  title: string
  subtitle: string
  skills: string[]
  questions: QuestionSet['questions']
  answers: string[]
  updated_at: string
}

export async function fetchSetRow(sb: SupabaseClient, id: string): Promise<SetRow | null> {
  const data = check(await sb.from('question_sets').select('*').eq('id', id).maybeSingle())
  return (data as SetRow | null) ?? null
}

export interface SetUsage {
  total: number
  submitted: number
  /** Ученик открыл и решает, но ещё не сдал */
  inProgress: number
}

/** Сколько заданий выдано по сету (все ученики репетитора). */
export async function fetchSetUsage(sb: SupabaseClient, setId: string): Promise<SetUsage> {
  const data = check(await sb.from('assignments').select('started_at, submitted_at').eq('set_id', setId)) as {
    started_at: string | null
    submitted_at: string | null
  }[]
  return {
    total: data.length,
    submitted: data.filter((a) => a.submitted_at).length,
    inProgress: data.filter((a) => a.started_at && !a.submitted_at).length,
  }
}

type SetFields = Pick<QuestionSet, 'title' | 'subtitle' | 'skills' | 'questions' | 'answers'>

/** Колонки, которые не копируются в новый сет (их выставляет база). */
const SERVER_COLS = ['id', 'owner_id', 'created_at', 'updated_at']

/**
 * Создаёт сет. base — строка исходного сета при «Сохранить как копию»:
 * незнакомые редактору колонки копируются как есть.
 */
export async function insertSet(
  sb: SupabaseClient,
  id: string,
  fields: SetFields,
  base?: Record<string, unknown>,
): Promise<void> {
  const extra = Object.fromEntries(Object.entries(base ?? {}).filter(([k]) => !SERVER_COLS.includes(k)))
  check(await sb.from('question_sets').insert({ ...extra, ...fields, id }))
}

export class SetConflictError extends Error {}

/**
 * Обновляет только колонки редактора; остальные не трогает.
 * Если сет успели изменить в другой вкладке (updated_at другой) — SetConflictError.
 */
export async function updateSet(
  sb: SupabaseClient,
  id: string,
  loadedUpdatedAt: string,
  fields: SetFields,
): Promise<string> {
  const data = check(
    await sb.from('question_sets').update(fields).eq('id', id).eq('updated_at', loadedUpdatedAt).select('updated_at'),
  ) as { updated_at: string }[]
  if (data.length === 0) {
    throw new SetConflictError('Сет изменили в другой вкладке или окне. Обновите страницу и повторите правки.')
  }
  return data[0].updated_at
}

/** Удаляет сет. Задания по нему (и их результаты) база удаляет каскадом. */
export async function deleteSet(sb: SupabaseClient, id: string): Promise<void> {
  check(await sb.from('question_sets').delete().eq('id', id))
}
