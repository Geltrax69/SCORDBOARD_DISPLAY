import { create } from 'zustand'
import type { Match, Event, MatchState, Tournament, Court, TimeoutPayload } from '@/types'

interface MatchStore {
  // Collections
  tournaments: Tournament[]
  courts: Court[]
  matches: Match[]
  events: Event[]

  // Current match detail
  currentMatch: Match | null
  currentState: MatchState | null

  // Derived live state (updated by WS)
  liveScores: Record<string, { scoreA: number; scoreB: number }>
  liveStatuses: Record<string, string>
  activeTimeouts: Record<string, TimeoutPayload | null>

  // Timer (client-side interpolation)
  timerTick: number

  // Setters
  setTournaments: (ts: Tournament[]) => void
  setCourts: (cs: Court[]) => void
  setMatches: (ms: Match[]) => void
  setEvents: (es: Event[]) => void
  setCurrentMatch: (m: Match | null) => void
  setCurrentState: (s: MatchState | null) => void

  // WS live update
  applyWSUpdate: (matchId: string, match: Match, state: MatchState) => void
  setActiveTimeout: (matchId: string, payload: TimeoutPayload | null) => void
  addEvent: (ev: Event) => void
  markEventUndone: (eventId: string) => void
  markEventRedone: (eventId: string) => void

  incrementTimer: () => void
  resetTimer: () => void
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  tournaments: [],
  courts: [],
  matches: [],
  events: [],
  currentMatch: null,
  currentState: null,
  liveScores: {},
  liveStatuses: {},
  activeTimeouts: {},
  timerTick: 0,

  setTournaments: (ts) => set({ tournaments: ts }),
  setCourts: (cs) => set({ courts: cs }),
  setMatches: (ms) => set({ matches: ms }),
  setEvents: (es) => set({ events: es }),
  setCurrentMatch: (m) => set({ currentMatch: m }),
  setCurrentState: (s) => set({ currentState: s }),

  applyWSUpdate: (matchId, match, state) => {
    set((prev) => ({
      liveScores: {
        ...prev.liveScores,
        [matchId]: { scoreA: state.score_a, scoreB: state.score_b },
      },
      liveStatuses: {
        ...prev.liveStatuses,
        [matchId]: state.status,
      },
      matches: prev.matches.map((m) =>
        m.id === matchId
          ? { ...m, ...match, score_a: state.score_a, score_b: state.score_b }
          : m
      ),
      currentMatch:
        prev.currentMatch?.id === matchId
          ? { ...prev.currentMatch, ...match, score_a: state.score_a, score_b: state.score_b }
          : prev.currentMatch,
      currentState:
        prev.currentMatch?.id === matchId ? state : prev.currentState,
    }))
  },

  setActiveTimeout: (matchId, payload) => {
    set((prev) => ({
      activeTimeouts: { ...prev.activeTimeouts, [matchId]: payload },
    }))
  },

  addEvent: (ev) => {
    set((prev) => ({ events: [ev, ...prev.events] }))
  },

  markEventUndone: (eventId) => {
    set((prev) => ({
      events: prev.events.map((e) => (e.id === eventId ? { ...e, undone: true } : e)),
    }))
  },

  markEventRedone: (eventId) => {
    set((prev) => ({
      events: prev.events.map((e) => (e.id === eventId ? { ...e, undone: false } : e)),
    }))
  },

  incrementTimer: () => set((prev) => ({ timerTick: prev.timerTick + 1 })),
  resetTimer: () => set({ timerTick: 0 }),
}))
