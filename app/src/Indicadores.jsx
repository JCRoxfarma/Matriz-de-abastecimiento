import { useEffect, useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { fetchAll } from './lib/importer'
import { cargarOI, ETAPAS } from './lib/seguimientoOI'

// Panel de indicadores (pestana "Indicadores"). Reglas de OTIF definidas
// por Johany (noviembre 2026):
//   - A tiempo: llego el mismo dia o antes de la fecha comprometida.
//   - Completo: llego al menos el 95% del programado (incluido el ajuste).
//     Llegar de mas tambien cuenta como completo.
//   - Meta: 90%.
// Se evalua cada entrega cuya fecha comprometida ya paso (las futuras aun
// no se pueden medir). Una entrega vencida que todavia no llega cuenta como
// no cumplida. Las ordenes anuladas no cuentan.
const META_OTIF = 90
const MINIMO_COMPLETO = 0.95

// Colores de series validados (azul local / ambar importado) y de estado.
const C_LOCAL = '#2a6fc2'
const C_IMPORT = '#c27a1c'
const C_BARRA = '#2a6fc2'

const hoyIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5)
const pct = (n, d) => d ? Math.round((n / d) * 1000) / 10 : null
const mesNombre = clave => {
  const [y, m] = clave.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'short' }).replace('.', '')
}
const mesLargo = clave => {
  const [y, m] = clave.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
}
const colorEstado = v => v == null ? 'var(--ink3)' : v >= META_OTIF ? 'var(--grn)' : v >= 75 ? 'var(--amb)' : 'var(--red)'
const valorPendiente = r => (r.saldo_pendiente || 0) * (r.precio_unitario || 0)
const esSoles = r => r.moneda === 'SOLES'

// Evalua una entrega para OTIF. base: 'original' (fecha programada antes de
// reprogramar) o 'vigente' (confirmada por el proveedor o programada actual).
function evaluarEntrega(r, base, ultimaLlegada, hoy) {
  if (r.estado_gestion === 'Orden Anulada') return null
  const compromiso = base === 'original' ? (r.fprog0 || r.fecha_programada_ingreso) : (r.fecha_confirmada || r.fecha_programada_ingreso)
  if (!compromiso || compromiso > hoy) return null
  const prog = r.progEfectivo || 0
  const ingresado = r.cant_ingresada || 0
  const completo = prog > 0 && ingresado >= prog * MINIMO_COMPLETO
  // Fecha de llegada: la real de la entrega (cuando se completo) o, si no
  // la tiene (llego incompleta o se cerro con tolerancia), el ultimo
  // ingreso de esa OC + SKU. "A tiempo" se mide aunque haya llegado
  // incompleta: OTIF exige ademas que este completa, por eso OTIF siempre
  // es menor o igual que A tiempo.
  const llegada = r.fecha_real_ingreso || (ingresado > 0 ? ultimaLlegada.get(`${r.oc}|${r.sku}`) || null : null)
  const aTiempo = !!llegada && llegada <= compromiso
  // Atraso solo de lo que ya llego: lo vencido que aun no llega se ve
  // aparte (Atrasadas hoy) y no infla el promedio.
  const atraso = llegada ? Math.max(0, diasEntre(compromiso, llegada)) : 0
  return { r, compromiso, completo, aTiempo, otif: completo && aTiempo, atraso, pendiente: !llegada }
}

// ---------- Piezas visuales ----------

function Tarjeta({ titulo, valor, pie, color, destacada }) {
  return (
    <div className={`ind-kpi ${destacada ? 'dest' : ''}`}>
      <div className="lb">{titulo}</div>
      <div className="vl" style={!destacada && color ? { color } : undefined}>{valor}</div>
      {pie && <div className="ft">{pie}</div>}
    </div>
  )
}

function Seccion({ titulo, etiqueta, children }) {
  return (
    <section className="ind-sec">
      <div className="ind-sec-h">
        <h2>{titulo}</h2>
        {etiqueta && <span className="ind-chip">{etiqueta}</span>}
      </div>
      {children}
    </section>
  )
}

// Barras verticales por mes con linea de meta. Una sola serie: el color de
// cada barra dice si cumple la meta (con el valor siempre escrito encima).
function GraficoOtifMes({ datos }) {
  const [hover, setHover] = useState(null)
  const alto = 180
  if (!datos.length) return <div className="ind-vacio">Todavía no hay entregas vencidas para medir.</div>
  const y = v => alto - (v / 100) * alto
  return (
    <div className="ind-vbars" onMouseLeave={() => setHover(null)}>
      <div className="ind-vbars-plot" style={{ height: alto }}>
        {[0, 50, 100].map(g => <div key={g} className="ind-grid" style={{ top: y(g) }}><span>{g}%</span></div>)}
        <div className="ind-meta" style={{ top: y(META_OTIF) }}><span>Meta {META_OTIF}%</span></div>
        <div className="ind-vbars-cols">
          {datos.map(d => (
            <div key={d.mes} className="ind-vcol" onMouseEnter={() => setHover(d)}>
              <div className="ind-vval" style={{ bottom: (d.otif / 100) * alto + 4 }}>{d.otif}%</div>
              <div className="ind-vbar" style={{ height: Math.max(2, (d.otif / 100) * alto), background: colorEstado(d.otif) }} />
            </div>
          ))}
        </div>
      </div>
      <div className="ind-vbars-x">{datos.map(d => <div key={d.mes}>{mesNombre(d.mes)}</div>)}</div>
      {hover && (
        <div className="ind-tip">
          <b>{mesLargo(hover.mes)}</b> · OTIF {hover.otif}%<br />
          {hover.n} entregas · a tiempo {hover.aTiempo}% · completas {hover.completo}%
        </div>
      )}
    </div>
  )
}

// Barras apiladas por semana: local / importado.
function GraficoSemanas({ datos }) {
  const [hover, setHover] = useState(null)
  const alto = 150
  const max = Math.max(1, ...datos.map(d => d.local + d.importado))
  return (
    <div className="ind-vbars" onMouseLeave={() => setHover(null)}>
      <div className="ind-leyenda">
        <span><i style={{ background: C_LOCAL }} />Local</span>
        <span><i style={{ background: C_IMPORT }} />Importado</span>
      </div>
      <div className="ind-vbars-plot" style={{ height: alto }}>
        <div className="ind-vbars-cols">
          {datos.map(d => {
            const total = d.local + d.importado
            return (
              <div key={d.clave} className="ind-vcol" onMouseEnter={() => setHover(d)}>
                {total > 0 && <div className="ind-vval" style={{ bottom: (total / max) * alto + 4 }}>{total}</div>}
                <div className="ind-stack" style={{ height: (total / max) * alto }}>
                  {d.importado > 0 && <div style={{ flex: d.importado, background: C_IMPORT }} />}
                  {d.local > 0 && <div style={{ flex: d.local, background: C_LOCAL }} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="ind-vbars-x">{datos.map(d => <div key={d.clave} className={d.atrasado ? 'rojo' : ''}>{d.etiqueta}</div>)}</div>
      {hover && (
        <div className="ind-tip">
          <b>{hover.titulo}</b><br />
          Local: {hover.local} entregas · Importado: {hover.importado}
        </div>
      )}
    </div>
  )
}

// Barras horizontales con nombre, barra y valor (ranking).
function BarrasH({ filas, formato, maximo, colorDe }) {
  const max = maximo || Math.max(1, ...filas.map(f => f.valor))
  if (!filas.length) return <div className="ind-vacio">Sin datos.</div>
  return (
    <div className="ind-hbars">
      {filas.map(f => (
        <div key={f.nombre} className="ind-hrow" title={f.detalle || ''}>
          <div className="ind-hname">{f.nombre}</div>
          <div className="ind-htrack"><div className="ind-hbar" style={{ width: `${Math.max(1.5, (f.valor / max) * 100)}%`, background: colorDe ? colorDe(f.valor) : C_BARRA }} /></div>
          <div className="ind-hval">{formato(f.valor)}</div>
          {f.sub && <div className="ind-hsub">{f.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// ---------- Pantalla ----------

export default function Indicadores({ rows }) {
  const [base, setBase] = useState('original')
  const [ultimaLlegada, setUltimaLlegada] = useState(new Map())
  const [oi, setOi] = useState([])
  const [err, setErr] = useState(null)

  useEffect(() => {
    fetchAll('ingresos_sistema', 'oc,codigo,fecha_ingreso')
      .then(data => {
        const m = new Map()
        for (const e of data) {
          const k = `${e.oc}|${e.codigo}`
          if (e.fecha_ingreso && (!m.has(k) || e.fecha_ingreso > m.get(k))) m.set(k, e.fecha_ingreso)
        }
        setUltimaLlegada(m)
      })
      .catch(e => setErr(e.message))
    cargarOI().then(setOi).catch(e => setErr(e.message))
  }, [])

  const hoy = hoyIso()
  const mesActual = hoy.slice(0, 7)

  const evaluadas = useMemo(
    () => rows.map(r => evaluarEntrega(r, base, ultimaLlegada, hoy)).filter(Boolean),
    [rows, base, ultimaLlegada, hoy])

  // --- 1. OTIF ---
  const otif = useMemo(() => {
    const resumen = lista => ({
      n: lista.length,
      otif: pct(lista.filter(e => e.otif).length, lista.length),
      aTiempo: pct(lista.filter(e => e.aTiempo).length, lista.length),
      completo: pct(lista.filter(e => e.completo).length, lista.length),
    })
    const porMes = new Map()
    for (const e of evaluadas) {
      const k = e.compromiso.slice(0, 7)
      if (!porMes.has(k)) porMes.set(k, [])
      porMes.get(k).push(e)
    }
    const meses = [...porMes.keys()].sort().slice(-12)
    const serie = meses.map(m => ({ mes: m, ...resumen(porMes.get(m)) }))
    const actual = serie.find(s => s.mes === mesActual) || null
    const anterior = serie.filter(s => s.mes < mesActual).slice(-1)[0] || null
    const anio = resumen(evaluadas.filter(e => e.compromiso.slice(0, 4) === hoy.slice(0, 4)))
    const tarde = evaluadas.filter(e => e.atraso > 0)
    const atrasoProm = tarde.length ? Math.round((tarde.reduce((a, e) => a + e.atraso, 0) / tarde.length) * 10) / 10 : 0
    return { serie, actual, anterior, anio, atrasoProm, nTarde: tarde.length }
  }, [evaluadas, mesActual, hoy])

  // --- 2. Pendientes ---
  const pendientes = useMemo(() => {
    const abiertas = rows.filter(r => r.abierto && r.estado_gestion !== 'Orden Anulada')
    const grupo = lista => ({
      n: lista.length,
      soles: lista.filter(esSoles).reduce((a, r) => a + valorPendiente(r), 0),
      dolares: lista.filter(r => !esSoles(r)).reduce((a, r) => a + valorPendiente(r), 0),
    })
    const local = abiertas.filter(r => r.origen !== 'Importado')
    const importado = abiertas.filter(r => r.origen === 'Importado')
    const atrasadas = abiertas.filter(r => r.dd != null && r.dd < 0)
    const semana = abiertas.filter(r => r.dd != null && r.dd >= 0 && r.dd <= 7)

    // Atrasadas + proximas 8 semanas (lunes a domingo) segun fecha efectiva.
    const lunes = new Date(hoy + 'T00:00:00')
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
    const semanas = [{ clave: 'atr', etiqueta: 'Atrasado', titulo: 'Atrasadas (fecha ya pasó)', local: 0, importado: 0, atrasado: true }]
    for (let i = 0; i < 8; i++) {
      const ini = new Date(lunes); ini.setDate(lunes.getDate() + i * 7)
      const fin = new Date(ini); fin.setDate(ini.getDate() + 6)
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      semanas.push({ clave: iso(ini), desde: iso(ini), hasta: iso(fin), etiqueta: fdate(iso(ini)).slice(0, 5), titulo: `Semana del ${fdate(iso(ini))} al ${fdate(iso(fin))}`, local: 0, importado: 0 })
    }
    for (const r of abiertas) {
      const f = r.fecha_confirmada || r.fecha_programada_ingreso
      if (!f) continue
      const s = f < hoy ? semanas[0] : semanas.find(x => x.desde && f >= x.desde && f <= x.hasta)
      if (s) s[r.origen === 'Importado' ? 'importado' : 'local']++
    }
    return { local: grupo(local), importado: grupo(importado), atrasadas: grupo(atrasadas), semana: grupo(semana), semanas }
  }, [rows, hoy])

  // --- 3. Proveedores ---
  const proveedores = useMemo(() => {
    const m = new Map()
    for (const e of evaluadas) {
      const p = e.r.proveedor || 'Sin proveedor'
      if (!m.has(p)) m.set(p, [])
      m.get(p).push(e)
    }
    const lista = [...m.entries()].map(([nombre, es]) => {
      const tarde = es.filter(e => e.atraso > 0)
      return {
        nombre,
        n: es.length,
        otif: pct(es.filter(e => e.otif).length, es.length),
        nTarde: tarde.length,
        atrasoProm: tarde.length ? Math.round(tarde.reduce((a, e) => a + e.atraso, 0) / tarde.length) : 0,
      }
    })
    const repro = new Map()
    for (const r of rows) {
      const veces = (r.hist || []).length
      if (!veces) continue
      const p = r.proveedor || 'Sin proveedor'
      repro.set(p, (repro.get(p) || 0) + veces)
    }
    return {
      porOtif: lista.filter(p => p.n >= 3).sort((a, b) => a.otif - b.otif || b.n - a.n).slice(0, 10),
      porAtraso: lista.filter(p => p.nTarde > 0).sort((a, b) => b.atrasoProm - a.atrasoProm).slice(0, 10),
      reprogramaciones: [...repro.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    }
  }, [evaluadas, rows])

  // --- 4. Seguimiento ---
  const seguimiento = useMemo(() => {
    const abiertas = rows.filter(r => r.abierto && r.estado_gestion !== 'Orden Anulada')
    const confirmadas = abiertas.filter(r => r.fecha_confirmada).length
    return {
      pctConfirmadas: pct(confirmadas, abiertas.length),
      sinConfirmar: abiertas.length - confirmadas,
      reprogramadasAbiertas: abiertas.filter(r => (r.hist || []).length > 0).length,
      fueraTolerancia: rows.filter(r => r.fueraTolerancia).length,
    }
  }, [rows])

  // --- 5. Importaciones ---
  const importaciones = useMemo(() => {
    const abiertas = oi.filter(r => r.abierto)
    const porEtapa = ETAPAS.map(e => ({ nombre: e.l, valor: abiertas.filter(r => r.etapa === e.n).length }))
    const conEta = abiertas.filter(r => r.seg?.eta)
    return {
      abiertas: abiertas.length,
      porEtapa,
      etaVencida: conEta.filter(r => r.seg.eta < hoy).length,
      proximas: conEta.filter(r => r.seg.eta >= hoy).sort((a, b) => a.seg.eta.localeCompare(b.seg.eta)).slice(0, 6),
    }
  }, [oi, hoy])

  const variacion = otif.actual?.otif != null && otif.anterior?.otif != null
    ? Math.round((otif.actual.otif - otif.anterior.otif) * 10) / 10 : null

  return (
    <div className="ind">
      <div className="ind-top">
        <div>
          <h1>Indicadores de abastecimiento</h1>
          <div className="pct" style={{ margin: 0 }}>
            OTIF: a tiempo = llegó el mismo día o antes · completo = llegó al menos el 95% · meta {META_OTIF}% · al {fdate(hoy)}
          </div>
        </div>
        <div className="ind-base">
          <span>Medir contra:</span>
          <button className={`btn ${base === 'original' ? 'act' : ''}`} onClick={() => setBase('original')}>Fecha original</button>
          <button className={`btn ${base === 'vigente' ? 'act' : ''}`} onClick={() => setBase('vigente')}>Fecha vigente</button>
        </div>
      </div>
      {err && <div className="empty">No se pudo cargar todo: {err}</div>}

      <Seccion titulo="Cumplimiento de proveedores (OTIF)" etiqueta={`Meta ${META_OTIF}%`}>
        <div className="ind-kpis">
          <Tarjeta destacada titulo={`OTIF ${otif.actual ? mesLargo(otif.actual.mes) : 'del mes'}`}
            valor={otif.actual?.otif != null ? `${otif.actual.otif}%` : '-'}
            pie={variacion != null ? `${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion)} pts vs mes anterior · meta ${META_OTIF}%` : `meta ${META_OTIF}%`} />
          <Tarjeta titulo={`OTIF acumulado ${hoy.slice(0, 4)}`} valor={otif.anio.otif != null ? `${otif.anio.otif}%` : '-'} color={colorEstado(otif.anio.otif)} pie={`${fmt(otif.anio.n)} entregas medidas`} />
          <Tarjeta titulo="A tiempo (On Time)" valor={otif.anio.aTiempo != null ? `${otif.anio.aTiempo}%` : '-'} color={colorEstado(otif.anio.aTiempo)} pie="llegó el mismo día o antes" />
          <Tarjeta titulo="Completas (In Full)" valor={otif.anio.completo != null ? `${otif.anio.completo}%` : '-'} color={colorEstado(otif.anio.completo)} pie="llegó al menos el 95%" />
          <Tarjeta titulo="Atraso promedio" valor={`${otif.atrasoProm} días`} color="var(--red)" pie={`en ${fmt(otif.nTarde)} entregas que llegaron tarde`} />
        </div>
        <div className="ind-card">
          <h3>OTIF por mes</h3>
          <GraficoOtifMes datos={otif.serie} />
        </div>
      </Seccion>

      <Seccion titulo="Pendientes por ingresar">
        <div className="ind-kpis">
          <Tarjeta destacada titulo="OC pendientes (local)" valor={fmt(pendientes.local.n)} pie={`S/ ${fmt(pendientes.local.soles)} · US$ ${fmt(pendientes.local.dolares)}`} />
          <Tarjeta titulo="OI pendientes (importación)" valor={fmt(pendientes.importado.n)} pie={`S/ ${fmt(pendientes.importado.soles)} · US$ ${fmt(pendientes.importado.dolares)}`} />
          <Tarjeta titulo="Atrasadas hoy" valor={fmt(pendientes.atrasadas.n)} color="var(--red)" pie={`S/ ${fmt(pendientes.atrasadas.soles)} · US$ ${fmt(pendientes.atrasadas.dolares)}`} />
          <Tarjeta titulo="Llegan en 7 días" valor={fmt(pendientes.semana.n)} color="var(--amb)" pie="según fecha confirmada o programada" />
        </div>
        <div className="ind-card">
          <h3>Entregas pendientes por semana</h3>
          <GraficoSemanas datos={pendientes.semanas} />
        </div>
      </Seccion>

      <Seccion titulo="Ranking de proveedores">
        <div className="ind-grid2">
          <div className="ind-card">
            <h3>OTIF por proveedor <span className="dim">(los 10 más bajos, mínimo 3 entregas)</span></h3>
            <BarrasH maximo={100} colorDe={colorEstado} formato={v => `${v}%`}
              filas={proveedores.porOtif.map(p => ({ nombre: p.nombre, valor: p.otif, sub: `${p.n} entregas`, detalle: `${p.nombre}: OTIF ${p.otif}% en ${p.n} entregas` }))} />
          </div>
          <div className="ind-card">
            <h3>Mayor atraso promedio <span className="dim">(días, entregas que llegaron tarde)</span></h3>
            <BarrasH formato={v => `${v} d`}
              filas={proveedores.porAtraso.map(p => ({ nombre: p.nombre, valor: p.atrasoProm, sub: `${p.nTarde} tarde`, detalle: `${p.nombre}: ${p.nTarde} entregas tarde, ${p.atrasoProm} días en promedio` }))} />
          </div>
        </div>
        <div className="ind-card">
          <h3>Proveedores que más reprograman <span className="dim">(veces que se movió la fecha)</span></h3>
          <BarrasH formato={v => fmt(v)} filas={proveedores.reprogramaciones} />
        </div>
      </Seccion>

      <Seccion titulo="Seguimiento">
        <div className="ind-kpis">
          <Tarjeta titulo="Entregas abiertas confirmadas" valor={seguimiento.pctConfirmadas != null ? `${seguimiento.pctConfirmadas}%` : '-'} color={colorEstado(seguimiento.pctConfirmadas)} pie={`${fmt(seguimiento.sinConfirmar)} sin confirmar`} />
          <Tarjeta titulo="Abiertas reprogramadas" valor={fmt(seguimiento.reprogramadasAbiertas)} color="var(--amb)" pie="con la fecha movida al menos una vez" />
          <Tarjeta titulo="Cerradas fuera de tolerancia" valor={fmt(seguimiento.fueraTolerancia)} color="var(--red)" pie="llegó mucho más o menos de lo pedido" />
        </div>
      </Seccion>

      <Seccion titulo="Importaciones">
        <div className="ind-grid2">
          <div className="ind-card">
            <h3>OI abiertas por etapa <span className="dim">({fmt(importaciones.abiertas)} en total)</span></h3>
            <BarrasH formato={v => fmt(v)} filas={importaciones.porEtapa} />
          </div>
          <div className="ind-card">
            <h3>Próximas llegadas (ETA) {importaciones.etaVencida > 0 && <span className="tag t-red" style={{ marginLeft: 6 }}>{importaciones.etaVencida} con ETA vencida</span>}</h3>
            {importaciones.proximas.length === 0 ? <div className="ind-vacio">No hay OI con ETA próxima.</div> : (
              <div style={{ overflowX: 'auto' }}><table className="expl-mini">
                <thead><tr><th>ETA</th><th>OI</th><th>Material</th><th>Proveedor</th></tr></thead>
                <tbody>
                  {importaciones.proximas.map(r => (
                    <tr key={r.id_entrega} style={{ cursor: 'default' }}>
                      <td className="mono">{fdate(r.seg.eta)}</td>
                      <td className="mono">{r.oc}</td>
                      <td><div className="dsc">{r.descripcion || ''}</div></td>
                      <td><div className="prov">{r.proveedor || ''}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      </Seccion>
    </div>
  )
}
