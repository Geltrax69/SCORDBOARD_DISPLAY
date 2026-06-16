import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Megaphone, Image as ImageIcon, Send, Trash2, Loader, Upload, Check, Tv, Film, Play } from 'lucide-react'
import {
  listDisplayAssets, createDisplayAsset, deleteDisplayAsset, showDisplayAsset, uploadMedia,
} from '@/services/api'
import type { DisplayAsset } from '@/types'

type Tab = 'sponsor' | 'announcement'

export const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url)

export function DisplayAssetsControl() {
  const [tab, setTab]       = useState<Tab>('sponsor')
  const [assets, setAssets] = useState<DisplayAsset[]>([])
  const [loading, setLoading] = useState(true)

  // create form
  const [title, setTitle]       = useState('')
  const [body, setBody]         = useState('')
  const [duration, setDuration] = useState(10)
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [shownId, setShownId]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try { setAssets(await listDisplayAssets()) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const resetForm = () => { setTitle(''); setBody(''); setImageUrl(''); setDuration(10) }

  const onPickMedia = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try { const { url } = await uploadMedia(file); setImageUrl(url) }
    finally { setUploading(false) }
  }

  const mediaIsVideo = isVideoUrl(imageUrl)
  // Sponsor needs media; announcement needs ANY of headline / text / image.
  const canSave = tab === 'sponsor'
    ? !!imageUrl
    : !!(title.trim() || body.trim() || imageUrl)

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await createDisplayAsset({
        type: tab, title: title.trim(), body: body.trim(), image_url: imageUrl, duration,
      })
      resetForm()
      await load()
    } finally { setSaving(false) }
  }

  const handleShow = async (id: string) => {
    await showDisplayAsset(id)
    setShownId(id)
    setTimeout(() => setShownId((cur) => (cur === id ? null : cur)), 2500)
  }

  const handleDelete = async (id: string) => {
    await deleteDisplayAsset(id)
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  const filtered = assets.filter((a) => a.type === tab)
  const accept = tab === 'sponsor' ? 'image/*,video/*' : 'image/*'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Tv size={16} className="text-brand-400" />
        <h3 className="font-semibold text-dark-100">Sponsors &amp; Announcements</h3>
        <span className="text-xs text-dark-500 ml-auto">Build once · show with one click</span>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { id: 'sponsor' as const, label: 'Sponsors', icon: ImageIcon },
          { id: 'announcement' as const, label: 'Announcements', icon: Megaphone },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setTab(id); resetForm() }}
            className={clsx(
              'flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all active:scale-95',
              tab === id
                ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                : 'border-dark-600 bg-dark-800 text-dark-400 hover:text-dark-100 hover:border-brand-500/40',
            )}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Create form */}
      <div className="rounded-xl border border-dark-750 bg-dark-900/60 p-4 space-y-3">
        {tab === 'sponsor' ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Sponsor name (e.g. Nike)"
            className="w-full px-3.5 py-2.5 rounded-lg text-dark-100 text-sm bg-dark-925 border border-dark-700
                       focus:outline-none focus:border-brand-500 placeholder-dark-600" />
        ) : (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Headline (e.g. Final starts soon)"
              className="w-full px-3.5 py-2.5 rounded-lg text-dark-100 text-sm bg-dark-925 border border-dark-700
                         focus:outline-none focus:border-brand-500 placeholder-dark-600" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
              placeholder="Description (optional)…"
              className="w-full px-3.5 py-2.5 rounded-lg text-dark-100 text-sm bg-dark-925 border border-dark-700
                         focus:outline-none focus:border-brand-500 placeholder-dark-600 resize-none" />
          </>
        )}

        {/* Media upload (image, or image+video for sponsor) */}
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept={accept} className="hidden"
            onChange={(e) => onPickMedia(e.target.files?.[0])} />
          {imageUrl ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {mediaIsVideo ? (
                <div className="relative h-12 w-12 rounded-lg bg-dark-925 border border-dark-700 flex items-center justify-center">
                  <video src={imageUrl} className="h-full w-full object-cover rounded-lg" muted />
                  <Play size={14} className="absolute text-white/80" fill="currentColor" />
                </div>
              ) : (
                <img src={imageUrl} alt="" className="h-12 w-12 object-contain rounded-lg bg-dark-925 border border-dark-700" />
              )}
              <span className="text-xs text-dark-400">{mediaIsVideo ? 'Video attached' : 'Image attached'}</span>
              <button onClick={() => setImageUrl('')} className="text-xs text-danger hover:underline">Remove</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed border-dark-600
                         text-dark-400 text-sm hover:border-brand-500/50 hover:text-dark-200 transition-all">
              {uploading ? <Loader size={14} className="animate-spin" /> : tab === 'sponsor' ? <Film size={14} /> : <Upload size={14} />}
              {tab === 'sponsor' ? 'Upload image or video' : 'Add image (optional)'}
            </button>
          )}
          <div className="flex items-center gap-1.5 ml-auto text-xs text-dark-500">
            <span>Hold</span>
            <input type="number" min={3} max={120} value={duration}
              onChange={(e) => setDuration(Math.max(3, Math.min(120, +e.target.value || 10)))}
              className="w-14 px-2 py-1 rounded-md bg-dark-925 border border-dark-700 text-dark-200 text-center" />
            <span>s</span>
          </div>
        </div>
        {tab === 'sponsor' && mediaIsVideo && (
          <p className="text-xs text-dark-500">Video plays to the end (hold time is ignored for videos).</p>
        )}

        <button onClick={handleSave} disabled={!canSave || saving}
          className="btn-neon w-full py-2.5 rounded-lg font-semibold text-white text-sm bg-gradient-to-r from-brand-600 to-brand-500
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {saving ? 'Saving…' : `Save ${tab === 'sponsor' ? 'sponsor' : 'announcement'}`}
        </button>
      </div>

      {/* Saved list */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-xs text-dark-600 text-center py-3">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-dark-600 text-center py-3">No saved {tab}s yet</p>
        ) : filtered.map((a) => {
          const vid = isVideoUrl(a.image_url)
          return (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dark-700 bg-dark-800">
              {a.image_url ? (
                vid ? (
                  <div className="relative h-10 w-10 rounded-lg bg-dark-925 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    <video src={a.image_url} className="h-full w-full object-cover" muted />
                    <Play size={12} className="absolute text-white/80" fill="currentColor" />
                  </div>
                ) : (
                  <img src={a.image_url} alt="" className="h-10 w-10 object-contain rounded-lg bg-dark-925 flex-shrink-0" />
                )
              ) : (
                <div className="h-10 w-10 rounded-lg bg-dark-900 flex items-center justify-center flex-shrink-0">
                  <Megaphone size={16} className="text-dark-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark-100 truncate">{a.title || a.body || (vid ? 'Video' : 'Image')}</p>
                {a.type === 'announcement' && a.title && a.body && (
                  <p className="text-xs text-dark-500 truncate">{a.body}</p>
                )}
                <p className="text-xs text-dark-600">{vid ? 'Video' : `${a.duration}s`}</p>
              </div>
              <button onClick={() => handleShow(a.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 flex-shrink-0',
                  shownId === a.id ? 'bg-live/20 text-live' : 'bg-brand-500/15 text-brand-200 hover:bg-brand-500/25',
                )}>
                {shownId === a.id ? <><Check size={13} /> Shown</> : <><Send size={13} /> Show</>}
              </button>
              <button onClick={() => handleDelete(a.id)}
                className="p-1.5 rounded-lg text-dark-500 hover:text-danger hover:bg-danger/10 transition-all flex-shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
