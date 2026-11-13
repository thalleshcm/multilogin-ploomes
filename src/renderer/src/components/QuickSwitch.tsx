import { useEffect, useMemo, useRef, useState } from 'react'
import type { Account } from '../../../shared/types'
import { initial, matches } from '../util'

interface Props {
  /** Contas ativas, na ordem da barra lateral */
  accounts: Account[]
  onPick: (id: string) => void
  onClose: () => void
}

export function QuickSwitch({ accounts, onPick, onClose }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const results = useMemo(() => {
    if (!query.trim()) return [...accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 12)
    return accounts.filter((a) => matches(a, query)).slice(0, 12)
  }, [accounts, query])

  useEffect(() => setCursor(0), [query])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && results[cursor]) onPick(results[cursor].id)
  }

  return (
    <div className="overlay top" onMouseDown={onClose}>
      <div className="quick glass sheet" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ir para a conta… (digite parte do nome)"
        />
        <ul>
          {results.map((a, i) => (
            <li key={a.id} className={i === cursor ? 'on' : ''} onMouseEnter={() => setCursor(i)} onClick={() => onPick(a.id)}>
              <span className="avatar sm" style={{ background: a.color }}>
                {initial(a)}
              </span>
              <span className="name">{a.name}</span>
              <span className="sub">{a.tags.join(' · ') || a.email}</span>
            </li>
          ))}
          {results.length === 0 && <li className="none">Nenhuma conta encontrada.</li>}
        </ul>
      </div>
    </div>
  )
}
