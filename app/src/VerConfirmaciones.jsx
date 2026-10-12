import { useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { generarToken } from './lib/recordatorioService'

const BASE_URL = window.location.origin

function linkPortal(proveedor) {
  return `${BASE_URL}/confirmar?token=${encodeURIComponent(generarToken(proveedor))}`
}

export default function VerConfirmaciones({ rows, onClose }) {
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [expandido, setExpandido] = useState(null)
  const [copiado, setCopiado] = useState(null)

  const proveedores = useMemo(() => {
    const abiertas = rows.filter(r => r.abierto)
    const groups = new Map()
    for (const r of abiertas) {
      const prov = r.proveedor || 'Sin proveedor'
      if (!groups.has(prov)) groups.set(prov, [])
      groups.get(prov).push(r)
    }

    const bb = buscar.toLowerCase()
    return [...groups.entries()]
      .filter(([nombre]) => !bb || nombre.toLowerCase().includes(bb))
      .map(([nombre, filas]) => {
        const confirmadas = filas.filter(r => r.estado_confirmacion === 'Confirmada').length
        const pendientes = filas.length - confirmadas
        return { nombre, filas, confirmadas, pendientes }
      })
      .filter(p => {
        if (filtro === 'confirmadas') return p.confirmadas > 0
        if (filtro === 'pendientes') return p.pendientes > 0
        if (filtro === 'completas') return p.pendientes === 0
        return true
      })
      .sort((a, b) => b.filas.length - a.filas.length)
  }, [rows, buscar, filtro])

  const totales = useMemo(() => {
    const abiertas = rows.filter(r => r.abierto)
    const conf = abiertas.filter(r => r.estado_confirmacion === 'Confirmada').length
    return { total: abiertas.length, confirmadas: conf, pendientes: abiertas.length - conf }
  }, [rows])

  async function copiarLink(nombre) {
    const link = linkPortal(nombre)
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(nombre)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      window.prompt('Copia este link:', link)
    }
  }

  function abrirPortal(nombre) {
    window.open(linkPortal(nombre), '_blank')
  }

  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl mdl-wide" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Confirmaciones de proveedores</h2>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          <div className="conf-resumen-bar">
            <div className="conf-stat">
              <span className="conf-stat-num">{fmt(totales.total)}</span>
              <span className="conf-stat-lb">entregas abiertas</span>
            </div>
            <div className="conf-stat conf-stat-grn">
              <span className="conf-stat-num">{fmt(totales.confirmadas)}</span>
              <span className="conf-stat-lb">confirmadas</span>
            </div>
            <div className="conf-stat conf-stat-amb">
              <span className="conf-stat-num">{fmt(totales.pendientes)}</span>
              <span className="conf-stat-lb">sin confirmar</span>
            </div>
            {totales.total > 0 && (
              <div className="conf-stat">
                <span className="conf-stat-num">{(totales.confirmadas / totales.total * 100).toFixed(0)}%</span>
                <span className="conf-stat-lb">tasa de confirmacion</span>
              </div>
            )}
          </div>

          <div className="mdl-ctrl">
            <input
              type="text"
              placeholder="Buscar proveedor..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
            <select value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="todas">Todos los proveedores</option>
              <option value="pendientes">Con entregas sin confirmar</option>
              <option value="confirmadas">Con alguna confirmada</option>
              <option value="completas">100% confirmadas</option>
            </select>
          </div>

          <div className="conf-lista-prov">
            {proveedores.length === 0 && (
              <div className="mdl-empty">No hay proveedores con entregas abiertas.</div>
            )}
            {proveedores.map(prov => {
              const pct = prov.filas.length > 0 ? (prov.confirmadas / prov.filas.length * 100) : 0
              const abierto = expandido === prov.nombre
              return (
                <div key={prov.nombre} className={`conf-prov ${prov.pendientes === 0 ? 'conf-prov-ok' : ''}`}>
                  <div className="conf-prov-head" onClick={() => setExpandido(abierto ? null : prov.nombre)}>
                    <div className="conf-prov-info">
                      <span className="conf-prov-arrow">{abierto ? '▾' : '▸'}</span>
                      <b>{prov.nombre}</b>
                      <span className="conf-prov-badge">
                        {prov.filas.length} entrega{prov.filas.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="conf-prov-status">
                      <span className="conf-prov-pbar">
                        <i style={{ width: `${pct}%`, background: pct === 100 ? 'var(--grn)' : 'var(--acc)' }} />
                      </span>
                      <span className={`conf-prov-pct ${pct === 100 ? 'conf-pct-ok' : ''}`}>
                        {prov.confirmadas}/{prov.filas.length}
                      </span>
                      <button className="btn-sm" onClick={e => { e.stopPropagation(); copiarLink(prov.nombre) }}>
                        {copiado === prov.nombre ? 'Copiado' : 'Copiar link'}
                      </button>
                      <button className="btn-sm" onClick={e => { e.stopPropagation(); abrirPortal(prov.nombre) }}>
                        Ver portal
                      </button>
                    </div>
                  </div>
                  {abierto && (
                    <div className="conf-prov-detalle">
                      <table className="conf-tabla">
                        <thead>
                          <tr>
                            <th>OC</th>
                            <th>SKU</th>
                            <th>Material</th>
                            <th style={{ textAlign: 'right' }}>Cant. pendiente</th>
                            <th>F. programada</th>
                            <th>F. confirmada</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prov.filas
                            .sort((a, b) => (a.fecha_programada_ingreso || '').localeCompare(b.fecha_programada_ingreso || ''))
                            .map(r => (
                            <tr key={r.id_entrega}>
                              <td className="mono">{r.oc}</td>
                              <td className="mono">{r.sku}</td>
                              <td>{r.descripcion || ''}</td>
                              <td style={{ textAlign: 'right' }}>{fmt(r.saldo_pendiente)}</td>
                              <td className="mono">{fdate(r.fecha_programada_ingreso)}</td>
                              <td className="mono">
                                {r.fecha_confirmada
                                  ? <span style={{ color: 'var(--grn)', fontWeight: 500 }}>{fdate(r.fecha_confirmada)}</span>
                                  : <span className="dim">—</span>
                                }
                              </td>
                              <td>
                                <span className={`tag ${r.estado_confirmacion === 'Confirmada' ? 't-grn' : 't-amb'}`}>
                                  {r.estado_confirmacion}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="hint" style={{ marginTop: 12 }}>
            Cada proveedor tiene un link unico para confirmar sus fechas. Usa "Copiar link" para enviarlo manualmente o "Ver portal" para ver lo que el proveedor ve.
          </div>
        </div>
      </div>
    </div>
  )
}
