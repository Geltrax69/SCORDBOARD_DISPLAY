import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ArrowDownUp } from 'lucide-react'
import type { SubstitutionPayload, Match } from '@/types'

interface Props {
  payload: SubstitutionPayload
  match: Match
  onDone?: () => void
}

export function SubstitutionOverlay({ payload, match, onDone }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  const teamName  = payload.team === 'A' ? match.team_a : match.team_b
  const teamColor = payload.team === 'A' ? match.team_a_color : match.team_b_color

  useEffect(() => {
    if (!cardRef.current) return
    const tl = gsap.timeline({ onComplete: onDone })
    tl.fromTo(
      cardRef.current,
      { y: '100%', opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
    )
    .to(cardRef.current, { y: 0, opacity: 1, duration: 3.5 })
    .to(cardRef.current, { y: '100%', opacity: 0, duration: 0.4, ease: 'power2.in' })
  }, [])

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-6 flex justify-center">
      <div
        ref={cardRef}
        className="max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl border"
        style={{
          backgroundColor: `${teamColor}15`,
          borderColor: `${teamColor}40`,
          backdropFilter: 'blur(20px)',
        }}
      >
        <div
          className="h-1 w-full"
          style={{ backgroundColor: teamColor }}
        />
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: teamColor }}>
              {teamName}
            </span>
            <span className="text-xs text-dark-500 font-medium uppercase tracking-wider">Substitution</span>
            {payload.number > 0 && (
              <span className="ml-auto text-sm font-bold text-dark-300">#{payload.number}</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Player out */}
            <div className="flex-1 text-center">
              <p className="text-xs text-red-400 font-semibold uppercase mb-1">Out</p>
              <p className="text-2xl font-bold text-white">{payload.player_out}</p>
            </div>

            <div className="flex flex-col items-center">
              <ArrowDownUp size={24} className="text-dark-400" />
            </div>

            {/* Player in */}
            <div className="flex-1 text-center">
              <p className="text-xs text-emerald-400 font-semibold uppercase mb-1">In</p>
              <p className="text-2xl font-bold text-white">{payload.player_in}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
