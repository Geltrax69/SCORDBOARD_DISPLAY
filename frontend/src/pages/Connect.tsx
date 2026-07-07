import { useState, useEffect, useCallback, useRef } from 'react'
import { Trophy, Wifi, CheckCircle, AlertCircle, Loader, Plus, Minus,
         Play, Square, Timer, PauseCircle, Clock, RefreshCw, ArrowDownUp } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { scoreboardWS } from '@/services/websocket'
import { SubstitutionModal } from '@/components/admin/SubstitutionModal'
import { Modal } from '@/components/common/Modal'
import type { Match, MatchState, WSMessage } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'
const WS_BASE  = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host

// ── API helpers using device token ─────────────────────────────────────────
async function deviceFetch(url: string, token: string, body?: object) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    const err = new Error(d.error ?? `HTTP ${r.status}`) as any
    err.status = r.status
    throw err
  }
  return r.json()
}

function postEvent(matchId: string, token: string, type: string, payload: object = {}) {
  return deviceFetch(`${API_BASE}/matches/${matchId}/events`, token, { type, payload })
}

// ── Timer display ───────────────────────────────────────────────────────────
function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ── Serve indicator ──────────────────────────────────────────────────────────
// "to serve" badge (pulsing ball + SERVE label) next to the team serving next.
function ServeBall({ show, color = '#fbbf24' }: { show: boolean; color?: string }) {
  if (!show) return null
  return (
    <span title="Serving next rally"
      className="inline-block h-2.5 w-2.5 rounded-full align-middle animate-pulse"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
  )
}

// ── Score button ────────────────────────────────────────────────────────────
function ScoreBtn({ label, color, onClick, loading }: {
  label: string; color: string; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center rounded-2xl text-xl font-black transition-all active:scale-95 disabled:opacity-50 select-none"
      style={{
        backgroundColor: `${color}20`,
        border: `2px solid ${color}50`,
        color,
        minHeight: 64,
      }}
    >
      {loading ? <Loader size={18} className="animate-spin" /> : label}
    </button>
  )
}

// ── Connected scorer panel ──────────────────────────────────────────────────
function ScorerPanel({ match: initialMatch, token: initialToken, onDisconnect }: {
  match: Match; token: string; onDisconnect: () => void
}) {
  const [match, setMatch]   = useState(initialMatch)
  const [state, setState]   = useState<MatchState | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [fireError, setFireError] = useState('')
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting')
  const [timer, setTimer]   = useState(0)
  const [token, setToken]   = useState(initialToken)
  const [subOpen, setSubOpen] = useState(false)
  const [winnerModalOpen, setWinnerModalOpen] = useState(false)

  // Fetch initial state
  const refresh = useCallback(async () => {
    try {
      const d = await deviceFetch(`${API_BASE}/matches/${match.id}`, token)
      setMatch(d.match); setState(d.state)
      setTimer(d.state.timer_seconds ?? 0)
    } catch (err: any) {
      if (err.status === 401) {
        console.warn('Device pairing token expired or invalid. Disconnecting...')
        onDisconnect()
        return
      }
      const errMsg = err instanceof Error ? err.message : 'Failed to load match data'
      console.error('Match refresh error:', errMsg)
      setFireError(errMsg)
      setTimeout(() => setFireError(''), 5000)
    }
  }, [match.id, token, onDisconnect])

  useEffect(() => { refresh() }, [refresh])

  // WebSocket live updates - selective update instead of full refresh
  useEffect(() => {
    const wsURL = `${WS_BASE}/ws/match/${match.id}?token=${encodeURIComponent(token)}`
    scoreboardWS.connect(wsURL, (status) => {
      setWsStatus(status)
      if (status === 'error') {
        setFireError('WebSocket connection error - attempting to reconnect...')
        setTimeout(() => setFireError(''), 5000)
      }
    })

    const unsub = scoreboardWS.subscribe((msg: WSMessage) => {
      // Hard guard: this scorer only ever reacts to ITS OWN match, never another
      // court's broadcast (prevents the phone from being switched to match 2).
      if (msg.match_id && msg.match_id !== match.id) return
      // Selective update: only update relevant fields based on message type
      if (msg.payload?.match && msg.payload?.state) {
        setMatch(msg.payload.match)
        setState(msg.payload.state)
        // Sync timer when state updates
        setTimer(msg.payload.state.timer_seconds ?? 0)
      }
    })
    return () => { unsub(); scoreboardWS.disconnect() }
  }, [match.id, token])

  // Local timer tick when running
  useEffect(() => {
    if (!state?.timer_running) return
    const id = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [state?.timer_running])

  // Auto-end a timeout once its duration elapses → match resumes on its own.
  useEffect(() => {
    if (state?.status !== 'timeout') return
    const dur = state?.current_timeout?.duration || 60
    const id = setTimeout(() => { postEvent(match.id, token, 'timeout_end').catch(() => {}) }, dur * 1000)
    return () => clearTimeout(id)
  }, [state?.status, state?.current_timeout?.duration, match.id, token])

  // Countdown for timeout / court-change break — seeds from backend remaining,
  // ticks down locally, resyncs on each WS state update.
  const [breakKind, setBreakKind] = useState<'timeout' | 'break' | null>(null)
  const [breakLeft, setBreakLeft] = useState(0)
  useEffect(() => {
    const to = state?.timeout_remaining ?? 0
    const br = state?.break_remaining ?? 0
    if (to > 0)      { setBreakKind('timeout'); setBreakLeft(to) }
    else if (br > 0) { setBreakKind('break');   setBreakLeft(br) }
    else             { setBreakKind(null);      setBreakLeft(0) }
  }, [state?.timeout_remaining, state?.break_remaining])
  useEffect(() => {
    if (!breakKind) return
    const id = setInterval(() => setBreakLeft(x => Math.max(0, x - 1)), 1000)
    return () => clearInterval(id)
  }, [breakKind])

  // After a set finishes (court change), auto-resume the clock after the 2-min
  // break so the next set starts on its own.
  const prevSets = useRef(state?.completed_sets?.length ?? 0)
  useEffect(() => {
    const n = state?.completed_sets?.length ?? 0
    const grew = n > prevSets.current
    prevSets.current = n
    if (!grew || state?.status !== 'active') return
    const id = setTimeout(() => { postEvent(match.id, token, 'timer_start').catch(() => {}) }, 120 * 1000)
    return () => clearTimeout(id)
  }, [state?.completed_sets?.length, state?.status, match.id, token])

  // Auto-refresh token before expiration (every 6 hours for 12-hour tokens)
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/refresh-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        if (res.ok) {
          const data = await res.json()
          setToken(data.token)
          localStorage.setItem('scorer_token', data.token)
          console.log('Token refreshed successfully')
        } else {
          console.error('Token refresh failed')
        }
      } catch (err) {
        console.error('Token refresh error:', err)
      }
    }, 6 * 60 * 60 * 1000) // Every 6 hours

    return () => clearInterval(refreshInterval)
  }, [token])

  const fire = async (key: string, type: string, payload?: object) => {
    setLoading(key)
    setFireError('')
    try {
      await postEvent(match.id, token, type, payload)
      await refresh()
    } catch (err) {
      setFireError(err instanceof Error ? err.message : 'Action failed')
      setTimeout(() => setFireError(''), 3000)
    } finally {
      setLoading(null)
    }
  }

  const status  = state?.status ?? match.status
  const scoreA  = state?.score_a ?? 0
  const scoreB  = state?.score_b ?? 0
  const setsA   = state?.sets_a ?? 0
  const setsB   = state?.sets_b ?? 0
  const setNumber = state?.set_number ?? 1
  const serving = state?.serving ?? ''
  const setPoint = state?.set_point
  const matchPoint = state?.match_point
  const running = state?.timer_running ?? false
  const pending = status === 'pending'
  const active  = status === 'active' || status === 'timeout'
  const ended   = status === 'completed'

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending:   { text: 'NOT STARTED', color: '#f59e0b' },
    active:    { text: 'LIVE',        color: '#22c55e' },
    timeout:   { text: 'TIMEOUT',     color: '#f59e0b' },
    paused:    { text: 'PAUSED',      color: '#38bdf8' },
    completed: { text: 'ENDED',       color: '#6b7280' },
  }
  const st = statusLabel[status] ?? statusLabel.pending

  return (
    <div className="min-h-screen bg-[#060e1a] flex flex-col select-none">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a1828] border-b border-[#1e3450]">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{
            backgroundColor: wsStatus === 'connected' ? '#22c55e' : '#f59e0b',
            boxShadow: wsStatus === 'connected' ? '0 0 6px #22c55e' : undefined,
          }} />
          <span className="text-[#5a86ae] font-medium">
            {wsStatus === 'connected' ? 'Live' : 'Reconnecting…'}
          </span>
        </div>

        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ color: st.color, backgroundColor: `${st.color}18`, border: `1px solid ${st.color}40` }}>
            {st.text}
          </span>
        </div>

        <button onClick={refresh} className="p-1.5 rounded-lg text-[#3d6a91] hover:text-[#80a5c8] transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Match title */}
      <div className="text-center px-4 pt-5 pb-3">
        <p className="text-xs text-[#3d6a91] font-semibold uppercase tracking-wider mb-1">
          {match.court_name || 'Court'}
        </p>
        <h1 className="text-2xl font-black">
          <span style={{ color: match.team_a_color }}>{match.team_a}</span>
          <span className="text-[#2b506f] mx-3">vs</span>
          <span style={{ color: match.team_b_color }}>{match.team_b}</span>
        </h1>
      </div>

      {/* Set / match point badge */}
      {(setPoint || matchPoint) && !ended && (
        <div className="text-center -mb-1">
          <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
            {matchPoint ? `Match Point — ${matchPoint === 'A' ? match.team_a : match.team_b}`
                        : `Set Point — ${setPoint === 'A' ? match.team_a : match.team_b}`}
          </span>
        </div>
      )}
      {state?.deuce && !setPoint && !matchPoint && !ended && (
        <div className="text-center -mb-1">
          <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
            All Point
          </span>
        </div>
      )}

      {/* Timeout / court-change countdown */}
      {breakKind && !ended && (
        <div className="text-center mt-1">
          <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
            {breakKind === 'timeout' ? 'Timeout' : 'Court Change'}
            <span className="font-mono tabular-nums">
              {String(Math.floor(breakLeft / 60)).padStart(2, '0')}:{String(breakLeft % 60).padStart(2, '0')}
            </span>
          </span>
        </div>
      )}

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-6 px-4 py-4">
        {/* Team A score */}
        <div className="flex-1 text-center">
          <p className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5" style={{ color: match.team_a_color }}>
            <ServeBall show={serving === 'A' && active} color={match.team_a_color} /> {match.team_a}
          </p>
          <p className="text-7xl font-black leading-none tabular-nums" style={{ color: match.team_a_color }}>
            {scoreA}
          </p>
        </div>

        {/* Timer + sets */}
        <div className="text-center flex-shrink-0">
          <div className={`text-3xl font-black font-mono tabular-nums ${running ? 'text-[#22c55e]' : 'text-[#2b506f]'}`}>
            {fmt(timer)}
          </div>
          <div className="mt-1 text-xs font-bold text-[#5a86ae]">
            Set {Math.min(setNumber, 3)} · <span className="tabular-nums">{setsA}–{setsB}</span>
          </div>
        </div>

        {/* Team B score */}
        <div className="flex-1 text-center">
          <p className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5" style={{ color: match.team_b_color }}>
            {match.team_b} <ServeBall show={serving === 'B' && active} color={match.team_b_color} />
          </p>
          <p className="text-7xl font-black leading-none tabular-nums" style={{ color: match.team_b_color }}>
            {scoreB}
          </p>
        </div>
      </div>

      {/* Error feedback */}
      {fireError && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 text-sm text-center font-medium">
          {fireError}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-[#1e3450] mx-4" />

      {/* Score buttons — rally scoring: one point per rally */}
      {active && !ended && (
        <div className="flex gap-3 px-4 mt-4">
          <div className="flex-1">
            <ScoreBtn label="+1" color={match.team_a_color}
              loading={loading === 'a1'}
              onClick={() => fire('a1', 'score_update', { team: 'A', points: 1 })} />
          </div>
          <div className="w-px bg-[#1e3450] self-stretch" />
          <div className="flex-1">
            <ScoreBtn label="+1" color={match.team_b_color}
              loading={loading === 'b1'}
              onClick={() => fire('b1', 'score_update', { team: 'B', points: 1 })} />
          </div>
        </div>
      )}

      {/* Remove last point */}
      {active && !ended && (
        <div className="flex gap-3 px-4 mt-2">
          <button
            onClick={() => fire('rem_a', 'score_remove', { team: 'A', points: 1 })}
            disabled={!!loading || scoreA === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold text-[#3d6a91] border border-[#1e3450] hover:border-[#2b506f] disabled:opacity-30 transition-all active:scale-95"
          >
            <Minus size={14} /> {match.team_a}
          </button>
          <button
            onClick={() => fire('rem_b', 'score_remove', { team: 'B', points: 1 })}
            disabled={!!loading || scoreB === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold text-[#3d6a91] border border-[#1e3450] hover:border-[#2b506f] disabled:opacity-30 transition-all active:scale-95"
          >
            <Minus size={14} /> {match.team_b}
          </button>
        </div>
      )}

      {/* Match controls */}
      <div className="px-4 mt-4 space-y-2">

        {/* Timer controls — only when active (not timeout) */}
        {status === 'active' && (
          <button
            onClick={() => fire('timer', running ? 'timer_pause' : 'timer_start')}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: running ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
              border: `2px solid ${running ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`,
              color: running ? '#ef4444' : '#22c55e',
            }}
          >
            {loading === 'timer'
              ? <Loader size={18} className="animate-spin" />
              : running
                ? <><PauseCircle size={20} /> Pause Timer</>
                : timer === 0
                  ? <><Play size={20} /> Start Timer</>
                  : <><Timer size={20} /> Resume Timer</>}
          </button>
        )}

        {/* First server (toss) — pick who serves before the match starts */}
        {pending && (
          <div>
            <p className="text-xs text-[#3d6a91] font-semibold uppercase tracking-wider mb-1.5 text-center">First serve</p>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((team) => {
                const color = team === 'A' ? match.team_a_color : match.team_b_color
                const name  = team === 'A' ? match.team_a : match.team_b
                const sel   = serving === team
                return (
                  <button key={team}
                    onClick={() => fire(`serve_${team}`, 'serve_set', { team })}
                    disabled={!!loading}
                    className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      backgroundColor: sel ? `${color}22` : 'transparent',
                      border: `2px solid ${sel ? color : '#1e3450'}`,
                      color: sel ? color : '#3d6a91',
                    }}>
                    <ServeBall show={sel} /> {name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Start match */}
        {pending && (
          <button
            onClick={() => fire('start', 'match_start')}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 py-5 rounded-2xl text-lg font-black transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(34,197,94,0.15)',
              border: '2px solid rgba(34,197,94,0.4)',
              color: '#22c55e',
            }}
          >
            {loading === 'start'
              ? <Loader size={20} className="animate-spin" />
              : <><Play size={20} /> Start Match</>}
          </button>
        )}

        {/* Timeout controls */}
        {status === 'active' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => fire('to_a', 'timeout_start', { team: 'A', duration: 60, reason: '' })}
              disabled={!!loading}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: `${match.team_a_color}12`,
                border: `2px solid ${match.team_a_color}35`,
                color: match.team_a_color,
              }}
            >
              <Clock size={16} /> T/O {match.team_a}
            </button>
            <button
              onClick={() => fire('to_b', 'timeout_start', { team: 'B', duration: 60, reason: '' })}
              disabled={!!loading}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: `${match.team_b_color}12`,
                border: `2px solid ${match.team_b_color}35`,
                color: match.team_b_color,
              }}
            >
              <Clock size={16} /> T/O {match.team_b}
            </button>
          </div>
        )}

        {/* Substitution button */}
        {status === 'active' && (
          <button
            onClick={() => setSubOpen(true)}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold text-purple-400 transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(192,132,252,0.12)',
              border: '2px solid rgba(192,132,252,0.35)',
            }}
          >
            <ArrowDownUp size={18} /> Substitution
          </button>
        )}

        {/* End timeout */}
        {status === 'timeout' && (
          <button
            onClick={() => fire('end_to', 'timeout_end')}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold text-[#f59e0b] transition-all active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '2px solid rgba(245,158,11,0.35)' }}
          >
            {loading === 'end_to' ? <Loader size={18} className="animate-spin" /> : <><Timer size={18} /> End Timeout</>}
          </button>
        )}

        {/* End match */}
        {active && (
          <button
            onClick={() => setWinnerModalOpen(true)}
            disabled={!!loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold text-[#6b7280] transition-all active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: 'rgba(107,114,128,0.08)', border: '2px solid rgba(107,114,128,0.2)' }}
          >
            {loading === 'end' ? <Loader size={18} className="animate-spin" /> : <><Square size={16} /> End Match</>}
          </button>
        )}

        {ended && (
          <div className="text-center py-6 text-[#3d6a91] font-semibold">
            Match has ended
          </div>
        )}
      </div>

      {/* Disconnect */}
      <div className="px-4 mt-auto pt-6 pb-8">
        <button
          onClick={onDisconnect}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-[#3d6a91] border border-[#1e3450] hover:border-[#2b506f] transition-all"
        >
          Disconnect
        </button>
      </div>
      <SubstitutionModal
        open={subOpen}
        onClose={() => { setSubOpen(false); refresh() }}
        matchId={match.id}
        teamA={match.team_a}
        teamB={match.team_b}
        token={token}
      />
      <Modal
        open={winnerModalOpen}
        onClose={() => setWinnerModalOpen(false)}
        title="Select Winner"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-dark-300">
            Please choose the winner of this match. This will finalize the scores and show the winner on the display screen.
          </p>
          <div className="grid grid-cols-1 gap-2.5">
            <button
              onClick={() => {
                setWinnerModalOpen(false)
                fire('end', 'match_end', { winner: 'A' })
              }}
              className="w-full py-3.5 px-4 rounded-xl border border-dark-600 hover:border-emerald-500 bg-[#0f2035] hover:bg-emerald-900/10 font-bold transition-all text-left flex items-center justify-between"
              style={{ color: match.team_a_color }}
            >
              <span>{match.team_a}</span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-black font-score">Score: {scoreA}</span>
            </button>
            <button
              onClick={() => {
                setWinnerModalOpen(false)
                fire('end', 'match_end', { winner: 'B' })
              }}
              className="w-full py-3.5 px-4 rounded-xl border border-dark-600 hover:border-emerald-500 bg-[#0f2035] hover:bg-emerald-900/10 font-bold transition-all text-left flex items-center justify-between"
              style={{ color: match.team_b_color }}
            >
              <span>{match.team_b}</span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-black font-score">Score: {scoreB}</span>
            </button>
            <button
              onClick={() => {
                setWinnerModalOpen(false)
                fire('end', 'match_end', { winner: 'draw' })
              }}
              className="w-full py-3.5 px-4 rounded-xl border border-[#1e3450] hover:border-dark-400 bg-[#0a1828] hover:bg-dark-700/50 font-bold text-white transition-all text-left flex items-center justify-between"
            >
              <span>Tie / Draw</span>
              <span className="text-xs bg-dark-750 text-dark-400 px-2 py-0.5 rounded">Scores Equal</span>
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setWinnerModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-dark-300 hover:bg-dark-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function Connect() {
  const [code, setCode]             = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [step, setStep]             = useState<'form' | 'connecting' | 'connected' | 'error'>('form')
  const [match, setMatch]           = useState<Match | null>(null)
  const [token, setToken]           = useState('')
  const [error, setError]           = useState('')

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('scorer_token')
    const savedMatch = localStorage.getItem('scorer_match')
    if (savedToken && savedMatch) {
      try {
        setToken(savedToken)
        setMatch(JSON.parse(savedMatch))
        setStep('connected')
      } catch {
        localStorage.removeItem('scorer_token')
        localStorage.removeItem('scorer_match')
      }
    }
  }, [])

  const handleConnect = async (codeOverride?: string) => {
    const c = codeOverride ?? code
    if (c.length < 4) { setError('Enter a valid match code'); return }
    setError(''); setStep('connecting')
    try {
      const res = await fetch(`${API_BASE}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_code: c.trim(), device_name: deviceName || 'Scorer Device' }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Invalid match code')
      }
      const data: { token: string; match: Match } = await res.json()
      localStorage.setItem('scorer_token', data.token)
      localStorage.setItem('scorer_match', JSON.stringify(data.match))
      setMatch(data.match)
      setToken(data.token)
      setStep('connected')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setStep('error')
    }
  }

  const handleDisconnect = () => {
    scoreboardWS.disconnect()
    localStorage.removeItem('scorer_token')
    localStorage.removeItem('scorer_match')
    setStep('form'); setMatch(null); setToken(''); setCode('')
  }

  if (step === 'connected' && match && token) {
    return <ScorerPanel match={match} token={token} onDisconnect={handleDisconnect} />
  }

  return (
    <div className="min-h-screen bg-[#060e1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 mb-4">
            <Wifi size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black text-white">Connect to Match</h1>
          <p className="text-[#5a86ae] mt-1 text-sm">Enter the 4-digit match code shown on the scoreboard</p>
        </div>

        <div className="bg-[#0a1828] border border-[#1e3450] rounded-2xl p-8 shadow-2xl">

          {(step === 'form' || step === 'error') && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[#a6c1db] mb-1.5">Match Code</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setCode(v)
                    if (v.length === 4) setTimeout(() => handleConnect(v), 80)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && handleConnect(code)}
                  placeholder="8629"
                  className="w-full px-4 py-4 bg-[#0f2035] border border-[#1e3450] rounded-xl text-center
                             text-3xl font-black tracking-[0.3em] text-white
                             placeholder-[#2b506f] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#a6c1db] mb-1.5">
                  Device Name <span className="text-[#2b506f]">(optional)</span>
                </label>
                <input
                  type="text" value={deviceName} onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Court 1 Scorer"
                  className="w-full px-4 py-2.5 bg-[#0f2035] border border-[#1e3450] rounded-xl text-[#e2edf7]
                             placeholder-[#2b506f] focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0" /> {error}
                </div>
              )}
              <button
                onClick={() => handleConnect()} disabled={code.length < 4}
                className="w-full py-4 rounded-xl text-base font-black text-white disabled:opacity-40 transition-all active:scale-95"
                style={{ backgroundColor: '#22c55e', boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}
              >
                Connect
              </button>
            </div>
          )}

          {step === 'connecting' && (
            <div className="text-center py-6 space-y-4">
              <Loader size={40} className="mx-auto text-emerald-400 animate-spin" />
              <p className="text-[#80a5c8] font-medium">Connecting to match…</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[#1f3d5a] mt-6">Ask your administrator for the match code</p>
      </div>
    </div>
  )
}
