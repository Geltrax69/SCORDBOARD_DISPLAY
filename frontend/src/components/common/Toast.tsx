import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { clsx } from 'clsx'
import { CheckCircle2, XCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react'
import { useToastStore, type Toast, type ToastType } from '@/store/toastStore'

const META: Record<ToastType, {
  icon: React.ReactNode
  bg: string
  border: string
  bar: string
  title: string
}> = {
  success: {
    icon:   <CheckCircle2 size={18} />,
    bg:     'bg-dark-900',
    border: 'border-live/30',
    bar:    'bg-live',
    title:  'text-live',
  },
  error: {
    icon:   <XCircle size={18} />,
    bg:     'bg-dark-900',
    border: 'border-danger/30',
    bar:    'bg-danger',
    title:  'text-danger',
  },
  warning: {
    icon:   <AlertTriangle size={18} />,
    bg:     'bg-dark-900',
    border: 'border-timeout/30',
    bar:    'bg-timeout',
    title:  'text-timeout',
  },
  info: {
    icon:   <Info size={18} />,
    bg:     'bg-dark-900',
    border: 'border-brand-500/30',
    bar:    'bg-brand-500',
    title:  'text-brand-400',
  },
  loading: {
    icon:   <Loader2 size={18} className="animate-spin" />,
    bg:     'bg-dark-900',
    border: 'border-dark-600',
    bar:    'bg-brand-500',
    title:  'text-dark-100',
  },
}

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove)
  const ref    = useRef<HTMLDivElement>(null)
  const meta   = META[toast.type]

  // Entrance animation — slide down from above
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 0, y: -24, scale: 0.92 },
        { opacity: 1, y: 0,   scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
      )
    }
  }, [])

  const dismiss = () => {
    if (!ref.current) { remove(toast.id); return }
    gsap.to(ref.current, {
      opacity: 0, y: -16, scale: 0.92, duration: 0.22, ease: 'power2.in',
      onComplete: () => remove(toast.id),
    })
  }

  return (
    <div
      ref={ref}
      className={clsx(
        'relative flex items-start gap-3 w-96 pl-4 pr-10 py-3.5 rounded-2xl border shadow-2xl overflow-hidden',
        meta.bg, meta.border,
      )}
    >
      {/* Left accent bar */}
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl', meta.bar)} />

      {/* Icon */}
      <span className={clsx('flex-shrink-0 mt-0.5', meta.title)}>{meta.icon}</span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-semibold leading-snug', meta.title)}>{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">{toast.message}</p>
        )}
      </div>

      {/* Dismiss (not shown for loading) */}
      {toast.type !== 'loading' && (
        <button onClick={dismiss}
          className="absolute right-2.5 top-2.5 text-dark-600 hover:text-dark-200 transition-colors">
          <X size={14} />
        </button>
      )}

      {/* Progress bar for timed toasts */}
      {toast.duration > 0 && toast.type !== 'loading' && (
        <ProgressBar duration={toast.duration} color={meta.bar} onDone={dismiss} />
      )}
    </div>
  )
}

function ProgressBar({ duration, color, onDone }: { duration: number; color: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    gsap.fromTo(ref.current,
      { scaleX: 1 },
      { scaleX: 0, duration: duration / 1000, ease: 'none', onComplete: onDone }
    )
  }, [])
  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-800 rounded-b-2xl overflow-hidden">
      <div ref={ref} className={clsx('h-full origin-left', color)} style={{ opacity: 0.5 }} />
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  )
}
