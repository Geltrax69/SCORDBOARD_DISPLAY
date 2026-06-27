import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Monitor, Columns2, Grid2x2, Megaphone, Video, Tv, Send, Play, Check, Users } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { setDisplayLayout, listDisplayAssets, showDisplayAsset } from '@/services/api'
import { isVideoUrl } from '@/components/admin/DisplayAssetsControl'
import type { Match, DisplayAsset } from '@/types'

interface Props {
  matches: Match[]
}

const MODES = [
  { mode: 1 as const, label: 'Single',  icon: Monitor,    desc: 'One match fullscreen' },
  { mode: 2 as const, label: '2 Matches', icon: Columns2, desc: 'Side by side' },
  { mode: 3 as const, label: '4-Grid',  icon: Grid2x2,   desc: '2×2 grid' },
  { mode: 4 as const, label: 'Announce', icon: Megaphone, desc: 'Announcement overlay' },
  { mode: 5 as const, label: 'Sponsor',  icon: Video,     desc: 'Sponsor / video' },
]

const MAX_MATCHES: Record<number, number> = { 1: 1, 2: 2, 3: 4, 4: 0, 5: 0 }

export function DisplayControl({ matches }: Props) {
  // Only live/upcoming matches are selectable for the display — not finished ones.
  const pickable = matches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled')
  const [mode, setMode]       = useState<1|2|3|4|5>(1)
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending]  = useState(false)
  const [pushed, setPushed]    = useState(false)
  const [assets, setAssets]    = useState<DisplayAsset[]>([])
  const [shownId, setShownId]  = useState<string | null>(null)
  // Player intro animation on pending matches — off by default.
  const [showPlayerAnim, setShowPlayerAnim] = useState(false)

  const maxSel = MAX_MATCHES[mode] ?? 0
  const assetType: 'announcement' | 'sponsor' | null = mode === 4 ? 'announcement' : mode === 5 ? 'sponsor' : null

  // Keep the saved sponsor/announcement library in sync so it can be pushed
  // straight from here. Refetch when switching into Announce/Sponsor mode.
  useEffect(() => {
    if (!assetType) return
    listDisplayAssets().then(setAssets).catch(() => {})
  }, [assetType])

  const handleShowAsset = async (id: string) => {
    await showDisplayAsset(id)
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
      await setDisplayLayout({ mode, match_ids: selected, show_player_animation: showPlayerAnim })
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
      <div className="flex items-center gap-2">
        <Tv size={16} className="text-brand-400" />
        <h3 className="font-semibold text-dark-100">Display Control</h3>
        <span className="text-xs text-dark-500 ml-auto">Push layout to all display screens</span>
      </div>

      {/* Mode buttons */}
      <div className="grid grid-cols-5 gap-2">
        {MODES.map(({ mode: m, label, icon: Icon, desc }) => {
          const active = mode === m
          return (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              title={desc}
              aria-pressed={active}
              className={clsx(
                'group relative flex flex-col items-center gap-2 py-3.5 rounded-xl border text-xs font-semibold',
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
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.team_a_color }} />
                      <span className="text-sm font-medium text-dark-100 truncate">{m.team_a}</span>
                      <span className="text-dark-600 text-xs">vs</span>
                      <span className="text-sm font-medium text-dark-100 truncate">{m.team_b}</span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.team_b_color }} />
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

      {/* Player intro animation toggle — only for match layouts (1/2/4). */}
      {!assetType && (
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

      {/* Push button — only for match layouts (1/2/4). Assets push via Show. */}
      {!assetType && (
        <Button
          className="w-full"
          variant={pushed ? 'success' : 'primary'}
          icon={<Send size={14} />}
          loading={sending}
          onClick={handlePush}
          disabled={maxSel > 0 && selected.length === 0}
        >
          {pushed ? '✓ Pushed to Display Screens' : 'Push to Display Screens'}
        </Button>
      )}
    </div>
  )
}
