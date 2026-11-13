import { app } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { Account, AppState, DEFAULT_SETTINGS, Settings } from '../shared/types'
import { limparNome } from './ploomes'

/**
 * Pasta `data` ao lado do .exe (portable) ou na raiz do projeto (dev).
 * Guarda accounts.json e as sessões (cookies) de cada conta.
 */
export function resolveDataDir(): string {
  // permite apontar para outra pasta (testes automatizados, perfil alternativo)
  if (process.env.MULTILOGIN_DATA_DIR) return process.env.MULTILOGIN_DATA_DIR
  if (process.env.PORTABLE_EXECUTABLE_DIR) return join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
  if (app.isPackaged) return join(dirname(process.execPath), 'data')
  return join(app.getAppPath(), 'data')
}

export const dataDir = resolveDataDir()
const accountsFile = join(dataDir, 'accounts.json')

interface FileShape {
  settings: Settings
  accounts: Account[]
}

let state: FileShape = { settings: { ...DEFAULT_SETTINGS }, accounts: [] }

export function initStore(): void {
  mkdirSync(dataDir, { recursive: true })
  if (!existsSync(accountsFile)) {
    persist()
    return
  }
  try {
    const raw = JSON.parse(readFileSync(accountsFile, 'utf-8')) as Partial<FileShape>
    state = {
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
      accounts: (raw.accounts ?? []).map(normalize)
    }
  } catch (err) {
    console.error('Falha ao ler accounts.json, mantendo cópia de segurança', err)
    try {
      renameSync(accountsFile, join(dataDir, `accounts.corrompido-${Date.now()}.json`))
    } catch {
      /* ignora */
    }
  }
}

function persist(): void {
  const tmp = accountsFile + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
  renameSync(tmp, accountsFile)
}

function normalize(a: Partial<Account>): Account {
  const now = Date.now()
  return {
    id: a.id ?? randomUUID(),
    name: a.name ?? 'Sem nome',
    email: a.email ?? '',
    password: a.password ?? '',
    color: a.color ?? '#4f46e5',
    icon: a.icon ?? '',
    tags: a.tags ?? [],
    startUrl: a.startUrl ?? '',
    ploomesId: String(a.ploomesId ?? '').trim(),
    site: a.site ?? '',
    workName: limparNome(a.workName ?? ''),
    pinned: a.pinned ?? false,
    archived: a.archived ?? false,
    createdAt: a.createdAt ?? now,
    lastUsedAt: a.lastUsedAt ?? 0
  }
}

export function getState(): AppState {
  return { accounts: state.accounts, settings: state.settings, dataDir }
}

export function getAccount(id: string): Account | undefined {
  return state.accounts.find((a) => a.id === id)
}

export function getSettings(): Settings {
  return state.settings
}

/** Cria (sem id) ou atualiza (com id) uma conta. */
export function saveAccount(input: Partial<Account>): Account {
  const existing = input.id ? getAccount(input.id) : undefined
  if (existing) {
    Object.assign(existing, normalize({ ...existing, ...input }))
    persist()
    return existing
  }
  const created = normalize(input)
  state.accounts.push(created)
  persist()
  return created
}

export function touchAccount(id: string): void {
  const acc = getAccount(id)
  if (!acc) return
  acc.lastUsedAt = Date.now()
  persist()
}

export function deleteAccount(id: string): void {
  state.accounts = state.accounts.filter((a) => a.id !== id)
  persist()
}

export function saveSettings(settings: Settings): void {
  state.settings = { ...DEFAULT_SETTINGS, ...settings }
  persist()
}
