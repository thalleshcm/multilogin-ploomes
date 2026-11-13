import { useMemo, useState } from 'react'
import type { Account, ViewStatus, WorkItem } from '../../../shared/types'
import { Icon } from './Icon'
import { initial, matches, sortAccounts } from '../util'

type StatusFilter = 'active' | 'archived' | 'all'

interface Props {
  accounts: Account[]
  activeId: string | null
  status: ViewStatus
  links: Record<string, WorkItem>
  /** quantas contas em disco ainda não foram importadas */
  importCount: number
  onImport: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onEdit: (a: Account) => void
  onTogglePin: (a: Account) => void
  onToggleArchive: (a: Account) => void
  onSettings: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

export function Sidebar(p: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [tag, setTag] = useState<string | null>(null)

  const tags = useMemo(() => [...new Set(p.accounts.flatMap((a) => a.tags))].sort(), [p.accounts])

  const list = useMemo(() => {
    const filtered = p.accounts.filter(
      (a) =>
        (statusFilter === 'all' || (statusFilter === 'archived') === a.archived) &&
        (!tag || a.tags.includes(tag)) &&
        matches(a, query)
    )
    return sortAccounts(filtered)
  }, [p.accounts, statusFilter, tag, query])

  const counts = {
    active: p.accounts.filter((a) => !a.archived).length,
    archived: p.accounts.filter((a) => a.archived).length
  }

  if (p.collapsed) {
    const rail = sortAccounts(p.accounts.filter((a) => !a.archived))
    return (
      <aside className="sidebar rail glass" aria-label="Contas">
        <button className="ib" aria-label="Expandir barra lateral" title="Expandir barra lateral (Ctrl+B)" onClick={p.onToggleCollapsed}>
          <Icon name="chevrons-right" />
        </button>
        <button className="ib tint" aria-label="Nova conta" title="Nova conta" onClick={p.onNew}>
          <Icon name="plus" />
        </button>
        <ul className="list rail-list edge-fade">
          {rail.map((a) => {
            const badge = p.status.badges[a.id] ?? 0
            return (
              <li
                key={a.id}
                className={`rail-item ${a.id === p.activeId ? 'active' : ''}`}
                title={`${a.name}${a.email ? ` — ${a.email}` : ''}`}
                onClick={() => p.onSelect(a.id)}
              >
                <span className="avatar" style={{ background: a.color }}>
                  {initial(a)}
                </span>
                {badge > 0 && <span className="badge rail-badge">{badge}</span>}
                {p.status.loaded.includes(a.id) && <span className="loaded rail-loaded" />}
              </li>
            )
          })}
        </ul>
        <button className="ib" aria-label="Importar contas" title="Importar contas" onClick={p.onImport}>
          <Icon name="import" />
        </button>
        <button className="ib" aria-label="Configurações" title="Configurações" onClick={p.onSettings}>
          <Icon name="sliders" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="sidebar glass" aria-label="Contas">
      <div className="side-head">
        <strong>Contas</strong>
        <span className="head-btns">
          <button className="ib" aria-label="Retrair barra lateral" title="Retrair barra lateral (Ctrl+B)" onClick={p.onToggleCollapsed}>
            <Icon name="chevrons-left" />
          </button>
          <button className="ib tint" aria-label="Nova conta" title="Nova conta" onClick={p.onNew}>
            <Icon name="plus" />
          </button>
        </span>
      </div>

      <label className="searchbox">
        <Icon name="search" size={15} />
        <input
          placeholder="Filtrar por nome, e-mail ou tag…"
          aria-label="Filtrar contas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="seg" role="tablist" aria-label="Status das contas">
        {(
          [
            ['active', `Ativas ${counts.active}`],
            ['archived', `Arquivadas ${counts.archived}`],
            ['all', 'Todas']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={statusFilter === key}
            className={statusFilter === key ? 'on' : ''}
            onClick={() => setStatusFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <ul className="list edge-fade">
        {list.map((a) => {
          const loaded = p.status.loaded.includes(a.id)
          const badge = p.status.badges[a.id] ?? 0
          const link = p.links[a.id]
          return (
            <li
              key={a.id}
              className={`item ${a.id === p.activeId ? 'active' : ''} ${a.archived ? 'archived' : ''}`}
              onClick={() => !a.archived && p.onSelect(a.id)}
              onDoubleClick={() => a.archived && p.onEdit(a)}
            >
              <span className="avatar" style={{ background: a.color }}>
                {initial(a)}
              </span>
              <span className="meta">
                <span className="name">
                  {a.pinned && (
                    <span className="pin" title="Fixada no topo">
                      <Icon name="star" size={11} />
                    </span>
                  )}
                  {a.name}
                  {link?.temPasta && (
                    <span className="wk" title="Pasta de trabalho criada">
                      <Icon name="folder" size={12} />
                    </span>
                  )}
                  {link?.temChave && (
                    <span className="wk" title="Chave da API guardada">
                      <Icon name="key" size={12} />
                    </span>
                  )}
                </span>
                <span className="sub">{a.tags.length ? a.tags.join(' · ') : a.email}</span>
              </span>
              {badge > 0 && <span className="badge">{badge}</span>}
              {loaded && <span className="loaded" title="Carregada na memória" />}
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="ib sm"
                  aria-label={a.pinned ? 'Desafixar' : 'Fixar no topo'}
                  title={a.pinned ? 'Desafixar' : 'Fixar no topo'}
                  onClick={() => p.onTogglePin(a)}
                >
                  <Icon name="star" size={13} />
                </button>
                <button className="ib sm" aria-label="Editar" title="Editar" onClick={() => p.onEdit(a)}>
                  <Icon name="edit" size={13} />
                </button>
                <button
                  className="ib sm"
                  aria-label={a.archived ? 'Reativar' : 'Arquivar'}
                  title={a.archived ? 'Reativar' : 'Arquivar'}
                  onClick={() => p.onToggleArchive(a)}
                >
                  <Icon name={a.archived ? 'restore' : 'archive'} size={13} />
                </button>
              </span>
            </li>
          )
        })}
        {list.length === 0 && (
          <li className="none">
            {p.accounts.length === 0 ? 'Nenhuma conta ainda. Use o botão + para criar.' : 'Nada encontrado.'}
          </li>
        )}
      </ul>

      <div className="side-foot">
        <button className="ghost" onClick={p.onSettings}>
          <Icon name="sliders" size={15} /> Configurações
        </button>
        <button className="ghost" onClick={p.onImport} title="Trazer contas que já têm pasta de trabalho ou chave de API">
          <Icon name="import" size={15} /> Importar{p.importCount > 0 ? ` (${p.importCount})` : ''}
        </button>
      </div>
    </aside>
  )
}
