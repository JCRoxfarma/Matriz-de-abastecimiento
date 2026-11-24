import { useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'

// "2026-08" para el mes actual, "2026-09" si offset=1 (mes que viene), etc.
// Primero se fija el dia en 1: si hoy es 31 y se suma un mes sin hacer esto,
// Date intenta armar "31 de setiembre" (que no existe) y salta directo a
// octubre, saltandose setiembre por completo.
function claveMes(offset) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nombreCorto(clave) {
  const [y, m] = clave.split('-')
  const nombre = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'long' })
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`
}

const COLS = ['OC', 'SKU', 'ENTREGA', 'MATERIAL', 'PROVEEDOR', 'CANTIDAD', 'FECHA PROGRAMADA', 'DÍAS', 'ESTADO', 'GESTIÓN']

function dias(r) {
  if (r.dentroTolerancia) return 'tolerancia'
  if (r.fueraTolerancia) return 'fuera de tolerancia'
  if (r.dd == null) return 'sin fecha'
  if (r.dd < 0) return `${-r.dd} atraso`
  return `faltan ${r.dd}`
}

export default function Recordatorio({ rows, proveedores, onClose }) {
  const [prov, setProv] = useState('')
  const [rango, setRango] = useState('este')
  const [copiado, setCopiado] = useState(false)

  const claveEste = claveMes(0)
  const claveProx = claveMes(1)

  const filas = useMemo(() => {
    return rows
      .filter(r => r.abierto)
      .filter(r => !prov || r.proveedor === prov)
      .filter(r => {
        const clave = r.fecha_programada_ingreso?.slice(0, 7)
        if (rango === 'este') return clave === claveEste
        if (rango === 'proximo') return clave === claveProx
        return clave === claveEste || clave === claveProx
      })
      .sort((a, b) => (a.fecha_programada_ingreso || '').localeCompare(b.fecha_programada_ingreso || ''))
  }, [rows, prov, rango])

  function filaHtml(r) {
    return `<tr>
      <td>${r.oc}</td><td>${r.sku}</td><td>${r.entTot > 1 ? `${r.entN} de ${r.entTot}` : 'unica'}</td>
      <td>${r.descripcion || ''}</td><td>${r.proveedor || ''}</td>
      <td style="text-align:right">${fmt(r.cant_programada)}</td>
      <td>${fdate(r.fecha_programada_ingreso)}</td><td>${dias(r)}</td>
      <td>${r.estado_ingreso || ''}</td><td>${r.estado_gestion || ''}</td>
    </tr>`
  }

  function tablaHtml() {
    return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:13px">
      <thead><tr style="background:#1f4e78;color:#ffffff;font-weight:bold">${COLS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(filaHtml).join('')}</tbody>
    </table>`
  }

  function tablaTexto() {
    const header = COLS.join('\t')
    const cuerpo = filas.map(r => [
      r.oc, r.sku, r.entTot > 1 ? `${r.entN} de ${r.entTot}` : 'unica', r.descripcion || '',
      r.proveedor || '', r.cant_programada, fdate(r.fecha_programada_ingreso), dias(r),
      r.estado_ingreso || '', r.estado_gestion || '',
    ].join('\t')).join('\n')
    return `${header}\n${cuerpo}`
  }

  async function copiar() {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([tablaHtml()], { type: 'text/html' }),
        'text/plain': new Blob([tablaTexto()], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      alert('No se pudo copiar automaticamente. Selecciona la tabla de abajo y copiala con Ctrl+C.')
    }
  }

  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Recordatorio para proveedor</h2>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          <div className="mdl-ctrl">
            <select value={prov} onChange={e => setProv(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={rango} onChange={e => setRango(e.target.value)}>
              <option value="este">Pendientes de {nombreCorto(claveEste)}</option>
              <option value="proximo">Pendientes de {nombreCorto(claveProx)}</option>
              <option value="ambos">Ambos meses</option>
            </select>
            <button className="btn act" onClick={copiar} disabled={!filas.length}>
              {copiado ? 'Copiado' : 'Copiar tabla'}
            </button>
            <span className="count">{fmt(filas.length)} lineas pendientes</span>
          </div>
          {filas.length === 0 ? (
            <div className="mdl-empty">No hay entregas pendientes con estos filtros.</div>
          ) : (
            <div className="mdl-tbl">
              <table>
                <thead><tr>{COLS.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {filas.map(r => (
                    <tr key={r.id_entrega}>
                      <td>{r.oc}</td><td>{r.sku}</td><td>{r.entTot > 1 ? `${r.entN} de ${r.entTot}` : 'unica'}</td>
                      <td>{r.descripcion}</td><td>{r.proveedor}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.cant_programada)}</td>
                      <td>{fdate(r.fecha_programada_ingreso)}</td><td>{dias(r)}</td>
                      <td>{r.estado_ingreso}</td><td>{r.estado_gestion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hint" style={{ marginTop: 12 }}>
            Dale a "Copiar tabla" y pegala (Ctrl+V) directo en el cuerpo de tu correo en Outlook o Gmail: mantiene la tabla con bordes, igual que cuando la armas a mano.
          </div>
        </div>
      </div>
    </div>
  )
}
