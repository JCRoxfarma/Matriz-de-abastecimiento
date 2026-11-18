import { useRef, useState } from 'react'
import { importarDemandaPT } from './lib/demandaPT'

export default function DemandaPTButton({ onDone }) {
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
      const r = await importarDemandaPT(file, setStatus)
      setStatus(`Listo: plan de ventas de ${r.productos} productos actualizado.`)
      onDone?.()
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
        {busy ? 'Cargando...' : 'Cargar plan de ventas'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      {status && <span className="impst">{status}</span>}
    </div>
  )
}
