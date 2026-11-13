import { useRef, useState } from 'react'
import { importarExcel } from './lib/importer'

export default function ImportButton({ onDone }) {
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
      const r = await importarExcel(file, setStatus)
      setStatus(`✓ ${file.name} subido con exito — ${r.entregas} entregas, ${r.ingresosNuevos} ingresos nuevos${r.estadosActualizados ? `, ${r.estadosActualizados} estados de calidad actualizados` : ''}`)
      onDone()
    } catch (err) {
      setStatus('Error: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="imp">
      <button className="btn" disabled={busy} onClick={() => inputRef.current.click()}>
        {busy ? 'Importando...' : 'Importar Excel'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      {status && <span className={`impst ${status.startsWith('Error') ? 'err' : ''}`}>{status}</span>}
    </div>
  )
}
