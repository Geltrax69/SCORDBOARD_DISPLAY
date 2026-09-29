import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, RefreshCw, UploadCloud, Users } from 'lucide-react'
import { createTeam, listTeams, updateTeam } from '@/services/api'
import { identityKey, parsePlayerImport, teamColor } from '@/utils/playerImport'
import type { ImportCandidate, PlayerImportResult } from '@/utils/playerImport'
import type { PlayerInput, Team } from '@/types'

interface Props {
  onImported?: (teams: Team[]) => void
}

const inputClass = 'bg-dark-900 border border-dark-700 rounded-lg text-dark-100 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-500/30'

export function PlayerImport({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<PlayerImportResult | null>(null)
  const [existingTeams, setExistingTeams] = useState<Team[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [progress, setProgress] = useState('')

  const groups = useMemo(() => {
    if (!result) return []
    const byDistrict = new Map<string, ImportCandidate[]>()
    result.candidates.forEach((player) => {
      if (!player.district) return
      const rows = byDistrict.get(player.district) ?? []
      rows.push(player)
      byDistrict.set(player.district, rows)
    })
    return [...byDistrict.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [result])

  const selectedCount = result?.candidates.filter((player) => player.included).length ?? 0
  const duplicateCount = result?.candidates.filter((player) => player.duplicate).length ?? 0
  const errorCount = result?.issues.filter((issue) => issue.severity === 'error').length ?? 0

  const readFile = async (file?: File) => {
    if (!file) return
    setParsing(true); setError(''); setSuccess(''); setResult(null)
    try {
      const teams = await listTeams()
      setExistingTeams(teams)
      setResult(await parsePlayerImport(file, teams))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this spreadsheet.')
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const updateCandidate = (id: string, patch: Partial<ImportCandidate>) => {
    setResult((current) => current ? {
      ...current,
      candidates: current.candidates.map((player) => player.id === id ? { ...player, ...patch } : player),
    } : current)
  }

  const importTeams = async () => {
    if (!result || selectedCount === 0) return
    for (const [district, players] of groups) {
      const selected = players.filter((player) => player.included)
      const existing = existingTeams.find((team) => identityKey(team.name) === identityKey(district))
      const names = new Set(existing?.players.map((player) => identityKey(player.name)) ?? [])
      const jerseys = new Set(existing?.players.map((player) => player.jersey_number).filter((number) => number > 0) ?? [])
      for (const player of selected) {
        if (!player.name.trim()) { setError(`Full Name is required in ${district}.`); return }
        if (!player.gender) { setError(`Gender is required for ${player.name} in ${district}.`); return }
        if (!Number.isInteger(player.jerseyNumber) || player.jerseyNumber < 1 || player.jerseyNumber > 99) {
          setError(`Jersey number for ${player.name} must be a whole number from 1 to 99.`); return
        }
        const playerName = identityKey(player.name)
        if (names.has(playerName)) { setError(`${player.name} is duplicated in ${district}.`); return }
        if (jerseys.has(player.jerseyNumber)) { setError(`Jersey number ${player.jerseyNumber} is duplicated in ${district}.`); return }
        names.add(playerName); jerseys.add(player.jerseyNumber)
      }
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      const existingByName = new Map(existingTeams.map((team) => [identityKey(team.name), team]))
      const selectedGroups = groups
        .map(([district, players]) => [district, players.filter((player) => player.included)] as const)
        .filter(([, players]) => players.length > 0)

      let created = 0
      let updated = 0
      for (let index = 0; index < selectedGroups.length; index += 1) {
        const [district, candidates] = selectedGroups[index]
        setProgress(`Saving ${index + 1} of ${selectedGroups.length}: ${district}`)
        const imported: PlayerInput[] = candidates.map((player) => ({
          name: player.name.trim(),
          gender: player.gender,
          jersey_number: player.jerseyNumber,
          status: 'playing',
          photo_url: '',
        }))
        const existing = existingByName.get(identityKey(district))
        if (existing) {
          const current: PlayerInput[] = existing.players.map((player) => ({
            name: player.name,
            gender: player.gender,
            jersey_number: player.jersey_number,
            status: player.status,
            photo_url: player.photo_url,
          }))
          await updateTeam(existing.id, {
            name: existing.name,
            color: existing.color,
            logo_url: existing.logo_url,
            players: [...current, ...imported],
          })
          updated += 1
        } else {
          await createTeam({ name: district, color: teamColor(district), players: imported })
          created += 1
        }
      }

      const teams = await listTeams()
      onImported?.(teams)
      setSuccess(`${selectedCount} players imported. ${created} teams created and ${updated} teams updated.`)
      setResult(null)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'The import stopped before all teams could be saved. Review the Teams tab before retrying.')
    } finally {
      setSaving(false); setProgress('')
    }
  }

  if (!result) {
    return (
      <section className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1.5">
            <FileSpreadsheet size={19} className="text-brand-400" />
            <h2 className="text-lg font-bold text-white">Upload player registrations</h2>
          </div>
          <p className="text-sm text-dark-400 max-w-2xl">
            Upload the registration export. Only rows with an Approved status are included. District becomes the team name; Full Name and Gender become player details.
          </p>
        </div>

        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={(event) => readFile(event.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]) }}
          className={`w-full min-h-64 border border-dashed rounded-2xl flex flex-col items-center justify-center px-6 text-center transition-colors
            ${dragging ? 'border-brand-400 bg-brand-500/10' : 'border-dark-700 bg-dark-900 hover:border-dark-600 hover:bg-dark-850'}`}>
          {parsing ? <Loader2 size={32} className="animate-spin text-brand-400 mb-4" /> : <UploadCloud size={34} className="text-brand-400 mb-4" />}
          <span className="text-base font-bold text-dark-100">{parsing ? 'Reading registrations…' : 'Choose an Excel or CSV file'}</span>
          <span className="mt-1.5 text-xs text-dark-500">XLSX or CSV, up to 10 MB</span>
        </button>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-dark-500">
          <span>Required columns: Full Name, Gender, District, Status</span>
          <span>Duplicate players are skipped</span>
          <span>Jersey numbers are generated from 1–99</span>
        </div>
        {error && <p className="mt-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-sm text-red-300" role="alert">{error}</p>}
        {success && <p className="mt-4 px-4 py-3 rounded-xl bg-live/10 border border-live/30 text-sm text-green-300" role="status">{success}</p>}
      </section>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <FileSpreadsheet size={18} className="text-brand-400" />
            <h2 className="text-lg font-bold text-white">Verify player import</h2>
          </div>
          <p className="text-sm text-dark-400">{result.fileName} · Review the approved players before saving.</p>
        </div>
        <button onClick={() => setResult(null)} disabled={saving}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-700 text-xs font-semibold text-dark-300 hover:bg-dark-800 disabled:opacity-40">
          <RefreshCw size={13} /> Choose another file
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5" aria-label="Import summary">
        {[
          [`${selectedCount}`, 'ready', 'text-live bg-live/10 border-live/25'],
          [`${groups.length}`, 'district teams', 'text-brand-300 bg-brand-500/10 border-brand-500/25'],
          [`${result.ignoredRows}`, 'not approved', 'text-dark-300 bg-dark-850 border-dark-700'],
          [`${duplicateCount}`, 'duplicates', 'text-timeout bg-timeout/10 border-timeout/25'],
          [`${errorCount}`, 'errors', 'text-red-300 bg-danger/10 border-danger/25'],
        ].map(([value, label, classes]) => (
          <span key={label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${classes}`}>
            <strong className="tabular-nums text-sm">{value}</strong> {label}
          </span>
        ))}
      </div>

      {result.issues.length > 0 && (
        <details className="mb-5 rounded-xl border border-timeout/25 bg-timeout/5" open={errorCount > 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-200">
            <AlertCircle size={15} /> {result.issues.length} validation notice{result.issues.length === 1 ? '' : 's'}
            <ChevronDown size={14} className="ml-auto" />
          </summary>
          <div className="border-t border-timeout/15 px-4 py-3 max-h-40 overflow-y-auto space-y-1.5">
            {result.issues.map((issue, index) => (
              <p key={`${issue.row}-${index}`} className={issue.severity === 'error' ? 'text-xs text-red-300' : 'text-xs text-amber-200'}>
                Row {issue.row}: {issue.message}
              </p>
            ))}
          </div>
        </details>
      )}

      <div className="space-y-3">
        {groups.map(([district, players], groupIndex) => {
          const ready = players.filter((player) => player.included).length
          const existing = existingTeams.find((team) => identityKey(team.name) === identityKey(district))
          return (
            <details key={district} className="rounded-xl border border-dark-750 bg-dark-900 overflow-hidden" open={groupIndex === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-dark-850 transition-colors">
                <span className="h-8 w-8 rounded-lg grid place-items-center" style={{ backgroundColor: `${teamColor(district)}18`, color: teamColor(district) }}>
                  <Users size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-dark-100 truncate">{district}</span>
                  <span className="block text-xs text-dark-500">{existing ? `Update existing team · ${existing.players.length} current` : 'Create new team'}</span>
                </span>
                <span className="text-xs font-bold text-live tabular-nums">{ready} ready</span>
                <ChevronDown size={14} className="text-dark-500" />
              </summary>
              <div className="border-t border-dark-800 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead className="bg-dark-925 text-[11px] text-dark-400">
                    <tr><th className="w-12 px-4 py-2.5">Use</th><th className="px-3 py-2.5">Full Name</th><th className="w-32 px-3 py-2.5">Gender</th><th className="w-28 px-3 py-2.5">Jersey No.</th><th className="w-40 px-3 py-2.5">Validation</th></tr>
                  </thead>
                  <tbody className="divide-y divide-dark-850">
                    {players.map((player) => (
                      <tr key={player.id} className={player.included ? 'bg-transparent' : 'bg-dark-950/40'}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={player.included} disabled={Boolean(player.duplicate) || player.jerseyNumber === 0}
                            onChange={(event) => updateCandidate(player.id, { included: event.target.checked })}
                            className="h-4 w-4 rounded border-dark-600 bg-dark-850 text-brand-500 focus:ring-brand-500/40 disabled:opacity-40" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input value={player.name} disabled={!player.included}
                            onChange={(event) => updateCandidate(player.id, { name: event.target.value })}
                            className={`${inputClass} w-full px-2.5 py-1.5 text-sm disabled:opacity-50`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <select value={player.gender} disabled={!player.included}
                            onChange={(event) => updateCandidate(player.id, { gender: event.target.value })}
                            className={`${inputClass} w-full px-2 py-1.5 text-xs disabled:opacity-50`}>
                            <option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min={1} max={99} value={player.jerseyNumber || ''} disabled={!player.included}
                            onChange={(event) => updateCandidate(player.id, { jerseyNumber: Number(event.target.value) })}
                            className={`${inputClass} w-20 px-2 py-1.5 text-center text-sm font-bold tabular-nums disabled:opacity-50`} />
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {player.duplicate ? <span className="text-amber-300">Duplicate {player.duplicate === 'file' ? 'in file' : 'in team'}</span>
                            : player.included ? <span className="inline-flex items-center gap-1 text-live"><CheckCircle2 size={12} /> Ready</span>
                              : <span className="text-dark-500">Excluded</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )
        })}
      </div>

      {error && <p className="mt-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-sm text-red-300" role="alert">{error}</p>}
      <div className="sticky bottom-3 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark-700 bg-dark-925 px-4 py-3 shadow-card">
        <p className="text-xs text-dark-400">{saving ? progress : `${selectedCount} approved players will be added to ${groups.filter(([, players]) => players.some((player) => player.included)).length} teams.`}</p>
        <button onClick={importTeams} disabled={saving || selectedCount === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
          {saving ? 'Importing…' : `Import ${selectedCount} players`}
        </button>
      </div>
    </section>
  )
}
