import { useRef, useState } from 'react'
import { importarStock } from './lib/stockImporter'

export default function StockButton({ onDone }) {
  const inputRef = useRef(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setStatus('Empezando...')
    try {
      const r = await importarStock(file, setStatus)
      setStatus(`Listo: ${r.materiales} materiales actualizados.`)
      onDone()
    } catch (err) {
      setStatus('Error: ' + err.message)
    } finally {
      setBusy(false)
      setTimeout(() => setStatus(null), 6000)
    }
  }

  return (
    <div className="imp">
      <button className="btn" disabled={busy} onClick={() => inputRef.current.click()}>
        {busy ? 'Cargando...' : 'Actualizar stock'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      {status && <span className="impst">{status}</span>}
    </div>
  )
}
