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
  /** Содержание урока из конструктора; у старых уроков его нет */
  plan?: LessonPlan | null
}

/** Достигнут ли «хороший результат» урока ('' — не отмечено). */
export type LessonOutcome = '' | 'reached' | 'partly' | 'missed'

/** Содержание урока: что хотим получить, как объясняем и на чём тренируемся. */
export interface LessonPlan {
  /** Тема урока одной строкой */
  title: string
  /** Цели: что ученик сможет делать после урока (по строке на цель) */
  goals: string
  /** Хороший результат: по чему видно, что цель достигнута */
  success: string
  /** Теория: что и как объясняем */
  theory: string
  /** Практика на уроке: ход работы словами */
  practice: string
  /** Сеты (question_sets.id), которые решаем на уроке */
  practiceSetIds: string[]
  /** Сеты, которые задаём на дом (в облаке становятся заданиями ученика) */
  homeworkSetIds: string[]
  /** Срок сдачи домашних сетов, YYYY-MM-DD или пусто */
  homeworkDue: string
  /** Итог после урока */
  outcome: LessonOutcome
  /** id заготовки, из которой собран урок ('' — с нуля) */
  templateId: string
}

/** Заготовка урока: тот же план без ученика и даты. */
export interface LessonTemplate {
  id: string
  /** id навыков из SKILLS */
  skills: string[]
  durationMin: number
  /** Текст домашнего задания по умолчанию */
  homework: string
  plan: LessonPlan
  createdAt: string
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
  /** Заготовки уроков репетитора */
  lessonTemplates: LessonTemplate[]
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

// --- Пробные тесты (формат Bluebook) ---
// Дополняют интерфейсы выше (слияние объявлений TypeScript), чтобы не трогать существующие строки.

export interface TestModule {
  title: string
  count: number
  minutes: number
}

/** Закрытый модуль задания-теста (хранится на сервере). */
export interface ModuleAnswers {
  answers: (string | null)[]
  times: number[]
  submitted_at: string
  /** Сколько секунд прошло по часам сервера от начала модуля до сдачи */
  elapsed_sec: number
  /** Сдан позже лимита (+2 мин запаса) */
  late: boolean
}

export interface QuestionSet {
  /** 'test' — пробный тест с модулями; по умолчанию обычный сет */
  kind?: 'set' | 'test'
  modules?: TestModule[] | null
  /** Объяснения к ответам по порядку вопросов ('' — нет) — есть только у репетитора */
  explanations?: string[] | null
}

export interface SetQuestion {
  /** Номер модуля теста (с 1) */
  module?: number
  /** id навыка из SKILLS — ученику не отдаётся */
  skill?: string
}

export interface QuestionResult {
  module?: number
}

export interface Assignment {
  /** Оценка балла R&W 200–800 по тесту (грубая) */
  scoreEstimate?: number | null
  moduleAnswers?: ModuleAnswers[] | null
  /** Урок, из которого выдано задание как ДЗ */
  lessonId?: string | null
}
