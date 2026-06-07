import type { WSMessage } from '@/types'

type MessageHandler = (msg: WSMessage) => void

class ScoreboardWebSocket {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxDelay = 30_000
  private shouldReconnect = true
  private currentUrl = ''
  private onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void

  connect(url: string, onStatus?: (s: 'disconnected' | 'connecting' | 'connected' | 'error') => void) {
    this.currentUrl = url
    this.onStatusChange = onStatus
    this.shouldReconnect = true
    this._connect()
  }

  private _connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.onStatusChange?.('connecting')
    try {
      this.ws = new WebSocket(this.currentUrl)
    } catch {
      this.onStatusChange?.('error')
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.onStatusChange?.('connected')
      this.reconnectDelay = 1000
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage
        this.handlers.forEach((h) => h(msg))
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      this.onStatusChange?.('disconnected')
      if (this.shouldReconnect) {
        this._scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      this.onStatusChange?.('error')
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxDelay)
      this._connect()
    }, this.reconnectDelay)
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }
}

export const scoreboardWS = new ScoreboardWebSocket()
