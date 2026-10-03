import { describe, expect, it } from 'vitest'
import { parsePlayerImport, teamColor } from './playerImport'
import type { Team } from '@/types'

function csvFile(csv: string, name = 'players.csv'): File {
  return {
    name,
    size: new TextEncoder().encode(csv).byteLength,
    text: async () => csv,
  } as File
}

const header = 'Player ID,Full Name,Gender,District,Status'

describe('parsePlayerImport', () => {
  it('includes approved players, normalizes gender, and ignores other statuses', async () => {
    const file = csvFile(`${header}\n1,Alice,female,District A,approved\n2,Bob,Male,District A,pending\n3,Carol,F,District B,APPROVED`)
    const result = await parsePlayerImport(file, [])

    expect(result.totalRows).toBe(3)
    expect(result.approvedRows).toBe(2)
    expect(result.ignoredRows).toBe(1)
    expect(result.candidates.map((player) => [player.name, player.gender, player.district])).toEqual([
      ['Alice', 'Female', 'District A'], ['Carol', 'Female', 'District B'],
    ])
    expect(new Set(result.candidates.map((player) => player.jerseyNumber)).size).toBe(2)
  })

  it('excludes case-insensitive duplicates in the file and existing team', async () => {
    const existing: Team[] = [{
      id: 'team-1', name: 'District A', color: '#000000', logo_url: '', created_at: '', updated_at: '',
      tournament_id: '', external_id: '', district: '', event_type: '',
      players: [{ id: 'p1', team_id: 'team-1', name: 'Existing Player', gender: 'Male', jersey_number: 8, status: 'playing', photo_url: '' }],
    }]
    const file = csvFile(`${header}\n1,Alice,Female,District A,approved\n2, alice ,Female,District A,approved\n3,EXISTING PLAYER,Male,district a,approved`)
    const result = await parsePlayerImport(file, existing)

    expect(result.candidates.filter((player) => player.included)).toHaveLength(1)
    expect(result.candidates.map((player) => player.duplicate)).toEqual([null, 'file', 'existing'])
    expect(result.issues).toHaveLength(2)
    expect(result.candidates[0].jerseyNumber).not.toBe(8)
  })

  it('reports missing required columns', async () => {
    await expect(parsePlayerImport(csvFile('Name,Team\nAlice,A'), [])).rejects.toThrow('Missing required columns')
  })

  it('excludes approved rows with missing required values', async () => {
    const result = await parsePlayerImport(csvFile(`${header}\n1,,Female,District A,approved\n2,Alice,,District A,approved`), [])
    expect(result.candidates.every((player) => !player.included)).toBe(true)
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(2)
  })

  it('handles quoted commas and embedded quotes in CSV data', async () => {
    const result = await parsePlayerImport(csvFile(`${header}\n1,"Kumar, Ajay",Male,"District ""Central""",approved`), [])
    expect(result.candidates[0].name).toBe('Kumar, Ajay')
    expect(result.candidates[0].district).toBe('District "Central"')
  })

  it('rejects oversized files before parsing', async () => {
    const file = { name: 'large.csv', size: 10 * 1024 * 1024 + 1, text: async () => header } as File
    await expect(parsePlayerImport(file, [])).rejects.toThrow('larger than 10 MB')
  })

  it('remains stable during concurrent parsing', async () => {
    const source = csvFile(`${header}\n1,Alice,Female,District A,approved\n2,Bob,Male,District A,approved`)
    const results = await Promise.all(Array.from({ length: 100 }, () => parsePlayerImport(source, [])))
    expect(results.every((result) => result.candidates.filter((player) => player.included).length === 2)).toBe(true)
  })
})

describe('teamColor', () => {
  it('is deterministic and returns a hex color', () => {
    expect(teamColor('District A')).toBe(teamColor('District A'))
    expect(teamColor('District A')).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('carries registration profile columns through to candidates', async () => {
    const csv = 'Player ID,Full Name,Gender,Category,District,Date of Birth,Age,Status,District Games,State Games,National Games,International Games\n' +
      'HSTAP7277,Daksh,Male,General,Sonipat,2009-01-31,17,approved,3,2,1,'
    const [player] = (await parsePlayerImport(csvFile(csv), [])).candidates
    expect(player.profile).toEqual({
      player_code: 'HSTAP7277', category: 'General', date_of_birth: '2009-01-31', age: 17,
      district_games: 3, state_games: 2, national_games: 1, international_games: 0,
    })
  })
})
