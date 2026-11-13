import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, AppState, PloomesOverview, SetupInput, ViewStatus } from '../../shared/types'
import { Sidebar } from './components/Sidebar'
import { AccountForm } from './components/AccountForm'
import { ImportModal } from './components/ImportModal'
import { QuickSwitch } from './components/QuickSwitch'
import { SettingsModal } from './components/SettingsModal'
import { TabsBar } from './components/TabsBar'
import { Icon } from './components/Icon'
import { WindowControls } from './components/WindowControls'
import { sortAccounts } from './util'

type Modal =
  | null
  | { kind: 'form'; account: Partial<Account> | null }
  | { kind: 'quick' }
  | { kind: 'settings' }
  | { kind: 'import' }

export function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<ViewStatus>({ loaded: [], badges: {}, tabs: {} })
  const [modal, setModal] = useState<Modal>(null)
  const history = useRef<string[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === '1'
    } catch {
      return false
    }
  })

  // O main precisa saber a largura da sidebar para posicionar as views do Ploomes.
  useEffect(() => {
    window.api.setSidebarCollapsed(collapsed)
    try {
      localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0')
    } catch {
      /* ignora */
    }
  }, [collapsed])

  useEffect(() => {
    void window.api.getState().then(setState)
    const offs = [
      window.api.onStatus(setStatus),
      window.api.onActive((id) => {
        setActiveId(id)
        if (id) history.current = [id, ...history.current.filter((x) => x !== id)].slice(0, 30)
      })
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Pastas de trabalho / chaves em disco vinculadas às contas. Relê ao mudar contas ou
  // configurações e ao voltar o foco à janela (a pasta pode ter sido criada/apagada por fora).
  const [overview, setOverview] = useState<PloomesOverview>({ links: {}, importable: [] })
  const refreshOverview = useCallback(async (): Promise<PloomesOverview> => {
    const o = await window.api.ploomesOverview()
    setOverview(o)
    return o
  }, [])
  useEffect(() => {
    if (!state) return
    void refreshOverview()
    const onFocus = (): void => void refreshOverview()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [state, refreshOverview])

  // O conteúdo do Ploomes é uma view nativa por cima da janela: some enquanto há modal.
  useEffect(() => {
    window.api.setViewHidden(modal !== null)
  }, [modal])

  const accounts = state?.accounts ?? []
  const ordered = useMemo(() => sortAccounts(accounts.filter((a) => !a.archived)), [accounts])
  const orderedRef = useRef(ordered)
  orderedRef.current = ordered
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  const select = useCallback((id: string) => {
    window.api.activate(id)
    setModal(null)
  }, [])

  useEffect(() => {
    return window.api.onShortcut((s) => {
      const list = orderedRef.current
      if (s.type === 'quick-switch') {
        setModal((m) => (m?.kind === 'quick' ? null : { kind: 'quick' }))
      } else if (s.type === 'toggle-sidebar') {
        setCollapsed((c) => !c)
      } else if (s.type === 'index') {
        const acc = list[s.n - 1]
        if (acc) select(acc.id)
      } else if (s.type === 'previous') {
        const prev = history.current.find((id) => id !== activeRef.current && list.some((a) => a.id === id))
        if (prev) select(prev)
      } else if (s.type === 'cycle' && list.length) {
        const i = list.findIndex((a) => a.id === activeRef.current)
        select(list[(i + s.dir + list.length) % list.length].id)
      }
    })
  }, [select])

  if (!state) return <div className="boot">Carregando…</div>

  const active = accounts.find((a) => a.id === activeId) ?? null

  const saveAccount = async (input: Partial<Account>, work?: SetupInput): Promise<void> => {
    const isNew = !input.id
    const before = new Set(accounts.map((a) => a.id))
    const next = await window.api.saveAccount(input)
    setState(next)
    setModal(null)
    const id = input.id ?? next.accounts.find((a) => !before.has(a.id))?.id
    if (isNew) {
      if (id) window.api.activate(id)
    } else if (input.archived && input.id === activeId) {
      window.api.deactivate()
    }
    if (work && id) {
      let r = await window.api.ploomesSetup(id, work)
      if (!r.ok && r.jaExisteChave && confirm(`${r.erro}\n\nSubstituir a chave guardada por esta?`)) {
        r = await window.api.ploomesSetup(id, { ...work, overwriteKey: true })
      }
      if (!r.ok) alert(`A conta foi salva, mas a pasta/chave não: ${r.erro}`)
      void refreshOverview()
    }
  }

  const importAccounts = async (nomes: string[]): Promise<void> => {
    setState(await window.api.ploomesImport(nomes))
    setModal(null)
  }

  const openImport = async (): Promise<void> => {
    await refreshOverview()
    setModal({ kind: 'import' })
  }

  const deleteAccount = async (id: string): Promise<void> => {
    setState(await window.api.deleteAccount(id))
    setModal(null)
  }

  const toggleArchive = async (a: Account): Promise<void> => {
    setState(await window.api.saveAccount({ id: a.id, archived: !a.archived }))
    if (!a.archived && a.id === activeId) window.api.deactivate()
  }

  const togglePin = async (a: Account): Promise<void> => {
    setState(await window.api.saveAccount({ id: a.id, pinned: !a.pinned }))
  }

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="dragstrip" aria-hidden="true" />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        accounts={accounts}
        activeId={activeId}
        status={status}
        links={overview.links}
        importCount={overview.importable.length}
        onImport={() => void openImport()}
        onSelect={select}
        onNew={() => setModal({ kind: 'form', account: null })}
        onEdit={(a) => setModal({ kind: 'form', account: a })}
        onTogglePin={togglePin}
        onToggleArchive={toggleArchive}
        onSettings={() => setModal({ kind: 'settings' })}
      />

      <main className="main">
        {/* Camada de controles: um único painel de vidro com a barra da conta e as abas */}
        <div className="toolbar glass">
          <header className="topbar">
            {active ? (
              <>
                <span className="dot" style={{ background: active.color }} />
                <strong className="topbar-name">{active.name}</strong>
                <span className="topbar-sub">{active.email}</span>
                <span className="spacer" />
                <span className="btn-group">
                  {overview.links[active.id]?.temPasta && (
                    <button
                      className="ib"
                      aria-label="Abrir pasta de trabalho"
                      title="Abrir a pasta de trabalho do cliente"
                      onClick={() => window.api.ploomesOpenFolder(active.id)}
                    >
                      <Icon name="folder" />
                    </button>
                  )}
                  <button className="ib" aria-label="Recarregar página" title="Recarregar página" onClick={() => window.api.reload(active.id)}>
                    <Icon name="refresh" />
                  </button>
                  <button className="ib" aria-label="Início" title="Voltar à URL inicial da conta" onClick={() => window.api.goHome(active.id)}>
                    <Icon name="home" />
                  </button>
                  <button className="ib" aria-label="Logar novamente" title="Preencher e enviar o login de novo" onClick={() => window.api.login(active.id)}>
                    <Icon name="login" />
                  </button>
                  <button
                    className="ib"
                    aria-label="Inspecionar página"
                    title="Inspecionar (DevTools) — F12"
                    onClick={() => window.api.devTools(active.id)}
                  >
                    <Icon name="code" />
                  </button>
                  <button
                    className="ib"
                    aria-label="Abrir console"
                    title="Console — Ctrl+Shift+J"
                    onClick={() => window.api.devTools(active.id, 'console')}
                  >
                    <Icon name="terminal" />
                  </button>
                  <button
                    className="ib"
                    aria-label="Suspender conta"
                    title="Descarregar da memória (a sessão continua salva)"
                    onClick={() => window.api.suspend(active.id)}
                  >
                    <Icon name="pause" />
                  </button>
                </span>
              </>
            ) : (
              <>
                <span className="topbar-sub">Nenhuma conta selecionada</span>
                <span className="spacer" />
              </>
            )}
            <button className="searchpill" aria-label="Buscar conta" onClick={() => setModal({ kind: 'quick' })}>
              <Icon name="search" size={14} /> Buscar <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </button>
            <WindowControls />
          </header>

          <TabsBar accountId={activeId} tabs={activeId ? status.tabs[activeId] ?? [] : []} />
        </div>

        {/* Camada de conteúdo: a view nativa do Ploomes cobre este cartão quando há conta ativa */}
        <section className="empty">
          <h2>Multilogin Ploomes</h2>
          <p>Escolha uma conta na barra lateral ou use <kbd>Ctrl</kbd>+<kbd>K</kbd>.</p>
          <ul>
            <li><kbd>Ctrl</kbd>+<kbd>1…9</kbd> abre a n-ésima conta da lista</li>
            <li><kbd>Ctrl</kbd>+<kbd>Tab</kbd> volta para a conta anterior</li>
            <li><kbd>Ctrl</kbd>+<kbd>PgDn</kbd>/<kbd>PgUp</kbd> próxima/anterior da lista</li>
            <li><kbd>Ctrl</kbd>+<kbd>B</kbd> retrair / expandir a barra lateral</li>
            <li><kbd>Ctrl</kbd>+<kbd>T</kbd> /<kbd>Ctrl</kbd>+<kbd>W</kbd> nova / fechar aba da conta</li>
            <li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> alternar entre as abas da conta</li>
            <li><kbd>F12</kbd> inspecionar · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> console · clique direito → Inspecionar elemento</li>
            <li><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> voltar / avançar · <kbd>F5</kbd> recarregar · <kbd>Ctrl</kbd>+<kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd> zoom</li>
          </ul>
        </section>
      </main>

      {modal?.kind === 'form' && (
        <AccountForm
          initial={modal.account}
          link={modal.account?.id ? overview.links[modal.account.id] : undefined}
          allTags={[...new Set(accounts.flatMap((a) => a.tags))].sort()}
          defaultUrl={state.settings.baseUrl}
          onSave={saveAccount}
          onDelete={deleteAccount}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'import' && (
        <ImportModal items={overview.importable} onImport={importAccounts} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'quick' && (
        <QuickSwitch accounts={ordered} onPick={select} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'settings' && (
        <SettingsModal
          settings={state.settings}
          dataDir={state.dataDir}
          onSave={async (s) => {
            setState(await window.api.saveSettings(s))
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
