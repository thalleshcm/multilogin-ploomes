import { randomUUID } from 'crypto'
import { BrowserWindow, Input, Menu, WebContentsView, clipboard, shell } from 'electron'
import {
  PANEL_GAP,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH,
  Shortcut,
  TABSBAR_HEIGHT,
  TOPBAR_HEIGHT,
  VIEW_RADIUS,
  ViewStatus,
  WINDOW_PAD
} from '../shared/types'
import { buildAutoLoginScript, CHECK_LOGIN_FORM_SCRIPT } from './autologin'
import { getAccount, getSettings, touchAccount } from './store'

interface Tab {
  id: string
  view: WebContentsView
  title: string
  badge: number
}

/** Uma conta = uma sessão (partition) compartilhada por todas as suas sub-abas. */
interface Entry {
  tabs: Tab[]
  activeTab: string
  lastActive: number
  lastAutoLogin: number
  autoLoginRunning: boolean
  /** Envios seguidos sem o formulário sumir; evita travar a conta com senha errada */
  attempts: number
  watcher: NodeJS.Timeout | null
}

const AUTOLOGIN_COOLDOWN_MS = 15_000
const AUTOLOGIN_MAX_ATTEMPTS = 3
const AUTOLOGIN_WATCH_MS = 2_000
const IDLE_CHECK_MS = 30_000

const entries = new Map<string, Entry>()
let win: BrowserWindow
let activeId: string | null = null
let hidden = false
let sidebarWidth = SIDEBAR_WIDTH

export function setSidebarCollapsed(collapsed: boolean): void {
  sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH
  layout()
}

export function initViews(window: BrowserWindow): void {
  win = window
  win.on('resize', layout)
  win.on('maximize', layout)
  win.on('unmaximize', layout)
  win.on('enter-full-screen', layout)
  win.on('leave-full-screen', layout)
  win.webContents.on('before-input-event', handleInput)
  // botões voltar/avançar do mouse (Windows)
  win.on('app-command', (_e, cmd) => {
    if (!activeId) return
    if (cmd === 'browser-backward') goBack(activeId)
    else if (cmd === 'browser-forward') goForward(activeId)
  })
  setInterval(suspendIdle, IDLE_CHECK_MS)
}

function send(channel: string, payload?: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

const badgeOf = (e: Entry): number => Math.max(0, ...e.tabs.map((t) => t.badge))
const currentTab = (e: Entry): Tab | undefined => e.tabs.find((t) => t.id === e.activeTab)

function emitStatus(): void {
  const status: ViewStatus = {
    loaded: [...entries.keys()],
    badges: Object.fromEntries([...entries].map(([id, e]) => [id, badgeOf(e)])),
    tabs: Object.fromEntries(
      [...entries].map(([id, e]) => [
        id,
        e.tabs.map((t) => ({ id: t.id, title: t.title, active: t.id === e.activeTab }))
      ])
    )
  }
  send('views:status', status)
}

function layout(): void {
  const [w, h] = win.getContentSize()
  // Painéis flutuantes: a view do Ploomes ocupa o cartão à direita da sidebar e abaixo da toolbar.
  const x = WINDOW_PAD + sidebarWidth + PANEL_GAP
  const y = WINDOW_PAD + TOPBAR_HEIGHT + TABSBAR_HEIGHT + PANEL_GAP
  const bounds = {
    x,
    y,
    width: Math.max(0, w - x - WINDOW_PAD),
    height: Math.max(0, h - y - WINDOW_PAD)
  }
  for (const e of entries.values()) for (const t of e.tabs) t.view.setBounds(bounds)
}

/** Só a aba ativa da conta ativa fica visível (e só se não houver modal aberto). */
function applyVisibility(): void {
  for (const [id, e] of entries) {
    for (const t of e.tabs) t.view.setVisible(!hidden && id === activeId && t.id === e.activeTab)
  }
  if (!hidden && activeId) {
    const entry = entries.get(activeId)
    if (entry) currentTab(entry)?.view.webContents.focus()
  }
}

function updateTitle(): void {
  if (win.isDestroyed()) return
  const acc = activeId ? getAccount(activeId) : undefined
  const entry = activeId ? entries.get(activeId) : undefined
  const badge = entry ? badgeOf(entry) : 0
  win.setTitle(acc ? `${badge ? `(${badge}) ` : ''}${acc.name} — Multilogin Ploomes` : 'Multilogin Ploomes')
}

function handleInput(event: Electron.Event, input: Input): void {
  if (input.type !== 'keyDown') return
  const key = input.key
  const lower = key.toLowerCase()

  // Sem Ctrl: F12 (DevTools), F5 (recarregar), Alt+←/→ (voltar/avançar)
  if (!(input.control || input.meta)) {
    if (!activeId) return
    if (key === 'F12') {
      event.preventDefault()
      toggleDevTools(activeId)
    } else if (key === 'F5') {
      event.preventDefault()
      if (input.shift) hardReload(activeId)
      else reload(activeId)
    } else if (input.alt && key === 'ArrowLeft') {
      event.preventDefault()
      goBack(activeId)
    } else if (input.alt && key === 'ArrowRight') {
      event.preventDefault()
      goForward(activeId)
    }
    return
  }

  // DevTools do próprio app (a interface), para depuração: Ctrl+Shift+Alt+I
  if (input.shift && input.alt && lower === 'i') {
    event.preventDefault()
    toggleAppDevTools()
    return
  }

  // Ferramentas da página ativa
  if (activeId && !input.alt) {
    let handled = true
    if (input.shift && lower === 'i') toggleDevTools(activeId)
    else if (input.shift && lower === 'j') toggleDevTools(activeId, 'console')
    else if (lower === 'r' || key === 'F5') {
      if (input.shift || key === 'F5') hardReload(activeId)
      else reload(activeId)
    } else if (key === '=' || key === '+') zoom(activeId, 1)
    else if (key === '-' || key === '_') zoom(activeId, -1)
    else if (key === '0') zoom(activeId, 0)
    else handled = false
    if (handled) {
      event.preventDefault()
      return
    }
  }

  // Sub-abas: tratadas aqui mesmo, pois o estado delas é do processo principal.
  if (activeId && !input.shift && !input.alt && (lower === 't' || lower === 'w')) {
    event.preventDefault()
    if (lower === 't') newTab(activeId)
    else {
      const entry = entries.get(activeId)
      const tab = entry && currentTab(entry)
      if (tab) closeTab(activeId, tab.id)
    }
    return
  }
  if (activeId && input.alt && (key === 'ArrowRight' || key === 'ArrowLeft')) {
    event.preventDefault()
    cycleTab(activeId, key === 'ArrowRight' ? 1 : -1)
    return
  }

  let shortcut: Shortcut | null = null
  if (lower === 'k' && !input.shift && !input.alt) shortcut = { type: 'quick-switch' }
  else if (lower === 'b' && !input.shift && !input.alt) shortcut = { type: 'toggle-sidebar' }
  else if (/^[1-9]$/.test(key) && !input.alt) shortcut = { type: 'index', n: Number(key) }
  else if (key === 'Tab' && !input.shift) shortcut = { type: 'previous' }
  else if (key === 'PageDown') shortcut = { type: 'cycle', dir: 1 }
  else if (key === 'PageUp') shortcut = { type: 'cycle', dir: -1 }
  if (!shortcut) return
  event.preventDefault()
  send('shortcut', shortcut)
}

function isPloomesUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url)
    return (protocol === 'https:' || protocol === 'http:') && /(^|\.)ploomes\.com$/i.test(hostname)
  } catch {
    return false
  }
}

function startUrlFor(id: string): string {
  const acc = getAccount(id)
  return acc?.startUrl?.trim() || getSettings().baseUrl
}

function createTab(accId: string, entry: Entry, url: string): Tab {
  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:acc-${accId}`, // mesma partition = mesma sessão em todas as abas
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  view.setBorderRadius(VIEW_RADIUS)
  const tab: Tab = { id: randomUUID(), view, title: '', badge: 0 }
  entry.tabs.push(tab)
  win.contentView.addChildView(view)
  view.setVisible(false)
  layout()

  const wc = view.webContents
  wc.on('before-input-event', handleInput)
  wc.on('context-menu', (_e, params) => showContextMenu(accId, tab, params))

  // Links que abririam nova aba/janela do Ploomes viram sub-aba da mesma conta.
  wc.setWindowOpenHandler(({ url: target }) => {
    if (isPloomesUrl(target)) newTab(accId, target)
    else if (/^https?:/i.test(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })

  wc.on('page-title-updated', (_e, title) => {
    tab.title = title
    const m = /^\((\d+)\)/.exec(title)
    tab.badge = m ? Number(m[1]) : 0
    if (accId === activeId) updateTitle()
    emitStatus()
  })

  wc.on('render-process-gone', () => {
    const wasActive = accId === activeId
    closeTab(accId, tab.id, true)
    if (wasActive && !entries.has(accId)) activate(accId)
  })

  void wc.loadURL(url)
  return tab
}

function ensure(id: string): Entry {
  const existing = entries.get(id)
  if (existing) return existing

  const entry: Entry = {
    tabs: [],
    activeTab: '',
    lastActive: Date.now(),
    lastAutoLogin: 0,
    autoLoginRunning: false,
    attempts: 0,
    watcher: null
  }
  entries.set(id, entry)
  entry.activeTab = createTab(id, entry, startUrlFor(id)).id

  // Vigia o formulário de login em vez de depender de eventos de navegação:
  // cobre o caso de a Cloudflare / a SPA só mostrarem o login depois do load.
  entry.watcher = setInterval(() => void autoLogin(id), AUTOLOGIN_WATCH_MS)
  emitStatus()
  return entry
}

async function autoLogin(id: string, force = false): Promise<void> {
  const entry = entries.get(id)
  const acc = getAccount(id)
  if (!entry || !acc || !acc.email || !acc.password) return
  if (entry.autoLoginRunning) return
  if (!force && Date.now() - entry.lastAutoLogin < AUTOLOGIN_COOLDOWN_MS) return

  entry.autoLoginRunning = true
  try {
    let formSeen = false
    for (const tab of [...entry.tabs]) {
      const wc = tab.view.webContents
      if (wc.isDestroyed() || wc.isLoading()) continue
      const state = await wc.executeJavaScript(CHECK_LOGIN_FORM_SCRIPT)
      if (state !== 'form') continue
      formSeen = true
      if (force) entry.attempts = 0
      if (entry.attempts >= AUTOLOGIN_MAX_ATTEMPTS) break // use "Logar" para tentar de novo

      const result = await wc.executeJavaScript(buildAutoLoginScript(acc.email, acc.password))
      if (result === 'submitted') {
        entry.lastAutoLogin = Date.now()
        entry.attempts++
      }
      break
    }
    if (!formSeen) entry.attempts = 0 // formulário sumiu: logou (ou está em outra tela)
  } catch (err) {
    console.error(`[autologin] falhou para ${acc.name}`, err)
  } finally {
    entry.autoLoginRunning = false
  }
}

export function activate(id: string): void {
  if (!getAccount(id)) return
  if (activeId && activeId !== id) {
    const prev = entries.get(activeId)
    if (prev) prev.lastActive = Date.now()
  }
  activeId = id
  const entry = ensure(id)
  entry.lastActive = Date.now()
  layout()
  applyVisibility()
  touchAccount(id)
  updateTitle()
  emitStatus()
  send('views:active', id)
}

export function deactivate(): void {
  if (activeId) {
    const prev = entries.get(activeId)
    if (prev) prev.lastActive = Date.now()
  }
  activeId = null
  applyVisibility()
  updateTitle()
  send('views:active', null)
}

export function setHidden(value: boolean): void {
  hidden = value
  applyVisibility()
}

// ---- Sub-abas -------------------------------------------------------------

export function newTab(accId: string, url?: string): void {
  const entry = entries.get(accId)
  if (!entry) return
  const tab = createTab(accId, entry, url ?? startUrlFor(accId))
  entry.activeTab = tab.id
  applyVisibility()
  emitStatus()
}

export function selectTab(accId: string, tabId: string): void {
  const entry = entries.get(accId)
  if (!entry || !entry.tabs.some((t) => t.id === tabId)) return
  entry.activeTab = tabId
  applyVisibility()
  emitStatus()
}

export function cycleTab(accId: string, dir: 1 | -1): void {
  const entry = entries.get(accId)
  if (!entry || entry.tabs.length < 2) return
  const i = entry.tabs.findIndex((t) => t.id === entry.activeTab)
  selectTab(accId, entry.tabs[(i + dir + entry.tabs.length) % entry.tabs.length].id)
}

/** A última aba de uma conta não é fechada (use "Suspender"), exceto se `force` (crash). */
export function closeTab(accId: string, tabId: string, force = false): void {
  const entry = entries.get(accId)
  const idx = entry?.tabs.findIndex((t) => t.id === tabId) ?? -1
  if (!entry || idx < 0) return
  if (entry.tabs.length === 1 && !force) return

  const [tab] = entry.tabs.splice(idx, 1)
  if (!win.isDestroyed()) win.contentView.removeChildView(tab.view)
  if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()

  if (entry.tabs.length === 0) {
    destroy(accId)
    return
  }
  if (entry.activeTab === tabId) {
    entry.activeTab = entry.tabs[Math.min(idx, entry.tabs.length - 1)].id
  }
  applyVisibility()
  updateTitle()
  emitStatus()
}

// ---- Ferramentas da página (DevTools, navegação, zoom, menu de contexto) --------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function tabOf(accId: string): Tab | undefined {
  const entry = entries.get(accId)
  return entry && currentTab(entry)
}

async function showDevToolsPanel(wc: Electron.WebContents, panel: string): Promise<void> {
  // o front-end do DevTools leva um instante para estar pronto
  for (let i = 0; i < 40; i++) {
    const dt = wc.devToolsWebContents
    if (!dt || dt.isDestroyed()) return
    try {
      await dt.executeJavaScript(`DevToolsAPI.showPanel(${JSON.stringify(panel)})`)
      return
    } catch {
      await sleep(150)
    }
  }
}

/** Abre (ou fecha, se já aberto e sem `panel`) o DevTools da aba ativa da conta, destacado. */
export function toggleDevTools(accId: string, panel?: 'console'): void {
  const tab = tabOf(accId)
  if (!tab) return
  const wc = tab.view.webContents
  if (wc.isDevToolsOpened()) {
    if (!panel) {
      wc.closeDevTools()
      return
    }
    wc.devToolsWebContents?.focus()
    void showDevToolsPanel(wc, panel)
    return
  }
  if (panel) wc.once('devtools-opened', () => void showDevToolsPanel(wc, panel))
  wc.openDevTools({ mode: 'detach' })
}

/** DevTools da interface do app (barra lateral, formulários...), útil para depurar o próprio app. */
export function toggleAppDevTools(): void {
  if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
  else win.webContents.openDevTools({ mode: 'detach' })
}

export function goBack(accId: string): void {
  const nav = tabOf(accId)?.view.webContents.navigationHistory
  if (nav?.canGoBack()) nav.goBack()
}

export function goForward(accId: string): void {
  const nav = tabOf(accId)?.view.webContents.navigationHistory
  if (nav?.canGoForward()) nav.goForward()
}

export function hardReload(accId: string): void {
  tabOf(accId)?.view.webContents.reloadIgnoringCache()
}

/** dir: +1 aumenta, -1 diminui, 0 volta a 100%. Só a aba atual. */
export function zoom(accId: string, dir: 1 | -1 | 0): void {
  const wc = tabOf(accId)?.view.webContents
  if (!wc) return
  wc.setZoomLevel(dir === 0 ? 0 : Math.min(5, Math.max(-3, wc.getZoomLevel() + dir * 0.5)))
}

function showContextMenu(accId: string, tab: Tab, params: Electron.ContextMenuParams): void {
  const wc = tab.view.webContents
  const nav = wc.navigationHistory
  const isWeb = (u: string): boolean => /^https?:/i.test(u)
  const items: Electron.MenuItemConstructorOptions[] = []

  if (params.linkURL) {
    items.push(
      { label: 'Abrir link em nova aba', enabled: isPloomesUrl(params.linkURL), click: () => newTab(accId, params.linkURL) },
      { label: 'Abrir link no navegador padrão', enabled: isWeb(params.linkURL), click: () => void shell.openExternal(params.linkURL) },
      { label: 'Copiar endereço do link', click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' }
    )
  }
  if (params.isEditable) {
    const f = params.editFlags
    items.push(
      { label: 'Desfazer', role: 'undo', enabled: f.canUndo },
      { label: 'Refazer', role: 'redo', enabled: f.canRedo },
      { type: 'separator' },
      { label: 'Recortar', role: 'cut', enabled: f.canCut },
      { label: 'Copiar', role: 'copy', enabled: f.canCopy },
      { label: 'Colar', role: 'paste', enabled: f.canPaste },
      { label: 'Selecionar tudo', role: 'selectAll', enabled: f.canSelectAll },
      { type: 'separator' }
    )
  } else if (params.selectionText) {
    items.push({ label: 'Copiar', role: 'copy' }, { type: 'separator' })
  }

  items.push(
    { label: 'Voltar', enabled: nav.canGoBack(), click: () => nav.goBack() },
    { label: 'Avançar', enabled: nav.canGoForward(), click: () => nav.goForward() },
    { label: 'Recarregar', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Copiar endereço da página', click: () => clipboard.writeText(wc.getURL()) },
    { label: 'Abrir página no navegador padrão', enabled: isWeb(wc.getURL()), click: () => void shell.openExternal(wc.getURL()) },
    { type: 'separator' },
    {
      label: 'Inspecionar elemento',
      click: () => {
        wc.inspectElement(params.x, params.y)
        wc.devToolsWebContents?.focus()
      }
    },
    { label: 'Abrir console', click: () => toggleDevTools(accId, 'console') }
  )
  Menu.buildFromTemplate(items).popup({ window: win })
}

// ---- Ciclo de vida --------------------------------------------------------

export function destroy(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entries.delete(id)
  if (entry.watcher) clearInterval(entry.watcher)
  for (const tab of entry.tabs) {
    if (!win.isDestroyed()) win.contentView.removeChildView(tab.view)
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
  }
  if (id === activeId) {
    activeId = null
    updateTitle()
    send('views:active', null)
  }
  emitStatus()
}

export function reload(id: string): void {
  const entry = entries.get(id)
  if (entry) currentTab(entry)?.view.webContents.reload()
}

export function goHome(id: string): void {
  const entry = entries.get(id)
  const tab = entry && currentTab(entry)
  if (tab) void tab.view.webContents.loadURL(startUrlFor(id))
}

export function forceLogin(id: string): void {
  void autoLogin(id, true)
}

/** Chamado quando uma conta é editada ou excluída. */
export function accountChanged(id: string, removed: boolean): void {
  if (removed) destroy(id)
  else updateTitle()
}

function suspendIdle(): void {
  const idleMinutes = getSettings().idleMinutes
  if (idleMinutes <= 0) return
  const limit = Date.now() - idleMinutes * 60_000
  for (const [id, e] of entries) {
    if (id !== activeId && e.lastActive < limit) destroy(id)
  }
}
