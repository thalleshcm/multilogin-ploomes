import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppState,
  KeyTestResult,
  PloomesOverview,
  SetupInput,
  SetupResult,
  Settings,
  Shortcut,
  ViewStatus,
  WindowState
} from '../shared/types'

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('state:get'),
  saveAccount: (account: Partial<Account>): Promise<AppState> =>
    ipcRenderer.invoke('account:save', account),
  deleteAccount: (id: string): Promise<AppState> => ipcRenderer.invoke('account:delete', id),
  saveSettings: (settings: Settings): Promise<AppState> =>
    ipcRenderer.invoke('settings:save', settings),

  ploomesOverview: (): Promise<PloomesOverview> => ipcRenderer.invoke('ploomes:overview'),
  ploomesTestKey: (key: string): Promise<KeyTestResult> => ipcRenderer.invoke('ploomes:test-key', key),
  ploomesTestSaved: (accountId: string): Promise<KeyTestResult> =>
    ipcRenderer.invoke('ploomes:test-saved', accountId),
  ploomesSetup: (accountId: string, input: SetupInput): Promise<SetupResult> =>
    ipcRenderer.invoke('ploomes:setup', accountId, input),
  ploomesImport: (nomes: string[]): Promise<AppState> => ipcRenderer.invoke('ploomes:import', nomes),
  ploomesOpenFolder: (accountId: string): void => ipcRenderer.send('ploomes:open-folder', accountId),

  activate: (id: string): void => ipcRenderer.send('view:activate', id),
  deactivate: (): void => ipcRenderer.send('view:deactivate'),
  setViewHidden: (hidden: boolean): void => ipcRenderer.send('view:hidden', hidden),
  reload: (id: string): void => ipcRenderer.send('view:reload', id),
  goHome: (id: string): void => ipcRenderer.send('view:home', id),
  login: (id: string): void => ipcRenderer.send('view:login', id),
  suspend: (id: string): void => ipcRenderer.send('view:suspend', id),
  devTools: (id: string, panel?: 'console'): void => ipcRenderer.send('view:devtools', id, panel),
  openDataDir: (): void => ipcRenderer.send('app:open-data-dir'),
  windowState: (): Promise<WindowState> => ipcRenderer.invoke('win:state'),
  windowMinimize: (): void => ipcRenderer.send('win:minimize'),
  windowToggleMaximize: (): void => ipcRenderer.send('win:toggle-maximize'),
  windowClose: (): void => ipcRenderer.send('win:close'),
  onWindowState: (cb: (s: WindowState) => void) => listen<WindowState>('win:state', cb),
  setSidebarCollapsed: (collapsed: boolean): void => ipcRenderer.send('layout:sidebar', collapsed),
  newTab: (accountId: string): void => ipcRenderer.send('tab:new', accountId),
  selectTab: (accountId: string, tabId: string): void =>
    ipcRenderer.send('tab:select', accountId, tabId),
  closeTab: (accountId: string, tabId: string): void =>
    ipcRenderer.send('tab:close', accountId, tabId),

  onShortcut: (cb: (s: Shortcut) => void) => listen<Shortcut>('shortcut', cb),
  onStatus: (cb: (s: ViewStatus) => void) => listen<ViewStatus>('views:status', cb),
  onActive: (cb: (id: string | null) => void) => listen<string | null>('views:active', cb)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
