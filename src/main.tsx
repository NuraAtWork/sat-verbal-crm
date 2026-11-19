import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import '@fontsource-variable/inter'
import './index.css'
import './sets.css'
import { SolveApp } from './solve/SolveApp.tsx'
import { StoreProvider } from './store.tsx'
import { applyTheme, storedTheme } from './theme.ts'
import { VocabApp } from './vocab/VocabApp.tsx'

// Тема CRM: светлая по умолчанию, тёмная — по переключателю (страница ученика всегда светлая).
applyTheme(storedTheme())

// Ссылка ученика (#/solve/<token>) открывает отдельную страницу без входа и без CRM.
const SOLVE_RE = /^#\/solve\/([0-9a-f]{64})\/?$/
const solveToken = window.location.hash.match(SOLVE_RE)?.[1]
// Тренер словаря (#/vocab/<token>) — постоянная ссылка ученика; #/vocab/demo — демо без облака.
const VOCAB_RE = /^#\/vocab\/([0-9a-f]{64}|demo)\/?$/
const vocabToken = window.location.hash.match(VOCAB_RE)?.[1]

// Если ссылку ученика вставили во вкладку, где уже открыта CRM (или наоборот), перезагружаемся в нужный режим.
// Слушаем и popstate: роутер CRM узнаёт о смене адреса именно по нему и иначе успел бы увести на главную
// раньше перезагрузки — поэтому событие до него не пропускаем.
const onAddressChange = (e: Event) => {
  const next = window.location.hash.match(SOLVE_RE)?.[1]
  const nextVocab = window.location.hash.match(VOCAB_RE)?.[1]
  if (next !== solveToken || nextVocab !== vocabToken) {
    e.stopImmediatePropagation()
    window.location.reload()
  }
}
window.addEventListener('popstate', onAddressChange)
window.addEventListener('hashchange', onAddressChange)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {solveToken ? (
      <SolveApp token={solveToken} />
    ) : vocabToken ? (
      <VocabApp token={vocabToken} />
    ) : (
      <StoreProvider>
        <App />
      </StoreProvider>
    )}
  </StrictMode>,
)
