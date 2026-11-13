import type { Account } from '../../shared/types'

export { PALETTE } from '../../shared/types'

export function initial(a: Pick<Account, 'name' | 'icon'>): string {
  return (a.icon.trim() || a.name.trim().charAt(0) || '?').toUpperCase()
}

export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function matches(a: Account, query: string): boolean {
  const q = norm(query.trim())
  if (!q) return true
  return norm([a.name, a.email, ...a.tags].join(' ')).includes(q)
}

/** Fixadas primeiro, depois ordem alfabética. */
export function sortAccounts(list: Account[]): Account[] {
  return [...list].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name, 'pt-BR')
  )
}
