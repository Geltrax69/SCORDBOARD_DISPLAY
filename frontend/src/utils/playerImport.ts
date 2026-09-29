import type { Team } from '@/types'

export type ImportSeverity = 'error' | 'warning'

export interface ImportIssue {
  row: number
  severity: ImportSeverity
  message: string
}

export interface ImportCandidate {
  id: string
  row: number
  name: string
  gender: string
  district: string
  jerseyNumber: number
  included: boolean
  duplicate: 'file' | 'existing' | null
}

export interface PlayerImportResult {
  fileName: string
  totalRows: number
  approvedRows: number
  ignoredRows: number
  candidates: ImportCandidate[]
  issues: ImportIssue[]
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 5_000

const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ')
const key = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
export const identityKey = (value: string) => normalize(value).toLocaleLowerCase()

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'; i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell); cell = ''
    } else if (char === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

async function readRows(file: File): Promise<unknown[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv') return parseCsv(await file.text())
  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser')
    return readSheet(file)
  }
  throw new Error('Use an .xlsx or .csv file.')
}

function findColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map((header) => key(normalize(header)))
  return aliases.map(key).map((alias) => normalized.indexOf(alias)).find((index) => index >= 0) ?? -1
}

function normalizeGender(value: string) {
  const normalized = identityKey(value)
  if (normalized === 'male' || normalized === 'm') return 'Male'
  if (normalized === 'female' || normalized === 'f') return 'Female'
  if (['other', 'non-binary', 'nonbinary'].includes(normalized)) return 'Other'
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : ''
}

function randomAvailableJersey(used: Set<number>) {
  const available = Array.from({ length: 99 }, (_, index) => index + 1).filter((number) => !used.has(number))
  if (!available.length) return 0
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  const number = available[random[0] % available.length]
  used.add(number)
  return number
}

export async function parsePlayerImport(file: File, existingTeams: Team[]): Promise<PlayerImportResult> {
  if (file.size > MAX_FILE_SIZE) throw new Error('The file is larger than 10 MB.')

  const rows = await readRows(file)
  if (rows.length < 2) throw new Error('The spreadsheet does not contain any player rows.')
  if (rows.length - 1 > MAX_ROWS) throw new Error(`The spreadsheet has more than ${MAX_ROWS.toLocaleString()} rows.`)

  const headers = rows[0]
  const nameColumn = findColumn(headers, ['Full Name', 'Player Name'])
  const genderColumn = findColumn(headers, ['Gender', 'Sex'])
  const districtColumn = findColumn(headers, ['District', 'District Name', 'Team Name'])
  const statusColumn = findColumn(headers, ['Status', 'Approval Status', 'Registration Status'])
  const missing = [
    [nameColumn, 'Full Name'], [genderColumn, 'Gender'],
    [districtColumn, 'District'], [statusColumn, 'Status'],
  ].filter(([index]) => index === -1).map(([, label]) => label)
  if (missing.length) throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)

  const existingByDistrict = new Map(existingTeams.map((team) => [identityKey(team.name), team]))
  const jerseysByDistrict = new Map<string, Set<number>>()
  existingTeams.forEach((team) => {
    jerseysByDistrict.set(identityKey(team.name), new Set(team.players.map((player) => player.jersey_number).filter((number) => number > 0 && number <= 99)))
  })

  const issues: ImportIssue[] = []
  const candidates: ImportCandidate[] = []
  const seen = new Set<string>()
  let approvedRows = 0
  let ignoredRows = 0

  rows.slice(1).forEach((source, index) => {
    const row = index + 2
    if (!source.some((value) => normalize(value))) return
    const status = identityKey(normalize(source[statusColumn]))
    if (status !== 'approved') { ignoredRows += 1; return }
    approvedRows += 1

    const name = normalize(source[nameColumn])
    const genderRaw = normalize(source[genderColumn])
    const gender = normalizeGender(genderRaw)
    const district = normalize(source[districtColumn])
    const missingFields = [!name && 'Full Name', !gender && 'Gender', !district && 'District'].filter(Boolean)
    if (missingFields.length) {
      issues.push({ row, severity: 'error', message: `Missing ${missingFields.join(', ')}.` })
      candidates.push({ id: `row-${row}`, row, name, gender, district, jerseyNumber: 0, included: false, duplicate: null })
      return
    }

    if (!['Male', 'Female', 'Other'].includes(gender)) {
      issues.push({ row, severity: 'warning', message: `Unrecognized gender “${genderRaw}”; review before import.` })
    }

    const districtKey = identityKey(district)
    const playerKey = `${districtKey}\u0000${identityKey(name)}`
    const existingTeam = existingByDistrict.get(districtKey)
    const isFileDuplicate = seen.has(playerKey)
    const isExistingDuplicate = existingTeam?.players.some((player) => identityKey(player.name) === identityKey(name)) ?? false
    const duplicate = isFileDuplicate ? 'file' : isExistingDuplicate ? 'existing' : null
    if (duplicate) {
      issues.push({
        row,
        severity: 'warning',
        message: duplicate === 'file'
          ? `${name} appears more than once for ${district}.`
          : `${name} already exists in team ${existingTeam!.name}.`,
      })
    }
    seen.add(playerKey)

    const used = jerseysByDistrict.get(districtKey) ?? new Set<number>()
    jerseysByDistrict.set(districtKey, used)
    const jerseyNumber = duplicate ? 0 : randomAvailableJersey(used)
    if (!duplicate && jerseyNumber === 0) {
      issues.push({ row, severity: 'error', message: `${district} already uses all jersey numbers from 1 to 99.` })
    }

    candidates.push({
      id: `row-${row}`,
      row,
      name,
      gender,
      district,
      jerseyNumber,
      included: !duplicate && jerseyNumber > 0,
      duplicate,
    })
  })

  return { fileName: file.name, totalRows: rows.length - 1, approvedRows, ignoredRows, candidates, issues }
}

export function teamColor(name: string) {
  const palette = ['#6366F1', '#0EA5E9', '#14B8A6', '#22C55E', '#F59E0B', '#F97316', '#EC4899', '#8B5CF6']
  let hash = 0
  for (let index = 0; index < name.length; index += 1) hash = ((hash << 5) - hash + name.charCodeAt(index)) | 0
  return palette[Math.abs(hash) % palette.length]
}
