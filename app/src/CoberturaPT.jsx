import { Fragment, useEffect, useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { obtenerStockPT } from './lib/stockImporter'
import { obtenerDemandaPT, calcularCobertura, nombreMesCorto } from './lib/demandaPT'
import Icono from './Icono'

const ESTADO = {
  tarde: { lb: 'Pedido tardío', tag: 't-red', ayuda: 'La fecha para pedir ya pasó: aunque se pida hoy, no llega antes del quiebre.' },
  pedir_ya: { lb: 'Pedir ya', tag: 't-red', ayuda: 'Hay que emitir la OC en los próximos 30 días para que llegue antes del quiebre.' },
  con_tiempo: { lb: 'Con tiempo', tag: 't-amb', ayuda: 'Habrá quiebre más adelante; todavía hay tiempo para pedir.' },
  cubierto: { lb: 'Cubierto', tag: 't-grn', ayuda: 'Con el stock y las OC en camino alcanza para todo el plan cargado.' },
}
const ORDEN = { tarde: 0, pedir_ya: 1, con_tiempo: 2, cubierto: 3 }

// Pestana "Cobertura PT": stock vigente (stock_pt, P01+P02+P19) contra el
// plan de ventas (hoja DATOS) y las OC de PT en camino.
export default function CoberturaPT({ rows }) {
  const [demanda, setDemanda] = useState(undefined)
  const [stock, setStock] = useState(undefined)
  const [abierto, setAbierto] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    obtenerDemandaPT().then(setDemanda).catch(e => { setErr(e.message); setDemanda([]) })
    obtenerStockPT().then(setStock)
  }, [])

  const filas = useMemo(() => {
    if (!demanda || stock === undefined) return []
    return demanda.map(p => {
      const s = stock?.mapa.get(p.codigo)
      const ocs = rows.filter(r => String(r.sku) === p.codigo && r.abierto)
        .map(r => ({ oc: r.oc, entrega: r.n_entrega, saldo: r.saldo_pendiente || 0, fecha: r.fecha_confirmada || r.fecha_programada_ingreso }))
      const c = calcularCobertura({ producto: p, stockVigente: s?.stock_total || 0, ocAbiertas: ocs })
      // Venta real vs plan, meses con los dos datos.
      const ks = Object.keys(p.venta_real || {}).filter(k => p.plan[k])
      const real = ks.reduce((a, k) => a + p.venta_real[k], 0), plan = ks.reduce((a, k) => a + p.plan[k], 0)
      return { p, s, ocs, c, cumplimiento: plan ? Math.round((real / plan) * 100) : null, mesesReal: ks.length }
    }).sort((a, b) => ORDEN[a.c.estado] - ORDEN[b.c.estado] || (a.c.quiebre?.fecha || '9').localeCompare(b.c.quiebre?.fecha || '9'))
  }, [demanda, stock, rows])

  if (demanda === undefined || stock === undefined) return <div className="empty">Cargando cobertura...</div>
  if (err) return <div className="empty">No se pudo cargar la demanda: {err}</div>
  if (!demanda.length) return <div className="empty">Todavía no se ha cargado el plan de ventas. Súbelo en Archivos (hoja DATOS de tu Excel de cobertura).</div>

  const actualizado = demanda.reduce((m, p) => (p.actualizado_en > m ? p.actualizado_en : m), '')
  const urgentes = filas.filter(f => f.c.estado === 'tarde' || f.c.estado === 'pedir_ya').length
  return (
    <section className="oc-card">
      <div className="oc-card-h">
        <h2><Icono nombre="grafico" tam={22} /> Cobertura de producto terminado</h2>
        <span className="dim">
          Stock: {stock ? `reporte del ${fdate(stock.fecha)} (P01 + P02 + P19)` : 'sin reporte de stock'} · Plan de ventas: {demanda[0]?.archivo || 'hoja DATOS'}{actualizado ? `, cargado el ${fdate(actualizado.slice(0, 10))}` : ''}
        </span>
      </div>
      {!stock && <div className="aviso-rech"><Icono nombre="alerta" tam={18} /><span>Falta subir el reporte de stock: sin él la cobertura parte de cero.</span></div>}
      {urgentes > 0 && <div className="aviso-rech"><Icono nombre="alerta" tam={18} /><span><b>{urgentes} {urgentes === 1 ? 'producto necesita' : 'productos necesitan'} pedido</b> en los próximos 30 días o ya está tarde.</span></div>}
      <div className="pct" style={{ margin: '10px 2px', whiteSpace: 'normal' }}>
        Se descuenta el plan de ventas mes a mes (el mes en curso solo por los días que faltan) y se suman las OC abiertas en el mes de su fecha. Pedir antes de = quiebre menos el lead time. Sugerido = lotes completos para cubrir hasta 2 meses después del quiebre. Clic en un producto para ver el detalle por mes.
      </div>
      <div className="tw">
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Proveedor</th><th className="num">Stock vigente</th><th className="num">Cobertura</th><th className="num">OC en camino</th><th>Se acaba</th><th>Pedir antes de</th><th className="num">Sugerido</th><th>Estado</th><th className="num">Venta vs plan</th></tr>
            </thead>
            <tbody>
              {filas.map(({ p, s, ocs, c, cumplimiento, mesesReal }) => (
                <Fragment key={p.codigo}>
                  <tr onClick={() => setAbierto(a => (a === p.codigo ? null : p.codigo))} className={c.estado === 'tarde' || c.estado === 'pedir_ya' ? 'fila-rech' : ''}>
                    <td className="mono">{p.codigo}</td>
                    <td><div className="dsc">{p.descripcion}</div></td>
                    <td>{p.proveedor}</td>
                    <td className="num"><b>{fmt(s?.stock_total || 0)}</b></td>
                    <td className="num">{c.cobertura.toFixed(1)} meses</td>
                    <td className="num">{c.enCamino ? fmt(c.enCamino) : <span className="dim">-</span>}</td>
                    <td className="mono">{c.quiebre ? fdate(c.quiebre.fecha) : <span className="dim">no en el plan</span>}</td>
                    <td className="mono">{c.pedirAntes ? fdate(c.pedirAntes) : <span className="dim">-</span>}</td>
                    <td className="num">{c.sugerido ? fmt(c.sugerido) : <span className="dim">-</span>}</td>
                    <td><span className={`tag ${ESTADO[c.estado].tag}`} title={ESTADO[c.estado].ayuda}>{ESTADO[c.estado].lb}</span></td>
                    <td className="num" title={`Venta real contra plan de ventas en ${mesesReal} meses`}>{cumplimiento != null ? `${cumplimiento}%` : <span className="dim">-</span>}</td>
                  </tr>
                  {abierto === p.codigo && (
                    <tr className="expl-detalle-fila" style={{ cursor: 'default' }}>
                      <td colSpan={11}>
                        <div className="cob-det">
                          <div>
                            <b>Lote</b> {fmt(p.lote || 0)} · <b>Lead time</b> {p.lead_time_dias || '-'} días · <b>Stock</b> P01 {fmt(s?.stock_p01 || 0)} · P02 {fmt(s?.stock_p02 || 0)} · P19 {fmt(s?.stock_p19 || 0)}
                            {ocs.length > 0 && <> · <b>OC en camino:</b> {ocs.map(o => `${o.oc} ${o.entrega || ''} ${fmt(o.saldo)} (${fdate(o.fecha)})`).join(' · ')}</>}
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table className="expl-mini cob-meses">
                              <thead><tr><th></th>{c.meses.map(m => <th key={m.mes} className="num">{nombreMesCorto(m.mes)}</th>)}</tr></thead>
                              <tbody>
                                <tr><td>Demanda (plan)</td>{c.meses.map(m => <td key={m.mes} className="num">{fmt(Math.round(m.demanda))}</td>)}</tr>
                                <tr><td>Llegan OC</td>{c.meses.map(m => <td key={m.mes} className="num">{m.llegadas ? fmt(m.llegadas) : ''}</td>)}</tr>
                                <tr><td><b>Stock fin de mes</b></td>{c.meses.map(m => <td key={m.mes} className="num" style={{ color: m.fin < 0 ? 'var(--red)' : undefined, fontWeight: 600 }}>{fmt(Math.round(m.fin))}</td>)}</tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
