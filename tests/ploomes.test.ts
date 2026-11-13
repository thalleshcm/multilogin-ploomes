// Teste da lógica de pastas/chaves em pastas temporárias. `npm test`
import assert from 'assert'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  arquivoChave,
  chaveValida,
  criarPasta,
  gravarChave,
  lerChave,
  limparNome,
  scan,
  testarChave,
  type WorkCfg
} from '../src/main/ploomes'

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'contas-'))
  const cfg: WorkCfg = { workDir: join(tmp, 'base'), keysDir: join(tmp, 'chaves') }
  mkdirSync(cfg.workDir)
  const chave = 'x'.repeat(40)

  assert.strictEqual(limparNome('  Foo/Bar: "Baz"?.  '), 'FooBar Baz')
  assert.strictEqual(limparNome('..'), '') // não deixa escapar da pasta
  assert.ok(!chaveValida('curta'))
  assert.ok(!chaveValida('a'.repeat(30) + ' b'))
  assert.ok(chaveValida(chave))

  // pasta + modelos
  const r = criarPasta(cfg, { nome: 'Cliente Teste', id: '123', site: 'https://x.com' })
  for (const f of ['conta.md', 'processo.md', 'escopo.md', 'notas', 'documentos', 'arquivos-de-configuracao', 'telas'])
    assert.ok(existsSync(join(r.pasta, f)), f)

  // chave: formato do arquivo e leitura de volta
  const arq = gravarChave(cfg, 'Cliente Teste', chave)
  assert.strictEqual(arq, arquivoChave(cfg, 'Cliente Teste'))
  assert.strictEqual(readFileSync(arq, 'utf8'), 'UK_PLOOMES_CLIENTE=' + chave + '\r\n')
  assert.strictEqual(lerChave(cfg, 'Cliente Teste'), chave)

  // arquivo editado à mão não é sobrescrito ao recriar a pasta
  writeFileSync(join(r.pasta, 'processo.md'), 'EDITADO')
  const r2 = criarPasta(cfg, { nome: 'Cliente Teste', id: '123', site: '' })
  assert.ok(r2.mantidos.includes('processo.md'))
  assert.strictEqual(readFileSync(join(r.pasta, 'processo.md'), 'utf8'), 'EDITADO')

  // varredura: Id e site lidos de conta.md; chave sem pasta aparece separada
  gravarChave(cfg, 'So Chave', 'y'.repeat(40))
  const lista = scan(cfg)
  assert.strictEqual(lista.length, 2)
  const cli = lista.find((i) => i.nome === 'Cliente Teste')!
  assert.deepStrictEqual([cli.temPasta, cli.temChave, cli.id, cli.site], [true, true, '123', 'https://x.com'])
  const soChave = lista.find((i) => i.nome === 'So Chave')!
  assert.deepStrictEqual([soChave.temPasta, soChave.temChave], [false, true])

  // chave falsa não pode abrir conta nenhuma
  const t = await testarChave('z'.repeat(40))
  assert.ok(!t.ok)
  console.log('chave falsa ->', t.erro)

  rmSync(tmp, { recursive: true, force: true })
  console.log('OK')
}

main().catch((e) => {
  console.error('FALHOU:', (e as Error).message)
  process.exit(1)
})
