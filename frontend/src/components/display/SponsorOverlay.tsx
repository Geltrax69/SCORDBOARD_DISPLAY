import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

interface Props {
  title?: string
  imageUrl: string
  duration: number
  onDone?: () => void
}

const isVideo = (url: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url)

// Full-screen sponsor card. The logo eases up with a soft glow sweep, holds,
// then bows out — a clean broadcast "brought to you by" moment. If the media is
// a video, it plays full-screen to the end instead.
export function SponsorOverlay({ title, imageUrl, duration, onDone }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef    = useRef<HTMLDivElement>(null)
  const imgRef     = useRef<HTMLImageElement>(null)
  const labelRef   = useRef<HTMLParagraphElement>(null)
  const titleRef   = useRef<HTMLParagraphElement>(null)
  const sweepRef   = useRef<HTMLDivElement>(null)
  const video      = isVideo(imageUrl)

  useEffect(() => {
    if (!overlayRef.current || video) return
    const tl = gsap.timeline({ onComplete: onDone })

    tl.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4 })
      .fromTo(labelRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.1')
      .fromTo(imgRef.current,
        { opacity: 0, scale: 0.86, y: 28 },
        { opacity: 1, scale: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.1')
      .fromTo(titleRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.3')
      // glow sweep across the logo
      .fromTo(sweepRef.current,
        { xPercent: -160, opacity: 0 },
        { xPercent: 160, opacity: 1, duration: 0.9, ease: 'power2.inOut' }, '-=0.2')
      .to(sweepRef.current, { opacity: 0, duration: 0.2 }, '-=0.1')
      // gentle breathing while it holds on screen
      .to(cardRef.current, { scale: 1.03, duration: Math.max(0.6, duration - 1.8), ease: 'sine.inOut' })
      // bow out
      .to([labelRef.current, imgRef.current, titleRef.current], { opacity: 0, y: -20, duration: 0.4, stagger: 0.06, ease: 'power2.in' })
      .to(overlayRef.current, { opacity: 0, duration: 0.35 }, '-=0.2')

    return () => { tl.kill() }
  }, [duration, onDone, video])

  // Video sponsor: full-screen playback, ends when the clip ends.
  if (video) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <video
          src={imageUrl}
          autoPlay muted playsInline
          onEnded={onDone}
          onError={onDone}
          className="w-full h-full object-contain bg-black"
        />
        {title && (
          <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/90 text-2xl md:text-4xl font-black tracking-tight"
             style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
            {title}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at center, #0b1626 0%, #02060f 80%)' }}
    >
      <div ref={cardRef} className="flex flex-col items-center px-10">
        <p ref={labelRef} className="text-dark-500 text-sm md:text-base font-bold uppercase tracking-[0.4em] mb-10">
          Proudly sponsored by
        </p>
        {/* Fixed display stage — the logo always fills this area: small images
            scale UP, large ones scale DOWN (object-contain keeps aspect ratio),
            so presentation is consistent regardless of the source file size. */}
        <div className="relative overflow-hidden rounded-3xl flex items-center justify-center"
          style={{ width: 'min(78vw, 1100px)', height: 'min(62vh, 680px)' }}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt={title || 'Sponsor'}
            className="w-full h-full object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          {/* moving highlight sweep */}
          <div ref={sweepRef} className="pointer-events-none absolute inset-y-0 -inset-x-1/4 w-1/3"
            style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.35), transparent)', filter: 'blur(6px)' }} />
        </div>
        {title && (
          <p ref={titleRef} className="text-white text-3xl md:text-5xl font-black tracking-tight mt-10">
            {title}
          </p>
        )}
      </div>
    </div>
  )
}
