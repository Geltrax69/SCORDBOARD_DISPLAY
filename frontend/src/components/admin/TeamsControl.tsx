import { useEffect, useRef, useState } from 'react'
import { Users, Plus, Trash2, Pencil, Loader, Upload, X, Image as ImageIcon } from 'lucide-react'
import { listTeams, createTeam, updateTeam, deleteTeam, uploadTeamLogo } from '@/services/api'
import { scoreboardWS } from '@/services/websocket'
import { useAuthStore } from '@/store/authStore'
import { useMatchStore } from '@/store/matchStore'
import { Modal } from '@/components/common/Modal'
import { PlayersForm } from '@/components/admin/PlayersForm'
import type { Team, PlayerInput } from '@/types'

const inputCls =
  'w-full px-3.5 py-2.5 bg-dark-850 border border-dark-700 rounded-xl text-dark-100 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25 placeholder-dark-500 transition-all'

const blankForm = { name: '', color: '#3B82F6', logo_url: '' }

export function TeamsControl() {
  const token = useAuthStore((s) => s.token) ?? ''
  const tournaments = useMatchStore((s) => s.tournaments)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [form, setForm] = useState(blankForm)
  const [players, setPlayers] = useState<PlayerInput[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<Team | null>(null)
  const [genderFilter, setGenderFilter] = useState<'All' | 'Male' | 'Female'>('All')
  const genderCount = (g: string) => viewing?.players.filter((p) => g === 'All' || p.gender.toLowerCase() === g.toLowerCase()).length ?? 0
  const shownPlayers = viewing?.players.filter((p) => genderFilter === 'All' || p.gender.toLowerCase() === genderFilter.toLowerCase()) ?? []

  const load = async () => {
    try { setTeams(await listTeams()) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  // Refresh when the website sync adds/changes/removes teams.
  useEffect(() => scoreboardWS.subscribe((msg) => { if (msg.type === 'website_sync') load() }), [])

  const openNew = () => {
    setEditing(null); setForm(blankForm); setPlayers([]); setError(''); setOpen(true)
  }

  const openEdit = (t: Team) => {
    setEditing(t)
    setForm({ name: t.name, color: t.color, logo_url: t.logo_url })
    // Spread keeps the imported registration profile, so saving an edit doesn't wipe it.
    setPlayers(t.players.map(({ id: _id, team_id: _teamId, ...p }) => p))
    setError(''); setOpen(true)
  }

  const onPickLogo = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadTeamLogo(file)
      setForm((f) => ({ ...f, logo_url: url }))
    } finally { setUploading(false) }
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setError('')
    const payload = { ...form, players: players.filter((p) => p.name.trim()) }
    try {
      if (editing) await updateTeam(editing.id, payload)
      else await createTeam(payload)
      setOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to save team')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t: Team) => {
    if (!confirm(`Delete team "${t.name}"? Matches already created keep their players.`)) return
    await deleteTeam(t.id)
    await load()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-brand-400" />
          <h3 className="font-semibold text-dark-100">Teams</h3>
          <span className="text-xs font-bold text-dark-500 bg-dark-850 px-2 py-0.5 rounded-full">{teams.length}</span>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors">
          <Plus size={13} /> New Team
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader size={18} className="animate-spin text-dark-500" /></div>
      ) : teams.length === 0 ? (
        <p className="text-sm text-dark-500 py-6 text-center">
          No saved teams yet. Create one and its players load automatically when you set up a match.
        </p>
      ) : (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto">
          {/* Grouped by tournament: the same district can register in two
              tournaments, with the same team name but different players. */}
          {Object.entries(teams.reduce<Record<string, Team[]>>((acc, t) => {
            const k = t.tournament_id
            acc[k] = [...(acc[k] || []), t]
            return acc
          }, {})).sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1)).map(([tourId, group]) => {
            const tour = tournaments.find((x) => x.id === tourId)
            return (
          <div key={tourId || 'saved'} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-dark-500 pt-1">
              {tourId ? (tour?.name ?? 'Website tournament') : 'Saved teams'}
              {tour?.status === 'completed' && <span className="ml-1.5 normal-case tracking-normal font-semibold text-dark-600">· completed</span>}
            </p>
          {group.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-850 border border-dark-800">
              {t.logo_url
                ? <img src={t.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                : <div className="h-9 w-9 rounded-lg shrink-0" style={{ background: t.color }} />}
              <button onClick={() => { setViewing(t); setGenderFilter('All') }} className="min-w-0 flex-1 text-left" title="View players">
                <p className="text-sm font-bold text-dark-100 truncate hover:text-brand-400 transition-colors">{t.name}</p>
                <p className="text-xs text-dark-500">
                  {t.players.length} player{t.players.length === 1 ? '' : 's'}
                  {' · '}{t.players.filter((p) => p.gender.toLowerCase() === 'male').length} M
                  {' · '}{t.players.filter((p) => p.gender.toLowerCase() === 'female').length} F
                  {t.external_id && <>{' · '}<span className="text-brand-400">{t.district || 'Website'} · synced</span></>}
                </p>
              </button>
              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-dark-400 hover:text-brand-400 hover:bg-dark-800 transition-colors" title="Edit">
                <Pencil size={14} />
              </button>
              <button onClick={() => remove(t)} className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-800 transition-colors" title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          </div>
            )
          })}
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} size="xl" title={viewing?.name ?? ''}>
        <div className="flex gap-2 mb-4" role="group" aria-label="Filter by gender">
          {(['All', 'Male', 'Female'] as const).map((g) => (
            <button key={g} onClick={() => setGenderFilter(g)} aria-pressed={genderFilter === g}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${genderFilter === g ? 'bg-brand-600 text-white' : 'bg-dark-850 text-dark-400 hover:text-dark-100'}`}>
              {g} ({genderCount(g)})
            </button>
          ))}
        </div>
        {shownPlayers.length === 0 ? (
          <p className="text-sm text-dark-500 py-6 text-center">No players in this filter.</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {shownPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-dark-850 border border-dark-800">
                <span className="w-8 text-center font-mono text-sm font-bold tabular-nums" style={{ color: viewing?.color }}>{p.jersey_number || '–'}</span>
                {p.photo_url && <img src={p.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark-100 truncate">{p.name}</p>
                  <p className="text-xs text-dark-500 truncate">
                    {[p.gender, p.age ? `${p.age} yrs` : '', p.date_of_birth, p.category, p.player_code].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-xs text-dark-500 tabular-nums text-right" title="District · State · National · International games">
                  D {p.district_games ?? 0} · S {p.state_games ?? 0} · N {p.national_games ?? 0} · I {p.international_games ?? 0}
                </span>
                <span className="text-xs text-dark-600 uppercase">{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} size="xl"
        title={editing ? `Edit ${editing.name}` : 'New Team'}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setOpen(false)}
              className="flex-1 py-3 rounded-xl border border-dark-700 text-dark-300 text-sm font-semibold hover:bg-dark-800 transition-colors">Cancel</button>
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-all disabled:opacity-40">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Team'}
            </button>
          </div>
        }>
        <div className="space-y-5">
          <div>
            <label htmlFor="team-name" className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Team Name *</label>
            <input id="team-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls} placeholder="Team Alpha" autoFocus />
          </div>

          {/* Identity: the crest and the colour that represent this team on the display */}
          <div>
            <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Identity</p>
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-dark-900 border border-dark-800">
              {form.logo_url ? (
                <img src={form.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="h-11 w-11 rounded-xl grid place-items-center flex-shrink-0 border border-dashed border-dark-700"
                  style={{ background: `${form.color}1a` }}>
                  <ImageIcon size={15} style={{ color: form.color }} />
                </div>
              )}

              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => onPickLogo(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-700 text-dark-300 text-xs font-semibold hover:bg-dark-800 hover:text-dark-100 transition-colors disabled:opacity-50">
                {uploading ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? 'Uploading…' : form.logo_url ? 'Replace logo' : 'Upload logo'}
              </button>
              {form.logo_url && (
                <button onClick={() => setForm((f) => ({ ...f, logo_url: '' }))} aria-label="Remove logo"
                  className="p-2 rounded-lg text-dark-500 hover:text-danger hover:bg-danger/10 transition-colors"><X size={14} /></button>
              )}

              <label className="flex items-center gap-2 ml-auto cursor-pointer group"
                title="Team colour">
                <span className="h-8 w-8 rounded-lg border border-dark-700 group-hover:border-dark-600 transition-colors flex-shrink-0"
                  style={{ background: form.color }} />
                <span className="font-mono text-xs text-dark-400 tabular-nums uppercase">{form.color}</span>
                <input type="color" value={form.color} aria-label="Team colour"
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="sr-only" />
              </label>
            </div>
          </div>

          <div className="h-px bg-dark-850" />

          <PlayersForm teamColor={form.color}
            players={players} onChange={setPlayers} token={token} />

          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
        </div>
      </Modal>
    </>
  )
}
