export type StudentStatus = 'lead' | 'active' | 'paused' | 'finished'

export interface Student {
  id: string
  name: string
  contact: string
  parentContact: string
  status: StudentStatus
  /** YYYY-MM-DD */
  startDate: string
  /** YYYY-MM-DD, дата экзамена SAT */
  examDate: string
  /** Стартовый балл Reading & Writing (200–800) */
  baselineScore: number | null
  /** Целевой балл Reading & Writing (200–800) */
  targetScore: number | null
  notes: string
  createdAt: string
}

export interface Lesson {
  id: string
  studentId: string
  /** YYYY-MM-DD */
  date: string
  durationMin: number
  /** id навыков из SKILLS */
  topics: string[]
  homework: string
  notes: string
  paid: boolean
}

export interface ScoreEntry {
  id: string
  studentId: string
  /** YYYY-MM-DD */
  date: string
  /** Например «Bluebook Practice Test 4» */
  source: string
  /** Балл Reading & Writing (200–800) */
  score: number
  notes: string
}

export type MaterialKind = 'test' | 'practice' | 'vocab' | 'theory' | 'video' | 'other'

export interface Material {
  id: string
  title: string
  /** Ссылка на файл/страницу (Google Drive, сайт и т.п.), может быть пустой */
  url: string
  kind: MaterialKind
  /** id навыков из SKILLS */
  skills: string[]
  notes: string
  createdAt: string
}

export interface Db {
  version: 1
  students: Student[]
  lessons: Lesson[]
  scores: ScoreEntry[]
  materials: Material[]
}
