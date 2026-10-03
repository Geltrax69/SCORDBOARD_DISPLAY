import { describe, expect, it } from 'vitest'
import { courtCurrentMatch } from './DisplayControl'
import type { Match } from '@/types'

const m = (id: string, court_id: string, status: string, created_at: string) =>
  ({ id, court_id, status, created_at, team_a: id, team_b: id }) as unknown as Match

describe('courtCurrentMatch', () => {
  it('prefers the live match over earlier pending ones', () => {
    const matches = [
      m('p1', 'A', 'pending', '2026-01-01T09:00:00Z'),
      m('live', 'A', 'timeout', '2026-01-01T10:00:00Z'),
    ]
    expect(courtCurrentMatch(matches, 'A')?.id).toBe('live')
  })

  it('falls back to the earliest pending match on that court', () => {
    const matches = [
      m('done', 'A', 'completed', '2026-01-01T08:00:00Z'),
      m('p2', 'A', 'pending', '2026-01-01T11:00:00Z'),
      m('p1', 'A', 'pending', '2026-01-01T09:00:00Z'),
      m('other', 'B', 'active', '2026-01-01T07:00:00Z'),
    ]
    expect(courtCurrentMatch(matches, 'A')?.id).toBe('p1')
  })

  it('returns nothing when the court has no open matches', () => {
    const matches = [m('done', 'A', 'completed', '2026-01-01T08:00:00Z'), m('x', 'A', 'cancelled', '2026-01-01T09:00:00Z')]
    expect(courtCurrentMatch(matches, 'A')).toBeUndefined()
  })
})
