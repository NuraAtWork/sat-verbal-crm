import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePlan, type Action } from './db'
import type { Db, Lesson, LessonPlan, LessonTemplate, Material, MaterialKind, ScoreEntry, Student, StudentStatus } from './types'

// Строки таблиц Supabase (snake_case). owner_id проставляет база (default auth.uid()).

interface StudentRow {
  id: string
  name: string
  contact: string
  parent_contact: string
  status: StudentStatus
  start_date: string | null
  exam_date: string | null
  baseline_score: number | null
  target_score: number | null
  notes: string
  created_at: string
}

interface LessonRow {
  id: string
  student_id: string
  date: string
  duration_min: number
  topics: string[]
  homework: string
  notes: string
  paid: boolean
  plan: LessonPlan | null
}

interface TemplateRow {
  id: string
  skills: string[]
  duration_min: number
  homework: string
  plan: LessonPlan
  created_at: string
}

interface ScoreRow {
  id: string
  student_id: string
  date: string
  source: string
  score: number
  notes: string
}

const studentToRow = (s: Student): StudentRow => ({
  id: s.id,
  name: s.name,
  contact: s.contact,
  parent_contact: s.parentContact,
  status: s.status,
  start_date: s.startDate || null,
  exam_date: s.examDate || null,
  baseline_score: s.baselineScore,
  target_score: s.targetScore,
  notes: s.notes,
  created_at: s.createdAt,
})

const rowToStudent = (r: StudentRow): Student => ({
  id: r.id,
  name: r.name,
  contact: r.contact,
  parentContact: r.parent_contact,
  status: r.status,
  startDate: r.start_date ?? '',
  examDate: r.exam_date ?? '',
  baselineScore: r.baseline_score,
  targetScore: r.target_score,
  notes: r.notes,
  createdAt: r.created_at,
})

const lessonToRow = (l: Lesson): LessonRow => ({
  id: l.id,
  student_id: l.studentId,
  date: l.date,
  duration_min: l.durationMin,
  topics: l.topics,
  homework: l.homework,
  notes: l.notes,
  paid: l.paid,
  plan: l.plan ?? null,
})

const rowToLesson = (r: LessonRow): Lesson => ({
  id: r.id,
  studentId: r.student_id,
  date: r.date,
  durationMin: r.duration_min,
  topics: r.topics ?? [],
  homework: r.homework,
  notes: r.notes,
  paid: r.paid,
  plan: r.plan ? normalizePlan(r.plan) : null,
})

const templateToRow = (t: LessonTemplate): TemplateRow => ({
  id: t.id,
  skills: t.skills,
  duration_min: t.durationMin,
  homework: t.homework,
  plan: t.plan,
  created_at: t.createdAt,
})

const rowToTemplate = (r: TemplateRow): LessonTemplate => ({
  id: r.id,
  skills: r.skills ?? [],
  durationMin: r.duration_min,
  homework: r.homework,
  plan: normalizePlan(r.plan),
  createdAt: r.created_at,
})

const scoreToRow = (s: ScoreEntry): ScoreRow => ({
  id: s.id,
  student_id: s.studentId,
  date: s.date,
  source: s.source,
  score: s.score,
  notes: s.notes,
})

const rowToScore = (r: ScoreRow): ScoreEntry => ({
  id: r.id,
  studentId: r.student_id,
  date: r.date,
  source: r.source,
  score: r.score,
  notes: r.notes,
})

interface MaterialRow {
  id: string
  title: string
  url: string
  kind: MaterialKind
  skills: string[]
  notes: string
  created_at: string
  set_id: string | null
}

const materialToRow = (m: Material): MaterialRow => ({
  id: m.id,
  title: m.title,
  url: m.url,
  kind: m.kind,
  skills: m.skills,
  notes: m.notes,
  created_at: m.createdAt,
  set_id: m.setId ?? null,
})

const rowToMaterial = (r: MaterialRow): Material => ({
  id: r.id,
  title: r.title,
  url: r.url,
  kind: r.kind,
  skills: r.skills ?? [],
  notes: r.notes,
  createdAt: r.created_at,
  setId: r.set_id,
})

const STUDENT_COLS =
  'id, name, contact, parent_contact, status, start_date, exam_date, baseline_score, target_score, notes, created_at'
const LESSON_COLS = 'id, student_id, date, duration_min, topics, homework, notes, paid, plan'
const TEMPLATE_COLS = 'id, skills, duration_min, homework, plan, created_at'
const SCORE_COLS = 'id, student_id, date, source, score, notes'
const MATERIAL_COLS = 'id, title, url, kind, skills, notes, created_at, set_id'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Загружает все данные текущего пользователя. */
export async function fetchAll(sb: SupabaseClient): Promise<Db> {
  const [students, lessons, scores, materials, templates] = await Promise.all([
    sb.from('students').select(STUDENT_COLS),
    sb.from('lessons').select(LESSON_COLS),
    sb.from('scores').select(SCORE_COLS),
    sb.from('materials').select(MATERIAL_COLS),
    sb.from('lesson_templates').select(TEMPLATE_COLS),
  ])
  return {
    version: 1,
    students: (check(students) as StudentRow[]).map(rowToStudent),
    lessons: (check(lessons) as LessonRow[]).map(rowToLesson),
    scores: (check(scores) as ScoreRow[]).map(rowToScore),
    materials: (check(materials) as MaterialRow[]).map(rowToMaterial),
    lessonTemplates: (check(templates) as TemplateRow[]).map(rowToTemplate),
  }
}

const CHUNK = 500

async function inChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    check(await insert(rows.slice(i, i + CHUNK)))
  }
}

/** Повторяет действие редьюсера в базе. */
export async function applyRemote(sb: SupabaseClient, action: Action): Promise<void> {
  switch (action.type) {
    case 'student/upsert':
      check(await sb.from('students').upsert(studentToRow(action.student)))
      return
    case 'student/delete':
      // Уроки и тесты удалятся каскадом (on delete cascade).
      check(await sb.from('students').delete().eq('id', action.id))
      return
    case 'lesson/upsert':
      check(await sb.from('lessons').upsert(lessonToRow(action.lesson)))
      return
    case 'lesson/delete':
      check(await sb.from('lessons').delete().eq('id', action.id))
      return
    case 'score/upsert':
      check(await sb.from('scores').upsert(scoreToRow(action.score)))
      return
    case 'score/delete':
      check(await sb.from('scores').delete().eq('id', action.id))
      return
    case 'material/upsert':
      check(await sb.from('materials').upsert(materialToRow(action.material)))
      return
    case 'material/delete':
      check(await sb.from('materials').delete().eq('id', action.id))
      return
    case 'template/upsert':
      check(await sb.from('lesson_templates').upsert(templateToRow(action.template)))
      return
    case 'template/delete':
      check(await sb.from('lesson_templates').delete().eq('id', action.id))
      return
    case 'db/replace':
      // Удаляем всё своё (RLS ограничивает строками пользователя), затем вставляем заново.
      check(await sb.from('students').delete().not('id', 'is', null))
      check(await sb.from('materials').delete().not('id', 'is', null))
      check(await sb.from('lesson_templates').delete().not('id', 'is', null))
      await inChunks(action.db.students.map(studentToRow), (c) => sb.from('students').insert(c))
      await inChunks(action.db.lessons.map(lessonToRow), (c) => sb.from('lessons').insert(c))
      await inChunks(action.db.scores.map(scoreToRow), (c) => sb.from('scores').insert(c))
      await inChunks(action.db.materials.map(materialToRow), (c) => sb.from('materials').insert(c))
      await inChunks(action.db.lessonTemplates.map(templateToRow), (c) => sb.from('lesson_templates').insert(c))
      return
    case 'db/merge':
      // Порядок важен: уроки и тесты ссылаются на учеников.
      await inChunks(action.db.students.map(studentToRow), (c) => sb.from('students').upsert(c))
      await inChunks(action.db.lessons.map(lessonToRow), (c) => sb.from('lessons').upsert(c))
      await inChunks(action.db.scores.map(scoreToRow), (c) => sb.from('scores').upsert(c))
      await inChunks(action.db.materials.map(materialToRow), (c) => sb.from('materials').upsert(c))
      await inChunks(action.db.lessonTemplates.map(templateToRow), (c) => sb.from('lesson_templates').upsert(c))
      return
  }
}
