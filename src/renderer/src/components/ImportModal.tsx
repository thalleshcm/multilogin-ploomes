import { useEffect, useState } from 'react'
import type { WorkItem } from '../../../shared/types'

interface Props {
  items: WorkItem[]
  onImport: (nomes: string[]) => Promise<void>
  onClose: () => void
}

/** Contas que existem em disco (pasta de trabalho e/ou chave) mas ainda não estão no Multilogin. */
export function ImportModal({ items, onImport, onClose }: Props): React.JSX.Element {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (nome: string): void =>
    setPicked((p) => {
      const n = new Set(p)
      if (!n.delete(nome)) n.add(nome)
      return n
    })

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal glass sheet" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Importar contas encontradas</h3>
        <p className="hint">
          Contas com pasta de trabalho e/ou chave de API que ainda não estão na lista. Entram sem e-mail e senha:
          complete depois em “Editar”.
        </p>

        {items.length === 0 ? (
          <p className="none">Nada novo para importar.</p>
        ) : (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={picked.size === items.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(items.map((i) => i.nome)) : new Set())}
              />{' '}
              Selecionar todas ({items.length})
            </label>
            <ul className="import-list">
              {items.map((i) => (
                <li key={i.nome}>
                  <label className="check">
                    <input type="checkbox" checked={picked.has(i.nome)} onChange={() => toggle(i.nome)} />
                    <span className="import-name">{i.nome}</span>
                    <span className="sub">
                      {i.id ? `Id ${i.id} · ` : ''}
                      {i.temPasta ? 'pasta' : 'sem pasta'} · {i.temChave ? 'chave' : 'sem chave'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="primary"
            disabled={picked.size === 0 || busy}
            onClick={async () => {
              setBusy(true)
              await onImport([...picked])
              setBusy(false)
            }}
          >
            {busy ? 'Importando…' : `Importar ${picked.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}
