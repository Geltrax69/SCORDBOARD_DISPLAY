import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { gsap } from 'gsap'
import { scoreboardWS } from '@/services/websocket'
import { useAuthStore } from '@/store/authStore'
import { useWSStore } from '@/store/wsStore'
import { getMatch, listMatches, getMatchPlayers } from '@/services/api'
import { TimeoutOverlay } from '@/components/display/TimeoutOverlay'
import { SubstitutionOverlay } from '@/components/display/SubstitutionOverlay'
import { AnnouncementOverlay } from '@/components/display/AnnouncementOverlay'
import { PlayerLineup } from '@/components/display/PlayerLineup'
import { VideoPlayer } from '@/components/display/VideoPlayer'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import type {
  WSMessage, Match, MatchState, TimeoutPayload,
  SubstitutionPayload, AnnouncementPayload, Player,
} from '@/types'
import { clsx } from 'clsx'
import { Wifi, WifiOff } from 'lucide-react'

const WS_BASE =
  window.location.protocol === 'https:' ? 'wss://' : 'ws://' + window.location.host
const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

interface LiveMatch { match: Match; state: MatchState }

type OverlayState =
  | { type: 'none' }
  | { type: 'countdown'; match: Match; players: Player[]; pendingState: MatchState }
  | { type: 'lineup'; match: Match; players: Player[] }
  | { type: 'timeout'; payload: TimeoutPayload; match: Match }
  | { type: 'substitution'; payload: SubstitutionPayload; match: Match }
  | { type: 'announcement'; payload: AnnouncementPayload }
  | { type: 'video'; src: string }

export default function Display() {
  const [searchParams] = useSearchParams()
  const singleMatchId = searchParams.get('match')
  const token = useAuthStore((s) => s.token)
  const wsStatus = useWSStore((s) => s.status)
  const setWsStatus = useWSStore((s) => s.setStatus)

  const [mode, setMode]             = useState<1|2|3|4|5>(1)
  const [matchIds, setMatchIds]     = useState<string[]>(singleMatchId ? [singleMatchId] : [])
  const [liveMatches, setLiveMatches] = useState<Record<string, LiveMatch>>({})
  const [players, setPlayers]       = useState<Record<string, Player[]>>({})
  const [overlay, setOverlay]       = useState<OverlayState>({ type: 'none' })
  const [loading, setLoading]       = useState(true)

  const layoutRef = useRef<HTMLDivElement>(null)

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

  // ── WS connection ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    const path = singleMatchId ? `/ws/match/${singleMatchId}` : '/ws/global'
    const url = `${WS_BASE}${path}?token=${encodeURIComponent(token)}`
    scoreboardWS.connect(url, setWsStatus)

    const unsub = scoreboardWS.subscribe((msg: WSMessage) => handleWS(msg))
    return () => { unsub() }
  }, [token, singleMatchId])

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
        if (match_id && payload.match && payload.state) {
          setLiveMatches((prev) => ({ ...prev, [match_id]: { match: payload.match!, state: payload.state! } }))
        }
        if (type === 'timeout_end') setOverlay({ type: 'none' })
        break
      }
      case 'match_start': {
        if (match_id && payload.match && payload.state) {
          const m = payload.match!
          const pl = players[m.id] ?? []
          // Show 5-second countdown BEFORE switching to live view
          setOverlay({ type: 'countdown', match: m, players: pl, pendingState: payload.state! })
        }
        break
      }
      case 'timeout_start': {
        if (match_id && payload.match && payload.state?.current_timeout) {
          setLiveMatches((prev) => ({ ...prev, [match_id]: { match: payload.match!, state: payload.state! } }))
          setOverlay({ type: 'timeout', payload: payload.state!.current_timeout!, match: payload.match! })
        }
        break
      }
      case 'substitution': {
        if (match_id && payload.event && payload.match) {
          setOverlay({
            type: 'substitution',
            payload: payload.event.payload as unknown as SubstitutionPayload,
            match: payload.match!,
          })
        }
        break
      }
      case 'announcement': {
        const p = payload as unknown as AnnouncementPayload
        if (p.message) setOverlay({ type: 'announcement', payload: p })
        break
      }
      case 'display_layout_change': {
        const p = payload as unknown as { mode: 1|2|3|4|5; match_ids: string[] }
        if (p.mode) {
          animateLayoutChange(() => {
            setMode(p.mode)
            setMatchIds(p.match_ids ?? [])
            // Fetch newly added matches
            p.match_ids?.forEach(async (id) => {
              if (!liveMatches[id]) {
                const { match, state } = await getMatch(id)
                const pl = await getMatchPlayers(id)
                setLiveMatches((prev) => ({ ...prev, [id]: { match, state } }))
                setPlayers((prev) => ({ ...prev, [id]: pl }))
              }
            })
          })
        }
        break
      }
    }
  }, [players, liveMatches])

  // ── GSAP layout transition ────────────────────────────────────────────────
  const animateLayoutChange = (callback: () => void) => {
    if (!layoutRef.current) { callback(); return }
    gsap.timeline()
      .to(layoutRef.current, { opacity: 0, scale: 0.97, duration: 0.3, ease: 'power2.in' })
      .call(callback)
      .fromTo(layoutRef.current,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' }
      )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <LoadingSpinner size="lg" label="Connecting to live scores…" />
      </div>
    )
  }

  const matchList = matchIds.map((id) => liveMatches[id]).filter(Boolean) as LiveMatch[]

  return (
    <div className="h-screen bg-dark-950 overflow-hidden relative select-none">
      {/* WS indicator */}
      <div className={clsx(
        'absolute top-3 right-3 z-10 flex items-center gap-1 text-xs opacity-50',
        wsStatus === 'connected' ? 'text-emerald-400' : 'text-dark-600',
      )}>
        {wsStatus === 'connected' ? <Wifi size={10} /> : <WifiOff size={10} />}
      </div>

      {/* Main content */}
      <div ref={layoutRef} className="h-full flex flex-col">
        {mode === 1 && matchList[0] && (
          <SingleMatchDisplay lm={matchList[0]} players={players[matchList[0].match.id] ?? []} />
        )}
        {mode === 2 && <TwoMatchDisplay matches={matchList.slice(0, 2)} />}
        {mode === 3 && <FourMatchGrid matches={matchList.slice(0, 4)} />}
        {(mode === 4 || mode === 5) && matchList.length === 0 && (
          <EmptyDisplay label={mode === 4 ? 'ANNOUNCEMENT MODE' : 'SPONSOR MODE'} />
        )}
        {matchList.length === 0 && mode <= 3 && (
          <EmptyDisplay label="Waiting for matches…" />
        )}
      </div>

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
          onEnd={() => setOverlay({ type: 'none' })}
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
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-dark-800 text-2xl font-black uppercase tracking-widest">{label}</p>
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
function PreMatchIntro({ m, players }: { m: Match; players: Player[] }) {
  const ref     = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const spotIdxRef = useRef(0)
  const [spotIdx, setSpotIdx] = useState(0)

  const playersA  = players.filter((p) => p.team === 'A')
  const playersB  = players.filter((p) => p.team === 'B')
  const allPlayers = [...playersA, ...playersB]

  // ── Looping background + logo animations ─────────────────────────────────
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ctx = gsap.context(() => {

      // 1. Entrance — elements fly in once
      const entrance = gsap.timeline({ defaults: { ease: 'power3.out' } })
      entrance
        .fromTo('.pi-header', { opacity: 0, y: -32 }, { opacity: 1, y: 0, duration: 0.7 })
        .fromTo('.pi-team-a', { opacity: 0, x: -100 }, { opacity: 1, x: 0, duration: 0.65 }, '-=0.4')
        .fromTo('.pi-team-b', { opacity: 0, x: 100 },  { opacity: 1, x: 0, duration: 0.65 }, '<')
        .fromTo('.pi-vs',    { opacity: 0, scale: 2.2 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }, '-=0.3')

      // 2. Logo breathe (staggered so A and B are out of phase)
      gsap.to('.pi-logo-a', { scale: 1.08, duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 })
      gsap.to('.pi-logo-b', { scale: 1.08, duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2.4 })

      // 3. Background color blobs pulse
      gsap.to('.pi-glow-a', { opacity: 0.55, scale: 1.25, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.5 })
      gsap.to('.pi-glow-b', { opacity: 0.55, scale: 1.25, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.8 })

      // 4. VS text shimmer pulse
      gsap.to('.pi-vs-text', { opacity: 0.3, scale: 1.04, duration: 2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.2 })

      // 5. Horizontal light beam sweep (inspired by frame 010 — blue energy beam)
      gsap.fromTo('.pi-beam',
        { xPercent: -160, opacity: 1 },
        { xPercent: 220, opacity: 0.4, duration: 1.6, ease: 'power2.inOut', repeat: -1, repeatDelay: 5, delay: 2 }
      )

      // 6. Second, thinner beam with delay offset
      gsap.fromTo('.pi-beam2',
        { xPercent: -160, opacity: 0.6 },
        { xPercent: 220, opacity: 0, duration: 1.2, ease: 'power1.inOut', repeat: -1, repeatDelay: 5, delay: 4.5 }
      )

      // 7. Header amber dots staggered pulse
      gsap.to('.pi-dot', {
        opacity: 0.25, duration: 0.7, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.35, delay: 1,
      })

      // 8. "MATCH STARTING SOON" text slow opacity flicker
      gsap.to('.pi-soon-text', {
        opacity: 0.65, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 0.5,
      })

      // 9. Team name glow oscillation
      gsap.to('.pi-name-a', { filter: `drop-shadow(0 0 28px ${m.team_a_color}cc)`, duration: 2.5, repeat: -1, yoyo: true, ease: 'sine.inOut' })
      gsap.to('.pi-name-b', { filter: `drop-shadow(0 0 28px ${m.team_b_color}cc)`, duration: 2.5, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.3 })

      // 10. Bottom colour bar shimmer
      gsap.to('.pi-bar', { opacity: 0.4, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' })

    }, el)
    return () => ctx.revert()
  }, [m.id])


  // ── Player spotlight cycling ─────────────────────────────────────────────
  useEffect(() => {
    if (allPlayers.length < 2) return
    const id = setInterval(() => {
      const next = (spotIdxRef.current + 1) % allPlayers.length
      if (cardRef.current) {
        gsap.to(cardRef.current, {
          opacity: 0, x: -50, duration: 0.35, ease: 'power2.in',
          onComplete: () => { spotIdxRef.current = next; setSpotIdx(next) },
        })
      } else {
        spotIdxRef.current = next; setSpotIdx(next)
      }
    }, 3800)
    return () => clearInterval(id)
  }, [allPlayers.length])

  // Animate in whenever card content changes
  useEffect(() => {
    if (!cardRef.current || allPlayers.length === 0) return
    gsap.fromTo(cardRef.current,
      { opacity: 0, x: 60 },
      { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }
    )
  }, [spotIdx])

  const spotlight   = allPlayers[spotIdx]
  const spotColor   = spotlight?.team === 'A' ? m.team_a_color : m.team_b_color
  const spotTeam    = spotlight?.team === 'A' ? m.team_a : m.team_b

  return (
    <div ref={ref} className="flex-1 flex flex-col relative overflow-hidden" style={{ background: '#03070d' }}>

      {/* ── Light beams (broadcast-style sweep) ── */}
      <div className="pi-beam absolute inset-y-0 w-20 pointer-events-none z-30"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(120,200,255,0.09) 40%, rgba(180,230,255,0.18) 50%, rgba(120,200,255,0.09) 60%, transparent)', left: 0 }} />
      <div className="pi-beam2 absolute inset-y-0 w-10 pointer-events-none z-30"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 50%, transparent)', left: 0 }} />

      {/* ── Background colour blobs ── */}
      <div className="pi-glow-a absolute pointer-events-none" style={{
        left: '-10%', top: '5%', width: '55%', height: '90%', opacity: 0.22,
        background: `radial-gradient(ellipse at 30% 50%, ${m.team_a_color}35 0%, transparent 65%)`,
      }} />
      <div className="pi-glow-b absolute pointer-events-none" style={{
        right: '-10%', top: '5%', width: '55%', height: '90%', opacity: 0.22,
        background: `radial-gradient(ellipse at 70% 50%, ${m.team_b_color}35 0%, transparent 65%)`,
      }} />

      {/* ── Subtle grid overlay ── */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* ── Bottom colour bar ── */}
      <div className="pi-bar absolute bottom-0 left-0 right-0 h-[3px] z-10"
        style={{ background: `linear-gradient(90deg, ${m.team_a_color}, transparent 50%, ${m.team_b_color})`, opacity: 0.8 }} />

      {/* ── Header ── */}
      <div className="pi-header flex-shrink-0 flex items-center justify-between px-14 pt-8 pb-0 relative z-10">
        <p className="text-white/20 text-xs uppercase tracking-[0.4em] font-bold">{m.tournament_name || ''}</p>
        <div className="flex items-center gap-3">
          <span className="pi-dot h-2 w-2 rounded-full bg-amber-400" />
          <span className="pi-soon-text text-amber-400 text-sm font-black uppercase tracking-[0.3em]">Match Starting Soon</span>
          <span className="pi-dot h-2 w-2 rounded-full bg-amber-400" />
        </div>
        <p className="text-white/25 text-xs uppercase tracking-[0.3em] font-bold">{m.court_name || ''}</p>
      </div>

      {/* ── Teams + VS ── */}
      <div className="flex-1 flex items-center justify-between px-10 relative z-10 gap-4 min-h-0">

        {/* Team A */}
        <div className="pi-team-a flex-1 flex flex-col items-center gap-4">
          <div className="pi-logo-a relative flex-shrink-0">
            {m.team_a_logo ? (
              <img src={m.team_a_logo} alt="" className="h-32 w-32 object-contain rounded-2xl"
                style={{ filter: `drop-shadow(0 0 32px ${m.team_a_color}70)` }}
                onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <div className="h-32 w-32 rounded-2xl flex items-center justify-center text-5xl font-black"
                style={{ background: `${m.team_a_color}1a`, border: `2px solid ${m.team_a_color}50`, color: m.team_a_color, boxShadow: `0 0 40px ${m.team_a_color}25` }}>
                {m.team_a.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ boxShadow: `0 0 50px ${m.team_a_color}25, inset 0 0 20px ${m.team_a_color}08` }} />
          </div>
          <p className="pi-name-a font-black uppercase tracking-wider text-center leading-none"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 4.5rem)', color: m.team_a_color, filter: `drop-shadow(0 0 16px ${m.team_a_color}80)` }}>
            {m.team_a}
          </p>
          <p className="text-white/15 text-xs uppercase tracking-widest font-semibold">
            {playersA.length > 0 ? `${playersA.length} Players` : ''}
          </p>
        </div>

        {/* VS */}
        <div className="pi-vs flex-shrink-0 flex flex-col items-center">
          <p className="pi-vs-text font-black leading-none select-none"
            style={{ fontSize: 'clamp(4rem, 9vw, 10rem)', letterSpacing: '-0.05em', color: 'rgba(255,255,255,0.1)', opacity: 0.18 }}>
            VS
          </p>
        </div>

        {/* Team B */}
        <div className="pi-team-b flex-1 flex flex-col items-center gap-4">
          <div className="pi-logo-b relative flex-shrink-0">
            {m.team_b_logo ? (
              <img src={m.team_b_logo} alt="" className="h-32 w-32 object-contain rounded-2xl"
                style={{ filter: `drop-shadow(0 0 32px ${m.team_b_color}70)` }}
                onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : (
              <div className="h-32 w-32 rounded-2xl flex items-center justify-center text-5xl font-black"
                style={{ background: `${m.team_b_color}1a`, border: `2px solid ${m.team_b_color}50`, color: m.team_b_color, boxShadow: `0 0 40px ${m.team_b_color}25` }}>
                {m.team_b.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ boxShadow: `0 0 50px ${m.team_b_color}25, inset 0 0 20px ${m.team_b_color}08` }} />
          </div>
          <p className="pi-name-b font-black uppercase tracking-wider text-center leading-none"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 4.5rem)', color: m.team_b_color, filter: `drop-shadow(0 0 16px ${m.team_b_color}80)` }}>
            {m.team_b}
          </p>
          <p className="text-white/15 text-xs uppercase tracking-widest font-semibold">
            {playersB.length > 0 ? `${playersB.length} Players` : ''}
          </p>
        </div>
      </div>

      {/* ── Player spotlight ── */}
      {allPlayers.length > 0 && spotlight && (
        <div className="pi-spotlight-wrap flex-shrink-0 relative z-10 px-12 pb-8">

          {/* Section divider */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${spotColor}50)` }} />
            <span className="text-white/20 text-[10px] uppercase tracking-[0.5em] font-bold">Player Spotlight</span>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${spotColor}50)` }} />
          </div>

          {/* Card */}
          <div ref={cardRef} className="max-w-2xl mx-auto">
            <div className="flex items-center gap-6 rounded-2xl overflow-hidden p-4"
              style={{ background: `linear-gradient(135deg, ${spotColor}10 0%, rgba(255,255,255,0.03) 100%)`, border: `1px solid ${spotColor}25`, boxShadow: `0 0 60px ${spotColor}15` }}>

              {/* Photo or jersey card */}
              {spotlight.photo_url ? (
                <div className="relative flex-shrink-0">
                  <div className="w-24 h-32 rounded-xl overflow-hidden"
                    style={{ boxShadow: `0 0 30px ${spotColor}50, 0 0 0 2px ${spotColor}35` }}>
                    <img src={spotlight.photo_url} alt={spotlight.name}
                      className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full flex items-center justify-center text-xs font-black"
                    style={{ background: spotColor, color: '#000', boxShadow: `0 0 16px ${spotColor}90` }}>
                    {spotlight.jersey_number}
                  </div>
                </div>
              ) : (
                <div className="flex-shrink-0 w-24 h-32 rounded-xl flex flex-col items-center justify-center gap-1"
                  style={{ background: `${spotColor}15`, border: `2px solid ${spotColor}40`, boxShadow: `0 0 30px ${spotColor}25` }}>
                  <span className="text-3xl font-black tabular-nums leading-none" style={{ color: spotColor }}>
                    #{spotlight.jersey_number}
                  </span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-white/35 text-[10px] uppercase tracking-[0.5em] font-bold">{spotTeam}</p>
                <p className="font-black uppercase text-white leading-tight truncate"
                  style={{ fontSize: 'clamp(1.5rem, 3vw, 3rem)', filter: `drop-shadow(0 0 20px ${spotColor}70)` }}>
                  {spotlight.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase"
                    style={{ background: `${spotColor}25`, color: spotColor, border: `1px solid ${spotColor}45` }}>
                    #{spotlight.jersey_number}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                    spotlight.status === 'sub'
                      ? 'text-white/30 bg-white/5 border border-white/10'
                      : 'text-emerald-400 bg-emerald-900/40 border border-emerald-500/30'
                  }`}>
                    {spotlight.status === 'sub' ? 'SUBSTITUTE' : 'STARTER'}
                  </span>
                  <span className="text-white/20 text-xs font-bold uppercase tracking-widest">
                    {spotlight.team === 'A' ? m.team_a : m.team_b}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress dots */}
          {allPlayers.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-4">
              {allPlayers.map((pl, i) => (
                <div key={i} className="rounded-full transition-all duration-500"
                  style={{
                    width: i === spotIdx ? '22px' : '6px',
                    height: '6px',
                    background: i === spotIdx
                      ? (pl.team === 'A' ? m.team_a_color : m.team_b_color)
                      : 'rgba(255,255,255,0.12)',
                  }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer — shown only when no players */}
      {allPlayers.length === 0 && (
        <div className="flex-shrink-0 flex items-center justify-center pb-10 pt-2 relative z-10">
          <div className="flex items-center gap-4 text-white/15 text-xs uppercase tracking-widest font-medium">
            <div className="h-px w-16 bg-white/10" />
            Waiting for match to start
            <div className="h-px w-16 bg-white/10" />
          </div>
        </div>
      )}
    </div>
  )
}

function SingleMatchDisplay({ lm, players }: { lm: LiveMatch; players: Player[] }) {
  const { match: m, state: s } = lm
  const scoreARef = useRef<HTMLDivElement>(null)
  const scoreBRef = useRef<HTMLDivElement>(null)
  const prevA = useRef(s.score_a)
  const prevB = useRef(s.score_b)

  useEffect(() => {
    if (s.score_a !== prevA.current && scoreARef.current) {
      animateScore(scoreARef.current, m.team_a_color)
      prevA.current = s.score_a
    }
  }, [s.score_a])

  useEffect(() => {
    if (s.score_b !== prevB.current && scoreBRef.current) {
      animateScore(scoreBRef.current, m.team_b_color)
      prevB.current = s.score_b
    }
  }, [s.score_b])

  if (m.status === 'pending') return <PreMatchIntro m={m} players={players} />

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

        {/* Centre: status badge */}
        <span
          className="text-sm font-black uppercase tracking-widest px-6 py-2 rounded-full border-2 whitespace-nowrap mt-0.5"
          style={{ color: statusColor, borderColor: `${statusColor}55`, backgroundColor: `${statusColor}12` }}
        >
          {status}
        </span>

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
            className="font-black uppercase tracking-wider leading-none text-center"
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 5rem)',
              color: m.team_a_color,
              textShadow: `0 0 50px ${m.team_a_color}45`,
            }}
          >
            {m.team_a}
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
            className="font-black uppercase tracking-wider leading-none text-center"
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 5rem)',
              color: m.team_b_color,
              textShadow: `0 0 50px ${m.team_b_color}45`,
            }}
          >
            {m.team_b}
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

      {/* ── Timer — clean, no heavy box ── */}
      <div className="flex-shrink-0 flex items-center justify-center pb-10 pt-3 relative z-10 gap-4">
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
  )
}

function CompactScore({ lm }: { lm: LiveMatch }) {
  const { match: m, state: s } = lm
  const scoreARef = useRef<HTMLDivElement>(null)
  const scoreBRef = useRef<HTMLDivElement>(null)
  const prevA = useRef(s.score_a)
  const prevB = useRef(s.score_b)

  useEffect(() => {
    if (s.score_a !== prevA.current && scoreARef.current) {
      animateScore(scoreARef.current, m.team_a_color); prevA.current = s.score_a
    }
  }, [s.score_a])
  useEffect(() => {
    if (s.score_b !== prevB.current && scoreBRef.current) {
      animateScore(scoreBRef.current, m.team_b_color); prevB.current = s.score_b
    }
  }, [s.score_b])

  const status = ({ active: 'LIVE', timeout: 'TIMEOUT', completed: 'FINAL', pending: 'PENDING', paused: 'PAUSED', cancelled: 'CANCELLED' } as Record<string,string>)[m.status] ?? m.status
  const statusColor = ({ active: '#10b981', timeout: '#f59e0b', completed: '#64748b', pending: '#64748b', paused: '#38bdf8', cancelled: '#ef4444' } as Record<string,string>)[m.status] ?? '#64748b'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
      <div className="text-center">
        {m.court_name && <p className="text-dark-600 text-xs uppercase tracking-wider">{m.court_name}</p>}
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>
          {status}
        </span>
      </div>
      <div className="flex items-center gap-4 w-full">
        <div className="flex-1 text-right">
          {m.team_a_logo && (
            <img src={m.team_a_logo} alt="" className="h-8 w-8 object-contain rounded ml-auto mb-1"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <p className="text-sm font-bold uppercase" style={{ color: m.team_a_color }}>{m.team_a}</p>
          <div ref={scoreARef} className="text-6xl font-black font-score tabular-nums leading-none"
            style={{ color: m.team_a_color }}>
            {s.score_a}
          </div>
        </div>
        <div className="text-dark-700 text-3xl font-black flex-shrink-0">:</div>
        <div className="flex-1">
          {m.team_b_logo && (
            <img src={m.team_b_logo} alt="" className="h-8 w-8 object-contain rounded mb-1"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
          <p className="text-sm font-bold uppercase" style={{ color: m.team_b_color }}>{m.team_b}</p>
          <div ref={scoreBRef} className="text-6xl font-black font-score tabular-nums leading-none"
            style={{ color: m.team_b_color }}>
            {s.score_b}
          </div>
        </div>
      </div>
      {/* Timer */}
      <div className={clsx(
        'font-mono text-xl font-bold tabular-nums px-4 py-1.5 rounded-xl',
        s.timer_running ? 'text-emerald-400 bg-emerald-900/10' : 'text-dark-700 bg-dark-900',
      )}>
        {String(Math.floor(s.timer_seconds / 60)).padStart(2,'0')}:{String(s.timer_seconds % 60).padStart(2,'0')}
      </div>
    </div>
  )
}

function TwoMatchDisplay({ matches }: { matches: LiveMatch[] }) {
  return (
    <div className="flex-1 flex divide-x divide-dark-800">
      {matches[0] ? <CompactScore lm={matches[0]} /> : <EmptyDisplay label="Court 1" />}
      {matches[1] ? <CompactScore lm={matches[1]} /> : <EmptyDisplay label="Court 2" />}
    </div>
  )
}

function FourMatchGrid({ matches }: { matches: LiveMatch[] }) {
  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 divide-x divide-y divide-dark-800">
      {Array.from({ length: 4 }).map((_, i) =>
        matches[i]
          ? <CompactScore key={matches[i].match.id} lm={matches[i]} />
          : <EmptyDisplay key={i} label={`Court ${i + 1}`} />
      )}
    </div>
  )
}

// ── Shared GSAP score animation ───────────────────────────────────────────────
function animateScore(el: HTMLElement, color: string) {
  gsap.killTweensOf(el)
  gsap.timeline()
    .to(el, {
      scale: 1.45, duration: 0.12, ease: 'power2.out',
      filter: `drop-shadow(0 0 50px ${color}) drop-shadow(0 0 80px ${color}80)`,
    })
    .to(el, {
      scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.4)',
      filter: `drop-shadow(0 0 15px ${color}40)`,
    })
}
