import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number   // ms, 0 = stays until manually dismissed
}

interface ToastStore {
  toasts: Toast[]
  add: (toast: Omit<Toast, 'id'>) => string
  remove: (id: string) => void
  update: (id: string, patch: Partial<Toast>) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  warn:    (title: string, message?: string) => void
  info:    (title: string, message?: string) => void
  /** Show a "loading" toast and return helpers to resolve it */
  promise: <T>(
    promise: Promise<T>,
    opts: { loading: string; success: string | ((v: T) => string); error?: string | ((err: unknown) => string) }
  ) => Promise<T>
}

let seq = 0
const uid = () => `toast_${++seq}_${Date.now()}`

export const useToastStore = create<ToastStore>((set, get) => {
  const addRaw = (t: Omit<Toast, 'id'>): string => {
    const id = uid()
    set((s) => ({ toasts: [{ ...t, id }, ...s.toasts].slice(0, 5) }))
    if (t.duration > 0) {
      setTimeout(() => get().remove(id), t.duration)
    }
    return id
  }

  return {
    toasts: [],
    add: addRaw,
    remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    update: (id, patch) =>
      set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

    success: (title, message) => addRaw({ type: 'success', title, message, duration: 3500 }),
    error:   (title, message) => addRaw({ type: 'error',   title, message, duration: 6000 }),
    warn:    (title, message) => addRaw({ type: 'warning', title, message, duration: 4500 }),
    info:    (title, message) => addRaw({ type: 'info',    title, message, duration: 3500 }),

    promise: async (promise, opts) => {
      const id = addRaw({ type: 'loading', title: opts.loading, duration: 0 })
      try {
        const result = await promise
        const successMsg = typeof opts.success === 'function' ? opts.success(result) : opts.success
        get().update(id, { type: 'success', title: successMsg, duration: 3500 })
        setTimeout(() => get().remove(id), 3500)
        return result
      } catch (err) {
        let errMsg: string
        if (typeof opts.error === 'function') {
          errMsg = opts.error(err)
        } else if (opts.error) {
          errMsg = opts.error
        } else {
          // Extract message from axios response body if available
          const axiosMsg = (err as any)?.response?.data?.error
          errMsg = axiosMsg || (err instanceof Error ? err.message : 'Something went wrong')
        }
        get().update(id, { type: 'error', title: errMsg, duration: 6000 })
        setTimeout(() => get().remove(id), 6000)
        throw err
      }
    },
  }
})
