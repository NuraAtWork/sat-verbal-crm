import type { SupabaseClient } from '@supabase/supabase-js'
import { useState, type FormEvent } from 'react'

function translate(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Неверный email или пароль.'
  if (/email not confirmed/i.test(message)) return 'Email не подтверждён. Подтвердите пользователя в панели Supabase.'
  if (/failed to fetch|network/i.test(message)) return 'Нет связи с сервером. Проверьте интернет.'
  return message
}

export function Login({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(translate(error.message))
  }

  return (
    <div className="splash">
      <form className="card form login" onSubmit={onSubmit}>
        <div className="brand">
          <span className="brand-mark">RW</span>
          <span>
            SAT Verbal
            <small>CRM</small>
          </span>
        </div>
        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
