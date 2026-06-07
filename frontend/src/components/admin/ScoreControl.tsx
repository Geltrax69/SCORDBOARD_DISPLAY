import { useState } from 'react'
import { clsx } from 'clsx'
import { Button } from '@/components/common/Button'
import { addScore, removeScore } from '@/services/api'
import { Plus, Minus } from 'lucide-react'

interface Props {
  matchId: string
  teamA: string
  teamB: string
  teamAColor: string
  teamBColor: string
  scoreA: number
  scoreB: number
  status: string
}

const POINTS = [1, 2, 3] as const

export function ScoreControl({ matchId, teamA, teamB, teamAColor, teamBColor, scoreA, scoreB, status }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const disabled = status !== 'active'

  const fire = async (action: () => Promise<unknown>, key: string) => {
    if (loading) return
    setLoading(key)
    try { await action() } finally { setLoading(null) }
  }

  const TeamPanel = ({
    team, name, color, score,
  }: { team: 'A' | 'B'; name: string; color: string; score: number }) => (
    <div className="flex-1 rounded-2xl border border-dark-700 bg-dark-800/50 p-4 space-y-4">
      {/* Team header */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <h3 className="font-bold text-dark-100 truncate text-lg">{name}</h3>
      </div>

      {/* Score display */}
      <div
        className="text-center text-7xl font-black font-score tabular-nums py-4 rounded-xl"
        style={{ color, textShadow: `0 0 40px ${color}40` }}
      >
        {score}
      </div>

      {/* Add score buttons */}
      <div>
        <p className="text-xs text-dark-500 mb-2 font-medium uppercase tracking-wider">Add Points</p>
        <div className="grid grid-cols-3 gap-2">
          {POINTS.map((pts) => (
            <button
              key={pts}
              disabled={disabled || !!loading}
              onClick={() => fire(() => addScore(matchId, team, pts), `add-${team}-${pts}`)}
              className={clsx(
                'py-3 rounded-xl font-bold text-lg transition-all active:scale-95',
                'border-2 border-transparent disabled:opacity-40 disabled:cursor-not-allowed',
                loading === `add-${team}-${pts}` && 'opacity-60',
              )}
              style={{
                backgroundColor: `${color}20`,
                color,
                borderColor: `${color}40`,
              }}
            >
              <Plus size={12} className="inline" />
              {pts}
            </button>
          ))}
        </div>
      </div>

      {/* Remove score */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-dark-500 hover:text-red-400"
        disabled={disabled || score === 0 || !!loading}
        onClick={() => fire(() => removeScore(matchId, team, 1), `remove-${team}`)}
        icon={<Minus size={14} />}
      >
        Remove Point
      </Button>
    </div>
  )

  return (
    <div className="flex gap-4">
      <TeamPanel team="A" name={teamA} color={teamAColor} score={scoreA} />
      <div className="flex items-center">
        <span className="text-2xl font-bold text-dark-600">VS</span>
      </div>
      <TeamPanel team="B" name={teamB} color={teamBColor} score={scoreB} />
    </div>
  )
}
