import { addDays, today } from './dates'
import { newId } from './db'
import type { Db, Lesson, Material, ScoreEntry, Student } from './types'

/** Вымышленные ученики, чтобы посмотреть, как выглядит CRM с данными. */
export function demoDb(): Db {
  const t = today()
  const mk = (s: Omit<Student, 'id' | 'createdAt'>): Student => ({
    ...s,
    id: newId(),
    createdAt: new Date().toISOString(),
  })

  const aru = mk({
    name: 'Демо: Студент А',
    contact: '@student_a',
    parentContact: '',
    status: 'active',
    startDate: addDays(t, -42),
    examDate: addDays(t, 20),
    baselineScore: 560,
    targetScore: 700,
    notes: 'Сильная грамматика, проседает в Inferences и Cross-Text.',
  })
  const tim = mk({
    name: 'Демо: Студент Б',
    contact: '+7 700 000 00 00',
    parentContact: 'Мама: +7 700 000 00 01',
    status: 'active',
    startDate: addDays(t, -14),
    examDate: addDays(t, 48),
    baselineScore: 490,
    targetScore: 650,
    notes: '',
  })
  const lead = mk({
    name: 'Демо: Заявка В',
    contact: '@lead_v',
    parentContact: '',
    status: 'lead',
    startDate: '',
    examDate: addDays(t, 110),
    baselineScore: null,
    targetScore: 720,
    notes: 'Пробный урок на следующей неделе.',
  })

  const lesson = (
    studentId: string,
    daysAgo: number,
    topics: string[],
    homework: string,
    paid = true,
  ): Lesson => ({
    id: newId(),
    studentId,
    date: addDays(t, -daysAgo),
    durationMin: 60,
    topics,
    homework,
    notes: '',
    paid,
  })

  const score = (studentId: string, daysAgo: number, source: string, value: number): ScoreEntry => ({
    id: newId(),
    studentId,
    date: addDays(t, -daysAgo),
    source,
    score: value,
    notes: '',
  })

  const material = (m: Omit<Material, 'id' | 'createdAt'>): Material => ({
    ...m,
    id: newId(),
    createdAt: new Date().toISOString(),
  })

  return {
    version: 1,
    materials: [
      material({
        title: 'SAT Suite Question Bank — Words in Context',
        url: 'https://satsuitequestionbank.collegeboard.org/',
        kind: 'practice',
        skills: ['words-in-context'],
        notes: 'Официальный банк вопросов: фильтр по навыку и сложности.',
      }),
      material({
        title: 'Демо: Boundaries — сет 1 (20 вопросов)',
        url: '',
        kind: 'practice',
        skills: ['boundaries'],
        notes: '',
      }),
      material({
        title: 'Демо: Boundaries — сет 2 (hard)',
        url: '',
        kind: 'practice',
        skills: ['boundaries'],
        notes: '',
      }),
      material({
        title: 'Демо: Inferences — 15 вопросов',
        url: '',
        kind: 'practice',
        skills: ['inferences'],
        notes: '',
      }),
      material({
        title: 'Демо: Графики и таблицы',
        url: '',
        kind: 'practice',
        skills: ['evidence-quant'],
        notes: '',
      }),
      material({
        title: 'Демо: Transitions + Rhetorical Synthesis',
        url: '',
        kind: 'practice',
        skills: ['transitions', 'rhetorical-synthesis'],
        notes: 'Смешанный сет на Expression of Ideas.',
      }),
      material({
        title: 'Bluebook — официальные пробные тесты',
        url: 'https://bluebook.collegeboard.org/',
        kind: 'test',
        skills: [],
        notes: 'Полноформатные адаптивные тесты College Board.',
      }),
      material({
        title: 'Демо: SAT март (разбор R&W)',
        url: '',
        kind: 'test',
        skills: [],
        notes: 'Пример прошлого теста без ссылки.',
      }),
    ],
    students: [aru, tim, lead],
    lessons: [
      lesson(aru.id, 40, ['words-in-context', 'text-structure'], '20 вопросов WIC'),
      lesson(aru.id, 33, ['boundaries', 'form-structure-sense'], 'Пунктуация: 2 сета'),
      lesson(aru.id, 26, ['inferences'], 'Inferences: 15 вопросов'),
      lesson(aru.id, 19, ['evidence-quant', 'evidence-textual'], 'Графики и таблицы'),
      lesson(aru.id, 12, ['cross-text', 'inferences'], 'Разбор ошибок PT3'),
      lesson(aru.id, 5, ['transitions', 'rhetorical-synthesis'], 'Practice Test 4', false),
      lesson(tim.id, 13, ['words-in-context'], 'Словарь: 40 слов'),
      lesson(tim.id, 6, ['boundaries'], 'Пунктуация: 1 сет', false),
    ],
    scores: [
      score(aru.id, 38, 'Bluebook Practice Test 1', 580),
      score(aru.id, 24, 'Bluebook Practice Test 2', 620),
      score(aru.id, 10, 'Bluebook Practice Test 3', 650),
      score(tim.id, 12, 'Bluebook Practice Test 1', 510),
    ],
  }
}
