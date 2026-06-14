import type { WSMessage } from '@/types'

type MessageHandler = (msg: WSMessage) => void

class ScoreboardWebSocket {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxDelay = 30_000
  private maxRetries = 999999
  private retryCount = 0
  private shouldReconnect = true
  private currentUrl = ''
  private onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void

  constructor() {
    if (typeof window !== 'undefined') {
      const handleWake = () => {
        if (this.shouldReconnect && this.currentUrl && this.ws?.readyState !== WebSocket.OPEN) {
          console.log('WebSocket: System wake/online event, forcing reconnect')
          this.retryCount = 0
          this.reconnectDelay = 1000
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
          this._connect()
        }
      }
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          handleWake()
        }
      })
      window.addEventListener('online', handleWake)
    }
  }

  connect(url: string, onStatus?: (s: 'disconnected' | 'connecting' | 'connected' | 'error') => void) {
    this.disconnect() // Clean up any existing connection first
    this.currentUrl = url
    this.onStatusChange = onStatus
    this.shouldReconnect = true
    this.retryCount = 0
    this._connect()
  }

  private _connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    if (this.retryCount >= this.maxRetries) {
      console.error('WebSocket: Max retries reached, giving up')
      this.onStatusChange?.('error')
      return
    }

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
      this.retryCount = 0
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
      if (this.shouldReconnect && this.retryCount < this.maxRetries) {
        this._scheduleReconnect()
      } else if (this.retryCount >= this.maxRetries) {
        this.onStatusChange?.('error')
      }
    }

    this.ws.onerror = () => {
      this.onStatusChange?.('error')
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.retryCount++
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      // Nullify all event handlers before closing to prevent triggers during teardown
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      try {
        this.ws.close()
      } catch {
        // ignore close errors
      }
      this.ws = null
    }
  }

  get readyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }
}

export const scoreboardWS = new ScoreboardWebSocket()
