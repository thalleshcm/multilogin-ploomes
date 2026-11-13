import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'

interface Props {
  settings: Settings
  dataDir: string
  onSave: (s: Settings) => Promise<void>
  onClose: () => void
}

export function SettingsModal({ settings, dataDir, onSave, onClose }: Props): React.JSX.Element {
  const [idle, setIdle] = useState(String(settings.idleMinutes))
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [workDir, setWorkDir] = useState(settings.workDir)
  const [keysDir, setKeysDir] = useState(settings.keysDir)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={onClose}>
      <form
        className="modal glass sheet"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void onSave({
            idleMinutes: Math.max(0, Math.round(Number(idle) || 0)),
            baseUrl: baseUrl.trim() || settings.baseUrl,
            workDir: workDir.trim() || settings.workDir,
            keysDir: keysDir.trim()
          })
        }}
      >
        <h3>Configurações</h3>

        <label>
          Suspender conta após (minutos sem uso; 0 = nunca)
          <input type="number" min={0} value={idle} onChange={(e) => setIdle(e.target.value)} />
        </label>
        <label>
          URL padrão do Ploomes
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>

        <label>
          Pasta de trabalho dos clientes (vazio = pasta Multilogin Ploomes do seu usuário)
          <input value={workDir} onChange={(e) => setWorkDir(e.target.value)} />
        </label>
        <label>
          Pasta das chaves da API (vazio = pasta .ploomes do seu usuário)
          <input value={keysDir} onChange={(e) => setKeysDir(e.target.value)} placeholder="%USERPROFILE%\.ploomes" />
        </label>

        <p className="hint">
          Dados (accounts.json e sessões) em <code>{dataDir}</code>. O arquivo guarda as senhas em texto puro.
        </p>

        <div className="modal-actions">
          <button type="button" onClick={() => window.api.openDataDir()}>
            Abrir pasta de dados
          </button>
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Salvar
          </button>
        </div>
      </form>
    </div>
  )
}
