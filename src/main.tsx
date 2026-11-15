import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './sets.css'
import { SolveApp } from './solve/SolveApp.tsx'
import { StoreProvider } from './store.tsx'

// Ссылка ученика (#/solve/<token>) открывает отдельную страницу без входа и без CRM.
const SOLVE_RE = /^#\/solve\/([0-9a-f]{64})\/?$/
const solveToken = window.location.hash.match(SOLVE_RE)?.[1]

// Если ссылку ученика вставили во вкладку, где уже открыта CRM (или наоборот), перезагружаемся в нужный режим.
window.addEventListener('hashchange', () => {
  const next = window.location.hash.match(SOLVE_RE)?.[1]
  if (next !== solveToken) window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {solveToken ? (
      <SolveApp token={solveToken} />
    ) : (
      <StoreProvider>
        <App />
      </StoreProvider>
    )}
  </StrictMode>,
)
