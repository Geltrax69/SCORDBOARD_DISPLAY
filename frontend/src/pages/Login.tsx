import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Eye, EyeOff, Loader2, Monitor, Radio, ShieldCheck } from 'lucide-react'

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
      navigate(user.role === 'display' ? '/display' : user.role === 'owner' ? '/admin' : '/')
    } catch {
      setError('Invalid username or password')
    } finally { setLoading(false) }
  }

  return (
    <main className="min-h-screen bg-dark-950 text-dark-100 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(430px,0.95fr)]">
      <section className="relative hidden lg:flex min-h-screen flex-col justify-between overflow-hidden border-r border-dark-800 px-12 py-10 xl:px-20 xl:py-14">
        <div className="absolute inset-0 pointer-events-none opacity-[0.045]"
          style={{ backgroundImage: 'linear-gradient(#818cf8 1px,transparent 1px),linear-gradient(90deg,#818cf8 1px,transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="absolute -left-28 top-1/3 h-80 w-80 rounded-full bg-brand-600/15 blur-[100px] pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white overflow-hidden grid place-items-center">
            <img src="/logo.png" alt="" className="h-[120%] w-[120%] object-contain" />
          </div>
          <div><p className="text-lg font-black text-white">ScoreCast</p><p className="text-xs text-dark-400">Tournament operations</p></div>
        </div>

        <div className="relative max-w-xl">
          <p className="text-sm font-semibold text-brand-300 mb-4">Live event control</p>
          <h1 className="text-4xl xl:text-5xl font-black tracking-[-0.035em] text-white text-balance leading-[1.08]">
            From team setup to the final point.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-dark-300">
            Prepare rosters, connect scorers, manage live matches, and control every venue display from one workspace.
          </p>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-4 text-sm text-dark-300">
            <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-live" /> Role-based access</span>
            <span className="inline-flex items-center gap-2"><Radio size={16} className="text-live" /> Live scoring</span>
            <span className="inline-flex items-center gap-2"><Monitor size={16} className="text-live" /> Broadcast display</span>
          </div>
        </div>

        <p className="relative text-xs text-dark-500">Secure access for authorized tournament staff.</p>
      </section>

      <section className="min-h-screen flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="h-12 w-12 rounded-xl bg-white overflow-hidden grid place-items-center">
              <img src="/logo.png" alt="" className="h-[120%] w-[120%] object-contain" />
            </div>
            <div><p className="text-lg font-black text-white">ScoreCast</p><p className="text-xs text-dark-400">Tournament operations</p></div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-black tracking-[-0.025em] text-white">Sign in</h2>
            <p className="mt-2 text-sm text-dark-300">Use your tournament account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-dark-200 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-4 py-3.5 rounded-xl text-dark-100 text-base bg-dark-900 border border-dark-700
                           focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25
                           placeholder:text-dark-400 transition-colors"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-dark-200 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full px-4 py-3.5 pr-12 rounded-xl text-dark-100 text-base bg-dark-900 border border-dark-700
                             focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25
                             placeholder:text-dark-400 transition-colors"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-dark-100 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-red-300 text-sm" role="alert">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-danger shrink-0" /> {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full min-h-12 rounded-xl font-bold text-white text-sm bg-brand-600 hover:bg-brand-500
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-950
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs leading-5 text-dark-500">
            Need access? Contact your tournament administrator.
          </p>
        </div>
      </section>
    </main>
  )
}
