import type { Match, Event } from '@/types'

// Build & download a CSV match log: real time + match clock + set context for
// every event (start, scores, set boundaries, timeouts, subs, end). Pure
// client-side, no deps — Excel opens CSV directly.
// ponytail: CSV not .xlsx; add SheetJS only if real Excel formatting is needed.

// Mirrors the server clock: timeout-start / pause / sub / end freeze it;
// timer_start and timeout_end resume it (match_start does NOT — intro plays first).
const STOPS = new Set(['timer_pause', 'timeout_start', 'match_end', 'substitution'])
const STARTS = new Set(['timer_start', 'timeout_end'])

// Sepak Takraw set rules (mirror of backend setLimits/setWon).
// ponytail: duplicated from Go; keep in sync if the ruleset changes.
const setLimits = (_i: number) => ({ target: 15, cap: 17 })
const setWon = (x: number, y: number, t: number, c: number) => (x >= t && x - y >= 2) || x >= c

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

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

export function buildMatchCsv(match: Match, events: Event[]): string {
  const rows = [...events].sort((a, b) => a.sequence - b.sequence)

  let accumulated = 0
  let lastStart: number | null = null
  // Set tracking — mirrors the server so set boundaries land at the right time.
  let setIdx = 0, sa = 0, sb = 0, setsA = 0, setsB = 0, matchOver = false, setStarted = false

  const lines = [['#', 'Real Time', 'Match Clock', 'Set', 'Event', 'Detail'].join(',')]
  const push = (seq: string, time: string, clock: number, setNo: number, event: string, detail: string) =>
    lines.push([seq, esc(time), fmtClock(clock), `Set ${setNo}`, esc(event), esc(detail)].join(','))

  for (const e of rows) {
    const t = new Date(e.created_at).getTime()
    if (lastStart !== null && STOPS.has(e.type)) { accumulated += (t - lastStart) / 1000; lastStart = null }
    const clock = accumulated + (lastStart !== null ? (t - lastStart) / 1000 : 0)
    if (lastStart === null && STARTS.has(e.type)) lastStart = t

    const time = new Date(e.created_at).toLocaleString()
    const { event, detail } = label(e, match)
    push(String(e.sequence), time, clock, setIdx + 1, event, detail)

    if (e.type === 'match_start' && !setStarted) {
      setStarted = true
      push('', time, clock, 1, 'Set 1 — started', `${match.team_a} vs ${match.team_b}`)
    }

    if (!matchOver && (e.type === 'score_update' || e.type === 'score_remove')) {
      const p = (e.payload ?? {}) as Record<string, unknown>
      const pts = Number(p.points) || 0
      const sign = e.type === 'score_update' ? 1 : -1
      if (p.team === 'A') sa = Math.max(0, sa + sign * pts)
      else if (p.team === 'B') sb = Math.max(0, sb + sign * pts)

      if (e.type === 'score_update') {
        const { target, cap } = setLimits(setIdx)
        if (setWon(sa, sb, target, cap) || setWon(sb, sa, target, cap)) {
          const winner = sa > sb ? match.team_a : match.team_b
          push('', time, clock, setIdx + 1, `Set ${setIdx + 1} — completed`, `${sa}–${sb} · won by ${winner}`)
          if (sa > sb) setsA++; else setsB++
          sa = 0; sb = 0
          if (setsA === 2 || setsB === 2) matchOver = true
          else { setIdx++; push('', time, clock, setIdx + 1, `Set ${setIdx + 1} — started`, '') }
        }
      }
    }
  }
  return lines.join('\r\n')
}

export function downloadMatchCsv(match: Match, events: Event[]) {
  const blob = new Blob([buildMatchCsv(match, events)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${match.team_a}-vs-${match.team_b}-${match.match_code}.csv`.replace(/\s+/g, '_')
  a.click()
  URL.revokeObjectURL(url)
}
