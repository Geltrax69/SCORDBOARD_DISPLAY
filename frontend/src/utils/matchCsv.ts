import type { Match, Event } from '@/types'

// Build & download a CSV match log: real time + match clock for every event
// (start, scores, timeouts, substitutions, end). Pure client-side, no deps —
// Excel opens CSV directly.
// ponytail: CSV not .xlsx; if real Excel formatting is ever needed, add SheetJS.

// Mirrors the server's authoritative clock: timeout/sub freeze it; the ref
// resumes manually via timer_start (timeout_end does NOT auto-resume).
const STOPS = new Set(['timer_pause', 'timeout_start', 'match_end', 'substitution'])
const STARTS = new Set(['match_start', 'timer_start'])

const fmtClock = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function label(e: Event, m: Match): { event: string; detail: string } {
  const p = (e.payload ?? {}) as Record<string, unknown>
  const team = p.team === 'A' ? m.team_a : p.team === 'B' ? m.team_b : ''
  switch (e.type) {
    case 'match_start':   return { event: 'Match started', detail: `${m.team_a} vs ${m.team_b}` }
    case 'match_end':     return { event: 'Match ended', detail: p.winner === 'A' ? `Winner: ${m.team_a}` : p.winner === 'B' ? `Winner: ${m.team_b}` : 'Draw' }
    case 'timer_start':   return { event: 'Timer resumed', detail: '' }
    case 'timer_pause':   return { event: 'Timer paused', detail: '' }
    case 'timeout_start': return { event: 'Timeout', detail: `${team}${p.reason ? ' — ' + p.reason : ''}` }
    case 'timeout_end':   return { event: 'Timeout ended', detail: '' }
    case 'substitution':  return { event: 'Substitution', detail: `${team}: IN ${p.player_in ?? ''} (#${p.number ?? ''}), OUT ${p.player_out ?? ''}` }
    case 'score_update':  return { event: 'Score', detail: `${team} +${p.points ?? ''}` }
    case 'score_remove':  return { event: 'Score removed', detail: `${team} -${p.points ?? ''}` }
    default:              return { event: e.type, detail: '' }
  }
}

const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`

export function downloadMatchCsv(match: Match, events: Event[]) {
  const rows = [...events].sort((a, b) => a.sequence - b.sequence)

  // Replay to derive the match clock (running elapsed seconds) at each event,
  // mirroring the server's authoritative timer.
  let accumulated = 0
  let lastStart: number | null = null

  const lines = [['#', 'Real Time', 'Match Clock', 'Event', 'Detail'].join(',')]
  for (const e of rows) {
    const t = new Date(e.created_at).getTime()
    if (lastStart !== null && STOPS.has(e.type)) { accumulated += (t - lastStart) / 1000; lastStart = null }
    const clock = accumulated + (lastStart !== null ? (t - lastStart) / 1000 : 0)
    if (lastStart === null && STARTS.has(e.type)) lastStart = t

    const { event, detail } = label(e, match)
    lines.push([
      String(e.sequence),
      esc(new Date(e.created_at).toLocaleString()),
      fmtClock(clock),
      esc(event),
      esc(detail),
    ].join(','))
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${match.team_a}-vs-${match.team_b}-${match.match_code}.csv`.replace(/\s+/g, '_')
  a.click()
  URL.revokeObjectURL(url)
}
