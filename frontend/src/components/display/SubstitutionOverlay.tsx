import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { SubstitutionPayload, Match } from '@/types'

interface Props {
  payload: SubstitutionPayload
  match: Match
  onDone?: () => void
}

// Full-screen substitution takeover — plays ~4s, then fades back to the match.
export function SubstitutionOverlay({ payload, match, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onDoneRef = useRef(onDone); onDoneRef.current = onDone

  const teamName  = payload.team === 'A' ? match.team_a : match.team_b
  const teamColor = payload.team === 'A' ? match.team_a_color : match.team_b_color

  useEffect(() => {
    if (!rootRef.current) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => onDoneRef.current?.() })
      tl.fromTo(rootRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' })
        .fromTo('.sub-head', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, '-=0.1')
        .fromTo('.sub-out', { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, '-=0.1')
        .fromTo('.sub-arrows', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2.4)' }, '-=0.2')
        .fromTo('.sub-in', { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, '-=0.35')
        .to({}, { duration: 2.6 })
        .to(rootRef.current, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
      style={{ background: `radial-gradient(ellipse at center, ${teamColor}22 0%, rgba(2,6,17,0.97) 70%)`, backdropFilter: 'blur(6px)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 160px ${teamColor}44`, border: `6px solid ${teamColor}35` }} />

      <div className="sub-head flex flex-col items-center mb-12">
        <p className="font-black uppercase tracking-[0.4em]" style={{ color: teamColor, fontSize: 'clamp(1rem,2.4vw,2rem)' }}>{teamName}</p>
        <h1 className="font-black uppercase tracking-tight text-white leading-none" style={{ fontSize: 'clamp(3rem,9vw,8rem)' }}>Substitution</h1>
      </div>

      <div className="flex items-center justify-center gap-8 sm:gap-16">
        {/* OUT */}
        <div className="sub-out flex flex-col items-center gap-3">
          <span className="flex items-center gap-2 text-red-400 font-black uppercase tracking-widest" style={{ fontSize: 'clamp(1rem,2vw,1.6rem)' }}>
            <ArrowDown /> Out
          </span>
          <p className="font-black uppercase text-white text-center leading-none" style={{ fontSize: 'clamp(2rem,5vw,4.5rem)' }}>{payload.player_out}</p>
        </div>

        <div className="sub-arrows text-white/30 font-black" style={{ fontSize: 'clamp(2.5rem,6vw,5rem)' }}>⇄</div>

        {/* IN */}
        <div className="sub-in flex flex-col items-center gap-3">
          <span className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-widest" style={{ fontSize: 'clamp(1rem,2vw,1.6rem)' }}>
            <ArrowUp /> In
          </span>
          <p className="font-black uppercase text-white text-center leading-none flex items-center gap-3" style={{ fontSize: 'clamp(2rem,5vw,4.5rem)' }}>
            {payload.player_in}
            {payload.number > 0 && <span className="rounded-xl px-3 tabular-nums" style={{ background: teamColor, color: '#fff', fontSize: '0.6em' }}>{payload.number}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}
