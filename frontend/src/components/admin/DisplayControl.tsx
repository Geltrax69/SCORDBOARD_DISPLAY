import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Monitor, Columns2, Grid2x2, Megaphone, Video, Send, Play, Check, Users, MapPin, ListChecks } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { setScreenLayout, listDisplayAssets, showDisplayAsset, followCourt } from '@/services/api'
import { isVideoUrl } from '@/components/admin/DisplayAssetsControl'
import type { Match, DisplayAsset, DisplayScreen } from '@/types'

interface Props {
  matches: Match[]
  /** The one TV this panel controls. */
  screen: DisplayScreen
  /** Courts this screen can follow, already labelled for display. */
  courts?: { id: string; label: string }[]
  onPushed?: (screen: DisplayScreen) => void
}

const LIVE = ['active', 'timeout', 'paused']

/** What a court-following screen will show: the live match, else the next pending one. */
export function courtCurrentMatch(matches: Match[], courtId: string): Match | undefined {
  const onCourt = matches
    .filter((m) => m.court_id === courtId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return onCourt.find((m) => LIVE.includes(m.status)) ?? onCourt.find((m) => m.status === 'pending')
}

const MODES = [
  { mode: 1 as const, label: 'Single',  icon: Monitor,    desc: 'One match fullscreen' },
  { mode: 2 as const, label: '2 Matches', icon: Columns2, desc: 'Side by side' },
  { mode: 3 as const, label: '4-Grid',  icon: Grid2x2,   desc: '2×2 grid' },
  { mode: 4 as const, label: 'Announce', icon: Megaphone, desc: 'Announcement overlay' },
  { mode: 5 as const, label: 'Sponsor',  icon: Video,     desc: 'Sponsor / video' },
]

const MAX_MATCHES: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 0, 5: 0 }

export function DisplayControl({ matches, screen, courts = [], onPushed }: Props) {
  // Only live/upcoming matches are selectable for the display — not finished ones.
  const pickable = matches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled')
  // Start from what this screen is showing now.
  const [mode, setMode]       = useState<1|2|3|4|5>(screen.mode)
  const [selected, setSelected] = useState<string[]>(
    screen.match_ids.filter((id) => pickable.some((m) => m.id === id)),
  )
  const [sending, setSending]  = useState(false)
  const [pushed, setPushed]    = useState(false)
  const [assets, setAssets]    = useState<DisplayAsset[]>([])
  const [shownId, setShownId]  = useState<string | null>(null)
  // Player intro animation on pending matches — off by default.
  const [showPlayerAnim, setShowPlayerAnim] = useState(screen.show_player_animation)
  // Pick matches by hand, or follow a court and switch matches automatically.
  const [source, setSource] = useState<'manual' | 'follow'>(screen.follow_court_id ? 'follow' : 'manual')
  const [courtId, setCourtId] = useState(screen.follow_court_id)

  const maxSel = MAX_MATCHES[mode] ?? 0
  const assetType: 'announcement' | 'sponsor' | null = mode === 4 ? 'announcement' : mode === 5 ? 'sponsor' : null

  // Keep the saved sponsor/announcement library in sync so it can be pushed
  // straight from here. Refetch when switching into Announce/Sponsor mode.
  useEffect(() => {
    if (!assetType) return
    listDisplayAssets().then(setAssets).catch(() => {})
  }, [assetType])

  const handleShowAsset = async (id: string) => {
    await showDisplayAsset(id, [screen.slug])
    setShownId(id)
    setTimeout(() => setShownId((cur) => (cur === id ? null : cur)), 2500)
  }

  const toggleMatch = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id))
    } else if (selected.length < maxSel) {
      setSelected([...selected, id])
    }
  }

  const handlePush = async () => {
    setSending(true)
    try {
      const updated = await setScreenLayout(screen.slug, { mode, match_ids: selected, show_player_animation: showPlayerAnim })
      onPushed?.({ ...updated, online: screen.online })
      setPushed(true)
      setTimeout(() => setPushed(false), 2500)
    } finally {
      setSending(false)
    }
  }

  const handleFollow = async (id: string) => {
    setSending(true)
    try {
      const updated = await followCourt(screen.slug, id, showPlayerAnim)
      onPushed?.({ ...updated, online: screen.online })
      setPushed(true)
      setTimeout(() => setPushed(false), 2500)
    } finally {
      setSending(false)
    }
  }

  const onModeChange = (m: 1|2|3|4|5) => {
    setMode(m)
    setSelected([])
  }

  return (
    <div className="space-y-5">
      {/* Source: pick matches by hand, or follow a court */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-dark-925 border border-dark-800" role="tablist">
        {([
          { id: 'manual' as const, label: 'Pick matches', icon: ListChecks },
          { id: 'follow' as const, label: 'Follow a court', icon: MapPin },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={source === id}
            onClick={() => setSource(id)}
            className={clsx(
              'flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
              source === id ? 'bg-brand-500/20 text-brand-100' : 'text-dark-400 hover:text-dark-100',
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {source === 'follow' && (
        <div>
          <p className="text-xs text-dark-500 mb-2 font-medium">
            Shows the court’s live match, else its next match — and moves on by itself when a match ends.
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {courts.length === 0 && (
              <p className="text-xs text-dark-600 text-center py-4">No courts yet — add one in Setup.</p>
            )}
            {courts.map((c) => {
              const now = courtCurrentMatch(matches, c.id)
              const isSel = courtId === c.id
              const isFollowing = screen.follow_court_id === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setCourtId(c.id)}
                  aria-pressed={isSel}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                    isSel ? 'border-brand-500 bg-brand-900/20' : 'border-dark-700 bg-dark-800 hover:border-dark-500',
                  )}
                >
                  <MapPin size={15} className={isSel ? 'text-brand-300' : 'text-dark-500'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-100 truncate">{c.label}</p>
                    <p className="text-xs text-dark-500 truncate">
                      {now
                        ? `${LIVE.includes(now.status) ? 'Live' : 'Next'}: ${now.team_a} vs ${now.team_b}`
                        : 'No upcoming matches'}
                    </p>
                  </div>
                  {isFollowing && <span className="text-xs font-semibold text-live flex-shrink-0">Following</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {source === 'manual' && (<>
      {/* Mode buttons */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {MODES.map(({ mode: m, label, icon: Icon, desc }) => {
          const active = mode === m
          return (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              title={desc}
              aria-pressed={active}
              className={clsx(
                'group relative flex flex-col items-center gap-2 py-3.5 px-1 rounded-xl border text-xs font-semibold text-center leading-tight min-w-0',
                'transition-all duration-200 active:scale-95',
                active
                  ? 'border-brand-500 bg-brand-500/15 text-brand-200 shadow-glow-brand'
                  : 'border-dark-600 bg-dark-800 text-dark-400 hover:border-brand-500/40 hover:bg-dark-750 hover:text-dark-100 hover:-translate-y-0.5',
              )}
            >
              <Icon size={20} className={clsx('transition-transform duration-200', active ? 'scale-110' : 'group-hover:scale-110')} />
              {label}
              {active && <span className="absolute -bottom-px left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-brand-400" />}
            </button>
          )
        })}
      </div>

      {/* Match picker */}
      {maxSel > 0 && (
        <div>
          <p className="text-xs text-dark-500 mb-2 font-medium">
            Select matches to display <span className="text-dark-700">({selected.length}/{maxSel})</span>
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {pickable.length === 0 && (
              <p className="text-xs text-dark-600 text-center py-4">No matches available</p>
            )}
            {pickable.map((m) => {
              const isSelected = selected.includes(m.id)
              const isDisabled = !isSelected && selected.length >= maxSel
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMatch(m.id)}
                  disabled={isDisabled}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                    isSelected
                      ? 'border-brand-500 bg-brand-900/20'
                      : isDisabled
                      ? 'border-dark-800 bg-dark-900 opacity-40 cursor-not-allowed'
                      : 'border-dark-700 bg-dark-800 hover:border-dark-500',
                  )}
                >
                  {/* Order badge */}
                  <div className={clsx(
                    'h-5 w-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-brand-500 text-white' : 'bg-dark-700 text-dark-600',
                  )}>
                    {isSelected ? selected.indexOf(m.id) + 1 : '·'}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Wraps instead of cutting names to one letter on narrow phones */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="flex items-center gap-2 min-w-0 max-w-full">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.team_a_color }} />
                        <span className="text-sm font-medium text-dark-100 truncate">{m.team_a}</span>
                      </span>
                      <span className="text-dark-600 text-xs">vs</span>
                      <span className="flex items-center gap-2 min-w-0 max-w-full">
                        <span className="text-sm font-medium text-dark-100 truncate">{m.team_b}</span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.team_b_color }} />
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-dark-500">{m.court_name}</span>
                      <span className="font-mono text-xs text-dark-700">#{m.match_code}</span>
                    </div>
                  </div>
                  <div className="text-xs font-black tabular-nums text-dark-400 flex-shrink-0">
                    {m.score_a} – {m.score_b}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Saved sponsors / announcements — push straight to the display */}
      {assetType && (
        <div>
          <p className="text-xs text-dark-500 mb-2 font-medium">
            {assetType === 'sponsor' ? 'Saved sponsors' : 'Saved announcements'}
            <span className="text-dark-700"> — tap Show to push</span>
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {assets.filter((a) => a.type === assetType).length === 0 && (
              <p className="text-xs text-dark-600 text-center py-4">
                None saved yet — add one in “Sponsors &amp; Announcements”.
              </p>
            )}
            {assets.filter((a) => a.type === assetType).map((a) => {
              const vid = isVideoUrl(a.image_url)
              return (
                <div key={a.id} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dark-700 bg-dark-800">
                  {a.image_url ? (
                    vid ? (
                      <div className="relative h-9 w-9 rounded-lg bg-dark-925 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        <video src={a.image_url} className="h-full w-full object-cover" muted />
                        <Play size={11} className="absolute text-white/80" fill="currentColor" />
                      </div>
                    ) : (
                      <img src={a.image_url} alt="" className="h-9 w-9 object-contain rounded-lg bg-dark-925 flex-shrink-0" />
                    )
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-dark-900 flex items-center justify-center flex-shrink-0">
                      <Megaphone size={14} className="text-dark-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-100 truncate">{a.title || a.body || (vid ? 'Video' : 'Image')}</p>
                    <p className="text-xs text-dark-600">{vid ? 'Video' : `${a.duration}s`}</p>
                  </div>
                  <button onClick={() => handleShowAsset(a.id)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 flex-shrink-0',
                      shownId === a.id ? 'bg-live/20 text-live' : 'bg-brand-500/15 text-brand-200 hover:bg-brand-500/25',
                    )}>
                    {shownId === a.id ? <><Check size={13} /> Shown</> : <><Send size={13} /> Show</>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      </>)}

      {/* Player intro animation toggle — only for match layouts (1/2/4). */}
      {(source === 'follow' || !assetType) && (
        <button
          type="button"
          onClick={() => setShowPlayerAnim((v) => !v)}
          aria-pressed={showPlayerAnim}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
            showPlayerAnim
              ? 'border-brand-500 bg-brand-500/15 text-brand-100'
              : 'border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-500',
          )}
        >
          <Users size={16} className={showPlayerAnim ? 'text-brand-300' : 'text-dark-500'} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Player animation</p>
            <p className="text-xs text-dark-500">Pre-match player spotlight intro</p>
          </div>
          <span className={clsx(
            'relative h-5 w-9 rounded-full transition-colors flex-shrink-0',
            showPlayerAnim ? 'bg-brand-500' : 'bg-dark-600',
          )}>
            <span className={clsx(
              'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
              showPlayerAnim ? 'left-[18px]' : 'left-0.5',
            )} />
          </span>
        </button>
      )}

      {source === 'follow' && (
        <div className="space-y-2">
          <Button
            className="w-full"
            variant={pushed ? 'success' : 'primary'}
            icon={<MapPin size={14} />}
            loading={sending}
            onClick={() => handleFollow(courtId)}
            disabled={!courtId}
          >
            {pushed
              ? '✓ Following'
              : `Follow ${courts.find((c) => c.id === courtId)?.label ?? 'court'} on ${screen.name}`}
          </Button>
          {screen.follow_court_id && (
            <button
              onClick={() => { setCourtId(''); handleFollow('') }}
              className="w-full text-xs text-dark-500 hover:text-dark-200 py-1"
            >
              Stop following (keep showing the current match)
            </button>
          )}
        </div>
      )}

      {/* Push button — only for match layouts (1/2/4). Assets push via Show. */}
      {source === 'manual' && !assetType && (
        <Button
          className="w-full"
          variant={pushed ? 'success' : 'primary'}
          icon={<Send size={14} />}
          loading={sending}
          onClick={handlePush}
          disabled={maxSel > 0 && selected.length === 0}
        >
          {pushed ? `✓ Pushed to ${screen.name}` : `Push to ${screen.name}`}
        </Button>
      )}
    </div>
  )
}
