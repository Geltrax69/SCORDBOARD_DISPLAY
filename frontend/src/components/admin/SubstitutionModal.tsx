import { useState, useEffect } from 'react'
import { Modal } from '@/components/common/Modal'
import { Button } from '@/components/common/Button'
import { createSubstitution, getMatchPlayers } from '@/services/api'
import { ArrowDownUp } from 'lucide-react'
import type { Player } from '@/types'
import { useAuthStore } from '@/store/authStore'

interface Props {
  open: boolean
  onClose: () => void
  matchId: string
  teamA: string
  teamB: string
  token?: string
}

export function SubstitutionModal({ open, onClose, matchId, teamA, teamB, token }: Props) {
  const [team, setTeam] = useState<'A' | 'B'>('A')
  const [playerOut, setPlayerOut] = useState('')
  const [playerIn, setPlayerIn] = useState('')
  const [number, setNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [players, setPlayers] = useState<Player[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(false)

  // Fetch players when modal opens
  useEffect(() => {
    if (open) {
      setLoadingPlayers(true)
      const fetchUrl = `${import.meta.env.VITE_API_URL ?? '/api'}/matches/${matchId}/players`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const adminToken = useAuthStore.getState().token
        if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`
      }

      fetch(fetchUrl, { headers })
        .then((res) => {
          if (!res.ok) throw new Error()
          return res.json()
        })
        .then((data) => {
          setPlayers(data)
          setLoadingPlayers(false)
        })
        .catch(() => {
          setLoadingPlayers(false)
        })
    }
  }, [open, matchId, token])

  // Reset player selections when team changes
  useEffect(() => {
    setPlayerOut('')
    setPlayerIn('')
    setNumber('')
  }, [team])

  const handleSubmit = async () => {
    if (!playerOut.trim() || !playerIn.trim()) {
      setError('Both player names are required')
      return
    }
    setError('')
    setLoading(true)
    try {
      const url = `${import.meta.env.VITE_API_URL ?? '/api'}/matches/${matchId}/events`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      } else {
        const adminToken = useAuthStore.getState().token
        if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'substitution',
          payload: {
            team,
            player_out: playerOut.trim(),
            player_in: playerIn.trim(),
            number: number ? parseInt(number) : 0,
          }
        })
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }

      onClose()
      setPlayerOut('')
      setPlayerIn('')
      setNumber('')
    } catch (err: any) {
      setError(err.message ?? 'Substitution failed')
    } finally {
      setLoading(false)
    }
  }

  const teamPlayers = players.filter((p) => p.team === team)
  const playingPlayers = teamPlayers.filter((p) => p.status === 'playing')
  const subPlayers = teamPlayers.filter((p) => p.status === 'sub')
  const hasPlayers = teamPlayers.length > 0

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

        <div className="relative space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Player Out</label>
            {loadingPlayers ? (
              <div className="h-10 bg-dark-700 border border-dark-600 animate-pulse rounded-lg" />
            ) : hasPlayers ? (
              <select
                value={playerOut}
                onChange={(e) => {
                  setPlayerOut(e.target.value)
                  const p = playingPlayers.find((x) => x.name === e.target.value)
                  if (p) setNumber(String(p.jersey_number))
                }}
                className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              >
                <option value="">Select player leaving</option>
                {playingPlayers.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} (#{p.jersey_number})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={playerOut}
                onChange={(e) => setPlayerOut(e.target.value)}
                placeholder="Name of player leaving"
                className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100
                           placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              />
            )}
          </div>

          <div className="flex justify-center py-1">
            <ArrowDownUp size={18} className="text-dark-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Player In</label>
            {loadingPlayers ? (
              <div className="h-10 bg-dark-700 border border-dark-600 animate-pulse rounded-lg" />
            ) : hasPlayers ? (
              <select
                value={playerIn}
                onChange={(e) => setPlayerIn(e.target.value)}
                className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              >
                <option value="">Select player entering</option>
                {subPlayers.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} (#{p.jersey_number})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={playerIn}
                onChange={(e) => setPlayerIn(e.target.value)}
                placeholder="Name of player entering"
                className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-dark-100
                           placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            )}
          </div>
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
