import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { scanReceipt, activeDevice, type OcrProgress } from '../lib/ocr'

type Phase = 'idle' | 'working' | 'error'

export function Capture() {
  const navigate = useNavigate()
  const draft = useStore((s) => s.draft)
  const loadParsedReceipt = useStore((s) => s.loadParsedReceipt)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [device, setDevice] = useState<string | null>(null)
  const [error, setError] = useState<string>('')

  function onProgress(p: OcrProgress) {
    setProgress(p)
    if (activeDevice) setDevice(activeDevice)
  }

  useEffect(() => {
    if (!draft) navigate('/', { replace: true })
  }, [draft, navigate])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    setPhase('working')
    setError('')
    try {
      const parsed = await scanReceipt(url, onProgress)
      if (parsed.items.length === 0) {
        setError("Couldn't read any items — you can add them by hand.")
        setPhase('error')
        return
      }
      loadParsedReceipt(parsed)
      navigate('/new/review')
    } catch (err) {
      console.error(err)
      setError('On-device OCR failed to load. No worries — enter the items manually.')
      setPhase('error')
    }
  }

  const pct = progress?.progress != null ? Math.round(progress.progress * 100) : null

  return (
    <div className="screen has-cta">
      <div className="topbar">
        <button className="iconbtn" onClick={() => navigate('/')}>
          ✕
        </button>
        <h1 style={{ fontSize: 17 }}>Scan receipt</h1>
        <span className="iconbtn" style={{ visibility: 'hidden' }}>
          ⚡
        </span>
      </div>

      {preview && (
        <div className="scanview">
          <img src={preview} alt="receipt" />
        </div>
      )}

      {phase === 'idle' && (
        <>
          <div className="card center">
            <div style={{ fontSize: 30 }}>🧾</div>
            <div style={{ fontWeight: 600, marginTop: 6 }}>Snap the whole receipt</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Lay it flat and fill the frame. Reads on your device — nothing is uploaded.
            </div>
          </div>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            📷 Take / choose photo
          </button>
          <button className="btn ghost" onClick={() => navigate('/new/review')}>
            ✏️ Enter manually instead
          </button>
        </>
      )}

      {phase === 'working' && (
        <div className="card">
          <div className="row">
            <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
              <span className="spinner" />
              <b className="small">{progress?.label ?? 'Warming up…'}</b>
            </div>
            {pct != null && <span className="small muted mono">{pct}%</span>}
          </div>
          {pct != null && (
            <div className="pgwrap">
              <i style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="small muted" style={{ marginTop: 10 }}>
            🔒 Donut (CORD) · runs locally{device ? ` on ${device.toUpperCase()}` : ''}. First scan
            downloads the model once, then it's cached.
          </div>
        </div>
      )}

      {phase === 'error' && (
        <>
          <div className="banner warn">⚠️ {error}</div>
          <button className="btn" onClick={() => navigate('/new/review')}>
            ✏️ Enter items manually
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setPhase('idle')
              setPreview(null)
            }}
          >
            Try another photo
          </button>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFile}
      />
    </div>
  )
}
