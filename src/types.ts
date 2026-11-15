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
  /** id сета вопросов в облаке (question_sets), если материал — интерактивный сет */
  setId?: string | null
}

export interface Db {
  version: 1
  students: Student[]
  lessons: Lesson[]
  scores: ScoreEntry[]
  materials: Material[]
}

// --- Сеты вопросов и задания (только облачный режим) ---

export interface SetChoice {
  letter: string
  html: string
}

export interface SetQuestion {
  n: number
  /** Easy / Medium / Hard — ученику не отдаётся */
  difficulty?: string
  stimulus: string
  stem: string
  choices: SetChoice[]
}

export interface QuestionSet {
  id: string
  title: string
  subtitle: string
  skills: string[]
  questions: SetQuestion[]
  /** Ключ ответов — есть только у репетитора */
  answers: string[]
}

export interface QuestionResult {
  n: number
  answer: string | null
  correct: string
  is_correct: boolean
  time_sec: number
}

export interface Assignment {
  id: string
  studentId: string
  setId: string
  token: string
  dueDate: string
  createdAt: string
  startedAt: string | null
  submittedAt: string | null
  durationSec: number | null
  correctCount: number | null
  totalCount: number | null
  results: QuestionResult[] | null
}
