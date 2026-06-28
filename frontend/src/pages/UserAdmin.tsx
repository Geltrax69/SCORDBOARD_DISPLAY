import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { listUsers, createUser, updateUser, deleteUser } from '@/services/api'
import type { User } from '@/types'
import { UserPlus, Trash2, Pencil, Loader2, X, Check, Users as UsersIcon } from 'lucide-react'

const ROLES = [
  { value: 'super_admin', label: 'Admin (runs matches)' },
  { value: 'scorer',      label: 'Scorer' },
  { value: 'display',     label: 'Display' },
  { value: 'owner',       label: 'Owner (manages users)' },
]

export default function UserAdmin() {
  const me = useAuthStore((s) => s.user)
  const [users, setUsers]   = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')
  const [editing, setEditing] = useState<User | null>(null)
  // form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState('super_admin')

  const load = () => listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  // Owner-only page.
  if (me && me.role !== 'owner') return <Navigate to="/" replace />

  const resetForm = () => { setEditing(null); setUsername(''); setPassword(''); setRole('super_admin'); setErr('') }
  const startEdit = (u: User) => { setEditing(u); setUsername(u.email); setPassword(''); setRole(u.role); setErr('') }

  const submit = async () => {
    setErr('')
    if (!username.trim()) { setErr('Username required'); return }
    if (!editing && password.length < 4) { setErr('Password must be at least 4 characters'); return }
    setBusy(true)
    try {
      if (editing) {
        await updateUser(editing.id, { email: username.trim(), role, ...(password ? { password } : {}) })
      } else {
        await createUser({ email: username.trim(), password, role })
      }
      resetForm(); load()
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to save')
    } finally { setBusy(false) }
  }

  const remove = async (u: User) => {
    if (!confirm(`Delete user "${u.email}"?`)) return
    try { await deleteUser(u.id); load() }
    catch (e: any) { alert(e?.response?.data?.error || 'Delete failed') }
  }

  const inputCls = 'w-full px-3.5 py-2.5 bg-dark-925 border border-dark-700 rounded-xl text-dark-100 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder-dark-600'

  return (
    <div className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex items-center gap-3 mb-6">
        <UsersIcon size={20} className="text-brand-400" />
        <h1 className="text-2xl font-black text-white">User Management</h1>
        <span className="text-xs text-dark-500 ml-auto">Owner only</span>
      </div>

      {/* Create / edit form */}
      <div className="card-hi p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          {editing ? <Pencil size={15} className="text-brand-400" /> : <UserPlus size={15} className="text-brand-400" />}
          <h2 className="font-semibold text-dark-100">{editing ? `Edit "${editing.email}"` : 'Add user'}</h2>
          {editing && <button onClick={resetForm} className="ml-auto text-xs text-dark-500 hover:text-dark-200 flex items-center gap-1"><X size={12} /> cancel</button>}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <input className={inputCls} placeholder="username" value={username} autoCapitalize="none" spellCheck={false}
            onChange={(e) => setUsername(e.target.value)} />
          <input className={inputCls} type="text" placeholder={editing ? 'new password (blank = keep)' : 'password'} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <select className={inputCls + ' cursor-pointer'} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <button onClick={submit} disabled={busy}
          className="btn-neon mt-4 px-5 py-2.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-brand-600 to-brand-500 disabled:opacity-50 flex items-center gap-2">
          {busy ? <Loader2 size={15} className="animate-spin" /> : editing ? <Check size={15} /> : <UserPlus size={15} />}
          {editing ? 'Save changes' : 'Create user'}
        </button>
      </div>

      {/* Users list */}
      <div className="card-hi overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-dark-600 text-sm">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-dark-600 text-sm">No users</div>
        ) : (
          <div className="divide-y divide-dark-850">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-dark-100 text-sm truncate">{u.email}</p>
                  <p className="text-xs text-dark-500">{ROLES.find((r) => r.value === u.role)?.label ?? u.role}</p>
                </div>
                <button onClick={() => startEdit(u)}
                  className="p-2 rounded-lg text-dark-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors" title="Edit"><Pencil size={15} /></button>
                <button onClick={() => remove(u)} disabled={u.id === me?.id}
                  className="p-2 rounded-lg text-dark-500 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={u.id === me?.id ? "Can't delete yourself" : 'Delete'}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
