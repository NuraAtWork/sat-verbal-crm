interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  /** Publishable key (sb_publishable_…) или legacy anon key — оба публичные по дизайну. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Юзернейм Telegram-бота без @ (например SatStartBot); пусто — блоки Telegram скрыты. */
  readonly VITE_TELEGRAM_BOT?: string
}
