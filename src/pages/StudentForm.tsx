import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { today } from '../dates'
import { STATUSES, STATUS_LABELS, parseScore } from '../sat'
import { newId } from '../db'
import { useStore } from '../useStore'
import type { Student, StudentStatus } from '../types'

export function StudentForm() {
  const { id } = useParams()
  const { db, dispatch } = useStore()
  const navigate = useNavigate()
  const existing = id ? db.students.find((s) => s.id === id) : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [contact, setContact] = useState(existing?.contact ?? '')
  const [parentContact, setParentContact] = useState(existing?.parentContact ?? '')
  const [status, setStatus] = useState<StudentStatus>(existing?.status ?? 'active')
  const [startDate, setStartDate] = useState(existing?.startDate ?? today())
  const [examDate, setExamDate] = useState(existing?.examDate ?? '')
  const [baseline, setBaseline] = useState(existing?.baselineScore?.toString() ?? '')
  const [target, setTarget] = useState(existing?.targetScore?.toString() ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')

  if (id && !existing) {
    return (
      <div className="page">
        <p>Ученик не найден.</p>
        <Link to="/students">← К списку</Link>
      </div>
    )
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const student: Student = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      name: name.trim(),
      contact: contact.trim(),
      parentContact: parentContact.trim(),
      status,
      startDate,
      examDate,
      baselineScore: parseScore(baseline),
      targetScore: parseScore(target),
      notes: notes.trim(),
    }
    dispatch({ type: 'student/upsert', student })
    navigate(`/students/${student.id}`, { replace: true })
  }

  const onDelete = () => {
    if (!existing) return
    if (!confirm(`Удалить ученика «${existing.name}» вместе со всеми уроками и тестами?`)) return
    dispatch({ type: 'student/delete', id: existing.id })
    navigate('/students', { replace: true })
  }

  return (
    <div className="page narrow">
      <Link className="back" to={existing ? `/students/${existing.id}` : '/students'}>
        ← Назад
      </Link>
      <h1>{existing ? 'Редактировать ученика' : 'Новый ученик'}</h1>

      <form className="card form" onSubmit={onSubmit}>
        <label className="field">
          <span>Имя *</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Контакт ученика</span>
            <input
              className="input"
              placeholder="Telegram, телефон…"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Контакт родителя</span>
            <input className="input" value={parentContact} onChange={(e) => setParentContact(e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Статус</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StudentStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Начало занятий</span>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Дата экзамена</span>
            <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Стартовый балл R&W</span>
            <input
              className="input"
              type="number"
              min={200}
              max={800}
              step={10}
              placeholder="200–800"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Цель R&W</span>
            <input
              className="input"
              type="number"
              min={200}
              max={800}
              step={10}
              placeholder="200–800"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Заметки</span>
          <textarea
            className="input"
            rows={4}
            placeholder="Сильные/слабые стороны, договорённости, расписание…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="row spread">
          <button className="btn btn-primary" type="submit">
            Сохранить
          </button>
          {existing && (
            <button className="btn btn-danger" type="button" onClick={onDelete}>
              Удалить ученика
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
