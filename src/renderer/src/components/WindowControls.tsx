import { useEffect, useState } from 'react'
import { Icon } from './Icon'

/** Minimizar / maximizar / fechar, já que a barra de título nativa foi removida. */
export function WindowControls(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.windowState().then((s) => setMaximized(s.maximized))
    return window.api.onWindowState((s) => setMaximized(s.maximized))
  }, [])

  return (
    <span className="btn-group win-controls" role="group" aria-label="Janela">
      <button className="ib" aria-label="Minimizar" title="Minimizar" onClick={() => window.api.windowMinimize()}>
        <Icon name="minimize" />
      </button>
      <button
        className="ib"
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
        title={maximized ? 'Restaurar' : 'Maximizar'}
        onClick={() => window.api.windowToggleMaximize()}
      >
        <Icon name={maximized ? 'restore-window' : 'maximize'} />
      </button>
      <button className="ib close" aria-label="Fechar" title="Fechar" onClick={() => window.api.windowClose()}>
        <Icon name="x" />
      </button>
    </span>
  )
}
