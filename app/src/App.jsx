import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { useSesion } from './lib/auth'
import { fmt, fdate, nombreMes, enrich, withEntregas, SEM, EST_TAG, GES_TAG, CONF_TAG } from './lib/derive'
import { ultimasImportaciones, hace } from './lib/importaciones'
import { fetchAll } from './lib/importer'
import Panel from './Panel'
import EnviarRecordatorios from './EnviarRecordatorios'
import ComunicarAlmacen from './ComunicarAlmacen'
import ImportButton from './ImportButton'
import ImportIngresosButton from './ImportIngresosButton'
import ExportButton from './ExportButton'
import Explosion from './Explosion'
import SeguimientoOI from './SeguimientoOI'
import VerConfirmaciones from './VerConfirmaciones'
import Login from './Login'
import './App.css'

const CAT_EST = ['Pendiente', 'Completo']
const CAT_GES = ['En seguimiento', 'Reprogramado', 'Atrasado', 'Cerrado', 'Orden Anulada']

const COLS = [
  { k: 'sem2', l: '', w: '30px' },
  { k: 'oc', l: 'OC' },
  { k: 'origen', l: 'Origen', w: '90px' },
  { k: 'sku', l: 'SKU' },
  { k: 'entN', l: 'Entrega', w: '86px' },
  { k: 'descripcion', l: 'Material' },
  { k: 'proveedor', l: 'Proveedor' },
  { k: 'comprador', l: 'Comprador', w: '104px' },
  { k: 'cant_programada', l: 'Programado', n: 1 },
  { k: 'cant_ingresada', l: 'Ingresado', n: 1 },
  { k: 'saldo_pendiente', l: 'Saldo', n: 1 },
  { k: 'avance', l: 'Avance', w: '126px' },
  { k: 'fecha_programada_ingreso', l: 'F. programada' },
  { k: 'estado_confirmacion', l: 'Confirmacion' },
  { k: 'dd', l: 'Dias', n: 1 },
  { k: 'desv', l: 'Tolerancia', w: '92px' },
  { k: 'estado_ingreso', l: 'Ingreso' },
  { k: 'estado_gestion', l: 'Gestion' },
]

export default function App() {
  const { sesion, perfil, cargando } = useSesion()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mostrarComunicar, setMostrarComunicar] = useState(false)
  const [mostrarEnviar, setMostrarEnviar] = useState(false)
  const [mostrarConfirmaciones, setMostrarConfirmaciones] = useState(false)
  const [vista, setVista] = useState('oc')

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [fEst, setFEst] = useState('')
  const [fGes, setFGes] = useState('')
  const [fProv, setFProv] = useState('')
  const [fComp, setFComp] = useState('')
  const [fMes, setFMes] = useState('')
  const [fConf, setFConf] = useState('')
  const [quick, setQuick] = useState('')
  const [soloTol, setSoloTol] = useState(false)
  const [sortK, setSortK] = useState('sem2')
  const [sortD, setSortD] = useState(1)
  const [importaciones, setImportaciones] = useState({})

  async function cargar() {
    setLoading(true)
    setErr(null)
    try {
      const data = await fetchAll('programacion_oc', '*')
      setRows(withEntregas(data.map(enrich)))
    } catch (e) {
      setErr(e.message)
      setLoading(false)
      return
    }
    setLoading(false)
    ultimasImportaciones().then(setImportaciones).catch(() => {})
  }

  // Ojo: Supabase renueva el token de sesion cada vez que vuelves a la
  // pestaña, generando una sesion "nueva" aunque sigas siendo la misma
  // persona. Por eso se compara el id de usuario, no el objeto sesion
  // completo, para no recargar todo y que la pantalla no parpadee.
  useEffect(() => { if (sesion) cargar() }, [sesion?.user?.id])

  // Con ~500 filas, filtrar y redibujar la tabla en cada tecla se siente
  // trabado. Se espera un momento sin escribir antes de aplicar la
  // busqueda, para que el cuadro de texto responda al instante.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250)
    return () => clearTimeout(t)
  }, [qInput])

  function actualizarFila(id, patch) {
    setRows(prev => withEntregas(prev.map(r => r.id_entrega === id ? enrich({ ...r, ...patch }) : r).map(r => ({ ...r }))))
  }

  const rowsOC = useMemo(() => rows.filter(r => r.origen !== 'Importado'), [rows])

  function matchRow(r, skip) {
    const qq = q.trim().toLowerCase()
    if (qq) {
      const busca = `${r.oc} ${r.sku} ${r.descripcion || ''} ${r.proveedor || ''} ${r.comprador || ''}`.toLowerCase()
      if (!busca.includes(qq)) return false
    }
    if (skip !== 'est' && fEst && r.estado_ingreso !== fEst) return false
    if (skip !== 'ges' && fGes && r.estado_gestion !== fGes) return false
    if (skip !== 'prov' && fProv && r.proveedor !== fProv) return false
    if (skip !== 'comp' && fComp && r.comprador !== fComp) return false
    if (skip !== 'mes' && fMes && (r.fecha_confirmada || r.fecha_programada_ingreso)?.slice(0, 7) !== fMes) return false
    if (skip !== 'conf' && fConf && r.estado_confirmacion !== fConf) return false
    if (quick === 'abierto' && !r.abierto) return false
    if (quick === 'sinconf' && r.estado_confirmacion !== 'Pendiente') return false
    if (quick === 'cerrado' && r.abierto) return false
    if (quick === 'atrasado' && r.sem2 !== 'atrasado') return false
    if (quick === 'sinfecha' && r.sem2 !== 'sinfecha') return false
    if (quick === 'porllegar' && r.sem2 !== 'porllegar') return false
    if (quick === 'repro' && !r.hist.length) return false
    if (quick === 'desviado' && r.sem2 !== 'desviado') return false
    if (soloTol && !r.tol) return false
    return true
  }

  const proveedores = useMemo(() =>
    [...new Set(rowsOC.filter(r => matchRow(r, 'prov')).map(r => r.proveedor).filter(Boolean))].sort()
  , [rowsOC, q, fEst, fGes, fComp, fMes, fConf, quick, soloTol])

  const compradores = useMemo(() =>
    [...new Set(rowsOC.filter(r => matchRow(r, 'comp')).map(r => r.comprador).filter(Boolean))].sort()
  , [rowsOC, q, fEst, fGes, fProv, fMes, fConf, quick, soloTol])

  const meses = useMemo(() => {
    const claves = [...new Set(rowsOC.filter(r => matchRow(r, 'mes')).map(r => (r.fecha_confirmada || r.fecha_programada_ingreso)?.slice(0, 7)).filter(Boolean))].sort()
    return claves.map(k => ({ valor: k, etiqueta: nombreMes(k) }))
  }, [rowsOC, q, fEst, fGes, fProv, fComp, fConf, quick, soloTol])

  useEffect(() => { if (fProv && !proveedores.includes(fProv)) setFProv('') }, [proveedores, fProv])
  useEffect(() => { if (fComp && !compradores.includes(fComp)) setFComp('') }, [compradores, fComp])
  useEffect(() => { if (fMes && !meses.some(m => m.valor === fMes)) setFMes('') }, [meses, fMes])

  const kpis = useMemo(() => {
    const ab = rowsOC.filter(r => r.abierto)
    const at = ab.filter(r => r.sem2 === 'atrasado')
    const pl = ab.filter(r => r.sem2 === 'porllegar')
    const sf = ab.filter(r => r.sem2 === 'sinfecha')
    const vs = ab.filter(r => r.moneda === 'SOLES').reduce((a, r) => a + (r.valor_pendiente || 0), 0)
    const vd = ab.filter(r => r.moneda !== 'SOLES').reduce((a, r) => a + (r.valor_pendiente || 0), 0)
    const pc = ab.filter(r => r.estado_confirmacion === 'Pendiente').length
    const rp = rowsOC.filter(r => r.hist.length).length
    const tl = rowsOC.filter(r => r.dentroTolerancia).length
    const fd = rowsOC.filter(r => r.fueraTolerancia).length
    const cc = rowsOC.length - ab.length - tl - fd
    return [
      { id: '', lb: 'Lineas totales', vl: rowsOC.length, ft: 'entregas programadas', cl: '' },
      { id: 'abierto', lb: 'Abiertas', vl: ab.length, ft: 'con saldo pendiente', cl: '' },
      { id: 'atrasado', lb: 'Atrasadas', vl: at.length, ft: 'pasaron su fecha', cl: 'r' },
      { id: 'sinfecha', lb: 'Sin fecha programada', vl: sf.length, ft: 'necesitan fecha', cl: 'a' },
      { id: 'porllegar', lb: 'Llegan en 7 dias', vl: pl.length, ft: 'ventana inmediata', cl: 'a' },
      { id: 'repro', lb: 'Reprogramadas', vl: rp, ft: 'con fecha movida', cl: 'a' },
      { id: 'sinconf', lb: 'Sin confirmar', vl: pc, ft: 'pendientes de confirmacion', cl: pc > 0 ? 'a' : '' },
      { id: 'desviado', lb: 'Cerradas fuera de tolerancia', vl: fd, ft: 'revisar si afecta el abastecimiento', cl: fd > 0 ? 'r' : '' },
      { id: 'cerrado', lb: 'Cerradas', vl: cc + tl + fd, ft: `${fmt(cc)} exactas, ${fmt(tl)} en tolerancia, ${fmt(fd)} fuera de tolerancia`, cl: 'g' },
      { id: 'valor', lb: 'Valor pendiente', vl: `S/ ${fmt(vs)}`, ft: `mas US$ ${fmt(vd)}`, cl: '' },
    ]
  }, [rowsOC])

  const filtradas = useMemo(() => {
    let out = rowsOC.filter(r => matchRow(r))
    const ord = { atrasado: 0, desviado: 1, sinfecha: 2, porllegar: 3, enfecha: 4, tolerancia: 5, cerrado: 6 }
    out.sort((a, b) => {
      if (sortK === 'sem2') return (ord[a.sem2] - ord[b.sem2]) * sortD
      let x = a[sortK], y = b[sortK]
      if (x == null) x = ''
      if (y == null) y = ''
      return (x > y ? 1 : x < y ? -1 : 0) * sortD
    })
    return out
  }, [rowsOC, q, fEst, fGes, fProv, fComp, fMes, fConf, quick, soloTol, sortK, sortD])

  const selected = filtradas.find(r => r.id_entrega === selectedId) || rowsOC.find(r => r.id_entrega === selectedId)

  function toggleSort(k) {
    if (sortK === k) setSortD(d => -d)
    else { setSortK(k); setSortD(1) }
  }

  function limpiar() {
    setQInput(''); setQ(''); setFEst(''); setFGes(''); setFProv(''); setFComp(''); setFMes(''); setFConf('')
    setQuick(''); setSoloTol(false)
  }

  function celda(r, k) {
    switch (k) {
      case 'sem2': return <span className="dot" style={{ background: SEM[r.sem2].c }} />
      case 'oc': return <span className="mono">{r.oc}</span>
      case 'origen': return <span className={`tag ${r.origen === 'Importado' ? 't-blu' : 't-gry'}`}>{r.origen || ''}</span>
      case 'sku': return <span className="mono">{r.sku}</span>
      case 'entN': return r.entTot > 1 ? <span className="tag t-blu">{r.entN} de {r.entTot}</span> : <span className="dim">unica</span>
      case 'descripcion': return <div className="dsc">{r.descripcion || ''}</div>
      case 'proveedor': return <div className="prov">{r.proveedor || ''}</div>
      case 'comprador': return <span className={`nw ${!r.comprador ? 'dim' : ''}`}>{r.comprador || 'Sin asignar'}</span>
      case 'cant_programada': return fmt(r.cant_programada)
      case 'cant_ingresada': return fmt(r.cant_ingresada)
      case 'saldo_pendiente': return r.saldo_pendiente > 0 ? <b style={{ fontWeight: 500 }}>{fmt(r.saldo_pendiente)}</b> : <span className="dim">0</span>
      case 'avance': return <><span className="pbar"><i style={{ width: `${(r.avance * 100).toFixed(0)}%` }} /></span><span className="pct">{(r.avance * 100).toFixed(0)}%</span></>
      case 'fecha_programada_ingreso': {
        const fEfectiva = r.fecha_confirmada || r.fecha_programada_ingreso
        return <>
          <span className="mono">{fdate(fEfectiva)}</span>
          {r.hist.length > 0 && <span className="rep" title={`Reprogramada ${r.hist.length} ${r.hist.length === 1 ? 'vez' : 'veces'}. Fecha original ${fdate(r.fprog0)}`}>R{r.hist.length > 1 ? r.hist.length : ''}</span>}
        </>
      }
      case 'estado_confirmacion':
        if (!r.estado_confirmacion) return <span className="dim">-</span>
        return <span className={`tag ${CONF_TAG[r.estado_confirmacion] || 't-gry'}`}>{r.estado_confirmacion}</span>
      case 'dd':
        if (r.dentroTolerancia) return <span className="dim">tolerancia</span>
        if (r.fueraTolerancia) return <span style={{ color: 'var(--red)', fontWeight: 500 }}>fuera de tolerancia</span>
        if (!r.abierto) return <span className="dim">{r.dias_atraso ? '+' + fmt(r.dias_atraso) : '0'}</span>
        if (r.dd == null) return <span style={{ color: 'var(--amb)', fontWeight: 500 }}>sin fecha</span>
        if (r.dd < 0) return <span style={{ color: 'var(--red)', fontWeight: 500 }}>{-r.dd} atraso</span>
        return <span className="dim">faltan {r.dd}</span>
      case 'desv': {
        if (!r.tol) return <span className="dim">-</span>
        const pc = r.desv * 100
        return <span className={`tag ${r.dentroTolerancia ? 't-grn' : 't-red'}`} title={`Cerrada con ${pc > 0 ? 'exceso' : 'faltante'} de ${Math.abs(pc).toFixed(1)}% frente a lo programado${r.fueraTolerancia ? ' (supera el margen de 8%)' : ''}`}>{pc > 0 ? '+' : ''}{pc.toFixed(1)}%</span>
      }
      case 'estado_ingreso': return <span className={`tag ${EST_TAG[r.estado_ingreso] || 't-gry'}`}>{r.estado_ingreso}</span>
      case 'estado_gestion': return <>
        <span className={`tag ${GES_TAG[r.estado_gestion] || 't-gry'}`}>{r.estado_gestion || ''}</span>
        {r.dentroTolerancia && <span className="rep tolm" title="Cierre dentro de tolerancia">T</span>}
        {r.fueraTolerancia && <span className="rep tolm" style={{ background: 'var(--red)' }} title="Cierre fuera de tolerancia: revisar abastecimiento">!</span>}
      </>
      default: return null
    }
  }

  if (cargando) return <div className="empty">Cargando...</div>
  if (!sesion) return <Login />
  if (!perfil) return <div className="empty">Cargando tu perfil...</div>

  const esEditor = perfil.rol === 'editor'

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Seguimiento de materiales de empaque</h1>
          <div className="sub">Ordenes de compra programadas y su estado real de ingreso a almacen</div>
          <div className="ultimasImp">
            {importaciones.programacion && (
              <span>Ultimo Excel: <b>{importaciones.programacion.archivo}</b> ({hace(importaciones.programacion.creado_en)})</span>
            )}
            {importaciones.ingresos && (
              <span>Ultimos ingresos: <b>{importaciones.ingresos.archivo}</b> ({hace(importaciones.ingresos.creado_en)})</span>
            )}
          </div>
        </div>
        <div className="corte">
          <div className="usr">
            {perfil.nombre} · {esEditor ? 'puede editar' : 'solo ver'}
            <button className="btn" onClick={() => supabase.auth.signOut()}>Cerrar sesion</button>
          </div>
          Fecha de corte
          <b>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</b>
        </div>
      </header>

      <div className="bar" style={{ marginBottom: 14 }}>
        <button className={`btn ${vista === 'oc' ? 'act' : ''}`} onClick={() => setVista('oc')}>Seguimiento OC</button>
        <button className={`btn ${vista === 'oi' ? 'act' : ''}`} onClick={() => setVista('oi')}>Seguimiento OI</button>
        <button className={`btn ${vista === 'explosion' ? 'act' : ''}`} onClick={() => setVista('explosion')}>Explosión de materiales</button>
      </div>

      {vista === 'oi' ? <SeguimientoOI /> : vista === 'explosion' ? <Explosion esEditor={esEditor} /> : <>
      {err && <div className="empty">No se pudo cargar la base: {err}</div>}
      {loading ? <div className="empty">Cargando...</div> : (
        <>
          <div className="kpis">
            {kpis.map(k => (
              <div key={k.lb} className={`kpi ${k.cl} ${quick === k.id && k.id ? 'on' : ''}`}
                onClick={() => { if (!k.id || k.id === 'valor') return; setQuick(q => q === k.id ? '' : k.id) }}>
                <div className="lb">{k.lb}</div>
                <div className="vl">{typeof k.vl === 'number' ? fmt(k.vl) : k.vl}</div>
                <div className="ft">{k.ft}</div>
              </div>
            ))}
          </div>

          <div className="bar">
            <input type="text" placeholder="Buscar por OC, SKU, descripcion o proveedor" value={qInput} onChange={e => setQInput(e.target.value)} />
            <select value={fEst} onChange={e => setFEst(e.target.value)}>
              <option value="">Todos los estados</option>
              {CAT_EST.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fGes} onChange={e => setFGes(e.target.value)}>
              <option value="">Toda gestion</option>
              {CAT_GES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fProv} onChange={e => setFProv(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fComp} onChange={e => setFComp(e.target.value)}>
              <option value="">Todos los compradores</option>
              {compradores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fMes} onChange={e => setFMes(e.target.value)}>
              <option value="">Todos los meses</option>
              {meses.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </select>
            <select value={fConf} onChange={e => setFConf(e.target.value)}>
              <option value="">Toda confirmacion</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Confirmada">Confirmada</option>
            </select>
            <button className={`btn ${soloTol ? 'act' : ''}`} onClick={() => setSoloTol(v => !v)}>Solo tolerancia</button>
            <button className="btn" onClick={limpiar}>Limpiar</button>
            {esEditor && <ImportButton onDone={cargar} />}
            {esEditor && <ImportIngresosButton onDone={cargar} />}
            <ExportButton />
            {esEditor && <button className="btn" onClick={() => setMostrarComunicar(true)}>Comunicar a almacen</button>}
            <button className="btn" onClick={() => setMostrarConfirmaciones(true)}>Ver confirmaciones</button>
            {esEditor && <button className="btn" onClick={() => setMostrarEnviar(true)}>Enviar recordatorios</button>}
            <span className="count">{fmt(filtradas.length)} lineas | {fmt(filtradas.filter(r => r.abierto).length)} abiertas</span>
          </div>

          <div className="tw">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    {COLS.map(c => (
                      <th key={c.k} className={c.n ? 'num' : ''} style={c.w ? { width: c.w } : undefined} onClick={() => toggleSort(c.k)}>
                        {c.l}{sortK === c.k && <span className="ar">{sortD > 0 ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id_entrega} className={selectedId === r.id_entrega ? 'sel' : ''} onClick={() => setSelectedId(r.id_entrega)}>
                      {COLS.map(c => <td key={c.k} className={c.n ? 'num' : ''}>{celda(r, c.k)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && <div className="empty">No hay entregas con estos filtros.</div>}
            </div>
          </div>
        </>
      )}
      </>}

      {selected && (
        <Panel row={selected} esEditor={esEditor} onClose={() => setSelectedId(null)} onSaved={patch => actualizarFila(selected.id_entrega, patch)} />
      )}

      {mostrarComunicar && (
        <ComunicarAlmacen rows={rowsOC} onClose={() => setMostrarComunicar(false)} />
      )}

      {mostrarEnviar && (
        <EnviarRecordatorios rows={rowsOC} esEditor={esEditor} onClose={() => setMostrarEnviar(false)} />
      )}

      {mostrarConfirmaciones && (
        <VerConfirmaciones rows={rowsOC} onClose={() => setMostrarConfirmaciones(false)} />
      )}
    </div>
  )
}
