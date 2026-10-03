import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Tv, Plus, Copy, Check, Radar, Trash2, Pencil, SlidersHorizontal, ChevronUp, MapPin } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { DisplayControl } from '@/components/admin/DisplayControl'
import {
  listDisplayScreens, createDisplayScreen, renameDisplayScreen,
  deleteDisplayScreen, identifyDisplayScreen,
} from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import type { Court, DisplayScreen, Match, Tournament } from '@/types'

interface Props {
  matches: Match[]
  courts: Court[]
  tournaments: Tournament[]
  /** Base display URL from server-info (LAN IP or public domain). */
  displayUrl?: string
}

const MODE_LABEL: Record<number, string> = {
  1: 'Single', 2: '2 Matches', 3: '4-Grid', 4: 'Announcement', 5: 'Sponsor',
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg text-dark-100 text-sm bg-dark-925 border border-dark-700 ' +
  'focus:outline-none focus:border-brand-500 placeholder-dark-600'

const errorMessage = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Please try again'

/** Every TV as its own control card: open /display?screen=<slug> once, then drive it from here. */
export function ScreensPanel({ matches, courts, tournaments, displayUrl }: Props) {
  const toast = useToastStore()
  const [screens, setScreens] = useState<DisplayScreen[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setScreens(await listDisplayScreens()) } catch { /* keep last list */ } finally { setLoading(false) }
  }, [])

  // Poll so each card's online dot stays current.
  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  // Court names repeat across tournaments ("Court A"), so add the tournament
  // when there is more than one.
  const courtOptions = courts.map((c) => ({
    id: c.id,
    label: tournaments.length > 1
      ? `${c.name} · ${tournaments.find((t) => t.id === c.tournament_id)?.name ?? ''}`.replace(/ · $/, '')
      : c.name,
  }))

  const base = (displayUrl || `${window.location.origin}/display`).replace(/\/$/, '')
  const linkFor = (s: DisplayScreen) => (s.slug === 'main' ? base : `${base}?screen=${s.slug}`)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const s = await createDisplayScreen(name)
      setScreens((prev) => [...prev, { ...s, online: 0 }])
      setNewName('')
      setOpenSlug(s.slug)
      toast.success(`Added “${s.name}”`, `Open ${linkFor(s)} on that TV`)
    } catch (err) {
      toast.error('Could not add screen', errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const replace = (s: DisplayScreen) =>
    setScreens((prev) => prev.map((p) => (p.slug === s.slug ? { ...s, online: p.online } : p)))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Tv size={16} className="text-brand-400" />
        <h3 className="font-semibold text-dark-100">Screens</h3>
        <span className="text-xs text-dark-500 ml-auto">Each TV is controlled on its own</span>
      </div>

      {/* Add a screen */}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); handleCreate() }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New screen name (e.g. Court A TV)"
          className={inputClass}
          maxLength={60}
        />
        <Button type="submit" icon={<Plus size={14} />} loading={creating} disabled={!newName.trim()}>
          Add
        </Button>
      </form>

      {loading ? (
        <p className="text-xs text-dark-600 text-center py-6">Loading screens…</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {screens.map((s) => (
            <ScreenCard
              key={s.slug}
              screen={s}
              link={linkFor(s)}
              matches={matches}
              courts={courtOptions}
              open={openSlug === s.slug}
              onToggle={() => setOpenSlug((cur) => (cur === s.slug ? null : s.slug))}
              onChanged={replace}
              onDeleted={() => setScreens((prev) => prev.filter((p) => p.slug !== s.slug))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface CardProps {
  screen: DisplayScreen
  link: string
  matches: Match[]
  courts: { id: string; label: string }[]
  open: boolean
  onToggle: () => void
  onChanged: (s: DisplayScreen) => void
  onDeleted: () => void
}

function ScreenCard({ screen, link, matches, courts, open, onToggle, onChanged, onDeleted }: CardProps) {
  const toast = useToastStore()
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(screen.name)
  const online = screen.online > 0
  const isMain = screen.slug === 'main'

  const followed = screen.follow_court_id
    ? courts.find((c) => c.id === screen.follow_court_id)?.label ?? 'a court'
    : null

  const showing = screen.mode >= 4
    ? MODE_LABEL[screen.mode]
    : screen.match_ids
        .map((id) => matches.find((m) => m.id === id))
        .filter(Boolean)
        .map((m) => `${m!.team_a} vs ${m!.team_b}`)
        .join(' · ') || (followed ? 'No upcoming matches' : isMain ? 'All open matches' : 'Nothing assigned')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard needs HTTPS or localhost; on a LAN IP show the link instead.
      toast.info('Copy this link', link)
    }
  }

  const identify = async () => {
    try {
      await identifyDisplayScreen(screen.slug)
      if (!online) toast.warn(`${screen.name} is offline`, 'Open its link on the TV first')
    } catch (err) {
      toast.error('Identify failed', errorMessage(err))
    }
  }

  const saveName = async () => {
    const n = name.trim()
    if (!n || n === screen.name) { setRenaming(false); setName(screen.name); return }
    try {
      onChanged(await renameDisplayScreen(screen.slug, n))
      setRenaming(false)
    } catch (err) {
      toast.error('Rename failed', errorMessage(err))
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete screen “${screen.name}”? The TV using its link will show “screen not found”.`)) return
    try {
      await deleteDisplayScreen(screen.slug)
      onDeleted()
    } catch (err) {
      toast.error('Delete failed', errorMessage(err))
    }
  }

  return (
    <div className={clsx(
      'rounded-xl border bg-dark-850 p-3 sm:p-4 space-y-3 transition-colors min-w-0',
      open ? 'border-brand-500/60' : 'border-dark-700',
    )}>
      {/* Name + status */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={clsx('h-2.5 w-2.5 rounded-full flex-shrink-0', online ? 'bg-live' : 'bg-dark-600')}
          title={online ? `${screen.online} display(s) connected` : 'No display connected'}
        />
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') { setRenaming(false); setName(screen.name) }
            }}
            className={clsx(inputClass, 'py-1.5')}
            maxLength={60}
          />
        ) : (
          <>
            <h4 className="font-semibold text-dark-100 truncate">{screen.name}</h4>
            <button onClick={() => setRenaming(true)} className="text-dark-500 hover:text-dark-200 flex-shrink-0" aria-label="Rename screen">
              <Pencil size={13} />
            </button>
          </>
        )}
        <span className={clsx('ml-auto text-xs font-medium flex-shrink-0', online ? 'text-live' : 'text-dark-500')}>
          {online ? (screen.online > 1 ? `${screen.online} online` : 'Online') : 'Offline'}
        </span>
      </div>

      {/* What it shows */}
      <div className="text-xs flex items-center gap-1 min-w-0">
        {followed ? (
          <span className="flex items-center gap-1 text-brand-300 flex-shrink-0">
            <MapPin size={12} /> Follows {followed} ·
          </span>
        ) : (
          <span className="text-dark-500 flex-shrink-0">{MODE_LABEL[screen.mode]} · </span>
        )}
        <span className="text-dark-200 truncate">{showing}</span>
      </div>

      {/* TV link */}
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-xs font-mono text-dark-400 bg-dark-925 border border-dark-800 rounded-lg px-2.5 py-1.5" title={link}>
          {link}
        </code>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-dark-300 hover:text-white flex-shrink-0" aria-label="Copy display link">
          {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onToggle}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
            open ? 'bg-brand-500 text-white' : 'bg-brand-500/15 text-brand-200 hover:bg-brand-500/25',
          )}
        >
          {open ? <ChevronUp size={13} /> : <SlidersHorizontal size={13} />}
          {open ? 'Close' : 'Change'}
        </button>
        <button onClick={identify}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-dark-800 text-dark-200 hover:bg-dark-700 transition-all active:scale-95">
          <Radar size={13} /> Identify
        </button>
        {!isMain && (
          <button onClick={remove}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-dark-500 hover:text-red-400 transition-colors"
            aria-label="Delete screen">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="pt-3 border-t border-dark-800">
          <DisplayControl matches={matches} screen={screen} courts={courts} onPushed={onChanged} />
        </div>
      )}
    </div>
  )
}
