import { useState } from 'react'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { startTimeout } from '@/services/api'
import { Timer } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  matchId: string
  teamA: string
  teamB: string
}

const DURATIONS = [
  { label: '60 sec', value: 60 },
  { label: '90 sec', value: 90 },
  { label: '120 sec', value: 120 },
]

export function TimeoutModal({ open, onClose, matchId, teamA, teamB }: Props) {
  const [team, setTeam] = useState<'A' | 'B'>('A')
  const [duration, setDuration] = useState(60)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await startTimeout(matchId, { team, duration, reason })
      onClose()
      setReason('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Call Timeout">
      <div className="space-y-5">
        {/* Team Selection */}
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Team</label>
          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTeam(t)}
                className={`py-3 rounded-xl border-2 font-semibold transition-all ${
                  team === t
                    ? 'border-brand-500 bg-brand-900/30 text-brand-300'
                    : 'border-dark-600 bg-dark-700 text-dark-300 hover:border-dark-500'
                }`}
              >
                {t === 'A' ? teamA : teamB}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Duration</label>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  duration === d.value
                    ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                    : 'border-dark-600 bg-dark-700 text-dark-300 hover:border-dark-500'
                }`}
              >
                <Timer size={14} className="inline mr-1" />
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Reason (optional)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Player injury, Coach request"
            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100
                       placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={loading} onClick={handleSubmit}>
            Start Timeout
          </Button>
        </div>
      </div>
    </Modal>
  )
}
