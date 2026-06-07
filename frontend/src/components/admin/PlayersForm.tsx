import { useRef, useState } from 'react'
import { Plus, X, Upload, UserCircle2, Loader2, ShieldCheck, ArrowLeftRight } from 'lucide-react'
import { clsx } from 'clsx'
import type { PlayerInput } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

interface Props {
  teamName: string
  teamColor: string
  players: PlayerInput[]
  onChange: (players: PlayerInput[]) => void
  token: string
  maxPlayers?: number
}

interface PlayerRowProps {
  player: PlayerInput
  color: string
  index: number
  token: string
  onUpdate: (field: keyof PlayerInput, value: string | number) => void
  onRemove: () => void
}

function PlayerRow({ player, color, index, token, onUpdate, onRemove }: PlayerRowProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('photo', file)
      const res = await fetch(`${API_BASE}/upload/player-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      if (data.url) onUpdate('photo_url', data.url)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const isPlaying = player.status !== 'sub'

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all group"
      style={{ backgroundColor: `${color}06`, borderColor: `${color}20` }}
    >
      {/* Photo avatar — click to upload */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="Click to upload photo"
        className="relative h-10 w-10 flex-shrink-0 rounded-xl overflow-hidden border-2 flex items-center justify-center transition-all hover:scale-105"
        style={{ borderColor: `${color}50`, backgroundColor: `${color}18` }}
      >
        {player.photo_url ? (
          <img src={player.photo_url} alt="" className="h-full w-full object-cover" />
        ) : uploading ? (
          <Loader2 size={14} className="animate-spin" style={{ color }} />
        ) : (
          <Upload size={13} style={{ color }} />
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </button>

      {/* Jersey number */}
      <input
        type="number"
        value={player.jersey_number || ''}
        onChange={(e) => onUpdate('jersey_number', parseInt(e.target.value) || 0)}
        placeholder="#"
        min={0} max={99}
        className="w-16 text-center px-2 py-1.5 bg-dark-850 border border-dark-700 rounded-lg text-base font-black
                   text-dark-100 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                   tabular-nums flex-shrink-0"
      />

      {/* Name */}
      <input
        type="text"
        value={player.name}
        onChange={(e) => onUpdate('name', e.target.value)}
        placeholder={`Player ${index + 1}`}
        className="flex-1 min-w-0 px-3 py-1.5 bg-dark-850 border border-dark-700 rounded-lg text-sm text-dark-100
                   focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                   placeholder-dark-600"
      />

      {/* Status toggle */}
      <button
        type="button"
        onClick={() => onUpdate('status', isPlaying ? 'sub' : 'playing')}
        title={isPlaying ? 'Click to mark as substitute' : 'Click to mark as playing'}
        className={clsx(
          'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all',
          isPlaying
            ? 'bg-live/10 border-live/30 text-live'
            : 'bg-dark-800 border-dark-700 text-dark-500 hover:text-dark-300',
        )}
      >
        {isPlaying
          ? <><ShieldCheck size={12} /> PLAY</>
          : <><ArrowLeftRight size={12} /> SUB</>}
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 rounded-lg text-dark-700 hover:text-danger hover:bg-danger/10 transition-all opacity-0 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function PlayersForm({ teamName, teamColor, players, onChange, token, maxPlayers = 12 }: Props) {
  const add = () => {
    if (players.length >= maxPlayers) return
    onChange([...players, { name: '', jersey_number: players.length + 1, status: 'playing', photo_url: '' }])
  }

  const update = (i: number, field: keyof PlayerInput, value: string | number) => {
    onChange(players.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  const remove = (i: number) => onChange(players.filter((_, idx) => idx !== i))

  const playing = players.filter((p) => p.status !== 'sub').length
  const subs    = players.filter((p) => p.status === 'sub').length

  return (
    <div className="space-y-2.5">
      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {playing > 0 && (
            <span className="flex items-center gap-1 text-live font-semibold">
              <ShieldCheck size={11} /> {playing} playing
            </span>
          )}
          {subs > 0 && (
            <span className="flex items-center gap-1 text-dark-500 font-semibold">
              <ArrowLeftRight size={11} /> {subs} sub
            </span>
          )}
          {players.length === 0 && (
            <span className="text-dark-600">No players added yet</span>
          )}
        </div>
        <span className="text-dark-600 font-medium">{players.length} / {maxPlayers}</span>
      </div>

      {/* Player rows */}
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
        {players.map((p, i) => (
          <PlayerRow
            key={i}
            player={p}
            color={teamColor}
            index={i}
            token={token}
            onUpdate={(field, value) => update(i, field, value)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>

      {/* Add player */}
      {players.length < maxPlayers && (
        <button
          type="button"
          onClick={add}
          className="w-full py-2.5 rounded-xl border border-dashed text-sm font-semibold
                     flex items-center justify-center gap-2 transition-all"
          style={{
            borderColor: `${teamColor}35`,
            color: `${teamColor}90`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `${teamColor}70`
            e.currentTarget.style.backgroundColor = `${teamColor}08`
            e.currentTarget.style.color = teamColor
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${teamColor}35`
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = `${teamColor}90`
          }}
        >
          <Plus size={14} />
          Add player
        </button>
      )}
    </div>
  )
}
