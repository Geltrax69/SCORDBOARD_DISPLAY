import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import type { TimeoutPayload, Match } from '@/types'

interface Props {
  payload: TimeoutPayload
  match: Match
  onEnd?: () => void
}

export function TimeoutOverlay({ payload, match, onEnd }: Props) {
  const [remaining, setRemaining] = useState(payload.duration)
  const overlayRef = useRef<HTMLDivElement>(null)
  const countdownRef = useRef<HTMLDivElement>(null)

  // Entrance animation
  useEffect(() => {
    if (!overlayRef.current) return
    gsap.fromTo(
      overlayRef.current,
      { opacity: 0, scale: 0.95 },
      { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' },
    )
  }, [])

  // Countdown
  useEffect(() => {
    if (remaining <= 0) {
      // Exit animation
      if (overlayRef.current) {
        gsap.to(overlayRef.current, {
          opacity: 0,
          scale: 0.95,
          duration: 0.4,
          onComplete: onEnd,
        })
      }
      return
    }

    const timer = setTimeout(() => {
      setRemaining((r) => r - 1)
      if (countdownRef.current) {
        gsap.fromTo(
          countdownRef.current,
          { scale: 1.15, opacity: 0.6 },
          { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' },
        )
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [remaining, onEnd])

  const teamName = payload.team === 'A' ? match.team_a : match.team_b
  const teamColor = payload.team === 'A' ? match.team_a_color : match.team_b_color
  const pct = (remaining / payload.duration) * 100

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
  const secs = (remaining % 60).toString().padStart(2, '0')

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center"
      style={{
        background: `radial-gradient(ellipse at center, ${teamColor}20 0%, rgba(2,6,23,0.97) 70%)`,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Animated border ring */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 border-8 rounded-none"
          style={{
            borderColor: teamColor,
            opacity: 0.3,
            boxShadow: `inset 0 0 80px ${teamColor}30`,
          }}
        />
      </div>

      <div className="relative text-center space-y-6 px-8">
        {/* TIMEOUT label */}
        <div
          className="text-7xl md:text-9xl font-black uppercase tracking-widest"
          style={{ color: teamColor, textShadow: `0 0 60px ${teamColor}60` }}
        >
          TIMEOUT
        </div>

        {/* Team name */}
        <div className="text-4xl md:text-6xl font-bold text-white uppercase tracking-wider">
          {teamName}
        </div>

        {/* Reason */}
        {payload.reason && (
          <div className="text-xl text-dark-300 italic">{payload.reason}</div>
        )}

        {/* Countdown */}
        <div ref={countdownRef} className="relative">
          <div
            className="text-8xl md:text-[10rem] font-black font-mono tabular-nums"
            style={{ color: teamColor, textShadow: `0 0 80px ${teamColor}80` }}
          >
            {mins}:{secs}
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 bg-dark-800 rounded-full overflow-hidden max-w-xs mx-auto">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${pct}%`, backgroundColor: teamColor }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
