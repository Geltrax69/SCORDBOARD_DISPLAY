import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { clsx } from 'clsx'
import { Wifi, WifiOff, Monitor, Smartphone, RefreshCw } from 'lucide-react'
import { Button } from '@/components/common/Button'
import type { DeviceInfo } from '@/types'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function fetchDevices(token: string): Promise<DeviceInfo[]> {
  const res = await fetch(`${API_BASE}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json()
}

interface Props {
  token: string
}

export function DeviceDashboard({ token }: Props) {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const refresh = async () => {
    setLoading(true)
    const d = await fetchDevices(token)
    setDevices(d)
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10_000) // poll every 10s
    return () => clearInterval(t)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-dark-100">Connected Devices</h3>
          <p className="text-xs text-dark-500">
            {devices.length} device{devices.length !== 1 ? 's' : ''} · updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={refresh}>
          Refresh
        </Button>
      </div>

      {devices.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-dark-700 rounded-xl text-dark-600">
          <WifiOff size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No devices connected</p>
          <p className="text-xs mt-1">Scorers will appear here after pairing</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dark-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-900 text-dark-500 text-xs font-semibold uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Device</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">IP Address</th>
                <th className="px-4 py-3 text-left">Match</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-dark-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {d.role === 'display'
                        ? <Monitor size={16} className="text-dark-500 flex-shrink-0" />
                        : <Smartphone size={16} className="text-dark-500 flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-dark-100">{d.device_name}</p>
                        <p className="text-xs text-dark-600 capitalize">{d.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="font-mono text-xs text-dark-400">{d.ip_address || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {d.match_name ? (
                      <div>
                        <p className="text-dark-200 truncate max-w-[160px]">{d.match_name}</p>
                        {d.match_code && (
                          <p className="text-xs font-mono text-dark-600">#{d.match_code}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-dark-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className={clsx(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
                      d.online
                        ? 'text-emerald-400 border-emerald-500/20 bg-emerald-900/10'
                        : 'text-dark-500 border-dark-700 bg-dark-800',
                    )}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', d.online ? 'bg-emerald-400 animate-pulse' : 'bg-dark-600')} />
                      {d.online ? 'Online' : 'Offline'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
