import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { PlayerInput, TeamPlayer } from '@/types'

type GenderFilter = 'All' | 'Male' | 'Female'

interface Props {
  roster: TeamPlayer[]
  selected: PlayerInput[]
  onChange: (players: PlayerInput[]) => void
  color: string
  max: number
}

// Player ID from the registration import identifies a player; name+jersey covers hand-made rosters.
export const playerKey = (p: PlayerInput) => p.player_code || `${p.name}#${p.jersey_number}`

export function RosterPicker({ roster, selected, onChange, color, max }: Props) {
  const [query, setQuery] = useState('')
  const [gender, setGender] = useState<GenderFilter>('All')

  const selectedKeys = useMemo(() => new Set(selected.map(playerKey)), [selected])
  const count = (g: GenderFilter) => roster.filter((p) => g === 'All' || p.gender === g).length
  const q = query.trim().toLowerCase()
  const shown = roster
    .filter((p) =>
      (gender === 'All' || p.gender === gender) &&
      (!q || p.name.toLowerCase().includes(q) || String(p.jersey_number) === q || p.player_code?.toLowerCase().includes(q)))
    .sort((a, b) => a.jersey_number - b.jersey_number)
  const full = selected.length >= max

  const toggle = (p: TeamPlayer) => {
    const key = playerKey(p)
    if (selectedKeys.has(key)) return onChange(selected.filter((s) => playerKey(s) !== key))
    if (full) return
    const { id: _id, team_id: _teamId, ...input } = p
    onChange([...selected, input])
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 pointer-events-none" />
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, jersey or player ID"
          aria-label="Search players"
          className="w-full pl-9 pr-9 py-2.5 bg-dark-850 border border-dark-700 rounded-xl text-sm text-dark-100 placeholder-dark-500
                     focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25 transition-colors"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-dark-500 hover:text-dark-200">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 p-1 rounded-xl bg-dark-900 border border-dark-800" role="group" aria-label="Filter by gender">
        {(['All', 'Male', 'Female'] as const).map((g) => (
          <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
            className={clsx(
              'flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
              gender === g ? 'bg-dark-750 text-dark-100' : 'text-dark-500 hover:text-dark-200',
            )}>
            {g}
            <span className="tabular-nums text-dark-500">{count(g)}</span>
          </button>
        ))}
      </div>

      <ul className="h-72 overflow-y-auto -mx-1 px-1 space-y-1" aria-label="Registered players">
        {shown.length === 0 && (
          <li className="h-full grid place-items-center text-center text-sm text-dark-500 px-6">
            {q ? `No player matches “${query.trim()}”.` : `No ${gender.toLowerCase()} players in this team.`}
          </li>
        )}
        {shown.map((p) => {
          const on = selectedKeys.has(playerKey(p))
          const disabled = !on && full
          return (
            <li key={p.id}>
              <button type="button" onClick={() => toggle(p)} disabled={disabled} aria-pressed={on}
                className={clsx(
                  'w-full grid grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-3 px-2.5 py-2 rounded-lg text-left border transition-colors',
                  on ? 'border-transparent' : 'border-transparent hover:bg-dark-850',
                  disabled && 'opacity-40 cursor-not-allowed',
                )}
                style={on ? { backgroundColor: `${color}1f`, borderColor: `${color}55` } : undefined}>
                <span className="font-mono text-sm font-bold tabular-nums text-right" style={{ color: on ? color : undefined }}>
                  {p.jersey_number || '–'}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-dark-100 truncate">{p.name}</span>
                  <span className="block text-xs text-dark-500 truncate">
                    {[p.gender, p.age ? `${p.age} yrs` : '', p.category].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={clsx('h-5 w-5 rounded-md border grid place-items-center', on ? 'border-transparent' : 'border-dark-600')}
                  style={on ? { backgroundColor: color } : undefined}>
                  {on && <Check size={13} strokeWidth={3} className="text-white" />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between text-xs">
        <span className={clsx('font-medium', full ? 'text-timeout' : 'text-dark-400')}>
          {full ? `Squad full: ${max} players maximum` : `${selected.length} of ${max} selected`}
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="font-semibold text-dark-400 hover:text-dark-100">
            Clear selection
          </button>
        )}
      </div>
    </div>
  )
}
