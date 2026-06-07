import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { clsx } from 'clsx'
import type { Match, MatchState } from '@/types'

interface Props {
  match: Match
  state: MatchState
  compact?: boolean
}

function useScoreAnimation(score: number, ref: React.RefObject<HTMLDivElement | null>) {
  const prevScore = useRef(score)
  useEffect(() => {
    if (score !== prevScore.current && ref.current) {
      gsap.killTweensOf(ref.current)
      gsap.timeline()
        .to(ref.current, { scale: 1.5, duration: 0.15, ease: 'power2.out',
          textShadow: '0 0 60px currentColor' })
        .to(ref.current, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)',
          textShadow: '0 0 20px currentColor' })
      prevScore.current = score
    }
  }, [score])
}

export function ScoreBoard({ match, state, compact = false }: Props) {
  const scoreARef = useRef<HTMLDivElement>(null)
  const scoreBRef = useRef<HTMLDivElement>(null)

  useScoreAnimation(state.score_a, scoreARef)
  useScoreAnimation(state.score_b, scoreBRef)

  const statusLabel = ({
    pending:   'NOT STARTED',
    active:    'LIVE',
    paused:    'PAUSED',
    timeout:   'TIMEOUT',
    completed: 'FINAL',
    cancelled: 'CANCELLED',
  } as Record<string,string>)[match.status] ?? match.status.toUpperCase()

  const statusColor = ({
    active:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    timeout:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
    completed: 'text-dark-400 bg-dark-700 border-dark-600',
    pending:   'text-dark-400 bg-dark-700 border-dark-600',
    paused:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    cancelled: 'text-red-400 bg-red-400/10 border-red-400/20',
  } as Record<string,string>)[match.status] ?? 'text-dark-400'

  return (
    <div className={clsx(
      'w-full bg-dark-900 rounded-2xl overflow-hidden border border-dark-700',
      compact ? 'p-4' : 'p-6',
    )}>
      {/* Tournament / Court header */}
      <div className="text-center mb-4">
        {match.tournament_name && (
          <p className={clsx('text-dark-500 font-medium uppercase tracking-widest', compact ? 'text-xs' : 'text-sm')}>
            {match.tournament_name}
          </p>
        )}
        {match.court_name && (
          <p className={clsx('text-dark-400 font-bold uppercase tracking-wider', compact ? 'text-sm' : 'text-base')}>
            {match.court_name}
          </p>
        )}
      </div>

      {/* Scores */}
      <div className="flex items-stretch gap-4">
        {/* Team A */}
        <TeamScore
          name={match.team_a}
          score={state.score_a}
          color={match.team_a_color}
          scoreRef={scoreARef}
          compact={compact}
          align="right"
        />

        {/* Center divider */}
        <div className="flex flex-col items-center justify-center gap-2 px-2">
          <span className={clsx(
            'px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-widest',
            statusColor,
          )}>
            {statusLabel}
          </span>
          <span className={clsx('font-black text-dark-700', compact ? 'text-3xl' : 'text-5xl')}>:</span>
        </div>

        {/* Team B */}
        <TeamScore
          name={match.team_b}
          score={state.score_b}
          color={match.team_b_color}
          scoreRef={scoreBRef}
          compact={compact}
          align="left"
        />
      </div>

      {/* Timer */}
      {!compact && (
        <div className="mt-4 text-center">
          <TimerDisplay seconds={state.timer_seconds} running={state.timer_running} />
        </div>
      )}
    </div>
  )
}

function TeamScore({
  name, score, color, scoreRef, compact, align,
}: {
  name: string
  score: number
  color: string
  scoreRef: React.RefObject<HTMLDivElement | null>
  compact: boolean
  align: 'left' | 'right'
}) {
  return (
    <div className={clsx('flex-1 flex flex-col', align === 'right' ? 'items-end' : 'items-start')}>
      <p
        className={clsx(
          'font-bold uppercase tracking-wide truncate max-w-full',
          compact ? 'text-sm text-dark-300' : 'text-base text-dark-200',
        )}
        style={{ color }}
      >
        {name}
      </p>
      <div
        ref={scoreRef}
        className={clsx(
          'font-black font-score tabular-nums leading-none',
          compact ? 'text-6xl' : 'text-9xl',
        )}
        style={{ color, textShadow: `0 0 40px ${color}30` }}
      >
        {score}
      </div>
    </div>
  )
}

function TimerDisplay({ seconds, running }: { seconds: number; running: boolean }) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
  const secs = (seconds % 60).toString().padStart(2, '0')
  return (
    <div className={clsx(
      'inline-flex items-center gap-2 px-4 py-2 rounded-xl border',
      running
        ? 'border-emerald-500/30 bg-emerald-900/10 text-emerald-400'
        : 'border-dark-700 bg-dark-800 text-dark-500',
    )}>
      <span className="text-2xl font-mono font-bold tabular-nums">
        {mins}:{secs}
      </span>
      {running && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />}
    </div>
  )
}
