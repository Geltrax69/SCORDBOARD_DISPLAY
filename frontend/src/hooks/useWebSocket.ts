import { useEffect, useRef } from 'react'
import { scoreboardWS } from '@/services/websocket'
import { useAuthStore } from '@/store/authStore'
import { useWSStore } from '@/store/wsStore'
import { useMatchStore } from '@/store/matchStore'
import type { WSMessage } from '@/types'

const WS_BASE = import.meta.env.VITE_WS_URL ?? (
  window.location.protocol === 'https:' ? 'wss://' : 'ws://'
) + window.location.host

export function useWebSocket(matchId?: string) {
  const token = useAuthStore((s) => s.token)
  const setStatus = useWSStore((s) => s.setStatus)
  const { applyWSUpdate, setActiveTimeout, addEvent } = useMatchStore()

  useEffect(() => {
    if (!token) return

    const path = matchId ? `/ws/match/${matchId}` : '/ws/global'
    const url = `${WS_BASE}${path}?token=${encodeURIComponent(token)}`

    scoreboardWS.connect(url, setStatus)

    const unsub = scoreboardWS.subscribe((msg: WSMessage) => {
      handleMessage(msg, applyWSUpdate, setActiveTimeout, addEvent)
    })

    return () => {
      unsub()
      scoreboardWS.disconnect()
    }
  }, [token, matchId])
}

function handleMessage(
  msg: WSMessage,
  applyWSUpdate: ReturnType<typeof useMatchStore.getState>['applyWSUpdate'],
  setActiveTimeout: ReturnType<typeof useMatchStore.getState>['setActiveTimeout'],
  addEvent: ReturnType<typeof useMatchStore.getState>['addEvent'],
) {
  const { type, match_id, payload } = msg

  switch (type) {
    case 'score_update':
    case 'score_remove':
    case 'match_start':
    case 'match_end':
    case 'status_change':
    case 'serve_set':
    case 'timer_start':
    case 'timer_pause':
    case 'timeout_end': {
      if (match_id && payload.match && payload.state) {
        applyWSUpdate(match_id, payload.match, payload.state)
      }
      if (match_id && type === 'timeout_end') {
        setActiveTimeout(match_id, null)
      }
      if (payload.event) {
        addEvent(payload.event)
      }
      break
    }
    case 'timeout_start': {
      if (match_id && payload.match && payload.state) {
        applyWSUpdate(match_id, payload.match, payload.state)
        if (payload.state.current_timeout) {
          setActiveTimeout(match_id, payload.state.current_timeout)
        }
      }
      if (payload.event) addEvent(payload.event)
      break
    }
    case 'substitution': {
      if (match_id && payload.match && payload.state) {
        applyWSUpdate(match_id, payload.match, payload.state)
      }
      if (payload.event) addEvent(payload.event)
      break
    }
    default:
      break
  }
}
