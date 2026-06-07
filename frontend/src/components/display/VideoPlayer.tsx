import { useEffect, useRef } from 'react'

interface Props {
  src: string
  onEnded?: () => void
}

export function VideoPlayer({ src, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.play().catch(() => {})
    const handler = () => onEnded?.()
    v.addEventListener('ended', handler)
    return () => v.removeEventListener('ended', handler)
  }, [src, onEnded])

  return (
    <div className="fixed inset-0 z-40 bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        src={src}
        className="max-h-screen max-w-screen w-full h-full object-contain"
        muted={false}
        playsInline
      />
    </div>
  )
}
