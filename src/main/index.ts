import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { Account, SetupInput, Settings, WindowState } from '../shared/types'
import { testarChave } from './ploomes'
import { importar, openFolder, overview, setupWork, testSaved } from './work'
import {
  deleteAccount,
  dataDir,
  getState,
  initStore,
  saveAccount,
  saveSettings
} from './store'
import {
  accountChanged,
  activate,
  closeTab,
  deactivate,
  destroy,
  forceLogin,
  goHome,
  initViews,
  newTab,
  reload,
  selectTab,
  setHidden,
  setSidebarCollapsed,
  toggleDevTools
} from './views'

// Tudo (sessões, cache, accounts.json) fica na pasta `data` ao lado do .exe.
// Precisa rodar antes de app.whenReady().
app.setPath('userData', join(dataDir, 'userData'))

// Remove "Electron/x.y" e o nome do app do User-Agent para parecer um Chrome comum.
app.userAgentFallback = app.userAgentFallback
  .replace(/\s(?:Electron|multilogin-ploomes|Multilogin[\w.-]*)\/\S+/gi, '')
  .trim()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Multilogin Ploomes',
    icon: join(app.getAppPath(), 'resources/icon.png'),
    // mesma cor-base do fundo ambiente do renderer (styles.css), para não piscar ao abrir
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0b12' : '#e8ebf5',
    autoHideMenuBar: true,
    // Sem barra de título nativa: os botões de janela são desenhados no renderer (WindowControls)
    // e a toolbar de vidro serve de área de arrastar. Mantém o redimensionamento e o encaixe nativos.
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.removeMenu()
  win.on('page-title-updated', (e) => e.preventDefault())
  const sendWindowState = (): void => {
    if (win && !win.isDestroyed()) win.webContents.send('win:state', windowState())
  }
  win.on('maximize', sendWindowState)
  win.on('unmaximize', sendWindowState)
  win.on('enter-full-screen', sendWindowState)
  win.on('leave-full-screen', sendWindowState)
  initViews(win)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.on('closed', () => (win = null))
}

function windowState(): WindowState {
  return { maximized: !!win?.isMaximized(), fullscreen: !!win?.isFullScreen() }
}

function registerIpc(): void {
  ipcMain.handle('state:get', () => getState())

  ipcMain.handle('win:state', () => windowState())
  ipcMain.on('win:minimize', () => win?.minimize())
  ipcMain.on('win:toggle-maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())

  ipcMain.handle('account:save', (_e, input: Partial<Account>) => {
    const saved = saveAccount(input)
    accountChanged(saved.id, false)
    return getState()
  })

  ipcMain.handle('account:delete', (_e, id: string) => {
    deleteAccount(id)
    accountChanged(id, true)
    return getState()
  })

  ipcMain.handle('settings:save', (_e, settings: Settings) => {
    saveSettings(settings)
    return getState()
  })

  ipcMain.handle('ploomes:overview', () => overview())
  ipcMain.handle('ploomes:test-key', (_e, key: string) => testarChave(String(key || '').trim()))
  ipcMain.handle('ploomes:test-saved', (_e, id: string) => testSaved(String(id)))
  ipcMain.handle('ploomes:setup', (_e, id: string, input: SetupInput) => setupWork(String(id), input))
  ipcMain.handle('ploomes:import', (_e, nomes: string[]) => importar(nomes.map(String)))
  ipcMain.on('ploomes:open-folder', (_e, id: string) => openFolder(String(id)))

  ipcMain.on('view:activate', (_e, id: string) => activate(id))
  ipcMain.on('view:deactivate', () => deactivate())
  ipcMain.on('view:hidden', (_e, value: boolean) => setHidden(value))
  ipcMain.on('view:reload', (_e, id: string) => reload(id))
  ipcMain.on('view:home', (_e, id: string) => goHome(id))
  ipcMain.on('view:login', (_e, id: string) => forceLogin(id))
  ipcMain.on('view:suspend', (_e, id: string) => destroy(id))
  ipcMain.on('view:devtools', (_e, id: string, panel?: 'console') =>
    toggleDevTools(String(id), panel === 'console' ? 'console' : undefined)
  )
  ipcMain.on('layout:sidebar', (_e, collapsed: boolean) => setSidebarCollapsed(collapsed))
  ipcMain.on('tab:new', (_e, accountId: string) => newTab(accountId))
  ipcMain.on('tab:select', (_e, accountId: string, tabId: string) => selectTab(accountId, tabId))
  ipcMain.on('tab:close', (_e, accountId: string, tabId: string) => closeTab(accountId, tabId))
  ipcMain.on('app:open-data-dir', () => void shell.openPath(dataDir))
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(() => {
  initStore()
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
