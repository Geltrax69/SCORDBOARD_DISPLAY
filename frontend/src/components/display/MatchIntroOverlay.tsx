import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import type { Match } from '@/types'
import { Swords } from 'lucide-react'

interface Props {
  match: Match
  onDone?: () => void
}

export function MatchIntroOverlay({ match, onDone }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const teamARef   = useRef<HTMLDivElement>(null)
  const teamBRef   = useRef<HTMLDivElement>(null)
  const vsRef      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overlayRef.current) return
    const tl = gsap.timeline({ onComplete: onDone })

    tl.set(overlayRef.current, { opacity: 1 })
      .fromTo(teamARef.current,
        { x: '-100%', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' },
      )
      .fromTo(teamBRef.current,
        { x: '100%', opacity: 0 },
        { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' },
        '-=0.5',
      )
      .fromTo(vsRef.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' },
        '-=0.3',
      )
      .to({}, { duration: 2.5 })
      .to(overlayRef.current, { opacity: 0, duration: 0.6 })
  }, [])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950"
      style={{ opacity: 0 }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1/2 h-96 blur-[120px] opacity-30"
          style={{ backgroundColor: match.team_a_color }}
        />
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 h-96 blur-[120px] opacity-30"
          style={{ backgroundColor: match.team_b_color }}
        />
      </div>

      <div className="relative flex items-center gap-8 px-8">
        <div ref={teamARef} className="text-right">
          <div
            className="text-6xl md:text-8xl font-black uppercase leading-none"
            style={{ color: match.team_a_color, textShadow: `0 0 60px ${match.team_a_color}60` }}
          >
            {match.team_a}
          </div>
        </div>

        <div ref={vsRef} className="flex flex-col items-center gap-2">
          <Swords size={32} className="text-dark-500" />
          <span className="text-4xl font-black text-dark-600">VS</span>
        </div>

        <div ref={teamBRef} className="text-left">
          <div
            className="text-6xl md:text-8xl font-black uppercase leading-none"
            style={{ color: match.team_b_color, textShadow: `0 0 60px ${match.team_b_color}60` }}
          >
            {match.team_b}
          </div>
        </div>
      </div>

      {match.court_name && (
        <div className="absolute bottom-12 text-center w-full">
          <p className="text-dark-500 text-lg uppercase tracking-widest font-medium">
            {match.tournament_name && `${match.tournament_name} · `}{match.court_name}
          </p>
        </div>
      )}
    </div>
  )
}
