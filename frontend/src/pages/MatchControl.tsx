import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useMatchStore } from '@/store/matchStore'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { getMatch, listEvents, startMatch, endMatch, startTimer, pauseTimer, endTimeout, updateMatchStatus, deleteMatch, createEvent } from '@/services/api'
import { TimeoutModal } from '@/components/admin/TimeoutModal'
import { SubstitutionModal } from '@/components/admin/SubstitutionModal'
import { Modal } from '@/components/common/Modal'
import { EventHistory } from '@/components/admin/EventHistory'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Square, Timer, PauseCircle,
  AlertTriangle, ArrowDownUp, ExternalLink, Minus,
  StopCircle, Trash2, CheckCircle2, XCircle, Download,
} from 'lucide-react'
import { downloadMatchCsv } from '@/utils/matchCsv'
import { addScore, removeScore } from '@/services/api'

type BtnState = 'loading' | 'success' | 'error'

const POINTS = [1, 2, 3] as const

export default function MatchControl() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user   = useAuthStore((s) => s.user)
  const { currentMatch: m, currentState: s, events,
          setCurrentMatch, setCurrentState, setEvents } = useMatchStore()

  const [loading, setLoading]         = useState(true)
  const [timeoutOpen, setTimeoutOpen] = useState(false)
  const [subOpen, setSubOpen]         = useState(false)
  const [winnerModalOpen, setWinnerModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [btnStates, setBtnStates]     = useState<Record<string, BtnState>>({})
  const toast = useToastStore()

  useWebSocket(id)

  useEffect(() => {
    if (!id) return
    Promise.all([getMatch(id), listEvents(id)]).then(([{ match, state }, evts]) => {
      setCurrentMatch(match); setCurrentState(state); setEvents(evts); setLoading(false)
    })
    return () => { setCurrentMatch(null); setCurrentState(null); setEvents([]) }
  }, [id])

  // Auto-end a timeout once its duration elapses → match clock resumes on its own.
  useEffect(() => {
    if (!id || s?.status !== 'timeout') return
    const dur = s?.current_timeout?.duration || 60
    const t = setTimeout(() => { endTimeout(id).catch(() => {}) }, dur * 1000)
    return () => clearTimeout(t)
  }, [s?.status, s?.current_timeout?.duration, id])

  // Local clock tick — keep the timer moving between WS events (resyncs on each).
  useEffect(() => {
    if (!s?.timer_running) return
    const t = setInterval(() => {
      const cur = useMatchStore.getState().currentState
      if (cur?.timer_running) {
        useMatchStore.getState().setCurrentState({ ...cur, timer_seconds: (cur.timer_seconds ?? 0) + 1 })
      }
    }, 1000)
    return () => clearInterval(t)
  }, [s?.timer_running])

  const setBtnResult = (key: string, state: 'success' | 'error') => {
    setBtnStates(s => ({ ...s, [key]: state }))
    setTimeout(() => setBtnStates(s => { const n = { ...s }; delete n[key]; return n }), 1800)
  }

  const fire = async (
    fn: () => Promise<unknown>,
    key: string,
    toastOpts?: { loading: string; success: string; error?: string },
  ) => {
    if (btnStates[key] === 'loading') return
    setBtnStates(s => ({ ...s, [key]: 'loading' }))
    if (toastOpts) {
      try {
        await toast.promise(fn(), {
          loading: toastOpts.loading,
          success: toastOpts.success,
          error: toastOpts.error ?? 'Something went wrong',
        })
        setBtnResult(key, 'success')
      } catch {
        setBtnResult(key, 'error')
      }
    } else {
      try { await fn(); setBtnResult(key, 'success') }
      catch { setBtnResult(key, 'error') }
    }
  }

  if (loading || !m || !s) return <PageLoader />

  const isSuperAdmin = user?.role === 'super_admin'
  const isActive     = m.status === 'active'
  const isPending    = m.status === 'pending'
  const isTimeout    = m.status === 'timeout'
  const isCompleted  = m.status === 'completed'
  const canScore     = isActive || isTimeout
  const anyLoading   = Object.values(btnStates).includes('loading')

  const mins = String(Math.floor(s.timer_seconds / 60)).padStart(2, '0')
  const secs = String(s.timer_seconds % 60).padStart(2, '0')

  const statusMeta = ({
    pending:   { label: 'Pending',   bg: 'bg-timeout/10', border: 'border-timeout/20', text: 'text-timeout' },
    active:    { label: 'Live',      bg: 'bg-live/10',    border: 'border-live/20',    text: 'text-live' },
    timeout:   { label: 'Timeout',   bg: 'bg-timeout/10', border: 'border-timeout/20', text: 'text-timeout' },
    completed: { label: 'Final',     bg: 'bg-dark-800',   border: 'border-dark-750',   text: 'text-dark-500' },
    cancelled: { label: 'Cancelled', bg: 'bg-danger/10',  border: 'border-danger/20',  text: 'text-danger' },
    paused:    { label: 'Paused',    bg: 'bg-info/10',    border: 'border-info/20',    text: 'text-info' },
  } as Record<string, { label: string; bg: string; border: string; text: string }>)[m.status] ?? { label: m.status, bg: 'bg-dark-800', border: 'border-dark-750', text: 'text-dark-500' }

  const ScorePanel = ({ team, name, color, logo, score }: {
    team: 'A' | 'B'; name: string; color: string; logo: string; score: number
  }) => (
    <div className="flex-1 rounded-2xl overflow-hidden border border-dark-800"
      style={{ background: `linear-gradient(135deg, ${color}08 0%, transparent 60%)` }}>
      {/* Team header */}
      <div className="px-5 pt-5 pb-4 border-b border-dark-850 flex items-center gap-3">
        {logo ? (
          <img src={logo} alt="" className="h-8 w-8 rounded-xl object-cover flex-shrink-0"
            onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : (
          <div className="h-8 w-8 rounded-xl flex-shrink-0" style={{ backgroundColor: `${color}25` }} />
        )}
        <h3 className="font-black text-lg truncate" style={{ color }}>{name}</h3>
      </div>

      {/* Score */}
      <div className="flex items-center justify-center py-6">
        <span className="score-digit font-black tabular-nums"
          style={{ fontSize: 'clamp(64px, 10vw, 96px)', color, filter: `drop-shadow(0 0 20px ${color}50)` }}>
          {score}
        </span>
      </div>

      {/* +1 +2 +3 buttons */}
      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        {POINTS.map((pts) => {
          const key = `add-${team}-${pts}`
          const st  = btnStates[key]
          return (
            <button
              key={pts}
              disabled={!canScore || anyLoading}
              onClick={() => fire(() => addScore(id!, team, pts), key)}
              className={clsx(
                'py-3 rounded-xl font-black text-lg transition-all active:scale-95 border',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                st === 'loading' && 'opacity-60 scale-95',
                st === 'success' && '!bg-live/20 !border-live/40 !text-live scale-105',
                st === 'error'   && '!bg-danger/20 !border-danger/40 !text-danger',
              )}
              style={!st ? { backgroundColor: `${color}18`, color, borderColor: `${color}35` } : undefined}
            >
              {st === 'loading'
                ? <svg className="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                : st === 'success' ? <CheckCircle2 size={18} className="mx-auto" />
                : st === 'error'   ? <XCircle size={18} className="mx-auto" />
                : `+${pts}`}
            </button>
          )
        })}
      </div>

      {/* -1 remove */}
      <div className="px-4 pb-4">
        {(() => {
          const key = `rem-${team}`
          const st  = btnStates[key]
          return (
            <button
              disabled={!canScore || score === 0 || anyLoading}
              onClick={() => fire(() => removeScore(id!, team, 1), key)}
              className={clsx(
                'w-full py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-20',
                'flex items-center justify-center gap-1.5 border',
                st === 'success' ? 'text-live bg-live/10 border-live/20'
                : st === 'error' ? 'text-danger bg-danger/10 border-danger/20'
                : 'text-dark-600 hover:text-danger hover:bg-danger/10 border-transparent hover:border-danger/20',
              )}
            >
              {st === 'loading'
                ? <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                : st === 'success' ? <><CheckCircle2 size={12} /> Removed</>
                : st === 'error'   ? <><XCircle size={12} /> Failed</>
                : <><Minus size={12} /> Remove point</>}
            </button>
          )
        })()}
      </div>
    </div>
  )

  const ControlBtn = ({ icon, label, variant = 'secondary', onClick, disabled = false, btnKey }: {
    icon: React.ReactNode; label: string; variant?: 'primary' | 'secondary' | 'danger' | 'success'
    onClick: () => void; disabled?: boolean; btnKey: string
  }) => {
    const st = btnStates[btnKey]

    const effectiveVariant = st === 'success' ? 'success' : st === 'error' ? 'danger' : variant
    const styles = {
      primary:   'bg-brand-600 hover:bg-brand-500 text-white border-brand-600',
      secondary: 'bg-dark-800 hover:bg-dark-750 text-dark-200 border-dark-700',
      danger:    'bg-danger/10 hover:bg-danger/20 text-danger border-danger/30',
      success:   'bg-live/10 hover:bg-live/20 text-live border-live/30',
    }[effectiveVariant]

    const displayIcon = st === 'loading'
      ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
      : st === 'success' ? <CheckCircle2 size={15} />
      : st === 'error'   ? <XCircle size={15} />
      : icon

    const displayLabel = st === 'success' ? 'Done!' : st === 'error' ? 'Failed' : label

    return (
      <button onClick={onClick} disabled={disabled || st === 'loading'}
        className={clsx(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
          st === 'success' && 'scale-105',
          styles,
        )}>
        {displayIcon}
        {displayLabel}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Hero header with team colors */}
      <div className="relative overflow-hidden border-b border-dark-850">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-0 inset-y-0 w-1/3 opacity-10"
            style={{ background: `linear-gradient(to right, ${m.team_a_color}, transparent)` }} />
          <div className="absolute right-0 inset-y-0 w-1/3 opacity-10"
            style={{ background: `linear-gradient(to left, ${m.team_b_color}, transparent)` }} />
        </div>

        <div className="relative px-6 py-5 max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/"
              className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-dark-100 transition-colors">
              <ArrowLeft size={15} /> Dashboard
            </Link>
            <div className="h-4 w-px bg-dark-800" />
            <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border', statusMeta.bg, statusMeta.border, statusMeta.text)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', m.status === 'active' ? 'bg-live animate-pulse' : 'bg-current')} />
              {statusMeta.label}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <a href={`/display?match=${id}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-dark-400 hover:text-dark-100 border border-dark-750 hover:border-dark-600 transition-all">
                <ExternalLink size={12} /> Display
              </a>
            </div>
          </div>

          {/* Match title */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                {m.tournament_name && <p className="text-xs text-dark-600 uppercase tracking-wider">{m.tournament_name}</p>}
                {m.court_name && <p className="text-sm text-dark-400 font-medium">{m.court_name}</p>}
              </div>
            </div>
            {/* Score summary — current points while live, sets won when finished */}
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black" style={{ color: m.team_a_color }}>{m.team_a}</span>
              <div className="flex items-baseline gap-2 px-4">
                <span className="text-5xl font-black text-white tabular-nums score-digit">{isCompleted ? s.sets_a : s.score_a}</span>
                <span className="text-dark-700 text-2xl">–</span>
                <span className="text-5xl font-black text-white tabular-nums score-digit">{isCompleted ? s.sets_b : s.score_b}</span>
              </div>
              <span className="text-2xl font-black" style={{ color: m.team_b_color }}>{m.team_b}</span>
              {isCompleted && <span className="text-xs font-bold uppercase tracking-widest text-dark-500 ml-1">sets</span>}
            </div>
            {/* Timer */}
            <div className={clsx(
              'font-mono text-2xl font-black tabular-nums px-5 py-2.5 rounded-xl border',
              s.timer_running ? 'text-live bg-live/10 border-live/20' : 'text-dark-700 bg-dark-900 border-dark-800',
            )}>
              {mins}:{secs}
              {s.timer_running && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-live animate-pulse" />}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
        {/* Score panels */}
        {!isCompleted && (
          <div className="flex gap-4 items-stretch">
            <ScorePanel team="A" name={m.team_a} color={m.team_a_color} logo={m.team_a_logo} score={s.score_a} />
            <div className="w-px bg-dark-850 self-stretch" />
            <ScorePanel team="B" name={m.team_b} color={m.team_b_color} logo={m.team_b_logo} score={s.score_b} />
          </div>
        )}

        {/* Match controls */}
        <div className="card-hi p-5">
          <p className="text-xs font-bold text-dark-600 uppercase tracking-widest mb-4">Match Controls</p>
          <div className="flex flex-wrap gap-2">
            {isPending && (
              <ControlBtn variant="success" icon={<Play size={15} />} label="Start Match" btnKey="start"
                onClick={() => fire(() => startMatch(id!), 'start', { loading: 'Starting match…', success: 'Match started!' })} />
            )}
            {(isActive || isTimeout) && isSuperAdmin && (
              <ControlBtn variant="danger" icon={<Square size={15} />} label="End Match" btnKey="end"
                onClick={() => setWinnerModalOpen(true)} />
            )}
            {isActive && !s.timer_running && (
              <ControlBtn variant="secondary" icon={<Timer size={15} />} label="Start Timer" btnKey="timer-start"
                onClick={() => fire(() => startTimer(id!), 'timer-start', { loading: 'Starting timer…', success: 'Timer running' })} />
            )}
            {isActive && s.timer_running && (
              <ControlBtn variant="secondary" icon={<PauseCircle size={15} />} label="Pause Timer" btnKey="timer-pause"
                onClick={() => fire(() => pauseTimer(id!), 'timer-pause', { loading: 'Pausing timer…', success: 'Timer paused' })} />
            )}
            {isActive && (
              <>
                <ControlBtn variant="secondary" icon={<AlertTriangle size={15} />} label="Timeout" btnKey="timeout-open"
                  onClick={() => setTimeoutOpen(true)} />
                <ControlBtn variant="secondary" icon={<ArrowDownUp size={15} />} label="Substitution" btnKey="sub-open"
                  onClick={() => setSubOpen(true)} />
              </>
            )}
            {isTimeout && (
              <ControlBtn variant="success" icon={<Play size={15} />} label="End Timeout" btnKey="end-timeout"
                onClick={() => fire(() => endTimeout(id!), 'end-timeout', { loading: 'Ending timeout…', success: 'Timeout ended' })} />
            )}

            {/* Divider + danger zone */}
            {isSuperAdmin && !isCompleted && (
              <div className="flex items-center gap-2 ml-auto">
                <div className="h-5 w-px bg-dark-800" />
                <ControlBtn variant="danger" icon={<StopCircle size={15} />} label="Stop Match" btnKey="stop"
                  onClick={() => fire(() => updateMatchStatus(id!, 'cancelled'), 'stop', { loading: 'Stopping match…', success: 'Match stopped', error: 'Could not stop match' })} />
              </div>
            )}
            {isSuperAdmin && (
              <button onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-dark-600
                           hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 transition-all">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>

          {isCompleted && (() => {
            const winner = s.winner === 'A' ? m.team_a : s.winner === 'B' ? m.team_b
              : s.sets_a > s.sets_b ? m.team_a : s.sets_b > s.sets_a ? m.team_b : null
            return (
              <div className="mt-4 px-5 py-5 rounded-2xl bg-dark-900 border border-dark-750 text-center">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-dark-500 mb-2">Match Ended</p>
                {winner
                  ? <p className="text-2xl font-black text-white">🏆 {winner} <span className="text-dark-400 font-bold">win</span></p>
                  : <p className="text-2xl font-black text-white">Match drawn</p>}
                <p className="mt-1 text-sm text-dark-400 tabular-nums">
                  Sets {s.sets_a}–{s.sets_b} · Final {s.score_a}–{s.score_b}
                </p>
              </div>
            )
          })()}
        </div>

        {/* Event history */}
        <div className="card-hi p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-dark-600 uppercase tracking-widest">Event History</p>
            <button
              onClick={() => downloadMatchCsv(m, events)}
              disabled={events.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-500/15 text-brand-200 hover:bg-brand-500/25 disabled:opacity-40 transition-all active:scale-95"
            >
              <Download size={13} /> Export CSV
            </button>
          </div>
          <EventHistory events={events} />
        </div>
      </div>

      <TimeoutModal open={timeoutOpen} onClose={() => setTimeoutOpen(false)} matchId={id!} teamA={m.team_a} teamB={m.team_b} />
      <SubstitutionModal open={subOpen} onClose={() => setSubOpen(false)} matchId={id!} teamA={m.team_a} teamB={m.team_b} />
      {m && (
        <Modal
          open={winnerModalOpen}
          onClose={() => setWinnerModalOpen(false)}
          title="Select Winner"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-dark-300">
              Choose the winner to finalize the match on the scoreboard.
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              <button
                onClick={() => {
                  setWinnerModalOpen(false)
                  fire(() => createEvent(id!, 'match_end', { winner: 'A' }), 'end', { loading: 'Ending match…', success: 'Match ended' })
                }}
                className="w-full py-3 px-4 rounded-xl border border-dark-600 hover:border-brand-500 bg-dark-750 hover:bg-brand-900/10 font-bold transition-all text-left flex items-center justify-between text-white"
              >
                <span style={{ color: m.team_a_color }}>{m.team_a}</span>
                <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded font-black font-score">Score: {s?.score_a}</span>
              </button>
              <button
                onClick={() => {
                  setWinnerModalOpen(false)
                  fire(() => createEvent(id!, 'match_end', { winner: 'B' }), 'end', { loading: 'Ending match…', success: 'Match ended' })
                }}
                className="w-full py-3 px-4 rounded-xl border border-dark-600 hover:border-brand-500 bg-dark-750 hover:bg-brand-900/10 font-bold transition-all text-left flex items-center justify-between text-white"
              >
                <span style={{ color: m.team_b_color }}>{m.team_b}</span>
                <span className="text-xs bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded font-black font-score">Score: {s?.score_b}</span>
              </button>
              <button
                onClick={() => {
                  setWinnerModalOpen(false)
                  fire(() => createEvent(id!, 'match_end', { winner: 'draw' }), 'end', { loading: 'Ending match…', success: 'Match ended' })
                }}
                className="w-full py-3 px-4 rounded-xl border border-dark-600 hover:border-dark-400 bg-dark-750 hover:bg-dark-700/50 font-bold text-white transition-all text-left flex items-center justify-between"
              >
                <span>Tie / Draw</span>
                <span className="text-xs bg-dark-800 text-dark-400 px-2 py-0.5 rounded">Scores Equal</span>
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
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-dark-900 border border-dark-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Delete this match?</h3>
            <p className="text-sm text-dark-400 mb-5">
              <strong className="text-white">{m.team_a} vs {m.team_b}</strong> — all events and player data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-dark-700 text-dark-300 text-sm font-medium hover:bg-dark-800 transition-colors">
                Cancel
              </button>
              <button
                disabled={btnStates['delete'] === 'loading'}
                onClick={async () => {
                  setBtnStates(s => ({ ...s, delete: 'loading' }))
                  try {
                    await toast.promise(deleteMatch(id!), {
                      loading: 'Deleting match…',
                      success: 'Match deleted',
                      error: 'Could not delete match',
                    })
                    navigate('/')
                  } catch {
                    setBtnResult('delete', 'error')
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-danger hover:bg-danger/90 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {btnStates['delete'] === 'loading'
                  ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                  : <Trash2 size={15} />}
                {btnStates['delete'] === 'loading' ? 'Deleting…' : 'Delete Match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
