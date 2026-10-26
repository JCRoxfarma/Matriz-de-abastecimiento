import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { obtenerSnapshotsActuales, obtenerMaterialesDeSnapshot, obtenerOcPorSku, obtenerIngresosPosterioresA } from './lib/explosionImporter'
import { compararExplosiones } from './lib/explosionDiff'
import { calcularCompraSugerida } from './lib/explosionCompra'
import { obtenerStockDiario } from './lib/stockImporter'
import ExplosionButton from './ExplosionButton'
import StockButton from './StockButton'

const fechaHora = s => s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const mesLabel = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }) : ''

const CAT_TAG = { nuevo: 't-grn', aumento: 't-red', disminucion: 't-blu', sin_cambio: 't-gry', desaparecido: 't-gry' }
const CAT_LABEL = { nuevo: 'Nuevo', aumento: 'Aumentó', disminucion: 'Disminuyó', sin_cambio: 'Sin cambio', desaparecido: 'Ya no aparece' }

const ESTADO_TAG = { cubierto: 't-grn', a_tiempo: 't-grn', ajustado: 't-amb', en_riesgo: 't-red', sin_oc: 't-red', sin_dato: 't-gry', quiebre: 't-quiebre' }
const ESTADO_LABEL = { cubierto: 'Cubierto', a_tiempo: 'A tiempo', ajustado: 'Ajustado', en_riesgo: 'En riesgo', sin_oc: 'Sin OC', sin_dato: 'Sin dato fabricación', quiebre: 'Ruptura de stock' }

// Orden de urgencia para "Sugerencias de compra": primero lo que ya esta
// en ruptura o en riesgo, al final lo que ya esta cubierto.
const ESTADO_URGENCIA = { quiebre: 0, en_riesgo: 1, sin_oc: 2, ajustado: 3, sin_dato: 4, a_tiempo: 5, cubierto: 6 }

const PESTANAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'consumos', label: 'Comparar consumos' },
  { id: 'compras', label: 'Sugerencias de compra' },
]

const signo = n => n > 0 ? '+' : ''

export default function Explosion() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [snaps, setSnaps] = useState({ actual: null, anterior: null })
  const [filas, setFilas] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [stockInfo, setStockInfo] = useState(null)
  const [pestana, setPestana] = useState('resumen')

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fMesFab, setFMesFab] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fCambio, setFCambio] = useState('')
  const [soloCambios, setSoloCambios] = useState(true)
  const [soloFaltante, setSoloFaltante] = useState(true)
  const [soloTardios, setSoloTardios] = useState(false)
  const scrollRef = useRef(null)
  const moverScroll = dir => scrollRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' })

  async function cargar() {
    setLoading(true)
    setErr(null)
    try {
      const [{ actual, anterior }, stockData] = await Promise.all([
        obtenerSnapshotsActuales(),
        obtenerStockDiario(),
      ])
      setSnaps({ actual, anterior })
      setStockInfo(stockData)
      if (actual && anterior) {
        const [matActual, matAnterior] = await Promise.all([
          obtenerMaterialesDeSnapshot(actual.id),
          obtenerMaterialesDeSnapshot(anterior.id),
        ])
        const comparadas = compararExplosiones(matAnterior, matActual)
        const codigos = comparadas.map(f => f.codigo)
        const [ocPorSku, ingresosPorSku] = await Promise.all([
          obtenerOcPorSku(codigos),
          obtenerIngresosPosterioresA(codigos, actual.fecha_corte),
        ])
        setFilas(calcularCompraSugerida(comparadas, ocPorSku, ingresosPorSku, actual.fecha_corte, stockData?.mapa))
      } else {
        setFilas(null)
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // Igual que en Seguimiento OC: espera un momento sin escribir antes de
  // aplicar la busqueda, para que el cuadro de texto responda al instante.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250)
    return () => clearTimeout(t)
  }, [qInput])

  const clientes = useMemo(() => filas ? [...new Set(filas.map(f => f.cliente).filter(Boolean))].sort() : [], [filas])
  const mesesFab = useMemo(() => filas ? [...new Set(filas.map(f => f.mesFabricacionProximo).filter(Boolean))].sort() : [], [filas])

  // Filtros comunes a las dos tablas (busqueda, grupo, cliente).
  const base = useMemo(() => {
    if (!filas) return []
    const qq = q.trim().toLowerCase()
    return filas.filter(f => {
      if (qq) {
        const busca = `${f.codigo} ${f.descripcion || ''} ${f.cliente || ''}`.toLowerCase()
        if (!busca.includes(qq)) return false
      }
      if (fGrupo && String(f.grupo) !== fGrupo) return false
      if (fCliente && f.cliente !== fCliente) return false
      return true
    })
  }, [filas, q, fGrupo, fCliente])

  const filasConsumos = useMemo(() => base.filter(f => {
    if (fCambio && f.categoria !== fCambio) return false
    if (soloCambios && f.categoria === 'sin_cambio') return false
    return true
  }), [base, fCambio, soloCambios])

  const filasCompras = useMemo(() => base.filter(f => {
    if (fMesFab && f.mesFabricacionProximo !== fMesFab) return false
    if (fEstado && f.estadoAbastecimiento !== fEstado) return false
    if (soloFaltante && f.faltanteReal <= 0) return false
    if (soloTardios && !f.pedidoTardio) return false
    return true
  }).sort((a, b) => {
    const p = ESTADO_URGENCIA[a.estadoAbastecimiento] - ESTADO_URGENCIA[b.estadoAbastecimiento]
    if (p !== 0) return p
    return (a.fechaRequeridaIngreso || '9999').localeCompare(b.fechaRequeridaIngreso || '9999')
  }), [base, fMesFab, fEstado, soloFaltante, soloTardios])

  const kpis = useMemo(() => {
    if (!filas) return null
    const contarCat = cat => filas.filter(f => f.categoria === cat).length
    return {
      nuevo: contarCat('nuevo'),
      aumento: contarCat('aumento'),
      disminucion: contarCat('disminucion'),
      desaparecido: contarCat('desaparecido'),
      requierenCompra: filas.filter(f => f.compraSugerida > 0).length,
      enRiesgo: filas.filter(f => f.estadoAbastecimiento === 'en_riesgo').length,
      quiebre: filas.filter(f => f.estadoAbastecimiento === 'quiebre').length,
      sinOc: filas.filter(f => f.estadoAbastecimiento === 'sin_oc').length,
      tardios: filas.filter(f => f.pedidoTardio).length,
    }
  }, [filas])

  // Listas cortas para el Resumen: lo mas importante de un vistazo.
  const resumen = useMemo(() => {
    if (!filas) return null
    const porVariacion = filas.filter(f => f.categoria === 'aumento' || f.categoria === 'nuevo')
      .sort((a, b) => b.variacionAbs - a.variacionAbs).slice(0, 8)
    const bajas = filas.filter(f => f.categoria === 'disminucion' || f.categoria === 'desaparecido')
      .sort((a, b) => a.variacionAbs - b.variacionAbs).slice(0, 8)
    const urgentes = filas.filter(f => ['quiebre', 'en_riesgo', 'sin_oc'].includes(f.estadoAbastecimiento))
      .sort((a, b) => {
        const p = ESTADO_URGENCIA[a.estadoAbastecimiento] - ESTADO_URGENCIA[b.estadoAbastecimiento]
        if (p !== 0) return p
        return (a.fechaRequeridaIngreso || '9999').localeCompare(b.fechaRequeridaIngreso || '9999')
      }).slice(0, 10)
    return { porVariacion, bajas, urgentes }
  }, [filas])

  function limpiar() {
    setQInput(''); setQ('')
    setFGrupo(''); setFCliente(''); setFMesFab(''); setFEstado(''); setFCambio('')
    setSoloCambios(false); setSoloFaltante(false); setSoloTardios(false)
  }

  // Desde el Resumen: abre la pestana indicada con un filtro ya puesto.
  function irA(destino, filtros = {}) {
    limpiar()
    if (destino === 'consumos') setSoloCambios(true)
    if (destino === 'compras') setSoloFaltante(!filtros.estado && !filtros.tardios)
    if (filtros.cambio) setFCambio(filtros.cambio)
    if (filtros.estado) setFEstado(filtros.estado)
    if (filtros.tardios) setSoloTardios(true)
    if (filtros.codigo) { setQInput(filtros.codigo); setQ(filtros.codigo) }
    setExpandido(filtros.codigo || null)
    setPestana(destino)
  }

  const filtrosComunes = (
    <>
      <input type="text" placeholder="Buscar por código, descripción o cliente" value={qInput} onChange={e => setQInput(e.target.value)} />
      <select value={fGrupo} onChange={e => setFGrupo(e.target.value)}>
        <option value="">Todos los grupos</option>
        {[1, 2, 3, 4].map(g => <option key={g} value={g}>Grupo {g}</option>)}
      </select>
      <select value={fCliente} onChange={e => setFCliente(e.target.value)}>
        <option value="">Todos los clientes</option>
        {clientes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </>
  )

  const detalleMeses = f => (
    <table className="expl-detalle">
      <thead>
        <tr><th>Mes</th><th className="num">Explosión anterior</th><th className="num">Nueva explosión</th><th className="num">Variación</th></tr>
      </thead>
      <tbody>
        {f.meses.map(m => (
          <tr key={m.mes}>
            <td>{fdate(m.mes)}</td>
            <td className="num">{fmt(m.anterior)}</td>
            <td className="num">{fmt(m.actual)}</td>
            <td className="num">{signo(m.variacion)}{fmt(m.variacion)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div>
      <div className="bar">
        <ExplosionButton rol="actual" label="Cargar explosión nueva" onDone={cargar} />
        <ExplosionButton rol="anterior" label="Corregir explosión anterior" className="btn-subtle" onDone={cargar} />
        <StockButton onDone={cargar} />
        {snaps.actual && (
          <span className="pct">
            Último snapshot: {snaps.actual.archivo} ({fechaHora(snaps.actual.creado_en)})
            {snaps.anterior && <> — comparado contra {snaps.anterior.archivo} ({fechaHora(snaps.anterior.creado_en)})</>}
          </span>
        )}
        {stockInfo && (
          <span className="pct" style={{ color: 'var(--grn)', fontWeight: 500 }}>
            Stock del sistema: {fdate(stockInfo.fecha)}
          </span>
        )}
      </div>

      {err && <div className="empty">No se pudo cargar la comparación: {err}</div>}
      {loading && <div className="empty">Cargando...</div>}

      {!loading && !err && !snaps.actual && (
        <div className="empty">Todavía no hay ninguna explosión cargada. Usa "Cargar explosión nueva" para subir la primera.</div>
      )}
      {!loading && !err && snaps.actual && !snaps.anterior && (
        <div className="empty">Ya tienes un snapshot cargado ({snaps.actual.archivo}). La próxima vez que uses "Cargar explosión nueva" vas a ver aquí qué cambió entre las dos.</div>
      )}

      {!loading && !err && filas && (
        <>
          <div className="expl-tabs">
            {PESTANAS.map(p => (
              <button key={p.id} className={`expl-tab ${pestana === p.id ? 'act' : ''}`} onClick={() => { setExpandido(null); setPestana(p.id) }}>
                {p.label}
                {p.id === 'compras' && kpis.requierenCompra > 0 && <span className="expl-tab-n">{kpis.requierenCompra}</span>}
              </button>
            ))}
          </div>

          {pestana === 'resumen' && (
            <>
              <div className="expl-sec">Cambios de consumo</div>
              <div className="kpis">
                <div className="kpi g" onClick={() => irA('consumos', { cambio: 'nuevo' })}><div className="lb">Materiales nuevos</div><div className="vl">{kpis.nuevo}</div></div>
                <div className="kpi r" onClick={() => irA('consumos', { cambio: 'aumento' })}><div className="lb">Aumentaron consumo</div><div className="vl">{kpis.aumento}</div></div>
                <div className="kpi a" onClick={() => irA('consumos', { cambio: 'disminucion' })}><div className="lb">Disminuyeron consumo</div><div className="vl">{kpis.disminucion}</div></div>
                <div className="kpi" onClick={() => irA('consumos', { cambio: 'desaparecido' })}><div className="lb">Ya no aparecen</div><div className="vl">{kpis.desaparecido}</div></div>
              </div>

              <div className="expl-sec">Abastecimiento</div>
              <div className="kpis">
                <div className="kpi r" onClick={() => irA('compras')}><div className="lb">Requieren compra</div><div className="vl">{kpis.requierenCompra}</div></div>
                <div className="kpi r" onClick={() => irA('compras', { estado: 'quiebre' })}><div className="lb">Ruptura de stock</div><div className="vl">{kpis.quiebre}</div></div>
                <div className="kpi r" onClick={() => irA('compras', { estado: 'en_riesgo' })}><div className="lb">En riesgo</div><div className="vl">{kpis.enRiesgo}</div></div>
                <div className="kpi a" onClick={() => irA('compras', { estado: 'sin_oc' })}><div className="lb">Sin OC</div><div className="vl">{kpis.sinOc}</div></div>
                <div className="kpi a" onClick={() => irA('compras', { tardios: true })}><div className="lb">Pedidos tardíos</div><div className="vl">{kpis.tardios}</div></div>
              </div>

              <div className="expl-res">
                <div className="expl-card expl-card-full">
                  <h3>Compras urgentes</h3>
                  {resumen.urgentes.length === 0
                    ? <div className="dim">No hay materiales en ruptura, en riesgo ni sin OC.</div>
                    : (
                      <table className="expl-mini">
                        <thead>
                          <tr><th>Código</th><th>Descripción</th><th className="num">Compra sugerida</th><th>Fecha requerida</th><th>Estado</th></tr>
                        </thead>
                        <tbody>
                          {resumen.urgentes.map(f => (
                            <tr key={f.codigo} onClick={() => irA('compras', { codigo: f.codigo })}>
                              <td className="mono">{f.codigo}</td>
                              <td><div className="dsc">{f.descripcion || ''}</div></td>
                              <td className="num">{f.compraSugerida > 0 ? fmt(f.compraSugerida) : <span className="dim">0</span>}</td>
                              <td className="mono">{f.fechaRequeridaIngreso ? fdate(f.fechaRequeridaIngreso) : <span className="dim">-</span>}</td>
                              <td><span className={`tag ${ESTADO_TAG[f.estadoAbastecimiento]}`}>{ESTADO_LABEL[f.estadoAbastecimiento]}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>

                <div className="expl-card">
                  <h3>Mayores aumentos de consumo</h3>
                  {resumen.porVariacion.length === 0
                    ? <div className="dim">Ningún material subió de consumo.</div>
                    : (
                      <table className="expl-mini">
                        <tbody>
                          {resumen.porVariacion.map(f => (
                            <tr key={f.codigo} onClick={() => irA('consumos', { codigo: f.codigo })}>
                              <td className="mono">{f.codigo}</td>
                              <td><div className="dsc">{f.descripcion || ''}</div></td>
                              <td className="num" style={{ color: 'var(--red)' }}>
                                {f.categoria === 'nuevo' ? <span className="tag t-grn">Nuevo</span> : <>+{fmt(f.variacionAbs)}</>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>

                <div className="expl-card">
                  <h3>Mayores disminuciones de consumo</h3>
                  {resumen.bajas.length === 0
                    ? <div className="dim">Ningún material bajó de consumo.</div>
                    : (
                      <table className="expl-mini">
                        <tbody>
                          {resumen.bajas.map(f => (
                            <tr key={f.codigo} onClick={() => irA('consumos', { codigo: f.codigo })}>
                              <td className="mono">{f.codigo}</td>
                              <td><div className="dsc">{f.descripcion || ''}</div></td>
                              <td className="num" style={{ color: 'var(--blu)' }}>
                                {f.categoria === 'desaparecido' ? <span className="tag t-gry">Ya no aparece</span> : fmt(f.variacionAbs)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </div>
              </div>
              <div className="pct" style={{ margin: '10px 2px' }}>Haz clic en cualquier tarjeta o material para ver el detalle.</div>
            </>
          )}

          {pestana === 'consumos' && (
            <>
              <div className="bar">
                {filtrosComunes}
                <select value={fCambio} onChange={e => setFCambio(e.target.value)}>
                  <option value="">Todos los cambios</option>
                  {Object.keys(CAT_LABEL).map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
                <button className={`btn ${soloCambios ? 'act' : ''}`} onClick={() => setSoloCambios(v => !v)}>Solo con cambios</button>
                <button className="btn" onClick={limpiar}>Limpiar</button>
                <span className="count">{fmt(filasConsumos.length)} materiales</span>
              </div>

              <div className="tw">
                <div className="scroll">
                  <table className="expl-tbl">
                    <thead>
                      <tr>
                        <th className="stk stk-a"></th>
                        <th className="stk stk-b">Código</th>
                        <th className="stk stk-c">Descripción</th>
                        <th>Grupo</th>
                        <th>Cliente</th>
                        <th className="num">Consumo anterior</th>
                        <th className="num">Consumo nuevo</th>
                        <th className="num">Variación</th>
                        <th className="num">Variación %</th>
                        <th>Cambio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasConsumos.map(f => (
                        <Fragment key={f.codigo}>
                          <tr onClick={() => setExpandido(e => e === f.codigo ? null : f.codigo)}>
                            <td className="dim stk stk-a">{expandido === f.codigo ? '▾' : '▸'}</td>
                            <td className="mono stk stk-b">{f.codigo}</td>
                            <td className="stk stk-c"><div className="dsc">{f.descripcion || ''}</div></td>
                            <td>{f.grupo ?? ''}</td>
                            <td>
                              {f.revisarVersion
                                ? <span className="tag t-amb">Revisar versión</span>
                                : <div className="cli">{f.cliente || ''}</div>}
                            </td>
                            <td className="num">{fmt(f.consumoAnteriorTotal)}</td>
                            <td className="num">{fmt(f.consumoActualTotal)}</td>
                            <td className="num">{signo(f.variacionAbs)}{fmt(f.variacionAbs)}</td>
                            <td className="num">{f.variacionPct == null ? '' : `${signo(f.variacionPct)}${f.variacionPct}%`}</td>
                            <td><span className={`tag ${CAT_TAG[f.categoria]}`}>{CAT_LABEL[f.categoria]}</span></td>
                          </tr>
                          {expandido === f.codigo && (
                            <tr>
                              <td></td>
                              <td colSpan={9}>
                                {detalleMeses(f)}
                                {f.revisarVersion && <div className="pct" style={{ marginTop: 8 }}>Clientes: {f.cliente}</div>}
                                {(f.version1 || f.version2 || f.version3) && (
                                  <div className="pct" style={{ marginTop: 8 }}>
                                    Versiones: {[f.version1, f.version2, f.version3].filter(Boolean).join(', ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  {filasConsumos.length === 0 && <div className="empty">No hay materiales con estos filtros.</div>}
                </div>
              </div>
            </>
          )}

          {pestana === 'compras' && (
            <>
              <div className="bar">
                {filtrosComunes}
                <select value={fMesFab} onChange={e => setFMesFab(e.target.value)}>
                  <option value="">Todos los meses de fabricación</option>
                  {mesesFab.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
                <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {Object.keys(ESTADO_LABEL).map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                </select>
                <button className={`btn ${soloFaltante ? 'act' : ''}`} onClick={() => setSoloFaltante(v => !v)}>Solo con faltante</button>
                <button className={`btn ${soloTardios ? 'act' : ''}`} onClick={() => setSoloTardios(v => !v)}>Solo pedidos tardíos</button>
                <button className="btn" onClick={limpiar}>Limpiar</button>
                <span className="count">{fmt(filasCompras.length)} materiales</span>
              </div>

              <div className="tw">
                <div className="expl-scrollbar">
                  <span className="dim" style={{ fontSize: '11.5px' }}>Mover la tabla:</span>
                  <button className="btn" onClick={() => moverScroll(-1)}>◂ Izquierda</button>
                  <button className="btn" onClick={() => moverScroll(1)}>Derecha ▸</button>
                </div>
                <div className="scroll" ref={scrollRef}>
                  <table className="expl-tbl">
                    <thead>
                      <tr>
                        <th className="stk stk-a"></th>
                        <th className="stk stk-b">Código</th>
                        <th className="stk stk-c">Descripción</th>
                        <th>Grupo</th>
                        <th className="num">Stock</th>
                        <th className="num">OC pendiente</th>
                        <th className="num">Faltante real</th>
                        <th className="num">Compra sugerida</th>
                        <th>Fecha requerida</th>
                        <th>Fecha programada</th>
                        <th className="num">Cobertura</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasCompras.map(f => (
                        <Fragment key={f.codigo}>
                          <tr onClick={() => setExpandido(e => e === f.codigo ? null : f.codigo)}>
                            <td className="dim stk stk-a">{expandido === f.codigo ? '▾' : '▸'}</td>
                            <td className="mono stk stk-b">{f.codigo}</td>
                            <td className="stk stk-c"><div className="dsc">{f.descripcion || ''}</div></td>
                            <td>{f.grupo ?? ''}</td>
                            <td className="num">
                              {fmt(f.stockEfectivo)}
                              {f.usaStockDiario
                                ? <div className="pct" style={{ margin: '2px 0 0', color: 'var(--grn)' }}>stock del sistema</div>
                                : f.ingresosPosterioresAlCorte > 0 && (
                                    <div className="pct" style={{ margin: '2px 0 0' }}>+{fmt(f.ingresosPosterioresAlCorte)} después del corte</div>
                                  )}
                            </td>
                            <td className="num">
                              {fmt(f.ocPendiente)}
                              {f.ocEntregas.length === 1 && <div className="pct" style={{ margin: '2px 0 0' }}>OC {f.ocEntregas[0].oc}</div>}
                              {f.ocEntregas.length > 1 && <div className="pct" style={{ margin: '2px 0 0' }}>{f.ocEntregas.length} OC, ver detalle</div>}
                            </td>
                            <td className="num">{f.faltanteReal > 0 ? <b style={{ fontWeight: 500 }}>{fmt(f.faltanteReal)}</b> : <span className="dim">0</span>}</td>
                            <td className="num">
                              {f.compraSugerida > 0 ? <b style={{ fontWeight: 500 }}>{fmt(f.compraSugerida)}</b> : <span className="dim">0</span>}
                              {f.loteMinimoAplicado && <div className="pct" style={{ margin: '2px 0 0' }}>lote mínimo</div>}
                            </td>
                            <td className="mono">{f.fechaRequeridaIngreso ? fdate(f.fechaRequeridaIngreso) : <span className="dim">-</span>}</td>
                            <td className="mono">{f.fechaEntregaProgramada ? fdate(f.fechaEntregaProgramada) : <span className="dim">-</span>}</td>
                            <td className="num">
                              {f.mesesCubiertos != null
                                ? <span style={{ color: f.mesesCubiertos >= 2.5 ? 'var(--grn)' : f.mesesCubiertos >= 1 ? 'var(--amb)' : 'var(--red)', fontWeight: 500 }}>{f.mesesCubiertos} m</span>
                                : <span className="dim">-</span>}
                            </td>
                            <td>
                              <span className={`tag ${ESTADO_TAG[f.estadoAbastecimiento]}`}>{ESTADO_LABEL[f.estadoAbastecimiento]}</span>
                              {f.pedidoTardio && <div style={{ marginTop: 4 }}><span className="tag t-quiebre">Tardío {f.diasAnticipacion}d</span></div>}
                            </td>
                          </tr>
                          {expandido === f.codigo && (
                            <tr>
                              <td></td>
                              <td colSpan={11}>
                                <div className="pct" style={{ margin: '6px 0 8px' }}>
                                  Cliente: {f.cliente || '-'}
                                  {' · '}Mes de fabricación: {f.mesFabricacionProximo ? mesLabel(f.mesFabricacionProximo) : '-'}
                                  {' · '}Merma: {f.mermaPct}%
                                  {' · '}Anticipación: {f.diasAnticipacion != null ? `${f.diasAnticipacion} días` : '-'}
                                </div>
                                {detalleMeses(f)}
                                {f.stockDiarioEntry && (
                                  <div className="pct" style={{ marginTop: 8 }}>
                                    Stock del sistema: E02 aprobados {fmt(f.stockDiarioEntry.e02)} · E01 cuarentena {fmt(f.stockDiarioEntry.e01)} · E24 externo {fmt(f.stockDiarioEntry.e24)}
                                  </div>
                                )}
                                {f.ocEntregas.length > 0 && (
                                  <div className="pct" style={{ marginTop: 8 }}>
                                    OC pendientes: {f.ocEntregas.map(e =>
                                      `OC ${e.oc} — ${fmt(e.saldo)}${e.fecha ? ' — ' + fdate(e.fecha) : ''}`
                                    ).join(' · ')}
                                  </div>
                                )}
                                {(f.version1 || f.version2 || f.version3) && (
                                  <div className="pct" style={{ marginTop: 8 }}>
                                    Versiones: {[f.version1, f.version2, f.version3].filter(Boolean).join(', ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  {filasCompras.length === 0 && <div className="empty">No hay materiales con estos filtros.</div>}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
