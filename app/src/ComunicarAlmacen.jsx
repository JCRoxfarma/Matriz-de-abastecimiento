import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, fdate, nombreMes } from './lib/derive'
import { exportarCuadroAlmacen, claveMes } from './lib/exportarAlmacen'

export default function ComunicarAlmacen({ rows, onClose }) {
  const [sel, setSel] = useState([])
  const [generando, setGenerando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const pendientesTodas = useMemo(() => rows
    .filter(r => (r.fecha_confirmada || r.fecha_programada_ingreso) && r.abierto)
    .map(r => ({ ...r, fechaEfectiva: r.fecha_confirmada || r.fecha_programada_ingreso }))
    .sort((a, b) => a.fechaEfectiva.localeCompare(b.fechaEfectiva)), [rows])

  const meses = useMemo(() => {
    const claves = [...new Set(pendientesTodas.map(r => r.fechaEfectiva.slice(0, 7)))].sort()
    const hoy = claveMes(0)
    return claves.map(k => ({
      valor: k,
      etiqueta: nombreMes(k),
      cantidad: pendientesTodas.filter(r => r.fechaEfectiva.startsWith(k)).length,
      pasado: k < hoy,
      actual: k === hoy,
    }))
  }, [pendientesTodas])

  const pendientes = useMemo(() => pendientesTodas
    .filter(r => sel.length === 0 || sel.includes(r.fechaEfectiva.slice(0, 7))), [pendientesTodas, sel])

  const alternar = valor => setSel(s => s.includes(valor) ? s.filter(v => v !== valor) : [...s, valor].sort())
  const todos = sel.length === meses.length && meses.length > 0

  async function generarCuadro() {
    setGenerando(true)
    try {
      await exportarCuadroAlmacen(sel)
    } catch (err) {
      alert('No se pudo generar el cuadro: ' + err.message)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Comunicar a almacen</h2>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          <div className="hint" style={{ marginBottom: 14 }}>
            Entregas pendientes de ingresar. Elige uno o varios meses y genera el Cuadro Almacen para enviarlo (una hoja por mes).
          </div>

          <div className="mdl-ctrl">
            <div className="mes-dd" ref={caja}>
              <button className="mes-dd-btn" onClick={() => setAbierto(a => !a)}>
                <span>{sel.length === 0 ? 'Todos los meses'
                  : sel.length === 1 ? nombreMes(sel[0])
                  : `${sel.length} meses seleccionados`}</span>
                <span className="mes-dd-car">▾</span>
              </button>
              {abierto && (
                <div className="mes-dd-menu">
                  <label className="mes-dd-op mes-dd-todos">
                    <input type="checkbox" checked={todos}
                      onChange={() => setSel(todos ? [] : meses.map(m => m.valor))} />
                    <span>Seleccionar todos</span>
                  </label>
                  {meses.map(m => (
                    <label key={m.valor} className="mes-dd-op">
                      <input type="checkbox" checked={sel.includes(m.valor)} onChange={() => alternar(m.valor)} />
                      <span className={m.pasado ? 'mes-pasado' : ''}>{m.etiqueta}{m.actual ? ' (actual)' : ''}</span>
                      <span className="mes-dd-n">{m.cantidad}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button className="btn act" onClick={generarCuadro} disabled={sel.length === 0 || generando} title={sel.length === 0 ? 'Marca al menos un mes' : ''}>
              {generando ? 'Generando...' : 'Generar Cuadro Almacen'}
            </button>
            <span className="count">
              {pendientes.length} pendientes{sel.length === 0 ? ' (todos los meses)' : ` en ${sel.length} ${sel.length === 1 ? 'mes' : 'meses'}`}
            </span>
          </div>

          {pendientes.length === 0 ? (
            <div className="mdl-empty">No hay entregas pendientes.</div>
          ) : (
            <div className="mdl-tbl">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th><th>Material</th><th>Proveedor</th>
                    <th>Programado</th><th>Ingresado</th><th>Saldo</th><th>F. ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map(r => (
                    <tr key={r.id_entrega}>
                      <td>{r.sku}</td>
                      <td>{r.descripcion}</td>
                      <td>{r.proveedor}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.progEfectivo || r.cant_programada)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.cant_ingresada || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(r.saldo_pendiente)}</td>
                      <td>{fdate(r.fechaEfectiva)}{r.fecha_confirmada ? ' ✓' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
