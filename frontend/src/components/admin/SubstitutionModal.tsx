import { useState } from 'react'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { createSubstitution } from '@/services/api'
import { ArrowDownUp } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  matchId: string
  teamA: string
  teamB: string
}

export function SubstitutionModal({ open, onClose, matchId, teamA, teamB }: Props) {
  const [team, setTeam] = useState<'A' | 'B'>('A')
  const [playerOut, setPlayerOut] = useState('')
  const [playerIn, setPlayerIn] = useState('')
  const [number, setNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!playerOut.trim() || !playerIn.trim()) {
      setError('Both player names are required')
      return
    }
    setError('')
    setLoading(true)
    try {
      await createSubstitution(matchId, {
        team,
        player_out: playerOut.trim(),
        player_in: playerIn.trim(),
        number: number ? parseInt(number) : 0,
      })
      onClose()
      setPlayerOut('')
      setPlayerIn('')
      setNumber('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Substitution">
      <div className="space-y-5">
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

        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Jersey # (optional)</label>
          <input
            type="number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="#"
            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100
                       placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-dark-300 mb-2">Player Out</label>
          <input
            type="text"
            value={playerOut}
            onChange={(e) => setPlayerOut(e.target.value)}
            placeholder="Name of player leaving"
            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100
                       placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
          />
          <div className="flex justify-center my-3">
            <ArrowDownUp size={18} className="text-dark-500" />
          </div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Player In</label>
          <input
            type="text"
            value={playerIn}
            onChange={(e) => setPlayerIn(e.target.value)}
            placeholder="Name of player entering"
            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100
                       placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={loading} onClick={handleSubmit}>
            Confirm Sub
          </Button>
        </div>
      </div>
    </Modal>
  )
}
