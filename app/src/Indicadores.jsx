import { useEffect, useMemo, useState } from 'react'
import { fmt, fdate } from './lib/derive'
import { fetchAll, esRechazado } from './lib/importer'
import Icono from './Icono'
import { exportarCumplimiento } from './lib/exportarCumplimiento'
import { cargarOI, ETAPAS } from './lib/seguimientoOI'
import { obtenerLeadTimes, leadTimeEsperado, leadTimeReal } from './lib/leadTime'

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
  // Desmedro (rotura en transito, no es culpa del proveedor): lo danado
  // cuenta como entregado para In Full.
  const ingresado = (r.cant_ingresada || 0) + (r.conDesmedro ? r.cant_rechazada || 0 : 0)
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
  return { r, compromiso, llegada, completo, aTiempo, otif: completo && aTiempo, atraso, pendiente: !llegada }
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

// Anillo de avance: el arco lleno es el % ingresado; el numero va al centro.
function Anillo({ valor, color, tam = 92 }) {
  const grosor = 9
  const r = (tam - grosor) / 2
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, valor || 0))
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="ind-anillo" role="img" aria-label={`${v}% ingresado`}>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--line2)" strokeWidth={grosor} />
      {v > 0 && (
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      )}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="ind-anillo-txt">{valor == null ? '-' : `${Math.round(v)}%`}</text>
    </svg>
  )
}

// Tarjeta OC / OI: anillo con el avance del mes y lo que falta ingresar.
function TarjetaAvance({ titulo, color, avance, pendiente, mesTexto }) {
  return (
    <div className="ind-avance">
      <Anillo valor={avance.pct} color={color} />
      <div className="ind-avance-txt">
        <div className="lb">{titulo}</div>
        <div className="vl">{fmt(pendiente.n)} <span>entregas pendientes</span></div>
        <div className="ft">S/ {fmt(pendiente.soles)} · US$ {fmt(pendiente.dolares)}</div>
        <div className="ft2">Avance de {mesTexto}: <b>{fmt(avance.ingresadas)}</b> de {fmt(avance.total)} entregas ya ingresaron</div>
      </div>
    </div>
  )
}

function Seccion({ titulo, etiqueta, accion, children }) {
  return (
    <section className="ind-sec">
      <div className="ind-sec-h">
        <h2>{titulo}</h2>
        {etiqueta && <span className="ind-chip">{etiqueta}</span>}
        {accion && <div className="ind-sec-acc">{accion}</div>}
      </div>
      {children}
    </section>
  )
}

// Barras verticales por mes con linea de meta. Una sola serie: el color de
// cada barra dice si cumple la meta (con el valor siempre escrito encima).
// % de ingresos del mes que llegaron antes del lead time. Una sola serie
// (azul); el numero va escrito sobre cada barra y el detalle al pasar el
// cursor.
function GraficoAntesMes({ datos }) {
  const [hover, setHover] = useState(null)
  const alto = 160
  if (!datos.length) return <div className="ind-vacio">Todavía no hay ingresos con lead time configurado para medir.</div>
  const y = v => alto - (v / 100) * alto
  return (
    <div className="ind-vbars" onMouseLeave={() => setHover(null)}>
      <div className="ind-vbars-plot" style={{ height: alto }}>
        {[0, 50, 100].map(g => <div key={g} className="ind-grid" style={{ top: y(g) }}><span>{g}%</span></div>)}
        <div className="ind-vbars-cols">
          {datos.map(d => (
            <div key={d.mes} className="ind-vcol" onMouseEnter={() => setHover(d)}>
              <div className="ind-vval" style={{ bottom: (d.pct / 100) * alto + 4 }}>{d.pct}%</div>
              <div className="ind-vbar" style={{ height: Math.max(2, (d.pct / 100) * alto), background: C_BARRA }} />
            </div>
          ))}
        </div>
      </div>
      <div className="ind-vbars-x">{datos.map(d => <div key={d.mes}>{mesNombre(d.mes)}<div className="ind-vbars-n">{d.antes}/{d.n}</div></div>)}</div>
      {hover && (
        <div className="ind-tip">
          <b>{mesLargo(hover.mes)}</b> · {hover.pct}% antes del lead time<br />
          {hover.antes} de {hover.n} ingresos{hover.diasAntes != null ? ` · en promedio ${hover.diasAntes} días antes` : ''}
        </div>
      )}
    </div>
  )
}

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

// Mapa de llegadas: un proveedor por fila, una semana por columna; cada
// casilla dice cuantas entregas llegan y se oscurece segun la cantidad
// (un solo tono; rojo para las atrasadas). El numero siempre va escrito.
function MapaLlegadas({ columnas, filas, maxCelda, maxAtr, grupo }) {
  // Detalle de una casilla: al pasar el cursor se muestran las entregas
  // (OC/OI, SKU, material, saldo y fecha) para ubicarlas facil; con clic
  // queda fijo hasta cerrarlo.
  const [detalle, setDetalle] = useState(null)
  useEffect(() => {
    if (!detalle?.fijo) return
    const cerrar = e => { if (e.key === 'Escape') setDetalle(null) }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [detalle?.fijo])
  if (!filas.length) return <div className="ind-vacio">No hay entregas pendientes.</div>
  const abrir = (e, f, c, lista, fijo) => {
    const x = Math.min(e.clientX + 14, window.innerWidth - 520)
    const y = Math.min(e.clientY + 14, window.innerHeight - 60)
    setDetalle({ f, c, lista, x, y, fijo })
  }
  const fondo = (n, atrasado) => {
    if (!n) return 'transparent'
    const t = 0.15 + 0.85 * (n / (atrasado ? maxAtr : maxCelda))
    return atrasado ? `rgba(200, 68, 60, ${t})` : `rgba(42, 111, 194, ${t})`
  }
  return (
    <div className="ind-mapa-wrap">
      <table className="ind-mapa">
        <thead>
          <tr>
            <th className="ind-mapa-prov">Proveedor</th>
            {columnas.map(c => <th key={c.clave} className={c.atrasado ? 'rojo' : ''} title={c.titulo}>{c.etiqueta}</th>)}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.nombre}>
              <td className="ind-mapa-prov">
                <div className="dsc" title={f.nombre}>{f.nombre}</div>
                {f.importado && <span className="ind-mapa-imp">Importado</span>}
              </td>
              {columnas.map(c => {
                const lista = f.celdas[c.clave] || []
                const n = lista.length
                const fuerte = n && n / (c.atrasado ? maxAtr : maxCelda) > 0.55
                const g = n ? grupo(lista) : null
                return (
                  <td key={c.clave}>
                    {n > 0 && (
                      <div className="ind-celda" style={{ background: fondo(n, c.atrasado), color: fuerte ? '#fff' : 'var(--ink)' }}
                        onMouseEnter={e => { if (!detalle?.fijo) abrir(e, { ...f, g }, c, lista, false) }}
                        onMouseLeave={() => { if (!detalle?.fijo) setDetalle(null) }}
                        onClick={e => abrir(e, { ...f, g }, c, lista, true)}>
                        {n}
                      </div>
                    )}
                  </td>
                )
              })}
              <td className="ind-mapa-tot">{f.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {detalle && (
        <div className={`ind-det ${detalle.fijo ? 'fijo' : ''}`} style={{ left: detalle.x, top: detalle.y }}>
          <div className="ind-det-h">
            <div>
              <b>{detalle.f.nombre}</b>
              <div className={detalle.c.atrasado ? 'rojo' : ''}>{detalle.c.titulo} · {detalle.lista.length} entrega{detalle.lista.length > 1 ? 's' : ''} · S/ {fmt(detalle.f.g.soles)} · US$ {fmt(detalle.f.g.dolares)}</div>
            </div>
            {detalle.fijo && <button className="ind-det-x" onClick={() => setDetalle(null)} title="Cerrar">×</button>}
          </div>
          <table>
            <thead><tr><th>{detalle.f.importado ? 'OI' : 'OC'}</th><th>SKU</th><th>Material</th><th className="num">Pendiente</th><th>Fecha</th></tr></thead>
            <tbody>
              {[...detalle.lista].sort((a, b) => (a.fecha_confirmada || a.fecha_programada_ingreso || '').localeCompare(b.fecha_confirmada || b.fecha_programada_ingreso || '')).map(r => (
                <tr key={r.id_entrega}>
                  <td className="mono">{r.oc}</td>
                  <td className="mono">{r.sku}</td>
                  <td><div className="dsc">{r.descripcion || ''}</div></td>
                  <td className="num">{fmt(r.saldo_pendiente)}</td>
                  <td className={`mono ${detalle.c.atrasado ? 'rojo' : ''}`}>{fdate(r.fecha_confirmada || r.fecha_programada_ingreso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!detalle.fijo && <div className="ind-det-pie">Haz clic en la casilla para dejar fijo este detalle</div>}
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
  // Exportar cumplimiento (OTIF) de un mes a Excel, para enviar al proveedor.
  const [expAbierto, setExpAbierto] = useState(false)
  const [expMes, setExpMes] = useState('')
  const [expProv, setExpProv] = useState('')
  const [expMsg, setExpMsg] = useState('')
  const [mesPend, setMesPend] = useState('')
  const [ultimaLlegada, setUltimaLlegada] = useState(new Map())
  const [oi, setOi] = useState([])
  const [leadTimes, setLeadTimes] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    fetchAll('ingresos_sistema', 'oc,codigo,fecha_ingreso,estado_ingreso_sistema')
      .then(data => {
        const m = new Map()
        for (const e of data) {
          // Un lote rechazado no cuenta como llegada (OTIF: vale la reposicion).
          if (esRechazado(e)) continue
          const k = `${e.oc}|${e.codigo}`
          if (e.fecha_ingreso && (!m.has(k) || e.fecha_ingreso > m.get(k))) m.set(k, e.fecha_ingreso)
        }
        setUltimaLlegada(m)
      })
      .catch(e => setErr(e.message))
    cargarOI().then(setOi).catch(e => setErr(e.message))
    obtenerLeadTimes().then(setLeadTimes).catch(() => setLeadTimes(null))
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
  // Meses con entregas pendientes (segun fecha efectiva) para el selector.
  const fechaEf = r => r.fecha_confirmada || r.fecha_programada_ingreso
  const mesesPend = useMemo(() => [...new Set(rows
    .filter(r => r.abierto && r.estado_gestion !== 'Orden Anulada' && fechaEf(r))
    .map(r => fechaEf(r).slice(0, 7)))].sort(), [rows])

  const pendientes = useMemo(() => {
    // Con un mes elegido, solo las entregas cuya fecha efectiva cae en ese mes.
    const abiertas = rows.filter(r => r.abierto && r.estado_gestion !== 'Orden Anulada'
      && (!mesPend || fechaEf(r)?.slice(0, 7) === mesPend))
    const grupo = lista => ({
      n: lista.length,
      soles: lista.filter(esSoles).reduce((a, r) => a + valorPendiente(r), 0),
      dolares: lista.filter(r => !esSoles(r)).reduce((a, r) => a + valorPendiente(r), 0),
    })
    const local = abiertas.filter(r => r.origen !== 'Importado')
    const importado = abiertas.filter(r => r.origen === 'Importado')

    // Columnas por plazo segun la fecha efectiva (confirmada o
    // programada): atrasado, 8 semanas de lunes a domingo (la primera es
    // la semana en curso) y "despues".
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const lunes = new Date(hoy + 'T00:00:00')
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
    // Semanas que se muestran: sin mes elegido, 8 semanas desde la actual;
    // con mes, las semanas de ese mes que aun no pasaron. La clave de cada
    // semana es su distancia a la semana actual (s0 = esta semana).
    let desdeSem = new Date(lunes)
    let hastaFecha = null
    if (mesPend) {
      const [y, m] = mesPend.split('-').map(Number)
      const ini = new Date(y, m - 1, 1)
      ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7))
      if (ini > desdeSem) desdeSem = ini
      hastaFecha = iso(new Date(y, m, 0))
    }
    const columnas = [{ clave: 'atr', etiqueta: 'Atrasado', titulo: 'Atrasadas (la fecha ya pasó)', atrasado: true }]
    for (let i = 0; i < (mesPend ? 6 : 8); i++) {
      const ini = new Date(desdeSem); ini.setDate(desdeSem.getDate() + i * 7)
      if (hastaFecha && iso(ini) > hastaFecha) break
      const fin = new Date(ini); fin.setDate(ini.getDate() + 6)
      const rel = Math.round((ini - lunes) / (7 * 864e5))
      columnas.push({ clave: `s${rel}`, desde: iso(ini), hasta: iso(fin), etiqueta: rel === 0 ? 'Esta sem.' : fdate(iso(ini)).slice(0, 5), titulo: `Semana del ${fdate(iso(ini))} al ${fdate(iso(fin))}` })
    }
    const ultimaHasta = columnas[columnas.length - 1].hasta || hoy
    if (!mesPend) columnas.push({ clave: 'desp', etiqueta: 'Después', titulo: `Después del ${fdate(ultimaHasta)}` })
    const columnaDe = f => !f ? null : f < hoy ? 'atr' : f > ultimaHasta ? 'desp' : columnas.find(c => c.desde && f >= c.desde && f <= c.hasta)?.clave

    // Tarjetas por plazo: atrasadas, esta semana, proxima, 2 a 4, despues.
    const plazoDe = clave => clave === 'atr' ? 'atr' : clave === 's0' ? 'esta' : clave === 's1' ? 'prox' : ['s2', 's3', 's4'].includes(clave) ? 'mes' : 'despues'
    const plazos = [
      { id: 'atr', titulo: 'Atrasadas', color: 'var(--red)' },
      { id: 'esta', titulo: 'Esta semana', color: 'var(--amb)' },
      { id: 'prox', titulo: 'Próxima semana' },
      { id: 'mes', titulo: 'En 2 a 4 semanas' },
      { id: 'despues', titulo: 'Más adelante' },
    ].map(p => ({ ...p, filas: [] }))

    const porProveedor = new Map()
    for (const r of abiertas) {
      const clave = columnaDe(r.fecha_confirmada || r.fecha_programada_ingreso)
      if (!clave) continue
      plazos.find(p => p.id === plazoDe(clave)).filas.push(r)
      const nombre = r.proveedor || 'Sin proveedor'
      if (!porProveedor.has(nombre)) porProveedor.set(nombre, { nombre, importado: r.origen === 'Importado', total: 0, celdas: {} })
      const fila = porProveedor.get(nombre)
      fila.total++
      fila.celdas[clave] = fila.celdas[clave] || []
      fila.celdas[clave].push(r)
    }
    const tarjetasPlazo = plazos.map(p => {
      const cuenta = new Map()
      for (const r of p.filas) cuenta.set(r.proveedor || 'Sin proveedor', (cuenta.get(r.proveedor || 'Sin proveedor') || 0) + 1)
      return { ...p, ...grupo(p.filas), top: [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) }
    })
    const mapa = [...porProveedor.values()].sort((a, b) =>
      (b.celdas.atr?.length || 0) - (a.celdas.atr?.length || 0) || b.total - a.total)
    const maxCelda = Math.max(1, ...mapa.flatMap(f => Object.entries(f.celdas).filter(([k]) => k !== 'atr').map(([, v]) => v.length)))
    const maxAtr = Math.max(1, ...mapa.map(f => f.celdas.atr?.length || 0))
    // Avance del mes (el elegido o el actual): de las entregas con fecha
    // efectiva en ese mes, cuantas ya ingresaron (dejaron de estar abiertas).
    const mesAvance = mesPend || mesActual
    const delMes = rows.filter(r => r.estado_gestion !== 'Orden Anulada' && fechaEf(r)?.slice(0, 7) === mesAvance)
    const avanceDe = lista => {
      const ingresadas = lista.filter(r => !r.abierto).length
      return { total: lista.length, ingresadas, pct: lista.length ? Math.round((ingresadas / lista.length) * 1000) / 10 : null }
    }
    const avance = {
      mes: mesAvance,
      local: avanceDe(delMes.filter(r => r.origen !== 'Importado')),
      importado: avanceDe(delMes.filter(r => r.origen === 'Importado')),
    }
    // Con un mes elegido no se muestra lo que queda vacio.
    const tarjetasVisibles = mesPend ? tarjetasPlazo.filter(p => p.n > 0) : tarjetasPlazo
    const hayAtrasadas = mapa.some(f => f.celdas.atr?.length)
    const columnasVisibles = mesPend && !hayAtrasadas ? columnas.filter(c => c.clave !== 'atr') : columnas
    return { local: grupo(local), importado: grupo(importado), tarjetasPlazo: tarjetasVisibles, columnas: columnasVisibles, mapa, maxCelda, maxAtr, grupo, avance }
  }, [rows, hoy, mesPend, mesActual])

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
    const desm = oi.filter(r => r.desmedro && (r.cant_rechazada || 0) > 0)
    const valorDe = mon => desm.filter(r => (mon === 'USD') === /us|dol/i.test(r.moneda || ''))
      .reduce((a, r) => a + (r.precio_unitario || 0) * (r.cant_rechazada || 0), 0)
    return {
      desmedro: { n: desm.length, und: desm.reduce((a, r) => a + (r.cant_rechazada || 0), 0), usd: valorDe('USD'), soles: valorDe('PEN') },
      abiertas: abiertas.length,
      porEtapa,
      etaVencida: conEta.filter(r => r.seg.eta < hoy).length,
      proximas: conEta.filter(r => r.seg.eta >= hoy).sort((a, b) => a.seg.eta.localeCompare(b.seg.eta)).slice(0, 6),
    }
  }, [oi, hoy])

  // --- 6. Lead time real vs esperado ---
  // Entregas ya completas con fecha de emision. Las que figuran ingresadas
  // antes de la emision (lead time negativo, seguramente OC de
  // regularizacion) no entran al promedio: se cuentan aparte.
  const leadTime = useMemo(() => {
    const medidas = []
    let negativas = 0
    for (const r of rows) {
      if (r.estado_gestion === 'Orden Anulada') continue
      const real = leadTimeReal(r)
      if (!real?.llego) continue
      if (real.dias < 0) { negativas++; continue }
      medidas.push({ r, real: real.dias, esperado: leadTimeEsperado(r, leadTimes)?.dias ?? null })
    }
    const prom = l => l.length ? Math.round(l.reduce((a, x) => a + x, 0) / l.length) : null
    const resumen = lista => {
      const conEsp = lista.filter(m => m.esperado != null)
      return {
        n: lista.length,
        real: prom(lista.map(m => m.real)),
        esperado: prom(conEsp.map(m => m.esperado)),
        nConEsp: conEsp.length,
        pctAntes: pct(conEsp.filter(m => m.real < m.esperado).length, conEsp.length),
        difProm: conEsp.length ? Math.round(conEsp.reduce((a, m) => a + (m.real - m.esperado), 0) / conEsp.length) : null,
      }
    }
    const porProv = new Map()
    for (const m of medidas) {
      const p = m.r.proveedor || 'Sin proveedor'
      if (!porProv.has(p)) porProv.set(p, [])
      porProv.get(p).push(m)
    }
    const proveedores = [...porProv.entries()].map(([nombre, l]) => ({ nombre, importado: l[0].r.origen === 'Importado', ...resumen(l) }))
      .filter(p => p.n >= 3)
      .sort((a, b) => (a.difProm ?? 999) - (b.difProm ?? 999))
    // Por mes de ingreso (fecha en que la entrega quedo completa), solo las
    // que tienen lead time configurado: cuantas llegaron antes.
    const porMes = new Map()
    for (const m of medidas) {
      if (m.esperado == null) continue
      const k = m.r.fecha_real_ingreso.slice(0, 7)
      if (!porMes.has(k)) porMes.set(k, [])
      porMes.get(k).push(m)
    }
    const serieMes = [...porMes.keys()].sort().slice(-12).map(mes => {
      const l = porMes.get(mes)
      const antes = l.filter(m => m.real < m.esperado)
      return {
        mes, n: l.length, antes: antes.length, pct: pct(antes.length, l.length),
        diasAntes: antes.length ? Math.round(antes.reduce((a, m) => a + (m.esperado - m.real), 0) / antes.length) : null,
      }
    })
    return {
      serieMes,
      local: resumen(medidas.filter(m => m.r.origen !== 'Importado')),
      importado: resumen(medidas.filter(m => m.r.origen === 'Importado')),
      proveedores,
      negativas,
    }
  }, [rows, leadTimes])

  const variacion = otif.actual?.otif != null && otif.anterior?.otif != null
    ? Math.round((otif.actual.otif - otif.anterior.otif) * 10) / 10 : null


  // Rechazos de calidad: entregas donde Calidad rechazo un lote (lo
  // calcula el importador desde el estado "Rechazado" de los ingresos).
  const rechazos = useMemo(() => {
    const con = rows.filter(r => (r.cant_rechazada || 0) > 0 && !r.desmedro && r.estado_gestion !== 'Orden Anulada')
    const porProv = new Map()
    for (const r of con) {
      const k = r.proveedor || 'Sin proveedor'
      const p = porProv.get(k) || { nombre: k, veces: 0, und: 0 }
      p.veces++; p.und += r.cant_rechazada || 0
      porProv.set(k, p)
    }
    return {
      total: con.length,
      pendientes: con.filter(r => r.rechazoPend).length,
      unidades: con.reduce((a, r) => a + (r.cant_rechazada || 0), 0),
      ncPendientes: con.filter(r => !r.nc_enviada).length,
      porProv: [...porProv.values()].sort((a, b) => b.veces - a.veces || b.und - a.und).slice(0, 10)
        .map(p => ({ nombre: p.nombre, valor: p.veces, sub: `${fmt(p.und)} und`, detalle: `${p.nombre}: ${p.veces} ${p.veces === 1 ? 'entrega rechazada' : 'entregas rechazadas'}, ${fmt(p.und)} unidades` })),
    }
  }, [rows])
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

      <Seccion titulo="Cumplimiento de proveedores (OTIF)" etiqueta={`Meta ${META_OTIF}%`}
        accion={<button className="btn" onClick={() => setExpAbierto(v => !v)}><Icono nombre="excel" tam={16} /> Exportar cumplimiento</button>}>
        {expAbierto && (() => {
          const meses = [...new Set(evaluadas.map(e => e.compromiso.slice(0, 7)))].sort().reverse()
          const mes = expMes || meses.find(m => m < mesActual) || meses[0] || ''
          const provs = [...new Set(evaluadas.filter(e => e.compromiso.slice(0, 7) === mes).map(e => e.r.proveedor).filter(Boolean))].sort()
          const prov = provs.includes(expProv) ? expProv : ''
          const descargar = async () => {
            setExpMsg('Preparando...')
            try {
              await exportarCumplimiento({ evaluadas, mes, proveedor: prov, base, meta: META_OTIF })
              setExpMsg('Listo, revisa tus descargas.')
            } catch (e) { setExpMsg(e.message) }
          }
          return (
            <div className="ind-card ind-exp">
              <label>Mes
                <select value={mes} onChange={e => { setExpMes(e.target.value); setExpMsg('') }}>
                  {meses.map(m => <option key={m} value={m}>{mesLargo(m).replace(/^./, c => c.toUpperCase())}{m === mesActual ? ' (en curso)' : ''}</option>)}
                </select>
              </label>
              <label>Proveedor
                <select value={prov} onChange={e => { setExpProv(e.target.value); setExpMsg('') }}>
                  <option value="">Todos los proveedores</option>
                  {provs.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <button className="btn act" onClick={descargar} disabled={!mes}><Icono nombre="excel" tam={16} /> Descargar Excel</button>
              <span className="dim">{expMsg || `Medido contra la fecha ${base === 'original' ? 'original' : 'vigente'} (cámbialo arriba). Hoja Resumen + hoja Detalle por entrega.`}</span>
            </div>
          )
        })()}
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

      <Seccion titulo="Pendientes por ingresar" accion={
        <select value={mesPend} onChange={e => setMesPend(e.target.value)}>
          <option value="">Todos los meses</option>
          {mesesPend.map(m => <option key={m} value={m}>{mesLargo(m).replace(/^./, c => c.toUpperCase())}{m < mesActual ? ' (atrasadas)' : ''}</option>)}
        </select>
      }>
        <div className="ind-kpis">
          <TarjetaAvance titulo="OC (local)" color="#2a6fc2" avance={pendientes.avance.local} pendiente={pendientes.local} mesTexto={mesLargo(pendientes.avance.mes)} />
          <TarjetaAvance titulo="OI (importación)" color="#c27a1c" avance={pendientes.avance.importado} pendiente={pendientes.importado} mesTexto={mesLargo(pendientes.avance.mes)} />
        </div>
        <div className="ind-plazos">
          {pendientes.tarjetasPlazo.map(p => (
            <div key={p.id} className="ind-plazo">
              <div className="lb">{p.titulo}</div>
              <div className="vl" style={p.color ? { color: p.color } : undefined}>{fmt(p.n)}</div>
              <div className="ft">S/ {fmt(p.soles)} · US$ {fmt(p.dolares)}</div>
              {p.top.length > 0 && (
                <ul className="ind-plazo-top">
                  {p.top.map(([nombre, n]) => <li key={nombre}><span>{nombre}</span><b>{n}</b></li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="ind-card">
          <h3>Llegadas por proveedor <span className="dim">(entregas pendientes por semana, según fecha confirmada o programada)</span></h3>
          <MapaLlegadas columnas={pendientes.columnas} filas={pendientes.mapa} maxCelda={pendientes.maxCelda} maxAtr={pendientes.maxAtr} grupo={pendientes.grupo} />
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

      <Seccion titulo="Rechazos de calidad">
        <div className="ind-kpis">
          <Tarjeta titulo="Esperando reposición" valor={fmt(rechazos.pendientes)} color={rechazos.pendientes ? 'var(--red)' : 'var(--grn)'} pie="entregas rechazadas que el proveedor aún no repone" />
          <Tarjeta titulo="Entregas con rechazo" valor={fmt(rechazos.total)} color="var(--ink)" pie={`${fmt(rechazos.unidades)} unidades rechazadas`} />
          <Tarjeta titulo="Nota de crédito por enviar" valor={fmt(rechazos.ncPendientes)} color={rechazos.ncPendientes ? 'var(--amb)' : 'var(--grn)'} pie="sin marcar como enviada a contabilidad" />
        </div>
        {rechazos.porProv.length > 0 && (
          <div className="ind-card">
            <h3>Rechazos por proveedor <span className="dim">(entregas con rechazo de calidad)</span></h3>
            <BarrasH formato={v => fmt(v)} filas={rechazos.porProv} />
          </div>
        )}
      </Seccion>

      <Seccion titulo="Seguimiento">
        <div className="ind-kpis">
          <Tarjeta titulo="Entregas abiertas confirmadas" valor={seguimiento.pctConfirmadas != null ? `${seguimiento.pctConfirmadas}%` : '-'} color={colorEstado(seguimiento.pctConfirmadas)} pie={`${fmt(seguimiento.sinConfirmar)} sin confirmar`} />
          <Tarjeta titulo="Abiertas reprogramadas" valor={fmt(seguimiento.reprogramadasAbiertas)} color="var(--amb)" pie="con la fecha movida al menos una vez" />
          <Tarjeta titulo="Cerradas fuera de tolerancia" valor={fmt(seguimiento.fueraTolerancia)} color="var(--red)" pie="llegó mucho más o menos de lo pedido" />
        </div>
      </Seccion>

      <Seccion titulo="Importaciones">
        {importaciones.desmedro.n > 0 && (
          <div className="ind-kpis">
            <Tarjeta titulo="OI con desmedro en tránsito" valor={fmt(importaciones.desmedro.n)} color="var(--amb)" pie={`${fmt(importaciones.desmedro.und)} unidades dañadas`} />
            <Tarjeta titulo="Gasto por desmedro" valor={importaciones.desmedro.usd ? `US$ ${fmt(Math.round(importaciones.desmedro.usd))}` : `S/ ${fmt(Math.round(importaciones.desmedro.soles))}`}
              color="var(--amb)" pie={importaciones.desmedro.usd && importaciones.desmedro.soles ? `+ S/ ${fmt(Math.round(importaciones.desmedro.soles))}` : 'precio de la OI × unidades dañadas'} />
          </div>
        )}
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

      <Seccion titulo="Lead time real vs esperado">
        <div className="pct" style={{ margin: '-4px 0 10px', whiteSpace: 'normal' }}>
          Días desde la emisión de la OC/OI hasta que la entrega quedó completa, contra el lead time configurado en Explosión de materiales → Lead time.
          {leadTime.negativas > 0 && <> No se cuentan {leadTime.negativas} entregas que figuran ingresadas antes de la emisión (revisar fechas).</>}
        </div>
        <div className="ind-kpis">
          <Tarjeta destacada titulo="Lead time real · local" valor={leadTime.local.real != null ? `${leadTime.local.real} días` : '-'}
            pie={leadTime.local.esperado != null ? `esperado ${leadTime.local.esperado} días · ${fmt(leadTime.local.n)} entregas` : `${fmt(leadTime.local.n)} entregas · sin lead time configurado`} />
          <Tarjeta titulo="Lead time real · importado" valor={leadTime.importado.real != null ? `${leadTime.importado.real} días` : '-'}
            pie={leadTime.importado.esperado != null ? `esperado ${leadTime.importado.esperado} días · ${fmt(leadTime.importado.n)} entregas` : `${fmt(leadTime.importado.n)} entregas · sin lead time configurado`} />
          <Tarjeta titulo="Llegan antes del lead time" valor={leadTime.local.pctAntes != null ? `${leadTime.local.pctAntes}%` : '-'} color="var(--blu)"
            pie={`de las entregas locales con lead time configurado (${fmt(leadTime.local.nConEsp)})`} />
        </div>
        <div className="ind-card">
          <h3>Ingresos antes del lead time por mes <span className="dim">(% de las entregas completadas en el mes; debajo, cuántas de cuántas)</span></h3>
          <GraficoAntesMes datos={leadTime.serieMes} />
        </div>
        <div className="ind-card">
          <h3>Por proveedor <span className="dim">(mínimo 3 entregas completas; primero los que llegan más antes del lead time)</span></h3>
          {leadTime.proveedores.length === 0 ? <div className="ind-vacio">Sin datos.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="expl-mini ind-lt">
                <thead><tr><th>Proveedor</th><th className="num">Entregas</th><th className="num">Lead time real</th><th className="num">Esperado</th><th className="num">Diferencia</th><th className="num">Llegan antes</th></tr></thead>
                <tbody>
                  {leadTime.proveedores.map(p => (
                    <tr key={p.nombre} style={{ cursor: 'default' }}>
                      <td><div className="prov" style={{ maxWidth: 260 }}>{p.nombre}</div>{p.importado && <span className="ind-mapa-imp">Importado</span>}</td>
                      <td className="num">{fmt(p.n)}</td>
                      <td className="num"><b>{p.real} d</b></td>
                      <td className="num">{p.esperado != null ? `${p.esperado} d` : <span className="dim">sin configurar</span>}</td>
                      <td className="num" style={{ color: p.difProm == null ? undefined : p.difProm < 0 ? 'var(--blu)' : p.difProm > 0 ? 'var(--red)' : undefined, fontWeight: 600 }}>
                        {p.difProm == null ? <span className="dim">-</span> : p.difProm < 0 ? `${-p.difProm} d antes` : p.difProm > 0 ? `${p.difProm} d después` : 'justo'}
                      </td>
                      <td className="num">{p.pctAntes != null ? `${p.pctAntes}%` : <span className="dim">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Seccion>
    </div>
  )
}
