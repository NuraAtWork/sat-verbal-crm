import { skillName } from './sat'
import type { Lesson, LessonOutcome } from './types'

// Общие подписи для уроков (раздел «Уроки», конструктор, карточка ученика).

export const OUTCOME_LABELS: Record<Exclude<LessonOutcome, ''>, string> = {
  reached: 'Достигнут',
  partly: 'Частично',
  missed: 'Не достигнут',
}

/** Короткая подпись урока для списков: тема, иначе навыки. */
export function lessonTitle(l: Lesson): string {
  return l.plan?.title || l.topics.map(skillName).join(', ') || 'Урок без темы'
}
