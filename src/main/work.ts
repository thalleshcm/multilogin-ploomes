// Liga as contas do Multilogin às pastas de trabalho e chaves de API em disco.
// A chave só existe aqui, no processo principal: a tela envia a chave digitada para testar/gravar
// e nunca recebe de volta o conteúdo dos arquivos.
import { existsSync } from 'fs'
import { shell } from 'electron'
import {
  Account,
  AppState,
  KeyTestResult,
  PALETTE,
  PloomesOverview,
  SetupInput,
  SetupResult,
  WorkItem
} from '../shared/types'
import {
  arquivoChave,
  chaveValida,
  criarPasta,
  gravarChave,
  lerChave,
  limparNome,
  resolveCfg,
  scan,
  testarChave
} from './ploomes'
import { getAccount, getSettings, getState, saveAccount } from './store'

const cfg = (): ReturnType<typeof resolveCfg> => resolveCfg(getSettings())
const lower = (s: string): string => s.toLowerCase()

function linkFor(acc: Account, items: WorkItem[]): WorkItem | undefined {
  const nome = lower(limparNome(acc.workName || acc.name))
  return nome ? items.find((i) => lower(i.nome) === nome) : undefined
}

export function overview(): PloomesOverview {
  const items = scan(cfg())
  const links: Record<string, WorkItem> = {}
  const usados = new Set<string>()
  for (const acc of getState().accounts) {
    const item = linkFor(acc, items)
    if (item) {
      links[acc.id] = item
      usados.add(lower(item.nome))
    }
  }
  return { links, importable: items.filter((i) => !usados.has(lower(i.nome))) }
}

export async function testSaved(accountId: string): Promise<KeyTestResult> {
  const acc = getAccount(accountId)
  const link = acc && linkFor(acc, scan(cfg()))
  if (!link?.temChave) return { ok: false, erro: 'Esta conta não tem chave guardada.' }
  try {
    return await testarChave(lerChave(cfg(), link.nome))
  } catch {
    return { ok: false, erro: 'Não consegui ler o arquivo de chave.' }
  }
}

/** Cria a pasta de trabalho e/ou guarda a chave da conta. Valida tudo antes de gravar. */
export function setupWork(accountId: string, input: SetupInput): SetupResult {
  const acc = getAccount(accountId)
  if (!acc) return { ok: false, erro: 'Conta não encontrada.' }
  const nome = limparNome(acc.workName || acc.name)
  if (!nome) return { ok: false, erro: 'Informe o nome do cliente.' }
  if (acc.ploomesId && !/^\d+$/.test(acc.ploomesId.trim()))
    return { ok: false, erro: 'O Id da conta deve ter só números.' }

  const key = (input.key ?? '').trim()
  const c = cfg()
  if (key) {
    if (!chaveValida(key)) return { ok: false, erro: 'Chave vazia ou com espaço/aspas.' }
    if (existsSync(arquivoChave(c, nome)) && !input.overwriteKey)
      return { ok: false, jaExisteChave: true, erro: `Já existe um arquivo de chave para "${nome}".` }
  }

  try {
    const result: SetupResult = { ok: true, criados: [], mantidos: [] }
    if (input.createFolder) {
      const r = criarPasta(c, { nome, id: acc.ploomesId.trim(), site: acc.site.trim() })
      Object.assign(result, r)
    }
    if (key) gravarChave(c, nome, key)
    saveAccount({ id: acc.id, workName: nome })
    return result
  } catch (e) {
    return { ok: false, erro: 'Falha ao gravar: ' + (e as Error).message }
  }
}

/** Traz para o Multilogin as contas encontradas em disco (sem e-mail/senha; completa-se depois). */
export function importar(nomes: string[]): AppState {
  const wanted = new Set(nomes.map(lower))
  const pendentes = overview().importable.filter((i) => wanted.has(lower(i.nome)))
  pendentes.forEach((item, n) => {
    saveAccount({
      name: item.nome,
      workName: item.nome,
      ploomesId: item.id,
      site: item.site,
      color: PALETTE[(getState().accounts.length + n) % PALETTE.length]
    })
  })
  return getState()
}

export function openFolder(accountId: string): void {
  const acc = getAccount(accountId)
  const link = acc && linkFor(acc, scan(cfg()))
  // só abre pastas que a própria listagem conhece
  if (link?.temPasta) void shell.openPath(link.pasta)
}
