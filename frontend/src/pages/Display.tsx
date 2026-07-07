import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(Flip)
import { scoreboardWS } from '@/services/websocket'
import { useAuthStore } from '@/store/authStore'
import { useWSStore } from '@/store/wsStore'
import { getMatch, listMatches, getMatchPlayers } from '@/services/api'
import { TimeoutOverlay } from '@/components/display/TimeoutOverlay'
import { SubstitutionOverlay } from '@/components/display/SubstitutionOverlay'
import { AnnouncementOverlay } from '@/components/display/AnnouncementOverlay'
import { SponsorOverlay } from '@/components/display/SponsorOverlay'
import { PlayerLineup } from '@/components/display/PlayerLineup'
import { VideoPlayer } from '@/components/display/VideoPlayer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { TakrawBall } from '@/components/common/TakrawBall'
import type {
  WSMessage, Match, MatchState, TimeoutPayload,
  SubstitutionPayload, AnnouncementPayload, SponsorPayload, Player,
} from '@/types'
import { clsx } from 'clsx'
import { Wifi, WifiOff, Trophy, Tv } from 'lucide-react'

const WS_BASE =
  (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host
const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

interface LiveMatch { match: Match; state: MatchState }

type OverlayState =
  | { type: 'none' }
  | { type: 'countdown'; match: Match; players: Player[]; pendingState: MatchState }
  | { type: 'lineup'; match: Match; players: Player[] }
  | { type: 'timeout'; payload: TimeoutPayload; match: Match }
  | { type: 'courtchange'; match: Match; nextSet: number }
  | { type: 'substitution'; payload: SubstitutionPayload; match: Match }
  | { type: 'setpoint'; match: Match; team: 'A' | 'B'; isMatch: boolean }
  | { type: 'announcement'; payload: AnnouncementPayload }
  | { type: 'sponsor'; payload: SponsorPayload }
  | { type: 'video'; src: string }

// Match-specific moments rendered INSIDE a single card when several matches
// share the screen, so they never cover the other live courts.
type CellFx =
  | { kind: 'sub'; payload: SubstitutionPayload }
  | { kind: 'setpoint'; team: 'A' | 'B'; isMatch: boolean }
  | { kind: 'courtchange'; nextSet: number }

export default function Display() {
  const [searchParams] = useSearchParams()
  const singleMatchId = searchParams.get('match')
  const token = useAuthStore((s) => s.token)
  const wsStatus = useWSStore((s) => s.status)
  const setWsStatus = useWSStore((s) => s.setStatus)

  const [mode, setMode]             = useState<1|2|3|4|5>(1)
  const [matchIds, setMatchIds]     = useState<string[]>(singleMatchId ? [singleMatchId] : [])
  // Pre-match player spotlight intro — off by default, toggled from admin.
  const [showPlayerAnim, setShowPlayerAnim] = useState(false)
  const [liveMatches, setLiveMatches] = useState<Record<string, LiveMatch>>({})
  const [players, setPlayers]       = useState<Record<string, Player[]>>({})
  const [overlay, setOverlay]       = useState<OverlayState>({ type: 'none' })
  const [bgUrl, setBgUrl]           = useState('')
  const [cardStyle, setCardStyle]   = useState<'classic' | 'cards'>('classic')
  const [loading, setLoading]       = useState(true)
  // Winner takeover + reflow: a just-finished match shows full-screen, then is
  // dropped from the grid so the remaining matches stretch to fill the space.
  const [celebrating, setCelebrating] = useState<LiveMatch | null>(null)
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set())
  // Per-card transient FX (only used in multi-match grid). true = >1 match shown.
  const [cellFx, setCellFx]           = useState<Record<string, CellFx>>({})
  const multiRef = useRef(false)
  const flashCell = (id: string, fx: CellFx, ms: number) => {
    setCellFx((prev) => ({ ...prev, [id]: fx }))
    setTimeout(() => setCellFx((prev) => { const n = { ...prev }; delete n[id]; return n }), ms)
  }

  const layoutRef = useRef<HTMLDivElement>(null)

  // After the winner takeover plays, drop that match and let the grid reflow.
  useEffect(() => {
    if (!celebrating) return
    const id = celebrating.match.id
    const t = setTimeout(() => {
      setDismissed((prev) => new Set(prev).add(id))
      setCelebrating(null)
    }, 20000)
    return () => clearTimeout(t)
  }, [celebrating])

  // Persistent display background + scorecard style (survive reloads, all displays).
  useEffect(() => {
    fetch(`${API_BASE}/display/background`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBgUrl(d.background_url || ''))
      .catch(() => {})
    fetch(`${API_BASE}/display/style`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCardStyle(d.style === 'cards' ? 'cards' : 'classic'))
      .catch(() => {})
  }, [])

  // ── Load initial data ─────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      let ids = matchIds

      // If no specific match requested, try to get persisted layout from server
      if (ids.length === 0 && token) {
        try {
          const res = await fetch(`${API_BASE}/display/layout`)
          if (res.ok) {
            const layout = await res.json()
            if (layout.mode) setMode(layout.mode)
            if (layout.match_ids?.length) ids = layout.match_ids
            setShowPlayerAnim(!!layout.show_player_animation)
          }
        } catch {}
      }

      // Fallback: load all non-completed matches
      if (ids.length === 0) {
        const all = await listMatches()
        ids = all.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').map((m) => m.id)
      }

      setMatchIds(ids)

      // Fetch each match + players
      const results = await Promise.allSettled(ids.map((id) => getMatch(id)))
      const pResults = await Promise.allSettled(ids.map((id) => getMatchPlayers(id)))

      const lm: Record<string, LiveMatch> = {}
      const pl: Record<string, Player[]> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          lm[ids[i]] = { match: r.value.match, state: r.value.state }
        }
      })
      pResults.forEach((r, i) => {
        if (r.status === 'fulfilled') pl[ids[i]] = r.value
      })
      setLiveMatches(lm)
      setPlayers(pl)
      setLoading(false)
    }
    init()
  }, [])

  // ── WS message handler ────────────────────────────────────────────────────
  const handleWS = useCallback((msg: WSMessage) => {
    const { type, match_id, payload } = msg

    switch (type) {
      case 'score_update':
      case 'score_remove':
      case 'timer_start':
      case 'timer_pause':
      case 'match_end':
      case 'timeout_end': {
        // A score means play resumed — clear any court-change/set-point card
        // overlay so the new set's scores are visible immediately.
        if ((type === 'score_update' || type === 'score_remove') && match_id) {
          setCellFx((prev) => { if (!prev[match_id]) return prev; const n = { ...prev }; delete n[match_id]; return n })
        }
        if (match_id && payload.match && payload.state) {
          // The deciding point auto-completes the match (status flips to
          // "completed"); fire the takeover when it does, not just on match_end.
          const justCompleted = payload.state.status === 'completed' &&
            liveMatches[match_id]?.state.status !== 'completed'
          // A finished set (but not the match) triggers the 2-minute court change.
          const prevSets = liveMatches[match_id]?.state.completed_sets?.length ?? 0
          const setJustFinished = type === 'score_update' &&
            payload.state.status !== 'completed' &&
            (payload.state.completed_sets?.length ?? 0) > prevSets
          // Newly reached set/match point (or escalated set→match, or switched team).
          const prevSt = liveMatches[match_id]?.state
          const curTeam = payload.state.match_point || payload.state.set_point
          const curIsMatch = !!payload.state.match_point
          const prevTeam = prevSt?.match_point || prevSt?.set_point
          const newlyPoint = !!curTeam && payload.state.status === 'active' &&
            (curTeam !== prevTeam || curIsMatch !== !!prevSt?.match_point)
          setLiveMatches((prev) => ({ ...prev, [match_id]: { match: payload.match!, state: payload.state! } }))
          if (type === 'match_end' || justCompleted) {
            setCelebrating({ match: payload.match, state: payload.state })
          } else if (setJustFinished) {
            if (multiRef.current) flashCell(match_id, { kind: 'courtchange', nextSet: payload.state.set_number }, 120000)
            else setOverlay({ type: 'courtchange', match: payload.match, nextSet: payload.state.set_number })
          } else if (newlyPoint) {
            if (multiRef.current) flashCell(match_id, { kind: 'setpoint', team: curTeam as 'A' | 'B', isMatch: curIsMatch }, 3500)
            else setOverlay({ type: 'setpoint', match: payload.match, team: curTeam as 'A' | 'B', isMatch: curIsMatch })
          }
        }
        if (type === 'timeout_end') setOverlay({ type: 'none' })
        break
      }
      case 'match_start': {
        if (match_id && payload.match && payload.state) {
          const m = payload.match!
          const pl = players[m.id] ?? []
          // A restarted match should re-enter the grid (undo any earlier dismiss).
          setDismissed((prev) => {
            if (!prev.has(m.id)) return prev
            const next = new Set(prev); next.delete(m.id); return next
          })
          // Show 5-second countdown BEFORE switching to live view
          setOverlay({ type: 'countdown', match: m, players: pl, pendingState: payload.state! })
        }
        break
      }
      case 'timeout_start': {
        if (match_id && payload.match && payload.state?.current_timeout) {
          setLiveMatches((prev) => ({ ...prev, [match_id]: { match: payload.match!, state: payload.state! } }))
          // Multi-match: the card itself shows TIME OUT (status). Single: full-screen.
          if (!multiRef.current) {
            setOverlay({ type: 'timeout', payload: payload.state!.current_timeout!, match: payload.match! })
          }
        }
        break
      }
      case 'substitution': {
        if (match_id && payload.event && payload.match) {
          const sub = payload.event.payload as unknown as SubstitutionPayload
          if (multiRef.current) flashCell(match_id, { kind: 'sub', payload: sub }, 4500)
          else setOverlay({ type: 'substitution', payload: sub, match: payload.match! })
        }
        break
      }
      case 'announcement': {
        const p = payload as unknown as AnnouncementPayload
        if (p.message || p.title || p.image_url) setOverlay({ type: 'announcement', payload: p })
        break
      }
      case 'sponsor_show': {
        const p = payload as unknown as SponsorPayload
        if (p.image_url) setOverlay({ type: 'sponsor', payload: p })
        break
      }
      case 'display_background': {
        setBgUrl((payload as unknown as { background_url: string }).background_url || '')
        break
      }
      case 'display_style': {
        setCardStyle((payload as unknown as { style: string }).style === 'cards' ? 'cards' : 'classic')
        break
      }
      case 'display_layout_change': {
        const p = payload as unknown as { mode: 1|2|3|4|5; match_ids: string[]; show_player_animation?: boolean }
        if (p.mode) {
          setMode(p.mode)
          setMatchIds(p.match_ids ?? [])
          setShowPlayerAnim(!!p.show_player_animation)
          setDismissed(new Set()) // fresh selection — clear prior reflow state
          setCelebrating(null)
          // Fetch any matches we don't have yet — the grid reflows via Flip.
          p.match_ids?.forEach(async (id) => {
            if (!liveMatches[id]) {
              const { match, state } = await getMatch(id)
              const pl = await getMatchPlayers(id)
              setLiveMatches((prev) => ({ ...prev, [id]: { match, state } }))
              setPlayers((prev) => ({ ...prev, [id]: pl }))
            }
          })
        }
        break
      }
    }
  }, [players, liveMatches])

  const handleWSRef = useRef(handleWS)
  useEffect(() => {
    handleWSRef.current = handleWS
  })

  // ── Local Timer Ticking ───────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveMatches((prev) => {
        let changed = false
        const next = { ...prev }
        for (const id in next) {
          const m = next[id]
          if (m?.state?.timer_running) {
            next[id] = {
              ...m,
              state: { ...m.state, timer_seconds: (m.state.timer_seconds ?? 0) + 1 }
            }
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ── WS connection ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    const path = singleMatchId ? `/ws/match/${singleMatchId}` : '/ws/global'
    const url = `${WS_BASE}${path}?token=${encodeURIComponent(token)}`
    scoreboardWS.connect(url, setWsStatus)

    const unsub = scoreboardWS.subscribe((msg: WSMessage) => handleWSRef.current(msg))
    return () => { unsub(); scoreboardWS.disconnect() }
  }, [token, singleMatchId])

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <LoadingSpinner size="lg" label="Connecting to live scores…" />
      </div>
    )
  }

  const matchList = matchIds.map((id) => liveMatches[id]).filter(Boolean) as LiveMatch[]
  // Matches actually shown right now: selected, loaded, and not reflowed-out
  // after their winner takeover. The grid auto-sizes to however many remain.
  const visibleList = matchList.filter((lm) => !dismissed.has(lm.match.id))
  // Multiple matches on screen → match-specific moments stay inside their card.
  multiRef.current = visibleList.length > 1

  return (
    <div
      className="h-screen bg-dark-950 overflow-hidden relative select-none bg-center bg-cover"
      style={bgUrl ? { backgroundImage: `url(${bgUrl})` } : undefined}
    >
      {/* Dark scrim over the background image so scores stay readable */}
      {bgUrl && <div className="absolute inset-0 bg-black/50 pointer-events-none" />}

      {/* WS indicator */}
      <div className={clsx(
        'absolute top-3 right-3 z-10 flex items-center gap-1 text-xs opacity-50',
        wsStatus === 'connected' ? 'text-emerald-400' : 'text-dark-600',
      )}>
        {wsStatus === 'connected' ? <Wifi size={10} /> : <WifiOff size={10} />}
      </div>

      {/* Main content */}
      <div ref={layoutRef} className="h-full flex flex-col">
        {(mode === 4 || mode === 5) && visibleList.length === 0 ? (
          <EmptyDisplay label={mode === 4 ? 'ANNOUNCEMENT MODE' : 'SPONSOR MODE'} />
        ) : visibleList.length === 0 ? (
          <EmptyDisplay label="Waiting for matches" />
        ) : (
          <MatchGrid matches={visibleList} players={players} showPlayerAnim={showPlayerAnim} fx={cellFx} cardStyle={cardStyle} />
        )}
      </div>

      {/* Winner takeover — full-screen celebration before the grid reflows */}
      {celebrating && (
        <div className="fixed inset-0 z-[60]">
          <MatchCompletedCelebration lm={celebrating} />
        </div>
      )}

      {/* Overlays (appear on top of everything) */}
      {overlay.type === 'countdown' && (
        <CountdownOverlay
          match={overlay.match}
          onDone={() => {
            const m = overlay.match
            const st = overlay.pendingState
            const pl = overlay.players
            setLiveMatches((prev) => ({ ...prev, [m.id]: { match: m, state: st } }))
            setOverlay({ type: 'lineup', match: m, players: pl })
          }}
        />
      )}
      {overlay.type === 'lineup' && (
        <PlayerLineup
          match={overlay.match}
          players={overlay.players}
          onDone={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'timeout' && (
        <TimeoutOverlay
          payload={overlay.payload}
          match={overlay.match}
          autoDismissSeconds={visibleList.length > 1 ? 5 : undefined}
          onEnd={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'courtchange' && (
        <CourtChangeOverlay
          match={overlay.match}
          nextSet={overlay.nextSet}
          onDone={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'setpoint' && (
        <SetPointOverlay
          match={overlay.match}
          team={overlay.team}
          isMatch={overlay.isMatch}
          onDone={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'substitution' && (
        <SubstitutionOverlay
          payload={overlay.payload}
          match={overlay.match}
          onDone={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'announcement' && (
        <AnnouncementOverlay
          message={overlay.payload.message}
          duration={overlay.payload.duration}
          imageUrl={overlay.payload.image_url}
          title={overlay.payload.title}
          onDone={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'sponsor' && (
        <SponsorOverlay
          title={overlay.payload.title}
          imageUrl={overlay.payload.image_url}
          duration={overlay.payload.duration}
          onDone={() => setOverlay({ type: 'none' })}
        />
      )}
      {overlay.type === 'video' && (
        <VideoPlayer src={overlay.src} onEnded={() => setOverlay({ type: 'none' })} />
      )}
    </div>
  )
}

// ── Display layout components ─────────────────────────────────────────────────

function EmptyDisplay({ label }: { label: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rootRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo('.ed-fade', { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.12 })
      gsap.to('.ed-ring', { scale: 1.18, opacity: 0.15, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.ed-ring2', { scale: 1.3, opacity: 0.08, duration: 2.4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.4 })
      gsap.to('.ed-dot', { opacity: 1, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.18 })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="flex-1 flex items-center justify-center relative overflow-hidden">
      {/* Ambient drifting glow */}
      <div className="absolute w-[42vw] h-[42vw] rounded-full bg-brand-600/10 blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="relative flex flex-col items-center gap-7">
        <div className="relative ed-fade">
          <div className="ed-ring absolute inset-0 rounded-full border border-brand-500/30" />
          <div className="ed-ring2 absolute inset-0 rounded-full border border-brand-500/20" />
          <div className="h-24 w-24 rounded-full bg-dark-900 border border-dark-700 flex items-center justify-center">
            <Tv size={40} className="text-brand-400" />
          </div>
        </div>
        <h2 className="ed-fade font-black text-white/90 tracking-tight text-4xl">Scoreboard</h2>
        <div className="ed-fade flex items-center gap-2 text-dark-500 text-lg font-semibold uppercase tracking-[0.25em]">
          <span>{label}</span>
          <span className="ed-dot opacity-20">.</span>
          <span className="ed-dot opacity-20">.</span>
          <span className="ed-dot opacity-20">.</span>
        </div>
      </div>
    </div>
  )
}

// Per-slot placeholder used inside the 2-up / 4-grid layouts.
function WaitingSlot({ label, index = 0 }: { label: string; index?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current, { opacity: 0, y: 26, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', delay: index * 0.12 })
      gsap.to('.ws-icon', { scale: 1.08, opacity: 0.85, duration: 1.6, repeat: -1, yoyo: true, ease: 'sine.inOut' })
    }, ref)
    return () => ctx.revert()
  }, [index])

  return (
    <div ref={ref} className="relative flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-dark-700 bg-dark-900/40 h-full">
      <div className="ws-icon h-16 w-16 rounded-full bg-dark-800 border border-dark-700 flex items-center justify-center">
        <Tv size={26} className="text-dark-500" />
      </div>
      <p className="text-dark-400 font-black uppercase tracking-widest text-lg">{label}</p>
      <p className="text-dark-600 text-sm font-medium">Waiting for match</p>
    </div>
  )
}

// ── 5-second countdown overlay ───────────────────────────────────────────────
function CountdownOverlay({ match: m, onDone }: { match: Match; onDone: () => void }) {
  const ref        = useRef<HTMLDivElement>(null)
  const numRef     = useRef<HTMLDivElement>(null)
  const labelRef   = useRef<HTMLDivElement>(null)
  const onDoneRef  = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const el  = ref.current
    const num = numRef.current
    const lbl = labelRef.current
    if (!el || !num || !lbl) return

    const ctx = gsap.context(() => {
      // Fade in the whole overlay
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' })

      // Animate each digit 5 → 4 → 3 → 2 → 1 → GO!
      const digits = [5, 4, 3, 2, 1]
      const tl = gsap.timeline({ onComplete: () => {
        // Fade out then call onDone
        gsap.to(el, { opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => onDoneRef.current() })
      }})

      digits.forEach((d, i) => {
        tl.call(() => { if (num) num.textContent = String(d) }, [], i)
        tl.fromTo(num,
          { scale: 1.6, opacity: 0 },
          { scale: 1,   opacity: 1, duration: 0.25, ease: 'back.out(2)' },
          i
        )
        tl.to(num,
          { scale: 0.7, opacity: 0, duration: 0.35, ease: 'power2.in' },
          i + 0.6
        )
      })

      // "GO!" at the end
      tl.call(() => { if (num) num.textContent = 'GO!'; if (lbl) lbl.textContent = 'MATCH STARTED' }, [], 5)
      tl.fromTo(num,
        { scale: 0, opacity: 0 },
        { scale: 1.1, opacity: 1, duration: 0.4, ease: 'back.out(3)' },
        5
      )
      tl.to(num, { scale: 1.3, duration: 0.3, ease: 'power1.in' }, 5.4)

      // Ripple ring pulse on each digit
      tl.fromTo('.cd-ring',
        { scale: 0.6, opacity: 0.6 },
        { scale: 2.5, opacity: 0, duration: 0.9, ease: 'power2.out', repeat: 4, repeatDelay: 0.1 },
        0
      )

    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={ref} className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#03070d' }}>

      {/* Team color blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-y-0 left-0 w-1/2"
          style={{ background: `radial-gradient(ellipse at 20% 50%, ${m.team_a_color}30 0%, transparent 70%)` }} />
        <div className="absolute inset-y-0 right-0 w-1/2"
          style={{ background: `radial-gradient(ellipse at 80% 50%, ${m.team_b_color}30 0%, transparent 70%)` }} />
      </div>

      {/* Match name */}
      <p className="text-white/25 text-sm uppercase tracking-[0.5em] font-bold mb-8 relative z-10">
        <span style={{ color: m.team_a_color }}>{m.team_a}</span>
        <span className="mx-3 text-white/20">vs</span>
        <span style={{ color: m.team_b_color }}>{m.team_b}</span>
      </p>

      {/* Ripple ring */}
      <div className="relative flex items-center justify-center z-10">
        <div className="cd-ring absolute w-48 h-48 rounded-full border-4 pointer-events-none"
          style={{ borderColor: `${m.team_a_color}60` }} />

        {/* Circle */}
        <div className="w-52 h-52 rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at center, ${m.team_a_color}20 0%, transparent 70%)`,
            border: `3px solid ${m.team_a_color}40`,
            boxShadow: `0 0 80px ${m.team_a_color}30, 0 0 0 1px ${m.team_a_color}20`,
          }}>
          <div ref={numRef} className="font-black leading-none select-none"
            style={{ fontSize: '6rem', color: '#fff', textShadow: `0 0 40px ${m.team_a_color}` }}>
            5
          </div>
        </div>
      </div>

      {/* Label */}
      <div ref={labelRef} className="mt-8 text-white/40 text-sm font-black uppercase tracking-[0.5em] relative z-10">
        MATCH STARTING
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: `linear-gradient(to right, ${m.team_a_color}, ${m.team_b_color})` }} />
    </div>
  )
}

// ── Pre-match intro — shown when status === 'pending' ────────────────────────
function PreMatchIntro({ m, players, showPlayerAnim }: { m: Match; players: Player[]; showPlayerAnim: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const logosSceneRef = useRef<HTMLDivElement>(null)
  const playerSceneRef = useRef<HTMLDivElement>(null)
  const logoARef = useRef<HTMLDivElement>(null)
  const logoBRef = useRef<HTMLDivElement>(null)
  const vsRef = useRef<HTMLDivElement>(null)
  const topBarRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const metaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoRef = useRef<HTMLImageElement>(null)

  const [playerPhase, setPlayerPhase] = useState(false)
  const [spotIdx, setSpotIdx] = useState(0)
  const [maskFrame, setMaskFrame] = useState<number | null>(null)

  const playersA  = players.filter((p) => p.team === 'A')
  const playersB  = players.filter((p) => p.team === 'B')
  const allPlayers = [...playersA, ...playersB]
  const spotlight = allPlayers[spotIdx]

  const spotColor = spotlight ? (spotlight.team === 'A' ? m.team_a_color : m.team_b_color) : m.team_a_color
  const spotTeam = spotlight ? (spotlight.team === 'A' ? m.team_a : m.team_b) : m.team_a
  const spotLogo = spotlight ? (spotlight.team === 'A' ? m.team_a_logo : m.team_b_logo) : undefined
  const spotStatus = spotlight ? (spotlight.status === 'sub' ? 'SUB' : 'PLAYER') : 'PLAYER'

  const nextIndex = (from: number) => (from + 1) % Math.max(allPlayers.length, 1)

  // Stable random particle generation to avoid jumping on re-renders
  const particles = useMemo(() => {
    return Array.from({ length: 25 }).map((_, i) => ({
      size: Math.random() * 4 + 2,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: Math.random() * 8 + 8,
      opacity: Math.random() * 0.4 + 0.2,
    }))
  }, [])

  // Keep spotColorRef up to date for continuous canvas animation
  const spotColorRef = useRef(spotColor)
  useEffect(() => {
    spotColorRef.current = spotColor
  }, [spotColor])





  // Canvas Particle Vortex Animation (sized to full screen window)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    class Particle {
      x: number
      y: number
      speedX: number
      speedY: number
      size: number
      opacity: number
      color: string
      angle: number

      constructor(canvasWidth: number, canvasHeight: number) {
        this.x = Math.random() * canvasWidth
        this.y = Math.random() * canvasHeight
        this.speedX = Math.random() * 0.3 - 0.15
        this.speedY = Math.random() * 0.3 - 0.15
        this.size = Math.random() * 1.5 + 0.3
        this.opacity = Math.random() * 0.20 + 0.05
        this.color = Math.random() > 0.4 ? 'spot' : 'white'
        this.angle = Math.random() * Math.PI * 2
      }

      update(w: number, h: number) {
        this.x += this.speedX + Math.sin(this.angle) * 0.08
        this.y += this.speedY + Math.cos(this.angle) * 0.08
        this.angle += 0.005

        if (this.x < 0) this.x = w
        if (this.x > w) this.x = 0
        if (this.y < 0) this.y = h
        if (this.y > h) this.y = 0
      }

      draw(context: CanvasRenderingContext2D, colorHex: string) {
        context.beginPath()
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        const rgb = hexToRgb(colorHex)
        context.fillStyle = this.color === 'spot' 
          ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.opacity})` 
          : `rgba(255, 255, 255, ${this.opacity * 0.35})`
        context.fill()
      }
    }

    function hexToRgb(hex: string) {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
      const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b)
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex)
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 }
    }

    const particlesList = Array.from({ length: 130 }, () => new Particle(width, height))

    const render = () => {
      // Clear with trailing alpha for particle sweeps
      ctx.fillStyle = 'rgba(2, 5, 10, 0.08)'
      ctx.fillRect(0, 0, width, height)

      particlesList.forEach(p => {
        p.update(width, height)
        p.draw(ctx, spotColorRef.current)
      })

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [playerPhase])

  // ── Sequence: logos first, then full-screen player intro ────────────────
  useEffect(() => {
    const el = ref.current
    if (!el || !logosSceneRef.current || !playerSceneRef.current) return

    const ctx = gsap.context(() => {
      gsap.set(playerSceneRef.current, { autoAlpha: 0 })
      gsap.set(logosSceneRef.current, { autoAlpha: 1 })

      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
      intro
        .fromTo('.pi-ls-badge', { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 0.45 })
        .fromTo([logoARef.current, logoBRef.current],
          { opacity: 0, scale: 0.68, y: 26 },
          { opacity: 1, scale: 1, y: 0, duration: 0.7, stagger: 0.14 },
          '-=0.1',
        )
        .fromTo(vsRef.current,
          { opacity: 0, scale: 0.35, rotation: -14 },
          { opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.8)' },
          '-=0.35',
        )
        // Logo bob. When the player-spotlight toggle is OFF, the intro stays on
        // this opener and loops the bob forever — scene 2 is never entered.
        .to([logoARef.current, logoBRef.current], {
          y: -10,
          duration: 1.2,
          yoyo: true,
          repeat: showPlayerAnim ? 1 : -1,
          ease: 'sine.inOut',
          stagger: 0.15,
        })

      if (showPlayerAnim) {
        intro
          .to(logosSceneRef.current, { autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, '+=0.1')
          .set(playerSceneRef.current, { autoAlpha: 1 })
          .fromTo(playerSceneRef.current, { opacity: 0, scale: 1.02 }, { opacity: 1, scale: 1, duration: 0.55, ease: 'power2.out' })
          .fromTo(topBarRef.current, { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: 0.45 }, '-=0.3')
          .call(() => {
            const maskObj = { frame: 0 }
            setMaskFrame(0)
            gsap.to(maskObj, {
              frame: 29,
              duration: 0.6,
              ease: 'steps(29)',
              onUpdate: () => setMaskFrame(Math.round(maskObj.frame)),
              onComplete: () => {
                setMaskFrame(null)
                setPlayerPhase(true) // Ensure playerPhase only triggers AFTER mask reveal completes
              }
            })
          }, undefined, '-=0.2')
      }

      // Ambient loops across the whole intro screen
      gsap.to('.pi-glow-a', { opacity: 0.5, scale: 1.22, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.pi-glow-b', { opacity: 0.5, scale: 1.22, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.1 })
      gsap.fromTo('.pi-beam',
        { xPercent: -160, opacity: 0.9 },
        { xPercent: 220, opacity: 0.2, duration: 1.4, ease: 'power2.inOut', repeat: -1, repeatDelay: 4.2, delay: 1.6 },
      )
      gsap.fromTo('.pi-beam2',
        { xPercent: -170, opacity: 0.4 },
        { xPercent: 220, opacity: 0, duration: 1.2, ease: 'power1.inOut', repeat: -1, repeatDelay: 4.6, delay: 2.8 },
      )
      gsap.to('.pi-bar', { opacity: 0.45, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' })

      // While the opener loops (player spotlight off), keep it breathing so it
      // never reads as a frozen frame. Starts after the intro reveal settles.
      if (!showPlayerAnim) {
        gsap.to('.pi-ls-dot', {
          scale: 1.7, opacity: 0.5, duration: 1, repeat: -1, yoyo: true,
          ease: 'sine.inOut', stagger: 0.25, transformOrigin: 'center',
        })
        gsap.to(vsRef.current, {
          scale: 1.07, duration: 1.9, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.4,
        })
      }
    }, el)

    return () => {
      setPlayerPhase(false)
      ctx.revert()
    }
  }, [m.id, showPlayerAnim])

  // ── Player spotlight cycling after the logo opener ──────────────────────
  useEffect(() => {
    if (!playerPhase || allPlayers.length < 2) return

    const id = setInterval(() => {
      const next = nextIndex(spotIdx)
      
      // 1. Subtle, premium slide-out before swapping spotlight
      const tl = gsap.timeline({
        onComplete: () => {
          setSpotIdx(next)
        }
      })
      
      tl.to(cardRef.current, { opacity: 0, x: -30, scale: 0.98, duration: 0.35, ease: 'power2.in' })
        .to([nameRef.current, metaRef.current, '.pi-watermark', '.pi-stroke'], { 
          opacity: 0, 
          y: 15, 
          duration: 0.25, 
          ease: 'power2.in', 
          stagger: 0.04 
        }, 0)

    }, 5000)

    return () => clearInterval(id)
  }, [allPlayers.length, playerPhase, spotIdx])

  // Synchronous Layout Effect prevents flash/flicker of the next player before reset
  useLayoutEffect(() => {
    if (!playerPhase || !ref.current || !cardRef.current || allPlayers.length === 0) return

    const ctx = gsap.context(() => {
      // Reset initial states for slide-in reveal
      gsap.set(cardRef.current, { opacity: 0, x: 30, scale: 0.98 })
      gsap.set('.pi-watermark', { opacity: 0, x: 30 })
      gsap.set('.pi-stroke', { scaleX: 0, opacity: 0, y: 0 })
      gsap.set(nameRef.current, { opacity: 0, y: -15, filter: 'blur(6px)' })
      gsap.set(metaRef.current, { opacity: 0, y: 15 })
      gsap.set('.pi-photo', { opacity: 0, scale: 0.96 })

      // Animate Card in
      gsap.to(cardRef.current,
        { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
      )

      gsap.to('.pi-watermark',
        { opacity: 0.1, x: 0, duration: 0.6, ease: 'power3.out' }
      )

      gsap.to('.pi-stroke',
        { scaleX: 1, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.08, delay: 0.08 }
      )

      gsap.to(nameRef.current,
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.48, ease: 'power3.out', delay: 0.15 }
      )

      gsap.to(metaRef.current,
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', delay: 0.22 }
      )

      // Directly trigger fade-in if the image is already cached/complete
      if (photoRef.current && photoRef.current.complete) {
        gsap.to(photoRef.current, { scale: 1, opacity: 1, duration: 0.55, ease: 'power3.out' })
      }
    }, ref.current)

    return () => ctx.revert()
  }, [allPlayers.length, playerPhase, spotIdx])



  return (
    <div ref={ref} className="flex-1 flex flex-col relative overflow-hidden" style={{ background: '#02050a' }}>

      {/* Inline styles for custom animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&display=swap');
        @keyframes floatUpParticles {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
        }
        .animate-particle {
          animation: floatUpParticles linear infinite;
        }
        .text-stroke {
          -webkit-text-stroke: 1px rgba(255,255,255,0.06);
          color: transparent;
        }
        .distressed-title {
          text-shadow: 0 4px 20px rgba(0,0,0,0.8), 0 0 40px rgba(255,255,255,0.1);
          font-family: 'Outfit', 'Inter', sans-serif;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        .glow-border {
          box-shadow: 0 0 30px rgba(0,0,0,0.6), inset 0 0 20px rgba(255,255,255,0.02);
        }
        .bg-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          opacity: 0.02;
          mix-blend-mode: overlay;
        }
      `}</style>

      {/* Grain noise overlay */}
      <div className="absolute inset-0 bg-grain pointer-events-none z-10" />

      {/* Canvas Particle Vortex */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none z-10" 
        style={{ mixBlendMode: 'screen', width: '100%', height: '100%' }} 
      />

      {/* Stable Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40 z-10">
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-particle"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              left: `${p.left}%`,
              bottom: '-20px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              background: spotColor,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      {/* ── Light beams (broadcast-style sweep) ── */}
      <div className="pi-beam absolute inset-y-0 w-32 pointer-events-none z-30"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent)', left: 0 }} />
      <div className="pi-beam2 absolute inset-y-0 w-16 pointer-events-none z-30"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03) 50%, transparent)', left: 0 }} />

      {/* ── Background colour blobs ── */}
      <div className="pi-glow-a absolute pointer-events-none" style={{
        left: '-10%', top: '5%', width: '55%', height: '90%', opacity: 0.25,
        background: `radial-gradient(ellipse at 30% 50%, ${m.team_a_color}35 0%, transparent 65%)`,
      }} />
      <div className="pi-glow-b absolute pointer-events-none" style={{
        right: '-10%', top: '5%', width: '55%', height: '90%', opacity: 0.25,
        background: `radial-gradient(ellipse at 70% 50%, ${m.team_b_color}35 0%, transparent 65%)`,
      }} />

      {/* ── Subtle grid overlay ── */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

      {/* ── Bottom colour bar ── */}
      <div className="pi-bar absolute bottom-0 left-0 right-0 h-[4px] z-10"
        style={{ background: `linear-gradient(90deg, ${m.team_a_color}, transparent 50%, ${m.team_b_color})`, opacity: 0.8 }} />

      {/* ── Scene 1: Logo opener (full screen) ── */}
      <div ref={logosSceneRef} className="absolute inset-0 z-20 flex flex-col items-center justify-center px-8">
        <div className="pi-ls-badge mb-7 flex items-center gap-3 text-amber-400 text-sm font-black uppercase tracking-[0.35em]">
          <span className="pi-ls-dot h-2 w-2 rounded-full bg-amber-400" />
          Match Starting Soon
          <span className="pi-ls-dot h-2 w-2 rounded-full bg-amber-400" />
        </div>

        <div className="flex items-center justify-center gap-10 sm:gap-20">
          <div ref={logoARef} className="flex flex-col items-center gap-4">
            {m.team_a_logo ? (
              <img src={m.team_a_logo} alt="" className="h-28 w-28 sm:h-36 sm:w-36 object-contain rounded-3xl"
                style={{ filter: `drop-shadow(0 0 34px ${m.team_a_color}90)` }}
                onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-3xl flex items-center justify-center text-5xl font-black"
                style={{ background: `${m.team_a_color}1a`, border: `2px solid ${m.team_a_color}60`, color: m.team_a_color }}>
                {m.team_a.charAt(0)}
              </div>
            )}
            <p className="text-3xl sm:text-5xl font-black uppercase tracking-wider" style={{ color: m.team_a_color, textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>{m.team_a}</p>
          </div>

          <div ref={vsRef} className="text-[4rem] sm:text-[6rem] font-black text-white/18 leading-none select-none">VS</div>

          <div ref={logoBRef} className="flex flex-col items-center gap-4">
            {m.team_b_logo ? (
              <img src={m.team_b_logo} alt="" className="h-28 w-28 sm:h-36 sm:w-36 object-contain rounded-3xl"
                style={{ filter: `drop-shadow(0 0 34px ${m.team_b_color}90)` }}
                onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <div className="h-28 w-28 sm:h-36 sm:w-36 rounded-3xl flex items-center justify-center text-5xl font-black"
                style={{ background: `${m.team_b_color}1a`, border: `2px solid ${m.team_b_color}60`, color: m.team_b_color }}>
                {m.team_b.charAt(0)}
              </div>
            )}
            <p className="text-3xl sm:text-5xl font-black uppercase tracking-wider" style={{ color: m.team_b_color, textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>{m.team_b}</p>
          </div>
        </div>
      </div>

      {/* ── Scene 2: Full-screen player intro ── */}
      <div 
        ref={playerSceneRef} 
        className="absolute inset-0 z-30 flex flex-col px-14 py-10"
        style={{
          mask: maskFrame !== null ? 'url(#circle-reveal-mask)' : 'none',
          WebkitMask: maskFrame !== null ? 'url(#circle-reveal-mask)' : 'none'
        }}
      >
        {allPlayers.length > 0 && spotlight ? (
          <div className="h-full flex flex-col justify-between">
            {/* Top Bar */}
            <div ref={topBarRef} className="flex-shrink-0 flex items-center justify-between border-b border-white/[0.08] pb-5 relative z-20">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center p-1.5 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
                  {spotLogo ? (
                    <img src={spotLogo} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xl font-black" style={{ color: spotColor }}>{spotTeam.charAt(0)}</span>
                  )}
                </div>
                <span className="text-2xl sm:text-3xl font-black uppercase tracking-wider" style={{ color: spotColor, textShadow: `0 0 20px ${spotColor}30` }}>
                  {spotTeam}
                </span>
              </div>
              <div className="text-white/50 text-xs sm:text-sm font-black uppercase tracking-[0.3em]">
                TOGETHER. STRONGER. <span style={{ color: spotColor }}>{spotTeam}</span>.
              </div>
            </div>

            {/* Main content split */}
            <div className="flex-1 min-h-0 flex items-center justify-between relative">
              {/* Large background team name watermark */}
              <div 
                className="pi-watermark absolute -left-6 top-1/2 -translate-y-1/2 text-[12vw] font-black uppercase tracking-widest select-none pointer-events-none leading-none z-10 text-stroke opacity-10"
                style={{ 
                  fontFamily: "'Outfit', 'Inter', sans-serif"
                }}
              >
                {spotTeam}
              </div>



              {/* Left Side: Card + Background Strokes Wrapper */}
              <div className="relative w-[38%] h-[82%] flex items-center justify-center">
                
                {/* Diagonal paint strokes / polygons (behind card, z-10) */}
                <div className="absolute inset-0 pointer-events-none z-10 overflow-visible">
                  <div className="pi-stroke absolute inset-0 origin-left">
                    <div 
                      className="absolute top-[-8%] left-[-10%] w-[120%] h-[116%] opacity-20 transform -rotate-12"
                      style={{ 
                        background: `linear-gradient(135deg, ${spotColor} 0%, transparent 80%)`,
                        clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)'
                      }} 
                    />
                  </div>
                  <div className="pi-stroke absolute inset-0 origin-left">
                    <div 
                      className="absolute top-[2%] left-[-5%] w-[110%] h-[96%] opacity-40 transform -rotate-6"
                      style={{ 
                        background: `linear-gradient(45deg, ${spotColor} 0%, transparent 95%)`,
                        clipPath: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)'
                      }} 
                    />
                  </div>
                </div>

                {/* The card itself (z-20) with overflow-hidden to clip the solid image background */}
                <div 
                  ref={cardRef} 
                  className="relative w-full h-full rounded-[2rem] border overflow-hidden flex items-end justify-center z-20 glow-border"
                  style={{ 
                    borderColor: `${spotColor}44`,
                    background: `linear-gradient(135deg, ${spotColor}12 0%, rgba(255,255,255,0.01) 100%)`,
                  }}
                >
                  {/* Player image filled exactly inside the card boundaries */}
                  {spotlight.photo_url ? (
                    <img
                      ref={photoRef}
                      src={spotlight.photo_url}
                      alt={spotlight.name}
                      onLoad={(e) => {
                        gsap.killTweensOf(e.currentTarget)
                        gsap.to(e.currentTarget, { scale: 1, opacity: 1, duration: 0.55, ease: 'power3.out' })
                      }}
                      className="pi-photo relative w-full h-full object-cover object-top z-20 select-none"
                      style={{ 
                        transformOrigin: 'bottom center',
                        filter: `drop-shadow(0 0 24px ${spotColor}60) drop-shadow(0 -10px 30px rgba(0,0,0,0.85))`,
                        opacity: 0
                      }}
                    />
                  ) : (
                    <div className="text-white/20 text-xs uppercase tracking-widest bottom-8 absolute">No Photo</div>
                  )}

                  {/* Team logo badge inside card */}
                  <div className="absolute top-5 left-5 z-30 h-10 w-10 rounded-xl bg-slate-950/40 border border-white/10 flex items-center justify-center p-1.5 backdrop-blur-md">
                    {spotLogo ? (
                      <img src={spotLogo} alt="" className="h-full w-full object-contain filter drop-shadow-md" />
                    ) : (
                      <span className="text-sm font-black" style={{ color: spotColor }}>{spotTeam.charAt(0)}</span>
                    )}
                  </div>

                  {/* Accent dots grid */}
                  <div className="absolute bottom-5 left-5 opacity-25 z-10">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="fill-white">
                      <circle cx="2" cy="2" r="1.5" />
                      <circle cx="10" cy="2" r="1.5" />
                      <circle cx="18" cy="2" r="1.5" />
                      <circle cx="2" cy="10" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="18" cy="10" r="1.5" />
                      <circle cx="2" cy="18" r="1.5" />
                      <circle cx="10" cy="18" r="1.5" />
                      <circle cx="18" cy="18" r="1.5" />
                    </svg>
                  </div>
                </div>

              </div>

              {/* Right Side: Player Details */}
              <div className="flex-1 h-full flex flex-col justify-center pl-20 pr-12 z-20">
                <div 
                  className="text-xs sm:text-sm font-black uppercase tracking-[0.45em] mb-2"
                  style={{ color: spotColor }}
                >
                  {spotStatus === 'SUB' ? 'SUBSTITUTE' : 'SPOTLIGHT PLAYER'}
                </div>

                <div 
                  ref={nameRef}
                  className="text-5xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white mb-3 leading-none distressed-title"
                >
                  {spotlight.name}
                </div>

                <div 
                  className="h-[3px] w-52 mb-8 rounded-full"
                  style={{ 
                    background: `linear-gradient(90deg, ${spotColor}, transparent)`,
                    boxShadow: `0 0 12px ${spotColor}`
                  }}
                />

                <div ref={metaRef} className="grid grid-cols-3 gap-8 max-w-xl border-t border-b border-white/[0.08] py-6 mb-6">
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest font-black mb-1">Jersey No.</p>
                    <p className="text-2xl sm:text-4xl font-black" style={{ color: spotColor }}>
                      #{spotlight.jersey_number}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest font-black mb-1">Role</p>
                    <p className="text-2xl sm:text-4xl font-black text-white">
                      {spotlight.status === 'sub' ? 'SUB' : 'STARTER'}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest font-black mb-1">Team</p>
                    <p className="text-2xl sm:text-4xl font-black uppercase" style={{ color: spotColor }}>
                      {spotTeam}
                    </p>
                  </div>
                </div>

                <p className="text-white/30 text-[10px] uppercase tracking-[0.35em] font-medium">
                  ONE TEAM. ONE FIGHT. ONE <span style={{ color: spotColor }}>{spotTeam}</span>.
                </p>
              </div>
            </div>

            {/* Pagination dots */}
            {allPlayers.length > 1 && (
              <div className="flex-shrink-0 flex justify-center gap-1.5 pb-2">
                {allPlayers.map((pl, i) => (
                  <div key={i} className="rounded-full transition-all duration-500"
                    style={{
                      width: i === spotIdx ? '28px' : '8px',
                      height: '8px',
                      background: i === spotIdx
                        ? (pl.team === 'A' ? m.team_a_color : m.team_b_color)
                        : 'rgba(255,255,255,0.15)',
                    }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-white/20 text-sm uppercase tracking-[0.45em] font-bold">Waiting for players</div>
          </div>
        )}
      </div>

      {/* SVG Mask Definition */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <mask id="circle-reveal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <image
              href="https://assets.codepen.io/721952/liquidMask2.svg"
              x="0"
              y={maskFrame !== null ? `-${maskFrame * 100}%` : '0%'}
              width="100%"
              height="3000%"
              preserveAspectRatio="none"
            />
          </mask>
        </defs>
      </svg>
    </div>
  )
}

// Pulsing ball shown next to the team serving the next rally.
// Clear "to serve" badge — a pulsing ball + SERVE label in the team's colour,
// so it's obvious which side serves the next rally.
// Serve indicator is meaningful while the rally is in play or about to resume —
// show it during active/timeout/paused so the audience always knows who serves.
const serveLive = (status: string) => status === 'active' || status === 'timeout' || status === 'paused'

function ServeBall({ show, size = 'clamp(0.9rem, 1.4vw, 1.6rem)', color = '#fbbf24' }: { show: boolean; size?: string; color?: string }) {
  if (!show) return null
  return (
    <span className="inline-flex flex-shrink-0 align-middle animate-pulse" title="Serving next rally">
      <TakrawBall size={size} color={color} />
    </span>
  )
}

// 2-minute interval between sets while the teams change ends.
function CourtChangeOverlay({ match, nextSet, onDone }: { match: Match; nextSet: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(120)
  useEffect(() => {
    if (remaining <= 0) { onDone(); return }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onDone])
  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#020611]/95 backdrop-blur-sm">
      <p className="text-white/40 text-lg font-black uppercase tracking-[0.4em] mb-4">{match.court_name || 'Court'}</p>
      <p className="text-amber-400 font-black uppercase tracking-[0.3em] mb-6" style={{ fontSize: 'clamp(1.5rem, 4vw, 3rem)' }}>
        Court Change
      </p>
      <div className="font-mono font-black tabular-nums text-white leading-none" style={{ fontSize: 'clamp(5rem, 16vw, 14rem)' }}>
        {mm}:{ss}
      </div>
      <p className="text-white/50 text-xl font-bold uppercase tracking-widest mt-6">Set {Math.min(nextSet, 3)} next</p>
    </div>
  )
}

// Full-screen "SET POINT" / "MATCH POINT" takeover — plays ~3.5s, then the
// small persistent badge in the score header carries it from there.
function SetPointOverlay({ match, team, isMatch, onDone }: { match: Match; team: 'A' | 'B'; isMatch: boolean; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const color = team === 'A' ? match.team_a_color : match.team_b_color
  const teamName = team === 'A' ? match.team_a : match.team_b
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone

  useEffect(() => {
    if (!rootRef.current) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => onDoneRef.current() })
      tl.fromTo(rootRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' })
        .fromTo('.sp-label', { y: 40, opacity: 0, filter: 'blur(8px)' },
          { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' }, '-=0.1')
        .fromTo('.sp-title', { scale: 0.6, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(2)' }, '-=0.25')
        .fromTo('.sp-team', { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, '-=0.3')
        .to('.sp-title', { scale: 1.04, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: 1 })
        .to(rootRef.current, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
      style={{ background: `radial-gradient(ellipse at center, ${color}26 0%, rgba(2,6,17,0.97) 70%)`, backdropFilter: 'blur(6px)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 160px ${color}55`, border: `6px solid ${color}40` }} />
      <p className="sp-label text-white/55 font-black uppercase tracking-[0.4em] mb-4" style={{ fontSize: 'clamp(1rem,2.2vw,1.8rem)' }}>
        {match.court_name || 'Court'}
      </p>
      <h1 className="sp-title font-black uppercase tracking-tight leading-none text-center"
        style={{ color, fontSize: 'clamp(4rem,13vw,13rem)', textShadow: `0 0 80px ${color}80` }}>
        {isMatch ? 'Match Point' : 'Set Point'}
      </h1>
      <p className="sp-team font-black uppercase tracking-widest text-white mt-6" style={{ fontSize: 'clamp(1.6rem,4.5vw,4rem)' }}>
        {teamName}
      </p>
    </div>
  )
}

function SingleMatchDisplay({ lm, players, showPlayerAnim }: { lm: LiveMatch; players: Player[]; showPlayerAnim: boolean }) {
  const { match: m, state: s } = lm
  const scoreARef = useRef<HTMLDivElement>(null)
  const scoreBRef = useRef<HTMLDivElement>(null)
  const prevA = useRef(s.score_a)
  const prevB = useRef(s.score_b)

  useEffect(() => {
    if (s.score_a !== prevA.current && scoreARef.current) {
      const diff = s.score_a - prevA.current
      if (diff > 0) {
        animateScore(scoreARef.current, m.team_a_color)
        spawnFloatingScore(scoreARef.current, `+${diff}`, m.team_a_color, false)
      }
      prevA.current = s.score_a
    }
  }, [s.score_a, m.team_a_color])

  useEffect(() => {
    if (s.score_b !== prevB.current && scoreBRef.current) {
      const diff = s.score_b - prevB.current
      if (diff > 0) {
        animateScore(scoreBRef.current, m.team_b_color)
        spawnFloatingScore(scoreBRef.current, `+${diff}`, m.team_b_color, false)
      }
      prevB.current = s.score_b
    }
  }, [s.score_b, m.team_b_color])

  if (m.status === 'pending') return <PreMatchIntro m={m} players={players} showPlayerAnim={showPlayerAnim} />
  if (m.status === 'completed') return <MatchCompletedCelebration lm={lm} />

  const status = ({ pending: 'NOT STARTED', active: 'LIVE', paused: 'PAUSED', timeout: 'TIMEOUT', completed: 'FINAL', cancelled: 'CANCELLED' } as Record<string,string>)[m.status] ?? m.status.toUpperCase()
  const statusColor = ({ active: '#10b981', timeout: '#f59e0b', completed: '#64748b', pending: '#94a3b8', paused: '#38bdf8', cancelled: '#ef4444' } as Record<string,string>)[m.status] ?? '#64748b'

  const mins = String(Math.floor(s.timer_seconds / 60)).padStart(2, '0')
  const secs = String(s.timer_seconds % 60).padStart(2, '0')

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Full-bleed left/right color halves */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-y-0 left-0 w-1/2"
          style={{ background: `radial-gradient(ellipse at 15% 55%, ${m.team_a_color}28 0%, transparent 65%)` }} />
        <div className="absolute inset-y-0 right-0 w-1/2"
          style={{ background: `radial-gradient(ellipse at 85% 55%, ${m.team_b_color}28 0%, transparent 65%)` }} />
        {/* Bottom colour bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px]"
          style={{ background: `linear-gradient(to right, ${m.team_a_color}, ${m.team_b_color})` }} />
      </div>

      {/* ── Top bar: tournament  ·  STATUS  ·  court ── */}
      <div className="flex-shrink-0 flex items-start justify-between px-14 pt-9 pb-0 relative z-10">
        <div className="min-w-[160px]">
          {m.tournament_name && (
            <p className="text-white/25 text-base uppercase tracking-[0.3em] font-bold leading-none">{m.tournament_name}</p>
          )}
        </div>

        {/* Centre: status badge + set/match point */}
        <div className="flex flex-col items-center gap-2 mt-0.5">
          <span
            className="text-sm font-black uppercase tracking-widest px-6 py-2 rounded-full border-2 whitespace-nowrap"
            style={{ color: statusColor, borderColor: `${statusColor}55`, backgroundColor: `${statusColor}12` }}
          >
            {status}
          </span>
          {(s.match_point || s.set_point) && m.status === 'active' && (
            <span className="text-sm font-black uppercase tracking-widest px-5 py-1.5 rounded-full border-2 border-amber-400/60 bg-amber-400/15 text-amber-300 whitespace-nowrap animate-pulse">
              {s.match_point
                ? `Match Point · ${s.match_point === 'A' ? m.team_a : m.team_b}`
                : `Set Point · ${s.set_point === 'A' ? m.team_a : m.team_b}`}
            </span>
          )}
          {s.deuce && !s.match_point && !s.set_point && m.status === 'active' && (
            <span className="text-sm font-black uppercase tracking-widest px-5 py-1.5 rounded-full border-2 border-amber-400/60 bg-amber-400/15 text-amber-300 whitespace-nowrap animate-pulse">
              All Point
            </span>
          )}
        </div>

        <div className="min-w-[160px] text-right">
          {m.court_name && (
            <p className="text-white/55 text-xl uppercase tracking-wider font-black leading-none">{m.court_name}</p>
          )}
        </div>
      </div>

      {/* ── Main score area — two halves side by side ── */}
      <div className="flex-1 flex items-center relative z-10 min-h-0">

        {/* Team A — score centred in left half */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          {m.team_a_logo && (
            <img src={m.team_a_logo} alt="" className="h-20 w-20 object-contain rounded-2xl"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <p
            className="font-black uppercase tracking-wider leading-none text-center flex items-center justify-center gap-3"
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 5rem)',
              color: m.team_a_color,
              textShadow: `0 0 50px ${m.team_a_color}45`,
            }}
          >
            <ServeBall show={s.serving === 'A' && serveLive(m.status)} color={m.team_a_color} size="clamp(1.4rem, 2.2vw, 2.6rem)" /> {m.team_a}
          </p>
          <div
            ref={scoreARef}
            className="font-black tabular-nums leading-[0.85] select-none"
            style={{
              fontSize: 'clamp(9rem, 22vw, 20rem)',
              color: m.team_a_color,
              filter: `drop-shadow(0 0 70px ${m.team_a_color}80)`,
            }}
          >
            {s.score_a}
          </div>
        </div>

        {/* Thin centre divider */}
        <div className="self-[60%] h-2/3 w-px rounded-full flex-shrink-0"
          style={{ background: `linear-gradient(to bottom, transparent, white/10, transparent)`,
                   opacity: 0.12 }} />

        {/* Team B — score centred in right half */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          {m.team_b_logo && (
            <img src={m.team_b_logo} alt="" className="h-20 w-20 object-contain rounded-2xl"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <p
            className="font-black uppercase tracking-wider leading-none text-center flex items-center justify-center gap-3"
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 5rem)',
              color: m.team_b_color,
              textShadow: `0 0 50px ${m.team_b_color}45`,
            }}
          >
            {m.team_b} <ServeBall show={s.serving === 'B' && serveLive(m.status)} color={m.team_b_color} size="clamp(1.4rem, 2.2vw, 2.6rem)" />
          </p>
          <div
            ref={scoreBRef}
            className="font-black tabular-nums leading-[0.85] select-none"
            style={{
              fontSize: 'clamp(9rem, 22vw, 20rem)',
              color: m.team_b_color,
              filter: `drop-shadow(0 0 70px ${m.team_b_color}80)`,
            }}
          >
            {s.score_b}
          </div>
        </div>
      </div>

      {/* ── Sets + timer ── */}
      <div className="flex-shrink-0 flex flex-col items-center pb-10 pt-3 relative z-10 gap-2">
        <div className="font-black uppercase tracking-[0.25em] text-white/45"
          style={{ fontSize: 'clamp(0.9rem, 1.6vw, 1.5rem)' }}>
          Set {Math.min(s.set_number || 1, 3)}
          <span className="text-white/70 ml-3 tabular-nums">{s.sets_a ?? 0}<span className="text-white/30 mx-1">–</span>{s.sets_b ?? 0}</span>
        </div>
        <div className="flex items-center justify-center gap-4">
          <span
            className={clsx(
              'font-mono font-black tabular-nums leading-none transition-colors',
              s.timer_running ? 'text-emerald-400' : 'text-white/18',
            )}
            style={{ fontSize: 'clamp(2.8rem, 6vw, 6.5rem)' }}
          >
            {mins}:{secs}
          </span>
          {s.timer_running && (
            <span className="h-3.5 w-3.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  )
}

// Alternate "cards" scorecard style (admin-selectable): sponsor ticker on top,
// two rounded glass score cards over the background, timer + set underneath.
function CardsMatchDisplay({ lm, players, showPlayerAnim }: { lm: LiveMatch; players: Player[]; showPlayerAnim: boolean }) {
  const { match: m, state: s } = lm
  const scoreARef = useRef<HTMLDivElement>(null)
  const scoreBRef = useRef<HTMLDivElement>(null)
  const prevA = useRef(s.score_a)
  const prevB = useRef(s.score_b)

  useEffect(() => {
    if (s.score_a !== prevA.current && scoreARef.current) {
      if (s.score_a - prevA.current > 0) animateScore(scoreARef.current, m.team_a_color)
      prevA.current = s.score_a
    }
  }, [s.score_a, m.team_a_color])
  useEffect(() => {
    if (s.score_b !== prevB.current && scoreBRef.current) {
      if (s.score_b - prevB.current > 0) animateScore(scoreBRef.current, m.team_b_color)
      prevB.current = s.score_b
    }
  }, [s.score_b, m.team_b_color])

  if (m.status === 'pending') return <PreMatchIntro m={m} players={players} showPlayerAnim={showPlayerAnim} />
  if (m.status === 'completed') return <MatchCompletedCelebration lm={lm} />

  const mins = String(Math.floor(s.timer_seconds / 60)).padStart(2, '0')
  const secs = String(s.timer_seconds % 60).padStart(2, '0')
  const ticker = (m.tournament_name || 'LIVE MATCH').toUpperCase()

  const Card = ({ team, color, logo, score, subtitle, scoreRef, serving }: {
    team: string; color: string; logo: string; score: number; subtitle?: string
    scoreRef: React.RefObject<HTMLDivElement | null>; serving: boolean
  }) => (
    <div className="flex-1 max-w-[42%] rounded-[2rem] bg-black/45 backdrop-blur-md flex flex-col items-center justify-center px-6 py-10">
      {logo && <img src={logo} alt="" className="h-16 w-16 object-contain rounded-xl mb-2"
        onError={(e) => (e.currentTarget.style.display = 'none')} />}
      <div ref={scoreRef} className="font-black tabular-nums text-white leading-[0.8] select-none"
        style={{ fontSize: 'clamp(6rem, 16vw, 15rem)' }}>
        {String(score).padStart(2, '0')}
      </div>
      <p className="font-black uppercase tracking-wide text-white flex items-center gap-3 mt-2"
        style={{ fontSize: 'clamp(1.6rem, 3.4vw, 3.2rem)' }}>
        <ServeBall show={serving} color={color} /> {team}
      </p>
      {subtitle && (
        <p className="italic text-white/60 uppercase tracking-wide mt-1"
          style={{ fontSize: 'clamp(0.8rem, 1.3vw, 1.3rem)' }}>{subtitle}</p>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Sponsor ticker */}
      <div className="flex-shrink-0 bg-black/70 overflow-hidden py-2.5 relative z-10">
        <div className="marquee-track">
          {[0, 1].map((k) => (
            <span key={k} className="text-2xl font-bold tracking-wide px-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i}>
                  <span className="text-amber-500">{ticker}</span>
                  <span className="text-white mx-4">·</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Court + status row */}
      <div className="flex-shrink-0 flex items-center justify-between px-10 pt-6 relative z-10">
        <span className="text-white/40 text-base uppercase tracking-[0.3em] font-bold">
          {m.status === 'active' ? 'LIVE' : m.status.toUpperCase()}
        </span>
        {m.court_name && (
          <span className="text-white/70 text-lg uppercase tracking-wider font-black">{m.court_name}</span>
        )}
      </div>

      {/* Two score cards */}
      <div className="flex-1 flex items-center justify-center gap-6 md:gap-10 px-8 relative z-10 min-h-0">
        <Card team={m.team_a} color={m.team_a_color} logo={m.team_a_logo} score={s.score_a}
          subtitle={m.tournament_name} scoreRef={scoreARef} serving={s.serving === 'A' && serveLive(m.status)} />
        <Card team={m.team_b} color={m.team_b_color} logo={m.team_b_logo} score={s.score_b}
          subtitle={m.tournament_name} scoreRef={scoreBRef} serving={s.serving === 'B' && serveLive(m.status)} />
      </div>

      {/* Timer + set */}
      <div className="flex-shrink-0 flex flex-col items-center pb-10 pt-2 relative z-10">
        <span className={clsx('font-mono font-black tabular-nums leading-none',
          s.timer_running ? 'text-emerald-400' : 'text-white/30')}
          style={{ fontSize: 'clamp(2.5rem, 5.5vw, 6rem)' }}>
          {mins}:{secs}
        </span>
        <span className="text-white/60 font-bold uppercase tracking-[0.3em] mt-2 text-xl">
          Set:{String(Math.min(s.set_number || 1, 3)).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

// In-card moment overlay (multi-match): covers ONE court's card, not the screen.
function CellFxOverlay({ fx, m }: { fx: CellFx; m: Match }) {
  const ref = useRef<HTMLDivElement>(null)
  // 2-minute court-change countdown.
  const [cc, setCc] = useState(120)
  useEffect(() => {
    if (fx.kind !== 'courtchange') return
    setCc(120)
    const id = setInterval(() => setCc((x) => Math.max(0, x - 1)), 1000)
    return () => clearInterval(id)
  }, [fx.kind])
  useEffect(() => {
    if (!ref.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power2.out' })
      gsap.fromTo('.fx-pop', { scale: 0.7, y: 14, opacity: 0 },
        { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.08 })
    }, ref)
    return () => ctx.revert()
  }, [])

  const team = (t: 'A' | 'B') => (t === 'A' ? m.team_a : m.team_b)
  const teamColor = (t: 'A' | 'B') => (t === 'A' ? m.team_a_color : m.team_b_color)

  let accent = '#6366f1', heading = ''
  let sub: ReactNode = null
  if (fx.kind === 'setpoint') {
    accent = teamColor(fx.team)
    heading = fx.isMatch ? 'Match Point' : 'Set Point'
    sub = <span className="fx-pop font-black uppercase tracking-widest text-white" style={{ fontSize: 'clamp(1rem,2.4vw,2rem)' }}>{team(fx.team)}</span>
  } else if (fx.kind === 'courtchange') {
    accent = '#f59e0b'
    heading = 'Court Change'
    sub = (
      <div className="fx-pop flex flex-col items-center gap-1">
        <span className="font-black font-mono tabular-nums text-white leading-none" style={{ fontSize: 'clamp(2.5rem,7vw,5rem)' }}>
          {Math.floor(cc / 60)}:{String(cc % 60).padStart(2, '0')}
        </span>
        <span className="font-bold uppercase tracking-[0.3em] text-white/50 text-xs mt-1">Set {fx.nextSet} next</span>
      </div>
    )
  } else {
    accent = '#a855f7'
    heading = 'Substitution'
    sub = (
      <div className="fx-pop flex flex-col items-center gap-1 text-center">
        <span className="text-emerald-400 font-bold uppercase text-sm tracking-wide">IN · {fx.payload.player_in} #{fx.payload.number}</span>
        <span className="text-rose-400 font-bold uppercase text-sm tracking-wide">OUT · {fx.payload.player_out}</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-3xl"
      style={{ background: `radial-gradient(ellipse at center, ${accent}26 0%, rgba(6,14,26,0.94) 70%)`, backdropFilter: 'blur(2px)' }}>
      <h3 className="fx-pop font-black uppercase tracking-tight leading-none text-center"
        style={{ color: accent, fontSize: 'clamp(1.8rem,5vw,4rem)', textShadow: `0 0 40px ${accent}66` }}>{heading}</h3>
      <div className="mt-3">{sub}</div>
    </div>
  )
}

function CompactScore({ lm, index = 0, dense = false, players = [], showPlayerAnim = false, fx }: { lm: LiveMatch; index?: number; dense?: boolean; players?: Player[]; showPlayerAnim?: boolean; fx?: CellFx }) {
  const { match: m, state: s } = lm
  const cardRef  = useRef<HTMLDivElement>(null)
  const scoreARef = useRef<HTMLDivElement>(null)
  const scoreBRef = useRef<HTMLDivElement>(null)
  const prevA = useRef(s.score_a)
  const prevB = useRef(s.score_b)

  // Staggered card entrance so viewers' eyes land on each match in turn.
  useEffect(() => {
    if (!cardRef.current) return
    gsap.fromTo(cardRef.current,
      { opacity: 0, y: 26, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', delay: index * 0.12 },
    )
  }, [index])

  // Per-card timeout countdown (shown in the TIME OUT banner).
  const [toLeft, setToLeft] = useState(0)
  useEffect(() => {
    if (m.status !== 'timeout') { setToLeft(0); return }
    setToLeft(s.current_timeout?.duration ?? 60)
    const id = setInterval(() => setToLeft((x) => Math.max(0, x - 1)), 1000)
    return () => clearInterval(id)
  }, [m.status, s.current_timeout?.duration])

  useEffect(() => {
    if (s.score_a !== prevA.current && scoreARef.current) {
      const diff = s.score_a - prevA.current
      if (diff > 0) {
        animateScore(scoreARef.current, m.team_a_color)
        spawnFloatingScore(scoreARef.current, `+${diff}`, m.team_a_color, true)
      }
      prevA.current = s.score_a
    }
  }, [s.score_a, m.team_a_color])

  useEffect(() => {
    if (s.score_b !== prevB.current && scoreBRef.current) {
      const diff = s.score_b - prevB.current
      if (diff > 0) {
        animateScore(scoreBRef.current, m.team_b_color)
        spawnFloatingScore(scoreBRef.current, `+${diff}`, m.team_b_color, true)
      }
      prevB.current = s.score_b
    }
  }, [s.score_b, m.team_b_color])

  const status = ({ active: 'LIVE', timeout: 'TIMEOUT', completed: 'FINAL', pending: 'PENDING', paused: 'PAUSED', cancelled: 'CANCELLED' } as Record<string,string>)[m.status] ?? m.status
  const statusColor = ({ active: '#10b981', timeout: '#f59e0b', completed: '#64748b', pending: '#64748b', paused: '#38bdf8', cancelled: '#ef4444' } as Record<string,string>)[m.status] ?? '#64748b'
  const isCompleted = m.status === 'completed'
  const winnerKey = s.winner || (s.sets_a > s.sets_b ? 'A' : s.sets_b > s.sets_a ? 'B' : 'draw')
  const scoreSize = dense ? 'clamp(5rem, 13vw, 11rem)' : 'clamp(9rem, 21vw, 19rem)'
  // During play show current-set points; once finished show sets won as the result.
  const dispA = isCompleted ? (s.sets_a ?? 0) : s.score_a
  const dispB = isCompleted ? (s.sets_b ?? 0) : s.score_b

  // Match hasn't started yet → show the teams + line-ups ("who's playing"),
  // not a meaningless 0–0 scoreline.
  if (m.status === 'pending') {
    return <CompactPreMatch lm={lm} index={index} dense={dense} players={players} showPlayerAnim={showPlayerAnim} />
  }

  return (
    <div ref={cardRef} className={clsx(
        'relative flex flex-col rounded-3xl border bg-dark-900/60 overflow-hidden h-full',
        m.status === 'timeout' ? 'border-amber-500/70' : 'border-dark-700',
      )}
      style={m.status === 'timeout' ? { boxShadow: '0 0 0 2px rgba(245,158,11,0.35), 0 0 40px rgba(245,158,11,0.15)' } : undefined}>
      {/* In-card moment (sub / set point / court change) — scoped to THIS court */}
      {fx && <CellFxOverlay fx={fx} m={m} />}
      {/* Timeout — prominent in-card takeover so it's clearly visible courtside */}
      {m.status === 'timeout' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(245,158,11,0.18) 0%, rgba(6,14,26,0.92) 70%)', backdropFilter: 'blur(2px)' }}>
          <p className="flex items-center gap-3 font-black uppercase tracking-[0.35em] text-amber-400 leading-none"
            style={{ fontSize: 'clamp(2rem,6vw,4.5rem)', textShadow: '0 0 40px rgba(245,158,11,0.5)' }}>
            <span className="rounded-full bg-amber-400 animate-pulse" style={{ width: '0.4em', height: '0.4em' }} /> Timeout
          </p>
          {s.current_timeout && (
            <p className="mt-2 font-bold uppercase tracking-widest text-white/80" style={{ fontSize: 'clamp(1rem,2.5vw,1.8rem)' }}>
              {s.current_timeout.team === 'A' ? m.team_a : m.team_b}
            </p>
          )}
          <p className="mt-3 font-black font-mono tabular-nums text-amber-300 leading-none" style={{ fontSize: 'clamp(2.5rem,8vw,6rem)' }}>
            {String(Math.floor(toLeft / 60)).padStart(2, '0')}:{String(toLeft % 60).padStart(2, '0')}
          </p>
        </div>
      )}
      {/* Team-colour identity bar so each match is instantly distinguishable */}
      <div className="h-1.5 w-full flex-shrink-0"
        style={{ background: `linear-gradient(to right, ${m.team_a_color}, ${m.team_b_color})` }} />

      {/* Header — court · matchup · status, so people know exactly what they watch */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <div className="min-w-0">
          <p className="text-white/90 font-black uppercase tracking-wide truncate"
             style={{ fontSize: dense ? '0.95rem' : '1.25rem' }}>
            {m.court_name || 'Court'}
          </p>
          <p className="text-dark-500 text-xs font-mono">#{m.match_code}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex-shrink-0"
          style={{ color: statusColor, backgroundColor: `${statusColor}1a`, border: `1px solid ${statusColor}44` }}>
          {m.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
          {status}
        </span>
      </div>

      {/* Score row */}
      <div className="flex-1 flex items-center justify-center gap-3 px-5 min-h-0">
        {/* Team A */}
        <div className={clsx('flex-1 flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors',
          isCompleted && winnerKey === 'A' && 'bg-white/[0.04]')}>
          {m.team_a_logo && (
            <img src={m.team_a_logo} alt="" className="h-10 w-10 object-contain rounded-lg"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <p className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5 text-center leading-tight"
             style={{ color: m.team_a_color }}>
            {isCompleted && winnerKey === 'A' && <span title="Winner">🏆</span>}
            <ServeBall show={s.serving === 'A' && serveLive(m.status)} size="0.9rem" color={m.team_a_color} />
            {m.team_a}
          </p>
          <div ref={scoreARef} className="font-black font-score tabular-nums leading-none"
            style={{ color: m.team_a_color, fontSize: scoreSize, filter: `drop-shadow(0 0 45px ${m.team_a_color}) brightness(1.25)` }}>
            {dispA}
          </div>
        </div>

        <div className="text-dark-600 text-2xl font-black flex-shrink-0">vs</div>

        {/* Team B */}
        <div className={clsx('flex-1 flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors',
          isCompleted && winnerKey === 'B' && 'bg-white/[0.04]')}>
          {m.team_b_logo && (
            <img src={m.team_b_logo} alt="" className="h-10 w-10 object-contain rounded-lg"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <p className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5 text-center leading-tight"
             style={{ color: m.team_b_color }}>
            {m.team_b}
            <ServeBall show={s.serving === 'B' && serveLive(m.status)} size="0.9rem" color={m.team_b_color} />
            {isCompleted && winnerKey === 'B' && <span title="Winner">🏆</span>}
          </p>
          <div ref={scoreBRef} className="font-black font-score tabular-nums leading-none"
            style={{ color: m.team_b_color, fontSize: scoreSize, filter: `drop-shadow(0 0 45px ${m.team_b_color}) brightness(1.25)` }}>
            {dispB}
          </div>
        </div>
      </div>

      {/* Sets + timer */}
      <div className="flex items-center justify-center gap-3 pb-4 pt-1">
        {!isCompleted && (
          <div className="font-black uppercase tracking-widest text-white/45 text-xs">
            Set {Math.min(s.set_number || 1, 3)}
            <span className="text-white/70 ml-1.5 tabular-nums">{s.sets_a ?? 0}–{s.sets_b ?? 0}</span>
          </div>
        )}
        <div className={clsx(
          'flex items-center gap-2 font-mono font-bold tabular-nums px-4 py-1.5 rounded-xl',
          dense ? 'text-lg' : 'text-2xl',
          s.timer_running ? 'text-emerald-400 bg-emerald-500/10' : 'text-white/30 bg-white/[0.03]',
        )}>
          {s.timer_running && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
          {String(Math.floor(s.timer_seconds / 60)).padStart(2,'0')}:{String(s.timer_seconds % 60).padStart(2,'0')}
        </div>
      </div>
    </div>
  )
}

// Pre-match spotlight shown inside a grid cell while a match is still PENDING —
// a compact cousin of the full-screen PreMatchIntro. It cycles each player one
// at a time (photo, name, role, jersey) like a broadcast line-up reveal, rather
// than a flat list of names.
function CompactPreMatch({ lm, index = 0, dense = false, players = [], showPlayerAnim = false }: { lm: LiveMatch; index?: number; dense?: boolean; players?: Player[]; showPlayerAnim?: boolean }) {
  const { match: m } = lm
  const cardRef  = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLDivElement>(null)
  const infoRef  = useRef<HTMLDivElement>(null)

  // Interleave A/B so both teams share the spotlight as it cycles.
  const order = useMemo(() => {
    const a = players.filter((p) => p.team === 'A')
    const b = players.filter((p) => p.team === 'B')
    const out: Player[] = []
    for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]) }
    return out
  }, [players])

  const [idx, setIdx] = useState(0)
  useEffect(() => { setIdx(0) }, [order.length])

  // Card entrance + breathing "starting soon" pill.
  useEffect(() => {
    if (!cardRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(cardRef.current, { opacity: 0, y: 26, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', delay: index * 0.12 })
      gsap.to('.cpm-soon', { opacity: 0.5, duration: 1.1, repeat: -1, yoyo: true, ease: 'sine.inOut' })
    }, cardRef)
    return () => ctx.revert()
  }, [index])

  // Advance the spotlight (only when the player animation is enabled).
  useEffect(() => {
    if (!showPlayerAnim || order.length <= 1) return
    const id = setInterval(() => setIdx((i) => (i + 1) % order.length), 3600)
    return () => clearInterval(id)
  }, [order.length, showPlayerAnim])

  // Animate each reveal (photo + text), transform/opacity only.
  useEffect(() => {
    if (!showPlayerAnim || !order.length) return
    const ctx = gsap.context(() => {
      gsap.fromTo(photoRef.current, { opacity: 0, scale: 1.08, xPercent: -5 },
        { opacity: 1, scale: 1, xPercent: 0, duration: 0.6, ease: 'power3.out' })
      gsap.fromTo('.cpm-line', { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.07 })
    }, cardRef)
    return () => ctx.revert()
  }, [idx, order.length, showPlayerAnim])

  const p = order[idx]
  const isA = p?.team === 'A'
  const color = isA ? m.team_a_color : m.team_b_color
  const teamName = isA ? m.team_a : m.team_b
  const teamLogo = isA ? m.team_a_logo : m.team_b_logo
  const role = p?.status === 'sub' ? 'Substitute' : 'Starting'
  const nameSize = dense ? 'clamp(1.4rem, 3.4vw, 2.4rem)' : 'clamp(2rem, 4vw, 3.4rem)'

  return (
    <div ref={cardRef} className="relative flex flex-col rounded-3xl border border-dark-700 bg-dark-900/60 overflow-hidden h-full">
      <div className="h-1.5 w-full flex-shrink-0"
        style={{ background: `linear-gradient(to right, ${m.team_a_color}, ${m.team_b_color})` }} />

      {/* Header — court · starting soon */}
      <div className="flex items-center justify-between gap-2 px-5 pt-4 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-white/90 font-black uppercase tracking-wide truncate"
             style={{ fontSize: dense ? '0.95rem' : '1.2rem' }}>{m.court_name || 'Court'}</p>
          <p className="text-dark-500 text-xs font-mono">#{m.match_code}</p>
        </div>
        <span className="cpm-soon flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex-shrink-0 text-amber-400"
          style={{ backgroundColor: '#f59e0b1a', border: '1px solid #f59e0b44' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Starting soon
        </span>
      </div>

      {/* Matchup band — big VS */}
      <div className="flex items-center justify-center gap-3 sm:gap-5 px-5 pt-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 justify-end flex-1">
          {m.team_a_logo && <img src={m.team_a_logo} alt="" className="h-8 w-8 object-contain rounded flex-shrink-0"
            onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <span className="font-black uppercase tracking-wide truncate" style={{ color: m.team_a_color, fontSize: dense ? '0.95rem' : '1.2rem' }}>{m.team_a}</span>
        </div>
        <span className="font-black text-white/25 leading-none select-none flex-shrink-0"
          style={{ fontSize: dense ? '1.8rem' : '2.8rem', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>VS</span>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-black uppercase tracking-wide truncate" style={{ color: m.team_b_color, fontSize: dense ? '0.95rem' : '1.2rem' }}>{m.team_b}</span>
          {m.team_b_logo && <img src={m.team_b_logo} alt="" className="h-8 w-8 object-contain rounded flex-shrink-0"
            onError={(e) => (e.currentTarget.style.display = 'none')} />}
        </div>
      </div>

      {/* Player spotlight (cycles) — only when the toggle is on */}
      {showPlayerAnim && p ? (
        <div className="flex-1 flex items-center gap-4 sm:gap-6 px-6 py-4 min-h-0 relative">
          {/* team-colour ambient wash */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 30% 60%, ${color}22 0%, transparent 60%)` }} />
          {/* watermark team name */}
          <div className="absolute right-3 bottom-1 font-black uppercase leading-none select-none pointer-events-none"
            style={{ color: `${color}14`, fontSize: dense ? '3.5rem' : '6rem' }}>{teamName.slice(0, 3)}</div>

          {/* photo — ONLY when the player actually has one */}
          {p.photo_url && (
            <div ref={photoRef} className="relative h-full aspect-[4/5] flex-shrink-0 rounded-2xl overflow-hidden z-10"
              style={{ maxHeight: dense ? '11rem' : '18rem', border: `2px solid ${color}66`, boxShadow: `0 0 32px ${color}33` }}>
              <img key={p.id} src={p.photo_url} alt={p.name} className="h-full w-full object-cover"
                onError={(e) => { const b = e.currentTarget.parentElement; if (b) b.style.display = 'none' }} />
            </div>
          )}

          {/* info — jersey + name + role + team (always) */}
          <div ref={infoRef} className="flex-1 min-w-0 z-10">
            <p className="cpm-line text-xs font-black uppercase tracking-[0.3em] mb-2" style={{ color }}>{role}</p>
            <div className="cpm-line flex items-center gap-3 mb-1">
              <span className="flex items-center justify-center font-black tabular-nums rounded-xl flex-shrink-0"
                style={{ background: color, color: '#fff', height: dense ? '2.2rem' : '3rem', minWidth: dense ? '2.2rem' : '3rem', padding: '0 0.5rem', fontSize: dense ? '1.1rem' : '1.6rem' }}>
                {p.jersey_number || '–'}
              </span>
              <p className="font-black uppercase tracking-tight leading-none text-white truncate"
                 style={{ fontSize: nameSize }}>{p.name}</p>
            </div>
            <div className="cpm-line h-0.5 w-12 rounded-full my-3" style={{ background: color }} />
            <div className="cpm-line flex items-center gap-2">
              {teamLogo && <img src={teamLogo} alt="" className="h-6 w-6 object-contain rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />}
              <span className="text-sm font-bold uppercase tracking-wide" style={{ color }}>{teamName}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-dark-600 text-sm uppercase tracking-[0.3em] font-bold">
          {showPlayerAnim ? 'Line-up to be announced' : 'Match starting soon'}
        </div>
      )}

      {/* dots */}
      {showPlayerAnim && order.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-4 flex-shrink-0">
          {order.map((_, i) => (
            <span key={i} className="h-1.5 rounded-full transition-all"
              style={{ width: i === idx ? '1.1rem' : '0.375rem', background: i === idx ? color : '#ffffff25' }} />
          ))}
        </div>
      )}
    </div>
  )
}

// Grid template for N matches — N drives the layout so the display "stretches"
// to fill whenever a match is added or finishes. Tuned for a 16:9 screen.
function gridTemplate(n: number): { cols: string; rows: string } {
  switch (n) {
    case 1:  return { cols: '1fr', rows: '1fr' }
    case 2:  return { cols: '1fr 1fr', rows: '1fr' }
    case 3:  return { cols: '1fr 1fr 1fr', rows: '1fr' }
    case 4:  return { cols: '1fr 1fr', rows: '1fr 1fr' }
    case 5:
    case 6:  return { cols: '1fr 1fr 1fr', rows: '1fr 1fr' }
    default: return { cols: '1fr 1fr 1fr 1fr', rows: 'repeat(2, 1fr)' }
  }
}

// Auto-sizing match grid. When the set of matches changes, surviving cards
// smoothly resize/reposition (GSAP Flip) while entering cards fade+scale in —
// so 4→3, 2→3, 1→4, etc. all reflow like a broadcast director cut.
function MatchGrid({ matches, players, showPlayerAnim, fx, cardStyle = 'classic' }: { matches: LiveMatch[]; players: Record<string, Player[]>; showPlayerAnim: boolean; fx: Record<string, CellFx>; cardStyle?: 'classic' | 'cards' }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const prevState = useRef<Flip.FlipState | null>(null)
  const n = matches.length
  const dense = n >= 3
  const idsKey = matches.map((m) => m.match.id).join(',')
  const { cols, rows } = gridTemplate(n)

  useLayoutEffect(() => {
    if (!gridRef.current) return
    const cards = gridRef.current.querySelectorAll<HTMLElement>('.match-card')
    if (prevState.current) {
      Flip.from(prevState.current, {
        duration: 0.7,
        ease: 'power3.inOut',
        absolute: true,
        scale: true,
        onEnter: (els) =>
          gsap.fromTo(els, { opacity: 0, scale: 0.82 },
            { opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.5)', delay: 0.15 }),
        onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.82, duration: 0.35 }),
      })
    }
    prevState.current = Flip.getState(cards)
  }, [idsKey])

  return (
    <div ref={gridRef} className="flex-1 grid gap-4 p-4 min-h-0"
      style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
      {matches.map((lm, i) => (
        <div key={lm.match.id} data-flip-id={lm.match.id} className="match-card min-h-0 min-w-0 flex flex-col">
          {n === 1
            ? (cardStyle === 'cards'
                ? <CardsMatchDisplay lm={lm} players={players[lm.match.id] ?? []} showPlayerAnim={showPlayerAnim} />
                : <SingleMatchDisplay lm={lm} players={players[lm.match.id] ?? []} showPlayerAnim={showPlayerAnim} />)
            : <CompactScore lm={lm} index={i} dense={dense} players={players[lm.match.id] ?? []} showPlayerAnim={showPlayerAnim} fx={fx[lm.match.id]} />}
        </div>
      ))}
    </div>
  )
}

// ── Shared GSAP score animation ───────────────────────────────────────────────
// Transform/opacity-only (GPU-composited, no per-frame filter recompute) so it
// stays buttery on a TV/projector. Three layers: a digit punch with anticipation
// + elastic settle, a soft radial glow flash, and an expanding shockwave ring.
function animateScore(el: HTMLElement, color: string) {
  gsap.killTweensOf(el)

  // Layer 1 — the digit: tiny anticipation, overshoot pop, springy settle.
  gsap.timeline()
    .to(el, { scale: 0.82, duration: 0.07, ease: 'power3.in' })
    .to(el, { scale: 1.5, duration: 0.16, ease: 'back.out(4)' })
    .to(el, { scale: 1, duration: 0.85, ease: 'elastic.out(1, 0.42)' })

  const host = el.parentElement
  if (!host) return
  const prevPos = getComputedStyle(host).position
  if (prevPos === 'static') host.style.position = 'relative'

  // Layer 2 — radial glow flash behind the number.
  const glow = document.createElement('div')
  glow.className = 'absolute rounded-full pointer-events-none z-30'
  glow.style.left = '50%'
  glow.style.top = '50%'
  glow.style.width = '60%'
  glow.style.aspectRatio = '1'
  glow.style.background = `radial-gradient(circle, ${color}aa 0%, ${color}33 35%, transparent 70%)`
  glow.style.mixBlendMode = 'screen'
  host.appendChild(glow)
  gsap.set(glow, { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0 })
  gsap.timeline({ onComplete: () => glow.remove() })
    .to(glow, { scale: 1.1, opacity: 1, duration: 0.14, ease: 'power2.out' })
    .to(glow, { scale: 1.9, opacity: 0, duration: 0.85, ease: 'power2.in' })

  // Layer 3 — shockwave ring snapping outward.
  const ring = document.createElement('div')
  ring.className = 'absolute rounded-full pointer-events-none z-30'
  ring.style.left = '50%'
  ring.style.top = '50%'
  ring.style.width = '42%'
  ring.style.aspectRatio = '1'
  ring.style.border = `3px solid ${color}`
  ring.style.boxShadow = `0 0 24px ${color}`
  host.appendChild(ring)
  gsap.set(ring, { xPercent: -50, yPercent: -50, scale: 0.4, opacity: 0.9 })
  gsap.to(ring, {
    scale: 2.6, opacity: 0, duration: 0.7, ease: 'expo.out',
    onComplete: () => ring.remove(),
  })
}

// ── Immersive Floating Score Points Animation ────────────────────────────────
function spawnFloatingScore(parentEl: HTMLElement, text: string, color: string, isCompact = false) {
  const container = parentEl.parentElement
  if (!container) return

  // Create floating "+N" indicator — a glowing pill that reads clearly on screen
  const floatEl = document.createElement('div')
  floatEl.innerText = text
  floatEl.className = 'absolute font-black pointer-events-none select-none z-50 leading-none'
  floatEl.style.color = '#ffffff'
  floatEl.style.fontSize = isCompact ? '1.5rem' : 'clamp(2.2rem, 5vw, 4.5rem)'
  floatEl.style.padding = isCompact ? '0.15em 0.5em' : '0.12em 0.45em'
  floatEl.style.borderRadius = '9999px'
  floatEl.style.background = `linear-gradient(135deg, ${color}, ${color}cc)`
  floatEl.style.boxShadow = `0 0 22px ${color}, 0 8px 24px ${color}66`
  floatEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.35)'

  container.style.position = 'relative'
  container.appendChild(floatEl)

  gsap.set(floatEl, {
    xPercent: -50,
    yPercent: -50,
    left: '50%',
    top: '50%',
    scale: 0.3,
    opacity: 0,
    rotation: -8,
  })

  gsap.timeline()
    .to(floatEl, {
      scale: 1,
      opacity: 1,
      rotation: 0,
      y: isCompact ? -18 : -55,
      duration: 0.32,
      ease: 'back.out(2.2)',
    })
    .to(floatEl, {
      y: isCompact ? -52 : -150,
      opacity: 0,
      scale: 1.05,
      duration: 0.85,
      ease: 'power2.in',
      onComplete: () => floatEl.remove(),
    }, '+=0.12')

  // Spawn glowing particle burst
  const numParticles = isCompact ? 6 : 12
  const maxDist = isCompact ? 60 : 180

  for (let i = 0; i < numParticles; i++) {
    const p = document.createElement('div')
    p.className = 'absolute rounded-full pointer-events-none z-40'
    p.style.width = isCompact ? `${Math.random() * 6 + 4}px` : `${Math.random() * 12 + 6}px`
    p.style.height = p.style.width
    p.style.backgroundColor = color
    p.style.boxShadow = `0 0 10px ${color}, 0 0 20px ${color}`
    container.appendChild(p)

    gsap.set(p, {
      xPercent: -50,
      yPercent: -50,
      left: '50%',
      top: '50%',
    })

    const angle = (i / numParticles) * Math.PI * 2 + (Math.random() * 0.4 - 0.2)
    const distance = Math.random() * (maxDist / 2) + (maxDist / 2)
    const destX = Math.cos(angle) * distance
    const destY = Math.sin(angle) * distance

    gsap.timeline()
      .to(p, {
        x: destX,
        y: destY,
        scale: 1.5,
        duration: 0.3,
        ease: 'power1.out',
      })
      .to(p, {
        scale: 0,
        opacity: 0,
        x: destX * 1.2,
        y: destY * 1.2,
        duration: 0.5,
        ease: 'power1.in',
        onComplete: () => p.remove(),
      })
  }
}

// ── Match Ended Celebration View ─────────────────────────────────────────────
function MatchCompletedCelebration({ lm }: { lm: LiveMatch }) {
  const { match: m, state: s } = lm
  const containerRef = useRef<HTMLDivElement>(null)

  // Determine winner details
  let winnerName = ''
  let winnerColor = '#e2e8f0'
  let winnerLogo = ''
  let isDraw = false

  const winnerKey = s.winner || (s.score_a > s.score_b ? 'A' : s.score_b > s.score_a ? 'B' : 'draw')

  if (winnerKey === 'A') {
    winnerName = m.team_a
    winnerColor = m.team_a_color
    winnerLogo = m.team_a_logo
  } else if (winnerKey === 'B') {
    winnerName = m.team_b
    winnerColor = m.team_b_color
    winnerLogo = m.team_b_logo
  } else {
    isDraw = true
  }

  useEffect(() => {
    if (!containerRef.current) return

    // Card slide-in/scale entrance
    gsap.fromTo(
      containerRef.current.querySelector('.celebration-card'),
      { scale: 0.6, opacity: 0, y: 100 },
      { scale: 1, opacity: 1, y: 0, duration: 1.2, ease: 'back.out(1.5)' }
    )

    gsap.fromTo(
      containerRef.current.querySelector('.celebration-logo'),
      { rotationY: -180, scale: 0.2, opacity: 0 },
      { rotationY: 0, scale: 1, opacity: 1, duration: 1.5, delay: 0.5, ease: 'power3.out' }
    )

    // Falling confetti animation
    const colors = isDraw ? ['#38bdf8', '#fbbf24', '#f43f5e', '#34d399'] : [winnerColor, '#ffffff', '#fbbf24']
    const particleCount = 80
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div')
      p.className = 'absolute rounded-sm pointer-events-none'
      p.style.width = `${Math.random() * 10 + 6}px`
      p.style.height = `${Math.random() * 15 + 8}px`
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
      containerRef.current.appendChild(p)

      const xStart = Math.random() * window.innerWidth
      const yStart = -20
      const xEnd = xStart + (Math.random() * 300 - 150)
      const yEnd = window.innerHeight + 20
      const rotation = Math.random() * 720 - 360

      gsap.set(p, { x: xStart, y: yStart, rotation: Math.random() * 360 })

      gsap.to(p, {
        x: xEnd,
        y: yEnd,
        rotation: rotation,
        duration: Math.random() * 3 + 2.5,
        delay: Math.random() * 1.5,
        ease: 'power1.out',
        onComplete: () => p.remove(),
      })
    }
  }, [winnerColor, isDraw])

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden bg-[#020611]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] opacity-20"
          style={{
            background: isDraw 
              ? 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 60%)'
              : `radial-gradient(circle, ${winnerColor}25 0%, transparent 65%)`
          }} 
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full filter blur-[150px] opacity-25 animate-pulse"
          style={{ backgroundColor: isDraw ? '#4f46e5' : winnerColor }} 
        />
      </div>

      <div className="celebration-card flex flex-col items-center max-w-2xl w-full px-8 py-12 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-md shadow-2xl relative z-10 text-center">
        <p className="text-white/40 text-sm font-black uppercase tracking-[0.4em] mb-3 leading-none">
          {m.tournament_name || 'TOURNAMENT MATCH'}
        </p>
        <span className="text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-950/20 mb-8">
          MATCH COMPLETED
        </span>

        {isDraw ? (
          <>
            <div className="celebration-logo flex items-center justify-center w-32 h-32 rounded-full bg-indigo-950/30 border-2 border-indigo-500/40 shadow-lg mb-6">
              <Trophy size={64} className="text-indigo-400" />
            </div>
            <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tight mb-4 drop-shadow-lg">
              MATCH DRAWN!
            </h1>
          </>
        ) : (
          <>
            {winnerLogo ? (
              <img src={winnerLogo} alt="" className="celebration-logo h-36 w-36 object-contain rounded-3xl mb-6 shadow-2xl"
                onError={(e) => { e.currentTarget.style.display = 'none' }} />
            ) : (
              <div className="celebration-logo flex items-center justify-center w-32 h-32 rounded-full bg-amber-950/30 border-2 border-amber-500/40 mb-6">
                <Trophy size={64} className="text-amber-400" />
              </div>
            )}
            <p className="text-amber-400 text-sm font-black uppercase tracking-[0.25em] mb-1">
              🏆 WINNER 🏆
            </p>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight mb-4 drop-shadow-2xl leading-none"
              style={{ color: winnerColor, textShadow: `0 0 50px ${winnerColor}50` }}>
              {winnerName}
            </h1>
          </>
        )}

        <div className="mt-8 pt-8 border-t border-white/5 w-full max-w-md">
          <p className="text-white/30 text-xs font-bold uppercase tracking-wider mb-3">SETS WON</p>
          <div className="flex items-center justify-center gap-6">
            <div className="text-right flex-1">
              <p className="text-sm font-semibold truncate" style={{ color: m.team_a_color }}>{m.team_a}</p>
              <p className="text-4xl font-black font-score" style={{ color: m.team_a_color }}>{s.sets_a ?? 0}</p>
            </div>
            <div className="text-white/20 text-2xl font-black">:</div>
            <div className="text-left flex-1">
              <p className="text-sm font-semibold truncate" style={{ color: m.team_b_color }}>{m.team_b}</p>
              <p className="text-4xl font-black font-score" style={{ color: m.team_b_color }}>{s.sets_b ?? 0}</p>
            </div>
          </div>
          {s.completed_sets?.length > 0 && (
            <p className="mt-4 text-white/40 text-sm font-bold tabular-nums tracking-wider">
              {s.completed_sets.map(([a, b], i) => (
                <span key={i} className="mx-1.5">{a}–{b}</span>
              ))}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
