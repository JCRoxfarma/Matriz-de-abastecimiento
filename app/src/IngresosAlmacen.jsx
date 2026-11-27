import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate } from './lib/derive'
import Icono from './Icono'

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

const RANGOS = [
  ['7', 'Próximos 7 días'],
  ['15', 'Próximos 15 días'],
  ['30', 'Próximos 30 días'],
  ['todo', 'Todas las fechas'],
]

export default function IngresosAlmacen({ perfil }) {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [cat, setCat] = useState('')
  const [tipo, setTipo] = useState('')
  const [rango, setRango] = useState('7')
  const [q, setQ] = useState('')

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
    const limite = rango === 'todo' ? null : sumarDias(hoy, Number(rango))
    const qq = q.trim().toLowerCase()
    const vis = filas.filter(r => {
      if (cat && r.categoria !== cat) return false
      if (tipo && r.tipo !== tipo) return false
      if (limite && r.fecha > limite) return false
      if (qq && !`${r.oc} ${r.sku} ${r.descripcion || ''} ${r.proveedor || ''}`.toLowerCase().includes(qq)) return false
      return true
    })
    const vencidas = vis.filter(r => r.fecha < hoy)
    const porDia = new Map()
    for (const r of vis.filter(r => r.fecha >= hoy)) {
      if (!porDia.has(r.fecha)) porDia.set(r.fecha, [])
      porDia.get(r.fecha).push(r)
    }
    return { vencidas, dias: [...porDia.entries()], total: vis.length }
  }, [filas, cat, tipo, rango, q, hoy])

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
                <span className={`tag ${r.categoria === 'Producto terminado' ? 't-grn' : 't-blu'}`}>
                  {r.categoria === 'Producto terminado' ? 'PT' : r.tipo}
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
          <select value={cat} onChange={e => setCat(e.target.value)}>
            <option value="">Material de empaque y PT</option>
            <option value="Material de empaque">Solo material de empaque</option>
            <option value="Producto terminado">Solo producto terminado</option>
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">OC y OI</option>
            <option value="OC">Solo OC (local)</option>
            <option value="OI">Solo OI (importación)</option>
          </select>
          <select value={rango} onChange={e => setRango(e.target.value)}>
            {RANGOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {error && <div className="empty">No se pudo cargar la información: {error}</div>}
        {cargando && !filas.length ? <div className="empty">Cargando...</div> : !error && (
          grupos.total === 0 ? <div className="empty">No hay ingresos por llegar con estos filtros.</div> : <>
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
