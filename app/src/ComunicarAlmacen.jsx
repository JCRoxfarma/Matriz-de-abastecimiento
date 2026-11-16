import { useMemo, useState } from 'react'
import { fmt, fdate, nombreMes } from './lib/derive'
import { exportarCuadroAlmacen, claveMes } from './lib/exportarAlmacen'

export default function ComunicarAlmacen({ rows, onClose }) {
  const [sel, setSel] = useState([])
  const [generando, setGenerando] = useState(false)

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
            Entregas pendientes de ingresar. Marca uno o varios meses y genera el Cuadro Almacen para enviarlo (una hoja por mes).
          </div>

          <div className="mes-chips">
            <button className={'mes-chip' + (todos ? ' on' : '')}
              onClick={() => setSel(todos ? [] : meses.map(m => m.valor))}>
              {todos ? 'Quitar todos' : 'Marcar todos'}
            </button>
            {meses.map(m => (
              <button key={m.valor}
                className={'mes-chip' + (sel.includes(m.valor) ? ' on' : '') + (m.pasado ? ' pasado' : '')}
                onClick={() => alternar(m.valor)}
                title={m.pasado ? 'Mes ya pasado: entregas atrasadas' : m.actual ? 'Mes actual' : ''}>
                {m.etiqueta}{m.actual ? ' (actual)' : ''}
                <span className="mes-n">{m.cantidad}</span>
              </button>
            ))}
          </div>

          <div className="mdl-ctrl">
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
