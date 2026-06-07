import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Trophy, Eye, EyeOff, Zap } from 'lucide-react'

export default function Login() {
  const navigate  = useNavigate()
  const setAuth   = useAuthStore((s) => s.setAuth)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { token, user } = await login(email, password)
      setAuth(token, user)
      navigate(user.role === 'display' ? '/display' : '/')
    } catch {
      setError('Invalid email or password')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-800/15 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-brand-500/8 rounded-full blur-[80px]" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#6366f1 1px,transparent 1px),linear-gradient(90deg,#6366f1 1px,transparent 1px)', backgroundSize: '48px 48px' }} />

      <div className="relative w-full max-w-[400px]">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl
                          bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow-brand mb-5 animate-float">
            <Trophy size={36} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Score<span className="text-brand-400">board</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Zap size={12} className="text-live" />
            <p className="text-dark-400 text-sm font-medium">Real-time sports scoring system</p>
          </div>
        </div>

        {/* Card */}
        <div className="card-hi p-8 shadow-card-hi">
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent rounded-t-2xl" />

          <h2 className="text-xl font-bold text-white mb-6">Welcome back</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">
                Email address
              </label>
              <input
                type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl text-dark-100 text-sm
                           bg-dark-900 border border-dark-750
                           focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                           placeholder-dark-600 transition-all"
                placeholder="admin@scoreboard.local"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full px-4 py-3 pr-11 rounded-xl text-dark-100 text-sm
                             bg-dark-900 border border-dark-750
                             focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                             placeholder-dark-600 transition-all"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-200 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-neon w-full py-3 rounded-xl font-bold text-white text-sm
                         bg-gradient-to-r from-brand-600 to-brand-500
                         disabled:opacity-50 disabled:cursor-not-allowed
                         hover:from-brand-500 hover:to-brand-400 transition-all
                         shadow-glow-brand/0 hover:shadow-glow-brand">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-dark-700">
            admin@scoreboard.local · Admin@1234
          </p>
        </div>
      </div>
    </div>
  )
}
