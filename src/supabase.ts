import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

/**
 * Клиент Supabase или null, если переменные окружения не заданы —
 * тогда приложение работает в локальном режиме (только localStorage).
 */
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Вход по паролю — токенов в URL не бывает, а hash занят HashRouter.
          detectSessionInUrl: false,
        },
      })
    : null
