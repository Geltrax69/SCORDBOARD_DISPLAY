import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Pinned below the scroll area — use for actions that must stay reachable. */
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '3xl'
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '3xl': 'max-w-4xl' }

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className={clsx(
        'relative w-full bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl',
        'animate-slide-up flex flex-col max-h-[calc(100dvh-2rem)]',
        widths[size],
      )} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-dark-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-dark-50 min-w-0 truncate">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-dark-400 hover:text-dark-100 hover:bg-dark-700 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-dark-700 flex-shrink-0">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
