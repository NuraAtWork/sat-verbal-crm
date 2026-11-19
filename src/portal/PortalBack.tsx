import { portalBackHref } from '../portal'
import './portal.css'

/** Ссылка «в кабинет» на страницах задания и словаря — только если ученик пришёл из кабинета. */
export function PortalBack() {
  const href = portalBackHref()
  if (!href) return null
  return (
    <a className="pt-back" href={href}>
      ← Мой кабинет
    </a>
  )
}
