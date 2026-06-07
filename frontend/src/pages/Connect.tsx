import { useState, useEffect, useCallback } from 'react'
import { Trophy, Wifi, CheckCircle, AlertCircle, Loader, Plus, Minus,
         Play, Square, Timer, PauseCircle, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { scoreboardWS } from '@/services/websocket'
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
    throw new Error(d.error ?? `HTTP ${r.status}`)
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

// ── Score button ────────────────────────────────────────────────────────────
function ScoreBtn({ label, color, onClick, loading }: {
  label: string; color: string; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center justify-center rounded-2xl text-xl font-black transition-all active:scale-95 disabled:opacity-50 select-none"
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
function ScorerPanel({ match: initialMatch, token, onDisconnect }: {
  match: Match; token: string; onDisconnect: () => void
}) {
  const [match, setMatch]   = useState(initialMatch)
  const [state, setState]   = useState<MatchState | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [fireError, setFireError] = useState('')
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting')
  const [timer, setTimer]   = useState(0)

  // Fetch initial state
  const refresh = useCallback(async () => {
    try {
      const d = await deviceFetch(`${API_BASE}/matches/${match.id}`, token)
      setMatch(d.match); setState(d.state)
      setTimer(d.state.timer_seconds ?? 0)
    } catch {}
  }, [match.id, token])

  useEffect(() => { refresh() }, [refresh])

  // WebSocket live updates
  useEffect(() => {
    const wsURL = `${WS_BASE}/ws/match/${match.id}?token=${encodeURIComponent(token)}`
    scoreboardWS.connect(wsURL, setWsStatus)

    const unsub = scoreboardWS.subscribe((_msg: WSMessage) => {
      // Re-fetch state on any WS event so scores, timer, and status stay in sync
      refresh()
    })
    return unsub
  }, [match.id, token, refresh])

  // Local timer tick when running
  useEffect(() => {
    if (!state?.timer_running) return
    const id = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [state?.timer_running])

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

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-6 px-4 py-4">
        {/* Team A score */}
        <div className="flex-1 text-center">
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: match.team_a_color }}>
            {match.team_a}
          </p>
          <p className="text-7xl font-black leading-none tabular-nums" style={{ color: match.team_a_color }}>
            {scoreA}
          </p>
        </div>

        {/* Timer */}
        <div className="text-center flex-shrink-0">
          <div className={`text-3xl font-black font-mono tabular-nums ${running ? 'text-[#22c55e]' : 'text-[#2b506f]'}`}>
            {fmt(timer)}
          </div>
        </div>

        {/* Team B score */}
        <div className="flex-1 text-center">
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: match.team_b_color }}>
            {match.team_b}
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

      {/* Score buttons — only when active */}
      {active && !ended && (
        <div className="flex gap-3 px-4 mt-4">
          {/* Team A buttons */}
          <div className="flex-1 grid grid-cols-3 gap-2">
            {[1, 2, 3].map(pts => (
              <ScoreBtn key={pts} label={`+${pts}`} color={match.team_a_color}
                loading={loading === `a${pts}`}
                onClick={() => fire(`a${pts}`, 'score_update', { team: 'A', points: pts })} />
            ))}
          </div>

          {/* Center divider */}
          <div className="w-px bg-[#1e3450] self-stretch" />

          {/* Team B buttons */}
          <div className="flex-1 grid grid-cols-3 gap-2">
            {[1, 2, 3].map(pts => (
              <ScoreBtn key={pts} label={`+${pts}`} color={match.team_b_color}
                loading={loading === `b${pts}`}
                onClick={() => fire(`b${pts}`, 'score_update', { team: 'B', points: pts })} />
            ))}
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
                : <><Timer size={20} /> Start Timer</>}
          </button>
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
            onClick={() => fire('end', 'match_end')}
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
    </div>
  )
}

// ── Connect form ────────────────────────────────────────────────────────────
export default function Connect() {
  const [code, setCode]             = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [step, setStep]             = useState<'form' | 'connecting' | 'connected' | 'error'>('form')
  const [match, setMatch]           = useState<Match | null>(null)
  const [token, setToken]           = useState('')
  const [error, setError]           = useState('')

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
