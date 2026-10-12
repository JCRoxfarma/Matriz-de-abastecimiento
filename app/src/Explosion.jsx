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

export default function Explosion() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [snaps, setSnaps] = useState({ actual: null, anterior: null })
  const [filas, setFilas] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [stockInfo, setStockInfo] = useState(null)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [fMesFab, setFMesFab] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [soloCambios, setSoloCambios] = useState(false)
  const [soloFaltante, setSoloFaltante] = useState(false)
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

  const filtradas = useMemo(() => {
    if (!filas) return []
    const qq = q.trim().toLowerCase()
    return filas.filter(f => {
      if (qq) {
        const busca = `${f.codigo} ${f.descripcion || ''} ${f.cliente || ''}`.toLowerCase()
        if (!busca.includes(qq)) return false
      }
      if (fGrupo && String(f.grupo) !== fGrupo) return false
      if (fCliente && f.cliente !== fCliente) return false
      if (fMesFab && f.mesFabricacionProximo !== fMesFab) return false
      if (fEstado && f.estadoAbastecimiento !== fEstado) return false
      if (soloCambios && f.categoria === 'sin_cambio') return false
      if (soloFaltante && f.faltanteReal <= 0) return false
      if (soloTardios && !f.pedidoTardio) return false
      return true
    })
  }, [filas, q, fGrupo, fCliente, fMesFab, fEstado, soloCambios, soloFaltante, soloTardios])

  const kpis = useMemo(() => {
    if (!filas) return null
    const contarCat = cat => filas.filter(f => f.categoria === cat).length
    return {
      nuevo: contarCat('nuevo'),
      aumento: contarCat('aumento'),
      disminucion: contarCat('disminucion'),
      conFaltante: filas.filter(f => f.faltanteReal > 0).length,
      requierenCompra: filas.filter(f => f.compraSugerida > 0).length,
      enRiesgo: filas.filter(f => f.estadoAbastecimiento === 'en_riesgo').length,
      quiebre: filas.filter(f => f.estadoAbastecimiento === 'quiebre').length,
      tardios: filas.filter(f => f.pedidoTardio).length,
    }
  }, [filas])

  function limpiar() {
    setQInput(''); setQ('')
    setFGrupo(''); setFCliente(''); setFMesFab(''); setFEstado('')
    setSoloCambios(false); setSoloFaltante(false); setSoloTardios(false)
  }

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
          <div className="kpis">
            <div className="kpi g"><div className="lb">Materiales nuevos</div><div className="vl">{kpis.nuevo}</div></div>
            <div className="kpi r"><div className="lb">Aumentaron consumo</div><div className="vl">{kpis.aumento}</div></div>
            <div className="kpi a"><div className="lb">Disminuyeron consumo</div><div className="vl">{kpis.disminucion}</div></div>
            <div className="kpi a"><div className="lb">Con faltante</div><div className="vl">{kpis.conFaltante}</div></div>
            <div className="kpi r"><div className="lb">Requieren compra</div><div className="vl">{kpis.requierenCompra}</div></div>
            <div className="kpi r"><div className="lb">En riesgo</div><div className="vl">{kpis.enRiesgo}</div></div>
            <div className="kpi r"><div className="lb">Ruptura de stock</div><div className="vl">{kpis.quiebre}</div></div>
            <div className="kpi r"><div className="lb">Pedidos tardíos</div><div className="vl">{kpis.tardios}</div></div>
          </div>

          <div className="bar">
            <input type="text" placeholder="Buscar por código, descripción o cliente" value={qInput} onChange={e => setQInput(e.target.value)} />
            <select value={fGrupo} onChange={e => setFGrupo(e.target.value)}>
              <option value="">Todos los grupos</option>
              {[1, 2, 3, 4].map(g => <option key={g} value={g}>Grupo {g}</option>)}
            </select>
            <select value={fCliente} onChange={e => setFCliente(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fMesFab} onChange={e => setFMesFab(e.target.value)}>
              <option value="">Todos los meses de fabricación</option>
              {mesesFab.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
            <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.keys(ESTADO_LABEL).map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
            </select>
            <button className={`btn ${soloCambios ? 'act' : ''}`} onClick={() => setSoloCambios(v => !v)}>Solo con cambios</button>
            <button className={`btn ${soloFaltante ? 'act' : ''}`} onClick={() => setSoloFaltante(v => !v)}>Solo con faltante</button>
            <button className={`btn ${soloTardios ? 'act' : ''}`} onClick={() => setSoloTardios(v => !v)}>Solo pedidos tardíos</button>
            <button className="btn" onClick={limpiar}>Limpiar</button>
            <span className="count">{fmt(filtradas.length)} materiales</span>
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
                    <th>Cliente</th>
                    <th className="num">Stock</th>
                    <th className="num">Consumo anterior</th>
                    <th className="num">Consumo nuevo</th>
                    <th className="num">Variación</th>
                    <th className="num">Variación %</th>
                    <th>Cambio</th>
                    <th className="num">OC pendiente</th>
                    <th className="num">% Merma</th>
                    <th className="num">Faltante real</th>
                    <th className="num">Compra sugerida</th>
                    <th>Mes fabricación</th>
                    <th>Fecha requerida</th>
                    <th>Fecha programada</th>
                    <th className="num">Cobertura</th>
                    <th>Anticipación</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(f => (
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
                        <td className="num">
                          {fmt(f.stockEfectivo)}
                          {f.usaStockDiario
                            ? <div className="pct" style={{ margin: '2px 0 0', color: 'var(--grn)' }}>stock del sistema</div>
                            : f.ingresosPosterioresAlCorte > 0 && (
                                <div className="pct" style={{ margin: '2px 0 0' }}>+{fmt(f.ingresosPosterioresAlCorte)} después del corte</div>
                              )}
                        </td>
                        <td className="num">{fmt(f.consumoAnteriorTotal)}</td>
                        <td className="num">{fmt(f.consumoActualTotal)}</td>
                        <td className="num">{f.variacionAbs > 0 ? '+' : ''}{fmt(f.variacionAbs)}</td>
                        <td className="num">{f.variacionPct == null ? '' : `${f.variacionPct > 0 ? '+' : ''}${f.variacionPct}%`}</td>
                        <td><span className={`tag ${CAT_TAG[f.categoria]}`}>{CAT_LABEL[f.categoria]}</span></td>
                        <td className="num">
                          {fmt(f.ocPendiente)}
                          {f.ocEntregas.length === 1 && <div className="pct" style={{ margin: '2px 0 0' }}>OC {f.ocEntregas[0].oc}</div>}
                          {f.ocEntregas.length > 1 && <div className="pct" style={{ margin: '2px 0 0' }}>{f.ocEntregas.length} OC, ver detalle</div>}
                        </td>
                        <td className="num">{f.mermaPct}%</td>
                        <td className="num">{f.faltanteReal > 0 ? <b style={{ fontWeight: 500 }}>{fmt(f.faltanteReal)}</b> : <span className="dim">0</span>}</td>
                        <td className="num">
                          {f.compraSugerida > 0 ? <b style={{ fontWeight: 500 }}>{fmt(f.compraSugerida)}</b> : <span className="dim">0</span>}
                          {f.loteMinimoAplicado && <div className="pct" style={{ margin: '2px 0 0' }}>lote mínimo</div>}
                        </td>
                        <td className="nw">{f.mesFabricacionProximo ? mesLabel(f.mesFabricacionProximo) : <span className="dim">-</span>}</td>
                        <td className="mono">{f.fechaRequeridaIngreso ? fdate(f.fechaRequeridaIngreso) : <span className="dim">-</span>}</td>
                        <td className="mono">{f.fechaEntregaProgramada ? fdate(f.fechaEntregaProgramada) : <span className="dim">-</span>}</td>
                        <td className="num">
                          {f.mesesCubiertos != null
                            ? <span style={{ color: f.mesesCubiertos >= 2.5 ? 'var(--grn)' : f.mesesCubiertos >= 1 ? 'var(--amb)' : 'var(--red)', fontWeight: 500 }}>{f.mesesCubiertos} m</span>
                            : <span className="dim">-</span>}
                        </td>
                        <td>
                          {f.pedidoTardio
                            ? <span className="tag t-quiebre">Tardío {f.diasAnticipacion}d</span>
                            : f.diasAnticipacion != null
                              ? <span style={{ color: f.diasAnticipacion >= 30 ? 'var(--grn)' : f.diasAnticipacion >= 15 ? 'var(--amb)' : 'var(--red)' }}>{f.diasAnticipacion}d</span>
                              : <span className="dim">-</span>}
                        </td>
                        <td><span className={`tag ${ESTADO_TAG[f.estadoAbastecimiento]}`}>{ESTADO_LABEL[f.estadoAbastecimiento]}</span></td>
                      </tr>
                      {expandido === f.codigo && (
                        <tr>
                          <td></td>
                          <td colSpan={20}>
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
                                    <td className="num">{m.variacion > 0 ? '+' : ''}{fmt(m.variacion)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
              {filtradas.length === 0 && <div className="empty">No hay materiales con estos filtros.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
