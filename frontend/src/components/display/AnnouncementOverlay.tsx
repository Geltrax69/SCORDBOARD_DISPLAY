import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Megaphone } from 'lucide-react'

interface Props {
  message: string
  duration: number
  onDone?: () => void
}

export function AnnouncementOverlay({ message, duration, onDone }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const textRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overlayRef.current || !textRef.current) return

    const tl = gsap.timeline({ onComplete: onDone })

    // Fade + zoom in
    tl.fromTo(overlayRef.current,
      { opacity: 0 },
      { opacity: 1, duration: 0.4 },
    )
    .fromTo(textRef.current,
      { scale: 0.7, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' },
      '-=0.2',
    )
    // Hold for duration
    .to({}, { duration: duration - 0.9 })
    // Fade + zoom out
    .to(textRef.current, { scale: 0.9, opacity: 0, duration: 0.3, ease: 'power2.in' })
    .to(overlayRef.current, { opacity: 0, duration: 0.3 }, '-=0.15')

    return () => { tl.kill() }
  }, [duration, onDone])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(10px)' }}
    >
      <div ref={textRef} className="text-center px-8 max-w-3xl">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-brand-900/40 border border-brand-500/30">
            <Megaphone size={40} className="text-brand-400" />
          </div>
        </div>
        <p className="text-xl text-brand-400 font-semibold uppercase tracking-widest mb-4">
          Announcement
        </p>
        <p className="text-4xl md:text-6xl font-black text-white leading-tight">
          {message}
        </p>
      </div>
    </div>
  )
}
