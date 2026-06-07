import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { ExternalLink, Download } from 'lucide-react'
import type { Match } from '@/types'

interface Props {
  match: Match | null
  onClose: () => void
  networkConnectURL?: string  // e.g. http://192.168.1.10:3000/connect from server-info
}

export function MatchQRModal({ match, onClose, networkConnectURL }: Props) {
  const qrRef = useRef<SVGSVGElement>(null)

  if (!match) return null

  // Prefer the network IP URL so scorers on other devices can scan and reach the server
  const connectURL = networkConnectURL ?? `${window.location.origin}/connect`

  const downloadQR = () => {
    const svg = qrRef.current
    if (!svg) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const data = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    canvas.width = 300; canvas.height = 300
    img.onload = () => {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, 300, 300)
      ctx.drawImage(img, 0, 0, 300, 300)
      const a = document.createElement('a')
      a.download = `match-${match.match_code}-qr.png`
      a.href = canvas.toDataURL()
      a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)))
  }

  return (
    <Modal open={!!match} onClose={onClose} title="Match QR Code" size="sm">
      <div className="text-center space-y-5">
        {/* Match info */}
        <div>
          <div className="flex items-center justify-center gap-3 mb-1">
            <span className="font-bold text-lg" style={{ color: match.team_a_color }}>{match.team_a}</span>
            <span className="text-dark-600 font-bold">vs</span>
            <span className="font-bold text-lg" style={{ color: match.team_b_color }}>{match.team_b}</span>
          </div>
          {match.court_name && <p className="text-xs text-dark-500">{match.court_name}</p>}
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-2xl shadow-lg">
            <QRCodeSVG
              ref={qrRef as React.RefObject<SVGSVGElement>}
              value={connectURL}
              size={160}
              level="H"
              includeMargin={false}
            />
          </div>
        </div>

        {/* 4-digit code — BIG */}
        <div>
          <p className="text-xs text-dark-500 uppercase tracking-widest font-medium mb-2">Match Code</p>
          <div className="flex justify-center gap-3">
            {match.match_code.split('').map((digit, i) => (
              <div
                key={i}
                className="w-14 h-16 flex items-center justify-center bg-dark-700 border-2 border-dark-600 rounded-xl text-4xl font-black text-white font-mono"
              >
                {digit}
              </div>
            ))}
          </div>
          <p className="text-xs text-dark-600 mt-3">
            Scorer enters this code at <span className="text-brand-400 font-mono">/connect</span>
          </p>
        </div>

        {/* Reconnect note */}
        <div className="bg-dark-700/50 border border-dark-600 rounded-xl px-4 py-3 text-xs text-dark-400 text-left">
          <strong className="text-dark-200">Lost connection?</strong> Just refresh the page and re-enter the same 4-digit code — same token re-issues automatically.
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" icon={<Download size={14} />} onClick={downloadQR}>
            Download QR
          </Button>
          <a href={connectURL} target="_blank" rel="noreferrer" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full" icon={<ExternalLink size={14} />}>
              Open Connect
            </Button>
          </a>
        </div>
      </div>
    </Modal>
  )
}
