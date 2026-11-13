export interface Account {
  id: string
  name: string
  email: string
  password: string
  color: string
  /** Emoji ou texto curto; vazio = inicial do nome */
  icon: string
  tags: string[]
  /** URL aberta ao selecionar a conta; vazio = baseUrl das configurações */
  startUrl: string
  /** Id da conta no Ploomes (o mesmo de conta.md) */
  ploomesId: string
  site: string
  /** Nome da pasta de trabalho e do arquivo de chave; vazio = ainda não vinculada */
  workName: string
  pinned: boolean
  archived: boolean
  createdAt: number
  lastUsedAt: number
}

export interface Settings {
  /** Minutos de inatividade até suspender uma conta (0 = nunca suspender) */
  idleMinutes: number
  baseUrl: string
  /** Pasta onde ficam as pastas de trabalho dos clientes (conta.md, processo.md...) */
  workDir: string
  /** Pasta dos arquivos de chave (<Nome>.txt); vazio = %USERPROFILE%\.ploomes */
  keysDir: string
}

/** Uma conta encontrada nas pastas de trabalho e/ou nos arquivos de chave. */
export interface WorkItem {
  nome: string
  temPasta: boolean
  temChave: boolean
  pasta: string
  id: string
  site: string
}

export interface PloomesOverview {
  /** conta do Multilogin (id) -> pasta/chave vinculadas */
  links: Record<string, WorkItem>
  /** encontradas em disco, mas ainda sem conta no Multilogin */
  importable: WorkItem[]
}

export interface KeyTestResult {
  ok: boolean
  id?: number | string
  nome?: string
  erro?: string
}

export interface SetupInput {
  /** Chave da API a guardar; vazio = não mexe na chave */
  key?: string
  createFolder: boolean
  overwriteKey?: boolean
}

export interface SetupResult {
  ok: boolean
  erro?: string
  jaExisteChave?: boolean
  pasta?: string
  criados?: string[]
  mantidos?: string[]
}

export interface AppState {
  accounts: Account[]
  settings: Settings
  dataDir: string
}

export type Shortcut =
  | { type: 'quick-switch' }
  | { type: 'index'; n: number }
  | { type: 'previous' }
  | { type: 'cycle'; dir: 1 | -1 }
  | { type: 'toggle-sidebar' }

export interface TabInfo {
  id: string
  title: string
  active: boolean
}

export interface WindowState {
  maximized: boolean
  fullscreen: boolean
}

export interface ViewStatus {
  /** ids de contas atualmente carregadas na memória */
  loaded: string[]
  /** contagem de notificações por conta (extraída do título da página) */
  badges: Record<string, number>
  /** sub-abas abertas de cada conta carregada */
  tabs: Record<string, TabInfo[]>
}

// Geometria do layout "Liquid Glass": painéis flutuantes com margem ao redor da janela.
// Estes valores precisam bater com as variáveis CSS em styles.css (--pad, --gap, --sidebar-w, ...).
export const WINDOW_PAD = 10
export const PANEL_GAP = 10
export const SIDEBAR_WIDTH = 300
export const SIDEBAR_COLLAPSED_WIDTH = 64
export const TOPBAR_HEIGHT = 44
export const TABSBAR_HEIGHT = 34
/** Raio da view do Ploomes; concêntrico com os painéis de vidro (raio 24) */
export const VIEW_RADIUS = 18

export const PALETTE = [
  '#4f46e5',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#64748b'
]

export const DEFAULT_SETTINGS: Settings = {
  idleMinutes: 30,
  baseUrl: 'https://app10.ploomes.com',
  workDir: '',
  keysDir: ''
}
