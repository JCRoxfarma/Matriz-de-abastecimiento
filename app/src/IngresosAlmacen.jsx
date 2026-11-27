import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate } from './lib/derive'
import Icono from './Icono'
import RangoFechas from './RangoFechas'

// Pantalla unica para la cuenta de Almacen (rol "almacen", nov-2026): solo
// los ingresos por llegar de OC, OI y producto terminado, con su fecha. Los
// datos vienen de la funcion ingresos_almacen() de Supabase, que ya filtra
// las columnas: almacen no puede leer las tablas completas (precios,
// gestion, stock, etc.). Ver supabase/almacen.sql.

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const diaTxt = iso => {
  const d = new Date(iso + 'T00:00:00')
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Tipo de ingreso que almacen puede marcar: OC local y OI de material de
// empaque, y producto terminado (sea OC u OI).
const TIPOS = [['OC', 'OC (local)'], ['OI', 'OI (importación)'], ['PT', 'Producto terminado']]
const tipoDe = r => r.categoria === 'Producto terminado' ? 'PT' : r.tipo

export default function IngresosAlmacen({ perfil }) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [tipos, setTipos] = useState(['OC', 'OI', 'PT'])
  const [desde, setDesde] = useState(() => hoyISO())
  const [hasta, setHasta] = useState(() => sumarDias(hoyISO(), 6))
  const [q, setQ] = useState('')
  const alternar = t => setTipos(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t])

  async function cargar() {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase.rpc('ingresos_almacen')
    if (error) setError(error.message)
    else setFilas(data || [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const hoy = hoyISO()
  const grupos = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const vis = filas.filter(r => {
      if (!tipos.includes(tipoDe(r))) return false
      if (qq && !`${r.oc} ${r.sku} ${r.descripcion || ''} ${r.proveedor || ''}`.toLowerCase().includes(qq)) return false
      return true
    })
    // Lo vencido (fecha anterior a hoy) sigue pendiente y puede llegar en
    // cualquier momento: se muestra arriba si el rango elegido empieza hoy
    // o antes (o si no hay rango).
    const verVencidas = !desde || desde <= hoy
    const vencidas = verVencidas ? vis.filter(r => r.fecha < hoy && (!desde || r.fecha >= desde || desde >= hoy)) : []
    const porDia = new Map()
    for (const r of vis) {
      if (r.fecha < hoy) continue
      if (desde && r.fecha < desde) continue
      if (hasta && r.fecha > hasta) continue
      if (!porDia.has(r.fecha)) porDia.set(r.fecha, [])
      porDia.get(r.fecha).push(r)
    }
    const dias = [...porDia.entries()]
    return { vencidas, dias, total: vencidas.length + dias.reduce((a, [, rs]) => a + rs.length, 0) }
  }, [filas, tipos, desde, hasta, q, hoy])

  const tabla = rs => (
    <div className="tw alm-tw">
      <table className="alm-tbl">
        <colgroup>
          <col style={{ width: 90 }} /><col style={{ width: 64 }} /><col style={{ width: 118 }} /><col style={{ width: 70 }} />
          <col style={{ width: 104 }} /><col /><col style={{ width: 230 }} /><col style={{ width: 150 }} /><col style={{ width: 140 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Fecha</th><th>Tipo</th><th>N° orden</th><th>Entrega</th><th>Código</th>
            <th>Material</th><th>Proveedor</th><th className="num">Cantidad por llegar</th><th>Fecha confirmada</th>
          </tr>
        </thead>
        <tbody>
          {rs.map((r, i) => (
            <tr key={`${r.oc}-${r.sku}-${r.n_entrega}-${i}`} className="alm-fila">
              <td className="nw">{fdate(r.fecha)}</td>
              <td className="nw">
                <span className={`tag ${tipoDe(r) === 'PT' ? 't-grn' : tipoDe(r) === 'OI' ? 't-amb' : 't-blu'}`}>
                  {tipoDe(r)}
                </span>
              </td>
              <td className="mono">{r.oc}</td>
              <td className="dim">{r.n_entrega || ''}</td>
              <td className="mono">{r.sku}</td>
              <td className="alm-mat">{r.descripcion}</td>
              <td className="prov" title={r.proveedor}>{r.proveedor}</td>
              <td className="num"><b>{fmt(r.por_llegar)}</b></td>
              <td>{r.confirmada
                ? <span className="tag t-grn">Confirmada</span>
                : <span className="tag t-amb">Por confirmar</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="wrap" data-espacio="ME">
      <header className="enc">
        <div className="enc-izq">
          <img className="marca-img" src="/logo-roxfarma.png" alt="Roxfarma" />
          <div>
            <h1>Próximos ingresos a almacén</h1>
            <div className="sub">Material de empaque y producto terminado: OC, OI y PT pendientes de ingresar</div>
          </div>
        </div>
        <div />
        <div className="enc-der">
          <div className="usr">
            {perfil.nombre || 'Almacén'} · solo ver
            <button className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
          </div>
          <div className="corte-box">
            <Icono nombre="calendario" tam={16} />
            Hoy: <b>{new Date().toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</b>
          </div>
        </div>
      </header>

      <section className="oc-card">
        <div className="oc-card-h">
          <h2><Icono nombre="camion" tam={22} /> Ingresos por llegar</h2>
          <button className="btn" onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando...' : 'Actualizar'}</button>
        </div>

        <div className="alm-filtros">
          <input type="text" placeholder="Buscar por orden, código, material o proveedor" value={q} onChange={e => setQ(e.target.value)} />
          <div className="alm-tipos" role="group" aria-label="Tipo de ingreso">
            {TIPOS.map(([t, lb]) => (
              <label key={t} className={`alm-tipo ${tipos.includes(t) ? 'on' : ''}`}>
                <input type="checkbox" checked={tipos.includes(t)} onChange={() => alternar(t)} />
                {lb}
              </label>
            ))}
          </div>
          <div className="alm-rango">
            <span>Fecha de ingreso</span>
            <RangoFechas desde={desde} hasta={hasta} onChange={(a, b) => { setDesde(a); setHasta(b) }} />
          </div>
        </div>

        {error && <div className="empty">No se pudo cargar la información: {error}</div>}
        {cargando && !filas.length ? <div className="empty">Cargando...</div> : !error && (
          tipos.length === 0 ? <div className="empty">Marca al menos un tipo: OC, OI o producto terminado.</div> : grupos.total === 0 ? <div className="empty">No hay ingresos por llegar con estos filtros.</div> : <>
            {grupos.vencidas.length > 0 && (
              <div className="alm-grupo">
                <h3 className="alm-dia alm-venc">
                  Con fecha vencida, pueden llegar en cualquier momento
                  <span className="alm-n">{grupos.vencidas.length}</span>
                </h3>
                {tabla(grupos.vencidas)}
              </div>
            )}
            {grupos.dias.map(([fecha, rs]) => (
              <div key={fecha} className="alm-grupo">
                <h3 className={`alm-dia ${fecha === hoy ? 'alm-hoy' : ''}`}>
                  {fecha === hoy ? 'Hoy, ' : ''}{diaTxt(fecha)}
                  <span className="alm-n">{rs.length} {rs.length === 1 ? 'entrega' : 'entregas'}</span>
                </h3>
                {tabla(rs)}
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  )
}
