import { create } from 'zustand'

type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface WSStore {
  status: WSStatus
  reconnectCount: number
  setStatus: (s: WSStatus) => void
  incrementReconnect: () => void
  resetReconnect: () => void
}

export const useWSStore = create<WSStore>((set) => ({
  status: 'disconnected',
  reconnectCount: 0,
  setStatus: (status) => set({ status }),
  incrementReconnect: () => set((s) => ({ reconnectCount: s.reconnectCount + 1 })),
  resetReconnect: () => set({ reconnectCount: 0 }),
}))
