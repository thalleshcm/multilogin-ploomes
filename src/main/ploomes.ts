// Pastas de trabalho e chaves de API dos clientes (portado do antigo "Gerenciador de Contas").
// Sem dependência do Electron, para poder ser testado com `npm test`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { KeyTestResult, WorkItem } from '../shared/types'

const API = 'https://public-api2.ploomes.com/'
const VAR = 'UK_PLOOMES_CLIENTE'
const SUBPASTAS = ['notas', 'documentos', 'arquivos-de-configuracao', 'telas']

export interface WorkCfg {
  workDir: string
  keysDir: string
}

export function resolveCfg(s: { workDir: string; keysDir: string }): WorkCfg {
  return {
    // vazio = pasta "Multilogin Ploomes" no diretório do usuário (nunca um caminho relativo)
    workDir: s.workDir.trim() || join(homedir(), 'Multilogin Ploomes'),
    keysDir: s.keysDir.trim() || join(homedir(), '.ploomes') }
}

export function limparNome(nome: string): string {
  return String(nome || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
}

export function chaveValida(chave: unknown): chave is string {
  return typeof chave === 'string' && chave.length >= 20 && !/[\s"'=]/.test(chave)
}

export const arquivoChave = (cfg: WorkCfg, nome: string): string => join(cfg.keysDir, limparNome(nome) + '.txt')

// Só GET na Account, sem seguir redirecionamento (a User-Key não pode ir para outro host).
export async function testarChave(chave: string): Promise<KeyTestResult> {
  if (!chaveValida(chave)) return { ok: false, erro: 'Chave vazia ou com espaço/aspas.' }
  try {
    const r = await fetch(API + 'Account', {
      headers: { 'User-Key': chave },
      redirect: 'error',
      signal: AbortSignal.timeout(20000)
    })
    if ([401, 403, 404].includes(r.status))
      return { ok: false, erro: `A API não aceitou essa chave (HTTP ${r.status}). Confira se copiou inteira.` }
    if (!r.ok) return { ok: false, erro: `A API respondeu HTTP ${r.status}.` }
    const j = (await r.json()) as { value?: { Id?: number; Name?: string }[] }
    const c = j.value?.[0] ?? {}
    return { ok: true, id: c.Id, nome: c.Name }
  } catch (e) {
    const err = e as { cause?: { code?: string }; message?: string }
    return { ok: false, erro: 'Não consegui falar com a API: ' + (err.cause?.code || err.message) }
  }
}

export function lerChave(cfg: WorkCfg, nome: string): string {
  const linhas = readFileSync(arquivoChave(cfg, nome), 'utf8').split(/\r?\n/)
  const l = linhas.find((x) => x.trim().startsWith(VAR + '='))
  return l ? l.split('=').slice(1).join('=').trim() : ''
}

function lerConta(pasta: string): { id: string; site: string } {
  try {
    const t = readFileSync(join(pasta, 'conta.md'), 'utf8')
    return {
      id: t.match(/Id da conta no Ploomes:\*\*[ \t]*(\d+)/)?.[1] ?? '',
      site: t.match(/\*\*Site:\*\*[ \t]*(\S*)/)?.[1] ?? ''
    }
  } catch {
    return { id: '', site: '' }
  }
}

/** Tudo que existe em disco: pastas com conta.md em workDir e arquivos .txt em keysDir. */
export function scan(cfg: WorkCfg): WorkItem[] {
  const mapa = new Map<string, WorkItem>()
  const pega = (nome: string): WorkItem => {
    let item = mapa.get(nome)
    if (!item) {
      item = { nome, temPasta: false, temChave: false, pasta: '', id: '', site: '' }
      mapa.set(nome, item)
    }
    return item
  }
  try {
    for (const f of readdirSync(cfg.keysDir)) {
      if (f.toLowerCase().endsWith('.txt')) pega(f.slice(0, -4)).temChave = true
    }
  } catch {
    /* pasta de chaves ainda não existe */
  }
  try {
    for (const d of readdirSync(cfg.workDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const pasta = join(cfg.workDir, d.name)
      if (!existsSync(join(pasta, 'conta.md'))) continue
      const item = pega(d.name)
      item.temPasta = true
      item.pasta = pasta
      Object.assign(item, lerConta(pasta))
    }
  } catch {
    /* pasta de trabalho indisponível (ex.: unidade T: ausente) */
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function modelos(nome: string, id: string, site: string): Record<string, string> {
  return {
    'conta.md': `# Conta

- **Empresa:** ${nome}
- **Id da conta no Ploomes:** ${id}
- **Site:** ${site}

## Contexto

- **Segmento:**
- **Tipo de venda:**
- **Porte:**
- **ERP:**
`,
    'processo.md': `# Processo comercial

Descreva o processo atual: etapas, quem faz o quê, o que trava.
`,
    'escopo.md': `# Escopo

O que entra no projeto agora e o que fica para depois.

## Agora

-

## Depois

-
`
  }
}

/** Cria a pasta e os modelos. Nunca apaga nem sobrescreve arquivo que já exista. */
export function criarPasta(
  cfg: WorkCfg,
  { nome, id, site }: { nome: string; id: string; site: string }
): { pasta: string; criados: string[]; mantidos: string[] } {
  const pasta = join(cfg.workDir, limparNome(nome))
  const criados: string[] = []
  const mantidos: string[] = []
  mkdirSync(pasta, { recursive: true })
  for (const [arq, txt] of Object.entries(modelos(limparNome(nome), id, site))) {
    const dest = join(pasta, arq)
    if (existsSync(dest)) mantidos.push(arq)
    else {
      writeFileSync(dest, txt, 'utf8')
      criados.push(arq)
    }
  }
  for (const s of SUBPASTAS) {
    const dest = join(pasta, s)
    if (!existsSync(dest)) {
      mkdirSync(dest)
      writeFileSync(join(dest, '.gitkeep'), '')
      criados.push(s + '/')
    }
  }
  return { pasta, criados, mantidos }
}

export function gravarChave(cfg: WorkCfg, nome: string, chave: string): string {
  mkdirSync(cfg.keysDir, { recursive: true })
  const arq = arquivoChave(cfg, nome)
  writeFileSync(arq, VAR + '=' + chave + '\r\n', 'utf8')
  return arq
}
