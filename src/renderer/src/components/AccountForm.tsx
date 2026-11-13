import { useEffect, useRef, useState } from 'react'
import type { Account, SetupInput, WorkItem } from '../../../shared/types'
import { PALETTE } from '../util'

interface Props {
  initial: Partial<Account> | null
  /** Pasta/chave já vinculadas a esta conta (se houver) */
  link?: WorkItem
  allTags: string[]
  defaultUrl: string
  onSave: (a: Partial<Account>, work?: SetupInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export function AccountForm({ initial, link, allTags, defaultUrl, onSave, onDelete, onClose }: Props): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [password, setPassword] = useState(initial?.password ?? '')
  const [showPwd, setShowPwd] = useState(false)
  const [color, setColor] = useState(initial?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)])
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [startUrl, setStartUrl] = useState(initial?.startUrl ?? '')
  const [pinned, setPinned] = useState(initial?.pinned ?? false)
  const [archived, setArchived] = useState(initial?.archived ?? false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [ploomesId, setPloomesId] = useState(initial?.ploomesId ?? link?.id ?? '')
  const [site, setSite] = useState(initial?.site ?? link?.site ?? '')
  const [key, setKey] = useState('')
  // conta nova: criar a pasta de trabalho por padrão; conta existente: só se ainda não tiver
  const [createFolder, setCreateFolder] = useState(!initial?.id)
  const [keyMsg, setKeyMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => nameRef.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Testa a chave digitada (ou a guardada, se o campo estiver vazio). Devolve o Id da conta, ou null se falhar. */
  const checkKey = async (): Promise<string | null> => {
    const typed = key.trim()
    if (!typed && !link?.temChave) {
      setKeyMsg({ text: 'Cole a chave primeiro.', ok: false })
      return null
    }
    setKeyMsg({ text: 'Testando…', ok: true })
    const r = typed
      ? await window.api.ploomesTestKey(typed)
      : await window.api.ploomesTestSaved(initial!.id as string)
    if (!r.ok) {
      setKeyMsg({ text: r.erro ?? 'Falha ao testar a chave.', ok: false })
      return null
    }
    const found = String(r.id)
    if (ploomesId.trim() && ploomesId.trim() !== found) {
      setKeyMsg({ text: `A chave abre a conta ${found} (${r.nome}), não a ${ploomesId.trim()}.`, ok: false })
      return null
    }
    if (!ploomesId.trim()) setPloomesId(found)
    if (!name.trim() && r.nome) setName(r.nome)
    setKeyMsg({ text: `Chave ok: conta ${found} (${r.nome})`, ok: true })
    return found
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    let id = ploomesId.trim()
    // confere a chave antes de gravar, para não guardar chave errada
    if (key.trim()) {
      const found = await checkKey()
      if (!found) {
        setBusy(false)
        return
      }
      id = found
    }
    const wantsWork = createFolder || key.trim()
    await onSave(
      {
        id: initial?.id,
        name: name.trim(),
        email: email.trim(),
        password,
        color,
        icon: icon.trim().slice(0, 2),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        startUrl: startUrl.trim(),
        ploomesId: id,
        site: site.trim(),
        pinned,
        archived
      },
      wantsWork ? { key: key.trim() || undefined, createFolder } : undefined
    )
    setBusy(false)
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="modal glass sheet" onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => void submit(e)}>
        <h3>{initial?.id ? 'Editar conta' : 'Nova conta'}</h3>

        <label>
          Apelido do cliente
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Acme Ltda" />
        </label>

        <div className="row">
          <label>
            E-mail
            <input
              type="text"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="login@cliente.com"
            />
          </label>
          <label>
            Senha
            <span className="pwd">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? 'ocultar' : 'ver'}
              </button>
            </span>
          </label>
        </div>

        <div className="row">
          <label>
            Cor
            <span className="swatches">
              {PALETTE.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`swatch ${c === color ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </span>
          </label>
          <label className="narrow">
            Ícone
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={2} placeholder="🏢" />
          </label>
        </div>

        <label>
          Tags / grupos (separadas por vírgula)
          <input
            list="known-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Implantação, Suporte"
          />
          <datalist id="known-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        <label>
          URL inicial / página favorita
          <input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder={`Vazio = ${defaultUrl}`} />
        </label>

        <fieldset className="section">
          <legend>Ploomes: pasta de trabalho e chave da API</legend>

          <div className="row">
            <label>
              Id da conta no Ploomes
              <input
                inputMode="numeric"
                autoComplete="off"
                value={ploomesId}
                onChange={(e) => setPloomesId(e.target.value)}
                placeholder="preenche sozinho ao testar a chave"
              />
            </label>
            <label>
              Site
              <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." />
            </label>
          </div>

          <label>
            Chave da API (UK_PLOOMES_CLIENTE){link?.temChave ? ' — já guardada; deixe vazio para manter' : ''}
            <span className="pwd">
              <input
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={link?.temChave ? '••••••••••••' : 'Administração → Integrações → Usuários de integração'}
              />
              <button type="button" disabled={busy} onClick={() => void checkKey()}>
                Testar
              </button>
            </span>
          </label>
          {keyMsg && <p className={`hint ${keyMsg.ok ? 'okmsg' : 'errmsg'}`}>{keyMsg.text}</p>}

          <div className="row checks">
            {link?.temPasta ? (
              <>
                <span className="hint">Pasta de trabalho: <code>{link.pasta}</code></span>
                <button type="button" onClick={() => initial?.id && window.api.ploomesOpenFolder(initial.id)}>
                  Abrir pasta
                </button>
              </>
            ) : (
              <label className="check">
                <input type="checkbox" checked={createFolder} onChange={(e) => setCreateFolder(e.target.checked)} />{' '}
                Criar pasta de trabalho (conta.md, processo.md, escopo.md, notas, telas…)
              </label>
            )}
          </div>
        </fieldset>

        <div className="row checks">
          <label className="check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fixar no topo
          </label>
          <label className="check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Arquivada
            (projeto encerrado)
          </label>
        </div>

        <div className="modal-actions">
          {initial?.id && (
            <button
              type="button"
              className="danger"
              onClick={() => (confirmDelete ? void onDelete(initial.id!) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'Confirmar exclusão' : 'Excluir'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={!name.trim() || busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
