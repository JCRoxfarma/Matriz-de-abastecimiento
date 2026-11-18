import { useEffect, useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { obtenerStockPT } from './lib/stockImporter'
import Icono from './Icono'

// Pestana "Stock PT" del espacio Producto terminado: stock vigente de cada
// producto = P01 (disponible) + P02 (cuarentena) + P19 (contingencia), del
// ultimo reporte de stock subido, junto con lo que falta llegar de sus OC.
export default function StockPT({ rows }) {
  const [stock, setStock] = useState(undefined)
  const [q, setQ] = useState('')
  const [soloOC, setSoloOC] = useState(false)

  useEffect(() => { obtenerStockPT().then(setStock) }, [])

  // Saldo pendiente de OC abiertas por SKU (solo del espacio PT).
  const porLlegar = useMemo(() => {
    const m = new Map()
    for (const r of rows) if (r.abierto) m.set(String(r.sku), (m.get(String(r.sku)) || 0) + (r.saldo_pendiente || 0))
    return m
  }, [rows])

  const filas = useMemo(() => {
    if (!stock) return []
    const lista = [...stock.mapa.values()].map(s => ({ ...s, porLlegar: porLlegar.get(s.codigo) || 0 }))
    // Productos con OC abierta que no figuran en el reporte (stock 0).
    for (const [sku, pend] of porLlegar) {
      if (!stock.mapa.has(sku)) {
        const r = rows.find(x => String(x.sku) === sku)
        lista.push({ codigo: sku, descripcion: r?.descripcion || '', unidad: '', stock_p01: 0, stock_p02: 0, stock_p19: 0, stock_total: 0, porLlegar: pend })
      }
    }
    const qq = q.trim().toLowerCase()
    return lista
      .filter(s => !qq || `${s.codigo} ${s.descripcion || ''}`.toLowerCase().includes(qq))
      .filter(s => !soloOC || s.porLlegar > 0)
      .sort((a, b) => (b.porLlegar > 0) - (a.porLlegar > 0) || b.stock_total - a.stock_total)
  }, [stock, porLlegar, rows, q, soloOC])

  if (stock === undefined) return <div className="empty">Cargando stock...</div>
  if (!stock) return (
    <div className="empty">
      Todavía no hay stock de producto terminado. Sube el reporte de stock (el mismo de siempre) desde la pestaña Archivos con el botón Actualizar stock.
    </div>
  )

  const conOC = filas.filter(s => s.porLlegar > 0).length
  return (
    <section className="oc-card">
      <div className="oc-card-h">
        <h2><Icono nombre="caja" tam={22} /> Stock de producto terminado</h2>
        <span className="dim">Reporte del {fdate(stock.fecha)} · P01 disponible + P02 cuarentena + P19 contingencia</span>
      </div>
      <div className="oc-filtros">
        <input type="text" placeholder="Buscar por código o producto" value={q} onChange={e => setQ(e.target.value)} />
        <button className={`btn ${soloOC ? 'act' : ''}`} onClick={() => setSoloOC(v => !v)}>Solo con OC por llegar ({conOC})</button>
      </div>
      <div className="oc-conteo"><span>{fmt(filas.length)} productos</span></div>
      <div className="tw">
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Und.</th><th className="num">P01 disponible</th><th className="num">P02 cuarentena</th><th className="num">P19 contingencia</th><th className="num">Stock vigente</th><th className="num">OC por llegar</th></tr>
            </thead>
            <tbody>
              {filas.map(s => (
                <tr key={s.codigo} style={{ cursor: 'default' }}>
                  <td className="mono">{s.codigo}</td>
                  <td><div className="dsc">{s.descripcion}</div></td>
                  <td className="dim">{s.unidad}</td>
                  <td className="num">{fmt(s.stock_p01)}</td>
                  <td className="num">{fmt(s.stock_p02)}</td>
                  <td className="num">{fmt(s.stock_p19)}</td>
                  <td className="num"><b>{fmt(s.stock_total)}</b></td>
                  <td className="num">{s.porLlegar > 0 ? <b style={{ color: 'var(--acc)' }}>{fmt(s.porLlegar)}</b> : <span className="dim">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length === 0 && <div className="empty">No hay productos con estos filtros.</div>}
        </div>
      </div>
    </section>
  )
}
