import { useState } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import { Button } from '@/components/common/Button'
import { undoEvent, redoEvent } from '@/services/api'
import { useMatchStore } from '@/store/matchStore'
import type { Event } from '@/types'
import {
  Plus, Minus, Timer, AlertTriangle, ArrowDownUp,
  Megaphone, Play, Square, Undo2, Redo2,
} from 'lucide-react'

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  score_update:   { label: 'Score +',      icon: <Plus size={14} />,        color: 'text-emerald-400' },
  score_remove:   { label: 'Score −',      icon: <Minus size={14} />,       color: 'text-red-400' },
  match_start:    { label: 'Match Start',  icon: <Play size={14} />,         color: 'text-brand-400' },
  match_end:      { label: 'Match End',    icon: <Square size={14} />,       color: 'text-dark-400' },
  timer_start:    { label: 'Timer Start',  icon: <Timer size={14} />,        color: 'text-cyan-400' },
  timer_pause:    { label: 'Timer Pause',  icon: <Timer size={14} />,        color: 'text-yellow-400' },
  timeout_start:  { label: 'Timeout',      icon: <AlertTriangle size={14} />, color: 'text-amber-400' },
  timeout_end:    { label: 'Timeout End',  icon: <AlertTriangle size={14} />, color: 'text-dark-400' },
  substitution:   { label: 'Substitution', icon: <ArrowDownUp size={14} />,  color: 'text-purple-400' },
  announcement:   { label: 'Announcement', icon: <Megaphone size={14} />,    color: 'text-pink-400' },
}

function EventRow({ ev, onUndo, onRedo }: { ev: Event; onUndo: (id: string) => void; onRedo: (id: string) => void }) {
  const meta = EVENT_META[ev.type] ?? { label: ev.type, icon: null, color: 'text-dark-400' }
  const payload = ev.payload as Record<string, unknown>

  const desc = () => {
    if (ev.type === 'score_update' || ev.type === 'score_remove') {
      return `Team ${payload.team} · ${payload.points} pt${Number(payload.points) !== 1 ? 's' : ''}`
    }
    if (ev.type === 'timeout_start') {
      return `Team ${payload.team} · ${payload.duration}s${payload.reason ? ` · ${payload.reason}` : ''}`
    }
    if (ev.type === 'substitution') {
      return `Team ${payload.team} · #${payload.number || ''} ${payload.player_out} → ${payload.player_in}`
    }
    if (ev.type === 'announcement') return String(payload.message ?? '')
    return ''
  }

  return (
    <div className={clsx(
      'flex items-start gap-3 px-4 py-3 rounded-xl border transition-all',
      ev.undone
        ? 'border-dark-700/50 bg-dark-900/30 opacity-50'
        : 'border-dark-700 bg-dark-800/60',
    )}>
      <span className={clsx('mt-0.5 flex-shrink-0', meta.color)}>{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={clsx('text-sm font-semibold', meta.color)}>{meta.label}</span>
          {ev.undone && (
            <span className="text-xs px-1.5 py-0.5 bg-dark-700 text-dark-400 rounded">undone</span>
          )}
        </div>
        {desc() && <p className="text-xs text-dark-400 mt-0.5 truncate">{desc()}</p>}
        <p className="text-xs text-dark-600 mt-1">
          {ev.created_by_name && <span className="text-dark-500 mr-2">{ev.created_by_name}</span>}
          {format(new Date(ev.created_at), 'HH:mm:ss')}
        </p>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        {!ev.undone ? (
          <button
            onClick={() => onUndo(ev.id)}
            className="p-1.5 rounded-lg text-dark-500 hover:text-amber-400 hover:bg-dark-700 transition-colors"
            title="Undo event"
          >
            <Undo2 size={14} />
          </button>
        ) : (
          <button
            onClick={() => onRedo(ev.id)}
            className="p-1.5 rounded-lg text-dark-500 hover:text-emerald-400 hover:bg-dark-700 transition-colors"
            title="Redo event"
          >
            <Redo2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  events: Event[]
  showAll?: boolean
}

export function EventHistory({ events, showAll = false }: Props) {
  const [showAllState, setShowAllState] = useState(showAll)
  const { markEventUndone, markEventRedone } = useMatchStore()

  const handleUndo = async (id: string) => {
    await undoEvent(id)
    markEventUndone(id)
  }

  const handleRedo = async (id: string) => {
    await redoEvent(id)
    markEventRedone(id)
  }

  const displayed = showAllState ? events : events.slice(0, 12)

  if (events.length === 0) {
    return (
      <div className="text-center py-10 text-dark-500">
        <Timer size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">No events yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {displayed.map((ev) => (
        <EventRow key={ev.id} ev={ev} onUndo={handleUndo} onRedo={handleRedo} />
      ))}
      {!showAllState && events.length > 12 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2"
          onClick={() => setShowAllState(true)}
        >
          Show all {events.length} events
        </Button>
      )}
    </div>
  )
}
