import type { TabInfo } from '../../../shared/types'
import { Icon } from './Icon'

interface Props {
  accountId: string | null
  tabs: TabInfo[]
}

/** Faixa de sub-abas da conta ativa (todas compartilham a mesma sessão). */
export function TabsBar({ accountId, tabs }: Props): React.JSX.Element {
  return (
    <div className="tabsbar" role="tablist" aria-label="Abas da conta">
      {accountId &&
        tabs.map((t, i) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.active}
            className={`tab ${t.active ? 'on' : ''}`}
            title={t.title}
            onClick={() => window.api.selectTab(accountId, t.id)}
            onAuxClick={(e) => e.button === 1 && window.api.closeTab(accountId, t.id)}
          >
            <span className="tab-title">{t.title.replace(/^\(\d+\)\s*/, '') || `Aba ${i + 1}`}</span>
            {tabs.length > 1 && (
              <button
                className="tab-x"
                aria-label="Fechar aba"
                title="Fechar aba (Ctrl+W)"
                onClick={(e) => {
                  e.stopPropagation()
                  window.api.closeTab(accountId, t.id)
                }}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      {accountId && (
        <button
          className="tab-new"
          aria-label="Nova aba desta conta"
          title="Nova aba desta conta (Ctrl+T)"
          onClick={() => window.api.newTab(accountId)}
        >
          <Icon name="plus" size={14} />
        </button>
      )}
    </div>
  )
}
