import { useRef, useState } from 'react'
import { importarIngresos } from './lib/importer'

export default function ImportIngresosButton({ onDone }) {
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
      const r = await importarIngresos(file, setStatus)
      setStatus(`✓ ${file.name} subido con exito — ${r.ingresosNuevos} ingresos nuevos, ${r.entregasActualizadas} entregas revisadas${r.estadosActualizados ? `, ${r.estadosActualizados} estados de calidad actualizados` : ''}`)
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
        {busy ? 'Importando...' : 'Importar Ingresos'}
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
      {status && <span className={`impst ${status.startsWith('Error') ? 'err' : ''}`}>{status}</span>}
    </div>
  )
}
