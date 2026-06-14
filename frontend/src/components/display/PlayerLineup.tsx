import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import type { Match, Player } from '@/types'
import { User } from 'lucide-react'
import { AnimatedPlayerPhoto } from '@/components/display/AnimatedPlayerPhoto'

interface Props {
  match: Match
  players: Player[]
  onDone?: () => void
}

function PlayerCard({ player, color, side }: { player: Player; color: string; side: 'left' | 'right' }) {
  return (
    <div className={`flex items-center gap-3 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      {/* Photo or avatar */}
      {player.photo_url ? (
        <AnimatedPlayerPhoto
          src={player.photo_url}
          alt={player.name}
          accent={color}
          size="sm"
          className="data-player-photo-frame flex-shrink-0"
          imageClassName="data-player-photo-img"
        />
      ) : (
        <div
          className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex-shrink-0 overflow-hidden border-2 flex items-center justify-center"
          data-player-photo-frame
          style={{ borderColor: color + '60', backgroundColor: color + '15' }}
        >
          <User size={24} style={{ color }} />
        </div>
      )}
      <div className={side === 'right' ? 'text-right' : 'text-left'}>
        <p className="font-bold text-white text-sm sm:text-base leading-tight">{player.name}</p>
        <div className="flex items-center gap-1.5" style={{ justifyContent: side === 'right' ? 'flex-end' : 'flex-start' }}>
          <span className="text-xs font-mono font-bold" style={{ color }}>#{player.jersey_number}</span>
          {player.status === 'sub' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-dark-700 text-dark-400 font-medium">SUB</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function PlayerLineup({ match, players, onDone }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const tourRef       = useRef<HTMLDivElement>(null)
  const teamARef      = useRef<HTMLDivElement>(null)
  const teamBRef      = useRef<HTMLDivElement>(null)
  const vsRef         = useRef<HTMLDivElement>(null)
  const playersARef   = useRef<HTMLDivElement>(null)
  const playersBRef   = useRef<HTMLDivElement>(null)

  const [maskFrame, setMaskFrame] = useState<number | null>(null)

  const playersA = players.filter((p) => p.team === 'A')
  const playersB = players.filter((p) => p.team === 'B')

  useEffect(() => {
    if (!containerRef.current) return

    const tl = gsap.timeline({ onComplete: onDone })
    const maskObj = { frame: 0 }
    setMaskFrame(0)

    // Entrance
    tl.set(containerRef.current, { opacity: 1 })
      .to(maskObj, {
        frame: 29,
        duration: 0.7,
        ease: 'steps(29)',
        onUpdate: () => setMaskFrame(Math.round(maskObj.frame)),
        onComplete: () => setMaskFrame(null),
      })
      // Tournament title
      .fromTo(tourRef.current,
        { y: -40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
        '-=0.45'
      )
      // Team A name slides from left
      .fromTo(teamARef.current,
        { x: -120, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        '-=0.2'
      )
      // Team B name slides from right
      .fromTo(teamBRef.current,
        { x: 120, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        '-=0.5'
      )
      // VS badge pops in
      .fromTo(vsRef.current,
        { scale: 0, rotation: -15, opacity: 0 },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)' },
        '-=0.3'
      )
      // Player cards stagger in
      .fromTo('.player-card-a',
        { x: -60, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out', stagger: 0.08 },
        '-=0.1'
      )
      .fromTo('.player-card-b',
        { x: 60, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out', stagger: 0.08 },
        '<'
      )
      // Hold
      .to({}, { duration: 4.2 })
      // Spotlight pulse on VS
      .to(vsRef.current, {
        scale: 1.2, textShadow: '0 0 60px rgba(99,102,241,0.9)',
        duration: 0.3, yoyo: true, repeat: 1,
      })
      // Exit — wipe entire screen away
      .call(() => {
        maskObj.frame = 29
        setMaskFrame(29)
      })
      .to(maskObj, {
        frame: 0,
        duration: 0.65,
        ease: 'steps(29)',
        onUpdate: () => setMaskFrame(Math.round(maskObj.frame)),
      }, '+=0.2')
      .to(containerRef.current,
        { opacity: 0, duration: 0.2 }
      )

    return () => { tl.kill() }
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ 
        opacity: 0, 
        background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)',
        mask: maskFrame !== null ? 'url(#lineup-circle-reveal-mask)' : 'none',
        WebkitMask: maskFrame !== null ? 'url(#lineup-circle-reveal-mask)' : 'none'
      }}
    >
      {/* Background team glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1/2 opacity-20"
          style={{ background: `linear-gradient(to right, ${match.team_a_color}40, transparent)` }} />
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-20"
          style={{ background: `linear-gradient(to left, ${match.team_b_color}40, transparent)` }} />
      </div>

      {/* Tournament name */}
      <div ref={tourRef} className="absolute top-8 text-center">
        {match.tournament_name && (
          <p className="text-dark-500 text-sm uppercase tracking-widest font-medium">{match.tournament_name}</p>
        )}
        {match.court_name && (
          <p className="text-dark-400 text-base uppercase tracking-wider font-bold">{match.court_name}</p>
        )}
      </div>

      {/* Main layout */}
      <div className="relative w-full max-w-5xl mx-auto px-6 flex items-start justify-between gap-4">
        {/* Team A */}
        <div className="flex-1 space-y-4">
          <div ref={teamARef} className="text-left">
            {match.team_a_logo && (
              <img src={match.team_a_logo} alt="" className="h-16 w-16 object-contain rounded-xl mb-2"
                onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
            <h2 className="text-4xl sm:text-6xl font-black uppercase leading-none"
              style={{ color: match.team_a_color, textShadow: `0 0 40px ${match.team_a_color}50` }}>
              {match.team_a}
            </h2>
          </div>
          <div ref={playersARef} className="space-y-2">
            {playersA.map((p) => (
              <div key={p.id} className="player-card-a">
                <PlayerCard player={p} color={match.team_a_color} side="left" />
              </div>
            ))}
          </div>
        </div>

        {/* VS center */}
        <div ref={vsRef} className="flex-shrink-0 flex flex-col items-center pt-6 gap-3">
          <div className="text-3xl sm:text-5xl font-black text-brand-500 px-4 py-2 border-2 border-brand-500/30 rounded-2xl bg-brand-900/20 backdrop-blur-sm">
            VS
          </div>
        </div>

        {/* Team B */}
        <div className="flex-1 space-y-4">
          <div ref={teamBRef} className="text-right">
            {match.team_b_logo && (
              <img src={match.team_b_logo} alt="" className="h-16 w-16 object-contain rounded-xl mb-2 ml-auto"
                onError={(e) => (e.currentTarget.style.display = 'none')} />
            )}
            <h2 className="text-4xl sm:text-6xl font-black uppercase leading-none text-right"
              style={{ color: match.team_b_color, textShadow: `0 0 40px ${match.team_b_color}50` }}>
              {match.team_b}
            </h2>
          </div>
          <div ref={playersBRef} className="space-y-2">
            {playersB.map((p) => (
              <div key={p.id} className="player-card-b">
                <PlayerCard player={p} color={match.team_b_color} side="right" />
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* SVG Mask Definition */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <mask id="lineup-circle-reveal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <image
              href="/liquidMask2.svg"
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
