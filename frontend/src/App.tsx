import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuthStore } from '@/store/authStore'
import { ToastContainer } from '@/components/common/Toast'
import Login      from '@/pages/Login'
import Dashboard  from '@/pages/Dashboard'
import MatchControl from '@/pages/MatchControl'
import Display    from '@/pages/Display'
import Connect    from '@/pages/Connect'
import UserAdmin  from '@/pages/UserAdmin'
import { LogOut, LayoutDashboard, Monitor, Users } from 'lucide-react'
import { useWSStore } from '@/store/wsStore'

function Navbar() {
  const { user, clearAuth } = useAuthStore()
  const wsStatus = useWSStore((s) => s.status)
  const location = useLocation()

  const navLinks = [
    { to: '/',       label: 'Dashboard', icon: LayoutDashboard },
  ]

  return (
    <header className="sticky top-0 z-30 h-14 flex items-center px-5 gap-5
                       border-b border-dark-850 bg-dark-925/80 backdrop-blur-md">
      {/* Logo */}
      <Link to="/" className="flex items-center flex-shrink-0">
        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden">
          <img src="/logo.png" alt="ScoreCast" className="w-[135%] h-[135%] object-contain" />
        </div>
      </Link>

      {/* Nav links — owner only manages users, so hide match dashboard/display */}
      <nav className="flex items-center gap-1">
        {user?.role !== 'owner' && navLinks.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to
          return (
            <Link key={to} to={to} className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              active
                ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
                : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800',
            )}>
              <Icon size={14} />
              <span className="hidden sm:block">{label}</span>
            </Link>
          )
        })}
        {user?.role !== 'owner' && (
          <a href="/display" target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                       text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-all">
            <Monitor size={14} />
            <span className="hidden sm:block">Display</span>
          </a>
        )}
        {user?.role === 'owner' && (
          <Link to="/admin" className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            location.pathname === '/admin'
              ? 'bg-brand-500/15 text-brand-300 border border-brand-500/20'
              : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800',
          )}>
            <Users size={14} />
            <span className="hidden sm:block">Users</span>
          </Link>
        )}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        {/* WS status */}
        <div className={clsx('flex items-center gap-1.5 text-xs font-medium', wsStatus === 'connected' ? 'text-live' : 'text-dark-600')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', wsStatus === 'connected' ? 'bg-live animate-pulse' : 'bg-dark-700')} />
          <span className="hidden sm:block">{wsStatus === 'connected' ? 'Live' : 'Offline'}</span>
        </div>

        {/* User chip */}
        <div className="flex items-center gap-2 pl-3 border-l border-dark-800">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700
                          flex items-center justify-center text-white text-xs font-black">
            {user?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold text-dark-100 leading-none">{user?.name}</p>
            <p className="text-[10px] text-dark-500 mt-0.5 capitalize">{user?.role?.replace('_',' ')}</p>
          </div>
          <button onClick={clearAuth}
            className="ml-1 p-1.5 rounded-lg text-dark-600 hover:text-dark-200 hover:bg-dark-800 transition-colors"
            title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </header>
  )
}

function ProtectedLayout() {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (user?.role === 'display') return <Navigate to="/display" replace />
  // Owner manages users — their home is the Users page, not the match dashboard.
  if (user?.role === 'owner' && location.pathname === '/') return <Navigate to="/admin" replace />

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

function DisplayRoute() {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Display />
}

export default function App() {
  return (
    <>
    <ToastContainer />
    <BrowserRouter>
      <Routes>
        <Route path="/login"   element={<Login />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="/display" element={<DisplayRoute />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/admin"     element={<UserAdmin />} />
          <Route path="/match/:id" element={<MatchControl />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </>
  )
}
