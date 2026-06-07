import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuthStore } from '@/store/authStore'
import { useMatchStore } from '@/store/matchStore'
import { useWSStore } from '@/store/wsStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { listTournaments, listMatches, listCourts, createTournament, createCourt, createMatch, updateMatchStatus, deleteMatch, uploadTeamLogo } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import { Modal } from '@/components/common/Modal'
import { PageLoader } from '@/components/common/LoadingSpinner'
import { DeviceDashboard } from '@/components/admin/DeviceDashboard'
import { DisplayControl } from '@/components/admin/DisplayControl'
import { MatchQRModal } from '@/components/admin/MatchQRModal'
import { PlayersForm } from '@/components/admin/PlayersForm'
import {
  Trophy, MapPin, Zap, Plus, ExternalLink,
  Wifi, WifiOff, Copy, Check, ChevronRight,
  QrCode, Activity, TrendingUp, StopCircle, Trash2,
  Upload, X, ImageIcon, Loader2,
} from 'lucide-react'

import type { ServerInfo, PlayerInput, Match } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

const STATUS_META: Record<string, { label: string; dot: string; bg: string; border: string; text: string }> = {
  active:    { label: 'LIVE',      dot: 'bg-live animate-pulse',    bg: 'bg-live/10',    border: 'border-live/20',    text: 'text-live' },
  pending:   { label: 'PENDING',   dot: 'bg-timeout',              bg: 'bg-timeout/10', border: 'border-timeout/20', text: 'text-timeout' },
  timeout:   { label: 'TIMEOUT',   dot: 'bg-timeout animate-pulse', bg: 'bg-timeout/10', border: 'border-timeout/20', text: 'text-timeout' },
  completed: { label: 'FINAL',     dot: 'bg-dark-600',              bg: 'bg-dark-800',   border: 'border-dark-750',   text: 'text-dark-500' },
  paused:    { label: 'PAUSED',    dot: 'bg-info',                  bg: 'bg-info/10',    border: 'border-info/20',    text: 'text-info' },
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border', m.bg, m.border, m.text)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', m.dot)} />
      {m.label}
    </span>
  )
}

function StatCard({ label, value, icon, color, glow }: { label: string; value: number; icon: React.ReactNode; color: string; glow: string }) {
  return (
    <div className={clsx('card-hi p-5 relative overflow-hidden group hover:border-dark-700 transition-all duration-200', glow && `hover:shadow-${glow}`)}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(circle at top right, ${color}08 0%, transparent 60%)` }} />
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-semibold text-dark-500 uppercase tracking-wider mb-3">{label}</p>
          <p className="text-4xl font-black text-white">{value}</p>
        </div>
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}15`, color }}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function ActiveMatchCard({ match, onQR, onStop, onDelete, isAdmin }: {
  match: Match; onQR: () => void; onStop: () => void; onDelete: () => void; isAdmin: boolean
}) {
  const m = match
  return (
    <Link to={`/match/${m.id}`} className="group block">
      <div className="card-hi overflow-hidden hover:border-dark-700 transition-all duration-200 hover:translate-y-[-2px] hover:shadow-card-hi">
        {/* Top color bar */}
        <div className="h-1 w-full" style={{ background: `linear-gradient(to right, ${m.team_a_color}, ${m.team_b_color})` }} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <StatusBadge status={m.status} />
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.preventDefault(); onQR() }}
                className="flex items-center gap-1 text-xs text-dark-600 hover:text-brand-400 transition-colors px-2 py-1 rounded-lg hover:bg-brand-500/10"
              >
                <QrCode size={11} />
                <span className="font-mono font-bold">{m.match_code}</span>
              </button>
              <span className="text-xs text-dark-600">{m.court_name}</span>
            </div>
          </div>

          {/* Score */}
          <div className="flex items-center">
            {/* Team A */}
            <div className="flex-1 min-w-0">
              {m.team_a_logo && (
                <img src={m.team_a_logo} alt="" className="h-7 w-7 rounded-lg object-cover mb-1.5"
                  onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
              <p className="text-sm font-bold truncate" style={{ color: m.team_a_color }}>{m.team_a}</p>
            </div>

            {/* Score display */}
            <div className="flex items-center gap-3 px-4 flex-shrink-0">
              <span className="score-digit text-5xl font-black text-white tabular-nums"
                style={{ filter: `drop-shadow(0 0 12px ${m.team_a_color}50)` }}>
                {m.score_a}
              </span>
              <span className="text-dark-700 text-2xl font-black">:</span>
              <span className="score-digit text-5xl font-black text-white tabular-nums"
                style={{ filter: `drop-shadow(0 0 12px ${m.team_b_color}50)` }}>
                {m.score_b}
              </span>
            </div>

            {/* Team B */}
            <div className="flex-1 min-w-0 text-right">
              {m.team_b_logo && (
                <img src={m.team_b_logo} alt="" className="h-7 w-7 rounded-lg object-cover mb-1.5 ml-auto"
                  onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
              <p className="text-sm font-bold truncate" style={{ color: m.team_b_color }}>{m.team_b}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-dark-850">
            <span className="text-xs text-dark-600 truncate max-w-[140px]">{m.tournament_name}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isAdmin && (
                <>
                  <button onClick={(e) => { e.preventDefault(); onStop() }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-dark-500 hover:text-timeout hover:bg-timeout/10 transition-colors">
                    <StopCircle size={12} /> Stop
                  </button>
                  <button onClick={(e) => { e.preventDefault(); onDelete() }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-dark-500 hover:text-danger hover:bg-danger/10 transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                </>
              )}
              <span className="flex items-center gap-1 text-xs text-dark-600 group-hover:text-brand-400 transition-colors ml-1">
                <ExternalLink size={11} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const user  = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const wsStatus = useWSStore((s) => s.status)
  const toast    = useToastStore()
  const { tournaments, courts, matches, setTournaments, setCourts, setMatches } = useMatchStore()
  const [loading, setLoading]     = useState(true)
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [copied, setCopied]       = useState(false)
  const [qrMatch, setQrMatch]     = useState<Match | null>(null)

  const fetchServerInfo = () => {
    if (token) {
      fetch(`${API_BASE}/server-info`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).then(setServerInfo).catch(() => {})
    }
  }
  const [confirmDelete, setConfirmDelete] = useState<Match | null>(null)
  const [actionMatch, setActionMatch]     = useState<string | null>(null)

  // Modals
  const [tourModal,  setTourModal]  = useState(false)
  const [courtModal, setCourtModal] = useState(false)
  const [matchModal, setMatchModal] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [logoUploading, setLogoUploading] = useState<'A' | 'B' | null>(null)
  const [activeTeam, setActiveTeam] = useState<'A' | 'B'>('A')

  // Forms
  const [tourName, setTourName]   = useState('')
  const [tourSport, setTourSport] = useState('')
  const [courtName, setCourtName] = useState('')
  const [courtTourId, setCourtTourId] = useState('')
  const [matchStep, setMatchStep] = useState<1|2|3>(1)
  const [matchForm, setMatchForm] = useState({
    court_id: '', tournament_id: '', team_a: '', team_b: '',
    team_a_color: '#3B82F6', team_b_color: '#EF4444',
    team_a_logo: '', team_b_logo: '',
  })
  const [playersA, setPlayersA] = useState<PlayerInput[]>([])
  const [playersB, setPlayersB] = useState<PlayerInput[]>([])

  useWebSocket()

  useEffect(() => {
    Promise.all([listTournaments(), listMatches(), listCourts()]).then(([ts, ms, cs]) => {
      setTournaments(ts); setMatches(ms); setCourts(cs); setLoading(false)
    })
    fetchServerInfo()
  }, [])

  const isSuperAdmin  = user?.role === 'super_admin'
  const activeMatches = matches.filter((m) => m.status === 'active' || m.status === 'timeout')

  // ── Safe async runner: shows toast on error, never stays stuck (10s timeout) ──
  const safeRun = async (
    fn: () => Promise<void>,
    matchId: string,
    opts: { loading?: string; success: string; error?: string }
  ) => {
    if (actionMatch) return
    setActionMatch(matchId)

    const timeoutId = setTimeout(() => {
      setActionMatch(null)
      toast.error('Request timed out', 'Check that the backend is running and try again')
    }, 10_000)

    try {
      if (opts.loading) toast.info(opts.loading)
      await fn()
      toast.success(opts.success)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(opts.error ?? 'Action failed', msg)
    } finally {
      clearTimeout(timeoutId)
      setActionMatch(null)
    }
  }

  const handleStopMatch = (m: Match) =>
    safeRun(async () => {
      await updateMatchStatus(m.id, 'cancelled')
      const updated = await listMatches()
      setMatches(updated)
    }, m.id, {
      success: `"${m.team_a} vs ${m.team_b}" stopped`,
      error: 'Could not stop match',
    })

  const handleDeleteMatch = (m: Match) =>
    safeRun(async () => {
      await deleteMatch(m.id)
      setMatches(matches.filter((x) => x.id !== m.id))
      setConfirmDelete(null)
    }, m.id, {
      loading: 'Deleting match…',
      success: `"${m.team_a} vs ${m.team_b}" deleted`,
      error: 'Delete failed — check backend is running',
    })

  const copyURL = (url: string) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const handleCreateTournament = async () => {
    if (!tourName.trim()) { toast.warn('Tournament name required'); return }
    setSaving(true)
    try {
      const t = await toast.promise(
        createTournament({ name: tourName, sport: tourSport || 'general' }),
        { loading: 'Creating tournament…', success: `"${tourName}" created!`, error: 'Failed to create tournament' }
      )
      setTournaments([t, ...tournaments])
      setTourModal(false); setTourName(''); setTourSport('')
    } catch {} finally { setSaving(false) }
  }

  const handleCreateCourt = async () => {
    if (!courtName.trim() || !courtTourId) { toast.warn('Select a tournament and enter a court name'); return }
    setSaving(true)
    try {
      const c = await toast.promise(
        createCourt({ name: courtName, tournament_id: courtTourId }),
        { loading: 'Creating court…', success: `"${courtName}" created!`, error: 'Failed to create court' }
      )
      setCourts([...courts, c])
      setCourtModal(false); setCourtName('')
    } catch {} finally { setSaving(false) }
  }

  const handleCreateMatch = async () => {
    setSaving(true)
    try {
      const m = await toast.promise(
        createMatch({
          ...matchForm,
          players_a: playersA.filter((p) => p.name.trim()),
          players_b: playersB.filter((p) => p.name.trim()),
        }),
        {
          loading: 'Creating match…',
          success: (m) => `Match "${m.team_a} vs ${m.team_b}" created! Code: #${m.match_code}`,
          error: (err) => (err as any)?.response?.data?.error ?? 'Failed to create match',
        }
      )
      setMatches([m, ...matches])
      setMatchModal(false); resetMatchForm()
    } catch {} finally { setSaving(false) }
  }

  const resetMatchForm = () => {
    setMatchStep(1)
    setMatchForm({ court_id: '', tournament_id: '', team_a: '', team_b: '', team_a_color: '#3B82F6', team_b_color: '#EF4444', team_a_logo: '', team_b_logo: '' })
    setPlayersA([]); setPlayersB([])
  }

  const filteredCourts = matchForm.tournament_id ? courts.filter((c) => c.tournament_id === matchForm.tournament_id) : courts

  if (loading) return <PageLoader />

  const inputCls = 'w-full px-3.5 py-2.5 bg-dark-850 border border-dark-700 rounded-xl text-dark-100 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25 placeholder-dark-500 transition-all'
  const selectCls = inputCls + ' cursor-pointer'

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Hero gradient header */}
      <div className="relative overflow-hidden border-b border-dark-850">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-32 bg-brand-600/10 blur-[80px]" />
          <div className="absolute top-0 right-1/4 w-64 h-32 bg-live/5 blur-[80px]" />
        </div>
        <div className="relative px-6 py-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity size={14} className="text-brand-400" />
                <span className="text-xs text-dark-500 font-medium uppercase tracking-widest">Tournament Dashboard</span>
              </div>
              <h1 className="text-2xl font-black text-white">Welcome back, {user?.name} 👋</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border',
                wsStatus === 'connected'
                  ? 'text-live bg-live/10 border-live/20'
                  : 'text-dark-500 bg-dark-800 border-dark-750',
              )}>
                {wsStatus === 'connected' ? <Wifi size={11} /> : <WifiOff size={11} />}
                {wsStatus === 'connected' ? 'Live Connected' : 'Offline'}
              </div>
              {isSuperAdmin && (
                <button onClick={() => { resetMatchForm(); setMatchModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white
                             bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400
                             transition-all shadow-glow-brand/0 hover:shadow-glow-brand btn-neon">
                  <Plus size={15} />
                  New Match
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Tournaments" value={tournaments.length} color="#6366f1" glow="glow-brand"
            icon={<Trophy size={20} />} />
          <StatCard label="Courts" value={courts.length} color="#38bdf8" glow=""
            icon={<MapPin size={20} />} />
          <StatCard label="Live Now" value={activeMatches.length} color="#22c55e" glow="glow-green"
            icon={<Zap size={20} />} />
        </div>

        {/* Network panel */}
        {serverInfo && (
          <div className="card-hi p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-live animate-pulse" />
              <h2 className="text-sm font-bold text-dark-100 uppercase tracking-wider">Local Network</h2>
              <span className="ml-auto text-xs text-dark-600">Scorer devices connect here</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-5">
              {/* URLs */}
              <div className="flex-1 space-y-3">
                {[
                  { label: 'Scorer Connect URL', url: serverInfo.connect_url, accent: '#22c55e' },
                  { label: 'Display URL',        url: serverInfo.display_url,  accent: '#6366f1' },
                ].map(({ label, url, accent }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-dark-500 uppercase tracking-wider mb-1.5">{label}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 rounded-xl bg-dark-900 border border-dark-750 flex items-center gap-2 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
                        <code className="text-xs truncate" style={{ color: accent }}>{url}</code>
                      </div>
                      <button onClick={() => copyURL(url)}
                        className="p-2 rounded-lg text-dark-500 hover:text-dark-100 hover:bg-dark-700 transition-colors flex-shrink-0">
                        {copied ? <Check size={14} className="text-live" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-dark-700 pt-1">
                  Scorers open the connect URL on their device, enter the 4-digit match code, and start scoring immediately.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active Matches */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
              <h2 className="text-lg font-bold text-white">Active Matches</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-live/10 border border-live/20 text-live text-xs font-bold">
              {activeMatches.length}
            </span>
          </div>

          {activeMatches.length === 0 ? (
            <div className="card-hi py-16 flex flex-col items-center gap-3 text-dark-600">
              <div className="p-4 rounded-2xl bg-dark-900"><Zap size={24} className="opacity-30" /></div>
              <p className="text-sm font-medium">No active matches right now</p>
              <p className="text-xs text-dark-700">Start a match from the match list below</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeMatches.map((m) => (
                <ActiveMatchCard key={m.id} match={m}
                  onQR={() => { fetchServerInfo(); setQrMatch(m) }}
                  onStop={() => handleStopMatch(m)}
                  onDelete={() => setConfirmDelete(m)}
                  isAdmin={isSuperAdmin}
                />
              ))}
            </div>
          )}
        </section>

        {/* All Matches */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp size={16} className="text-dark-500" />
            <h2 className="text-lg font-bold text-white">All Matches</h2>
          </div>

          <div className="card-hi overflow-hidden">
            {matches.length === 0 ? (
              <div className="py-12 text-center text-dark-600 text-sm">No matches created yet</div>
            ) : (
              <div className="divide-y divide-dark-850">
                {matches.map((m) => (
                  <Link key={m.id} to={`/match/${m.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-dark-900/60 transition-colors group">
                    {/* Color accent bar */}
                    <div className="w-1 h-8 rounded-full flex-shrink-0"
                      style={{ background: `linear-gradient(to bottom, ${m.team_a_color}, ${m.team_b_color})` }} />
                    <StatusBadge status={m.status} />
                    <span className="font-mono text-xs text-dark-700 hidden sm:block flex-shrink-0">#{m.match_code}</span>
                    <span className="text-xs text-dark-600 w-16 truncate hidden sm:block flex-shrink-0">{m.court_name}</span>
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className="font-semibold text-dark-200 text-sm truncate">{m.team_a}</span>
                      <span className="font-black text-white text-lg tabular-nums px-3 flex-shrink-0 font-score">
                        {m.score_a} <span className="text-dark-700">–</span> {m.score_b}
                      </span>
                      <span className="font-semibold text-dark-200 text-sm truncate text-right">{m.team_b}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.preventDefault(); fetchServerInfo(); setQrMatch(m) }}
                        className="p-1.5 rounded-lg text-dark-700 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                        title="Show QR code"
                      ><QrCode size={14} /></button>
                      {isSuperAdmin && m.status !== 'completed' && m.status !== 'cancelled' && (
                        <button
                          onClick={(e) => { e.preventDefault(); handleStopMatch(m) }}
                          disabled={actionMatch === m.id}
                          className="p-1.5 rounded-lg text-dark-700 hover:text-timeout hover:bg-timeout/10 transition-colors disabled:opacity-40"
                          title="Stop match"
                        >
                          {actionMatch === m.id ? (
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg>
                          ) : <StopCircle size={14} />}
                        </button>
                      )}
                      {isSuperAdmin && (
                        <button
                          onClick={(e) => { e.preventDefault(); setConfirmDelete(m) }}
                          className="p-1.5 rounded-lg text-dark-700 hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Delete match"
                        ><Trash2 size={14} /></button>
                      )}
                      <ExternalLink size={13} className="text-dark-700 group-hover:text-dark-400 transition-colors ml-1" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Two-column: Display Control + Quick Create */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Display Control */}
          {isSuperAdmin && (
            <div className="card-hi p-5">
              <DisplayControl matches={matches} />
            </div>
          )}

          {/* Quick Create */}
          {isSuperAdmin && (
            <div className="card-hi p-5">
              <div className="flex items-center gap-2 mb-4">
                <Plus size={15} className="text-brand-400" />
                <h3 className="font-semibold text-dark-100">Quick Create</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'New Tournament', desc: 'Create a tournament', onClick: () => setTourModal(true), color: '#6366f1' },
                  { label: 'New Court',      desc: 'Add a court', onClick: () => setCourtModal(true), color: '#38bdf8' },
                ].map(({ label, desc, onClick, color }) => (
                  <button key={label} onClick={onClick}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl bg-dark-900 border border-dark-750
                               hover:border-dark-700 hover:bg-dark-850 transition-all text-left group">
                    <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15` }}>
                      <Plus size={16} style={{ color }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-dark-100">{label}</p>
                      <p className="text-xs text-dark-600">{desc}</p>
                    </div>
                    <ChevronRight size={14} className="text-dark-700 group-hover:text-dark-400 transition-colors" />
                  </button>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-dark-850 text-xs text-dark-700">
                {tournaments.length} tournaments · {courts.length} courts · {matches.length} total matches
              </div>
            </div>
          )}
        </div>

        {/* Connected Devices */}
        {isSuperAdmin && token && (
          <div className="card-hi p-5">
            <DeviceDashboard token={token} />
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <Modal open={tourModal} onClose={() => setTourModal(false)} title="New Tournament">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-1.5">Name *</label>
            <input value={tourName} onChange={(e) => setTourName(e.target.value)} className={inputCls} placeholder="Spring Championship 2025" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-1.5">Sport</label>
            <input value={tourSport} onChange={(e) => setTourSport(e.target.value)} className={inputCls} placeholder="Basketball, Volleyball…" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setTourModal(false)} className="flex-1 py-2.5 rounded-xl border border-dark-700 text-dark-300 text-sm font-medium hover:bg-dark-800 transition-colors">Cancel</button>
            <button onClick={handleCreateTournament} disabled={saving || !tourName.trim()}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={courtModal} onClose={() => setCourtModal(false)} title="New Court">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-1.5">Tournament *</label>
            <select value={courtTourId} onChange={(e) => setCourtTourId(e.target.value)} className={selectCls}>
              <option value="">Select tournament…</option>
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {tournaments.length === 0 && <p className="text-xs text-timeout mt-1">Create a tournament first</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-1.5">Court Name *</label>
            <input value={courtName} onChange={(e) => setCourtName(e.target.value)} className={inputCls} placeholder="Court A" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setCourtModal(false)} className="flex-1 py-2.5 rounded-xl border border-dark-700 text-dark-300 text-sm font-medium hover:bg-dark-800 transition-colors">Cancel</button>
            <button onClick={handleCreateCourt} disabled={saving || !courtTourId || !courtName.trim()}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Match modal - 3 steps */}
      <Modal open={matchModal} onClose={() => { setMatchModal(false); resetMatchForm() }} title={`New Match · Step ${matchStep} of 3`} size="xl">
        {/* Step indicator */}
        <div className="flex items-center mb-6 pb-5 border-b border-dark-850">
          {(['Teams', 'Colors & Logos', 'Players'] as const).map((label, i) => (
            <div key={label} className="flex items-center gap-2.5 flex-1 last:flex-none">
              <div className={clsx(
                'w-7 h-7 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 transition-all',
                matchStep > i + 1 ? 'bg-live text-dark-950' : matchStep === i + 1 ? 'bg-brand-500 text-white ring-2 ring-brand-500/30' : 'bg-dark-850 text-dark-600 border border-dark-750',
              )}>{matchStep > i + 1 ? '✓' : i + 1}</div>
              <span className={clsx('text-sm font-semibold', matchStep === i + 1 ? 'text-white' : matchStep > i + 1 ? 'text-live' : 'text-dark-600')}>{label}</span>
              {i < 2 && <div className={clsx('flex-1 h-px mx-2', matchStep > i + 1 ? 'bg-live/40' : 'bg-dark-800')} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {matchStep === 1 && (
          <div className="space-y-5">
            {/* Venue */}
            <div>
              <p className="text-xs font-bold text-dark-600 uppercase tracking-widest mb-3">Venue</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Tournament *</label>
                  <select value={matchForm.tournament_id} onChange={(e) => setMatchForm(f => ({ ...f, tournament_id: e.target.value, court_id: '' }))} className={selectCls}>
                    <option value="">Select tournament…</option>
                    {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {tournaments.length === 0 && <p className="text-xs text-timeout mt-1.5">Create a tournament first</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Court *</label>
                  <select value={matchForm.court_id} onChange={(e) => setMatchForm(f => ({ ...f, court_id: e.target.value }))} className={selectCls} disabled={!matchForm.tournament_id}>
                    <option value="">Select court…</option>
                    {filteredCourts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {matchForm.tournament_id && filteredCourts.length === 0 && <p className="text-xs text-timeout mt-1.5">No courts for this tournament</p>}
                </div>
              </div>
            </div>

            <div className="h-px bg-dark-850" />

            {/* Teams */}
            <div>
              <p className="text-xs font-bold text-dark-600 uppercase tracking-widest mb-3">Teams</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Team A *</label>
                  <input value={matchForm.team_a} onChange={(e) => setMatchForm(f => ({ ...f, team_a: e.target.value }))} className={inputCls} placeholder="Team Alpha" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Team B *</label>
                  <input value={matchForm.team_b} onChange={(e) => setMatchForm(f => ({ ...f, team_b: e.target.value }))} className={inputCls} placeholder="Team Bravo" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setMatchModal(false); resetMatchForm() }} className="flex-1 py-3 rounded-xl border border-dark-700 text-dark-300 text-sm font-semibold hover:bg-dark-800 transition-colors">Cancel</button>
              <button onClick={() => setMatchStep(2)} disabled={!matchForm.tournament_id || !matchForm.court_id || !matchForm.team_a || !matchForm.team_b}
                className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {matchStep === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              {(['A', 'B'] as const).map((team) => {
                const color    = team === 'A' ? matchForm.team_a_color : matchForm.team_b_color
                const name     = team === 'A' ? matchForm.team_a : matchForm.team_b
                const logoKey  = team === 'A' ? 'team_a_logo' : 'team_b_logo'
                const colorKey = team === 'A' ? 'team_a_color' : 'team_b_color'
                const logoVal  = matchForm[logoKey] || ''
                const isUploading = logoUploading === team

                return (
                  <div key={team} className="space-y-4 p-4 rounded-2xl bg-dark-900 border border-dark-800">
                    {/* Team header */}
                    <div className="flex items-center gap-2.5">
                      <div className="h-3.5 w-3.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}80` }} />
                      <h4 className="font-black text-base" style={{ color }}>{name}</h4>
                    </div>

                    {/* Color picker */}
                    <div>
                      <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-2">Team Colour</label>
                      <div className="flex items-center gap-2.5">
                        <input type="color" value={color}
                          onChange={(e) => setMatchForm(f => ({ ...f, [colorKey]: e.target.value }))}
                          className="h-10 w-14 rounded-xl border border-dark-700 bg-dark-800 cursor-pointer p-1 flex-shrink-0" />
                        <code className="text-xs font-mono text-dark-400 bg-dark-800 px-3 py-2 rounded-lg border border-dark-750 flex-1">
                          {color}
                        </code>
                      </div>
                    </div>

                    {/* Logo section */}
                    <div>
                      <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-2">Team Logo</label>

                      {/* Logo preview + remove */}
                      {logoVal ? (
                        <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-dark-800 border border-dark-750">
                          <img src={logoVal} alt="logo"
                            className="h-14 w-14 rounded-xl object-cover border border-dark-700 flex-shrink-0"
                            onError={(e) => (e.currentTarget.style.display = 'none')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-dark-400 truncate">{logoVal.startsWith('http') ? 'Uploaded logo' : logoVal}</p>
                            <p className="text-xs text-live mt-0.5">✓ Ready for display</p>
                          </div>
                          <button
                            onClick={() => setMatchForm(f => ({ ...f, [logoKey]: '' }))}
                            className="p-1.5 rounded-lg text-dark-600 hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                            title="Remove logo"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 mb-3 h-16 rounded-xl border border-dashed border-dark-750 bg-dark-800/50">
                          <ImageIcon size={16} className="text-dark-700" />
                          <span className="text-xs text-dark-700">No logo set</span>
                        </div>
                      )}

                      {/* Upload button */}
                      <label className={clsx(
                        'flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all',
                        isUploading
                          ? 'border-dark-700 text-dark-600 cursor-not-allowed'
                          : 'border-brand-500/40 text-brand-400 hover:bg-brand-500/10 hover:border-brand-500/60',
                      )}>
                        {isUploading
                          ? <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                          : <><Upload size={15} /> Upload Image</>}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          className="hidden"
                          disabled={isUploading}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setLogoUploading(team)
                            try {
                              const url = await uploadTeamLogo(file)
                              setMatchForm(f => ({ ...f, [logoKey]: url }))
                              toast.success('Logo uploaded!')
                            } catch {
                              toast.error('Upload failed', 'Check file size (max 5 MB) and format')
                            } finally {
                              setLogoUploading(null)
                              e.target.value = ''
                            }
                          }}
                        />
                      </label>

                      {/* OR: paste URL */}
                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="flex-1 h-px bg-dark-800" />
                        <span className="text-xs text-dark-700">or paste URL</span>
                        <div className="flex-1 h-px bg-dark-800" />
                      </div>
                      <input
                        value={logoVal.startsWith('/uploads') ? '' : logoVal}
                        onChange={(e) => setMatchForm(f => ({ ...f, [logoKey]: e.target.value }))}
                        className={inputCls + ' mt-2'}
                        placeholder="https://…/logo.png"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setMatchStep(1)}
                className="px-5 py-3 rounded-xl border border-dark-700 text-dark-300 text-sm font-semibold hover:bg-dark-800 transition-colors flex items-center gap-1.5">
                ← Back
              </button>
              <button onClick={() => setMatchStep(3)}
                className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                disabled={!!logoUploading}>
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {matchStep === 3 && (
          <div className="space-y-4">
            {/* Team tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-dark-900 border border-dark-850">
              {(['A', 'B'] as const).map((team) => {
                const name  = team === 'A' ? matchForm.team_a : matchForm.team_b
                const color = team === 'A' ? matchForm.team_a_color : matchForm.team_b_color
                const count = team === 'A' ? playersA.length : playersB.length
                const active = activeTeam === team
                return (
                  <button
                    key={team}
                    onClick={() => setActiveTeam(team)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg text-sm font-bold transition-all',
                      active ? 'bg-dark-800 shadow-sm' : 'text-dark-600 hover:text-dark-300',
                    )}
                    style={active ? { color } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color, boxShadow: active ? `0 0 8px ${color}` : 'none' }}
                    />
                    {name}
                    {count > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Active team form */}
            <div className="min-h-[200px]">
              {activeTeam === 'A' && (
                <PlayersForm
                  teamName={matchForm.team_a} teamColor={matchForm.team_a_color}
                  players={playersA} onChange={setPlayersA} token={token ?? ''}
                />
              )}
              {activeTeam === 'B' && (
                <PlayersForm
                  teamName={matchForm.team_b} teamColor={matchForm.team_b_color}
                  players={playersB} onChange={setPlayersB} token={token ?? ''}
                />
              )}
            </div>

            {/* Summary row */}
            <div className="flex items-center justify-between text-xs text-dark-600 px-1">
              <span style={{ color: matchForm.team_a_color }}>{matchForm.team_a}: {playersA.length} players</span>
              <span style={{ color: matchForm.team_b_color }}>{matchForm.team_b}: {playersB.length} players</span>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setMatchStep(2)}
                className="px-5 py-3 rounded-xl border border-dark-700 text-dark-300 text-sm font-semibold hover:bg-dark-800 transition-colors">
                ← Back
              </button>
              <button onClick={handleCreateMatch} disabled={saving}
                className="flex-1 py-3 rounded-xl border border-dark-700 text-dark-400 text-sm font-semibold hover:bg-dark-800 transition-colors disabled:opacity-50">
                {saving ? 'Creating…' : 'Skip & Create'}
              </button>
              <button onClick={handleCreateMatch} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-live hover:bg-live/90 text-dark-950 text-sm font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving
                  ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                  : '✓ Create Match'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <MatchQRModal match={qrMatch} onClose={() => setQrMatch(null)} networkConnectURL={serverInfo?.connect_url} />

      {/* Delete confirmation */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Match" size="sm">
        {confirmDelete && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-danger/8 border border-danger/20">
              <p className="text-sm text-dark-100 font-medium">
                Delete <span className="font-black text-white">{confirmDelete.team_a} vs {confirmDelete.team_b}</span>?
              </p>
              <p className="text-xs text-dark-400 mt-1.5">
                This permanently removes the match, all events, and player data. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-dark-700 text-dark-300 text-sm font-medium hover:bg-dark-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMatch(confirmDelete)}
                disabled={actionMatch === confirmDelete.id}
                className="flex-1 py-2.5 rounded-xl bg-danger hover:bg-danger/90 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionMatch === confirmDelete.id ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg> Deleting…</>
                ) : (
                  <><Trash2 size={15} /> Delete Match</>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
