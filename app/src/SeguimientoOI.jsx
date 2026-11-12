import { useEffect, useMemo, useState } from 'react'
import { fmt, fdate, enrich, nombreMes } from './lib/derive'
import { cargarOI, ETAPAS, etapaLabel, calcularEtapa } from './lib/seguimientoOI'
import PanelOI from './PanelOI'
import EnviarRecordatorios from './EnviarRecordatorios'
import { useSesion } from './lib/auth'
import Icono from './Icono'

const ETAPA_SHORT = {
  1: 'Producción', 2: 'Recojo', 3: 'En tránsito', 4: 'Documentos',
  5: 'Numeración', 6: 'Pago', 7: 'Desaduanaje', 8: 'Ingreso', 9: 'Completado',
}

// Grupos de las 4 tarjetas de arriba (clic = filtrar la tabla). El detalle
// por etapa esta en el desplegable de etapas.
const GRUPOS = {
  abiertas: r => r.etapa !== 9,
  prod: r => r.etapa === 1,
  trans: r => r.etapa === 2 || r.etapa === 3,
  nac: r => r.etapa >= 4 && r.etapa <= 8,
}

const ETAPA_ICON = {
  1: '🏭', 2: '🚛', 3: '🚢', 4: '📄', 5: '📋', 6: '💰', 7: '🏛', 8: '📦', 9: '✅',
}

// Las primeras columnas (fijo = ancho en px) quedan inmoviles a la
// izquierda al mover la tabla hacia la derecha, para no perder de vista
// que OI y material es cada fila.
const COLS_OI = [
  { k: 'etapa', l: 'Etapa', fijo: 240 },
  { k: 'oc', l: 'OI', fijo: 110 },
  { k: 'sku', l: 'SKU', fijo: 100 },
  { k: 'descripcion', l: 'Material', fijo: 300 },
  { k: 'proveedor', l: 'Proveedor' },
  { k: 'comprador', l: 'Comprador', w: '104px' },
  { k: 'incoterm', l: 'Incoterm', w: '80px' },
  { k: 'cant_programada', l: 'Programado', n: 1 },
  { k: 'cant_ingresada', l: 'Ingresado', n: 1 },
  { k: 'saldo_pendiente', l: 'Saldo', n: 1 },
  { k: 'estado_ingreso', l: 'Ingreso' },
  { k: 'finProduccion', l: 'Fin producción' },
  { k: 'fechaRecojo', l: 'F. recojo' },
  { k: 'etd', l: 'ETD' },
  { k: 'eta', l: 'ETA' },
  { k: 'diasEta', l: 'Dias ETA', n: 1 },
  { k: 'fecha_programada_ingreso', l: 'F. programada' },
]

// Fechas del seguimiento de cada OI que se muestran como columnas (y se
// pueden ordenar): fin de produccion (= fecha de disponibilidad de la
// etapa 1), recojo (solo EXW) y ETD.
const fechasSeg = seg => ({
  finProduccion: seg?.fecha_disponibilidad || null,
  fechaRecojo: seg?.fecha_recojo || null,
  etd: seg?.etd || null,
})

const COLS_FIJAS = COLS_OI.filter(c => c.fijo)
const izquierdaFija = COLS_OI.reduce((acc, c, i) => {
  if (c.fijo) acc[c.k] = COLS_OI.slice(0, i).reduce((a, x) => a + (x.fijo || 0), 0)
  return acc
}, {})

// Clase y estilo de una celda: las fijas llevan "stk" y su posicion; la
// ultima fija lleva una sombra que marca el borde.
function propsCelda(c) {
  const clases = [c.n ? 'num' : '']
  if (!c.fijo) return { className: clases.join(' '), style: c.w ? { width: c.w } : undefined }
  clases.push('stk')
  if (c === COLS_FIJAS[COLS_FIJAS.length - 1]) clases.push('stk-ult')
  return {
    className: clases.join(' ').trim(),
    style: { left: izquierdaFija[c.k], width: c.fijo, minWidth: c.fijo, maxWidth: c.fijo },
  }
}

export default function SeguimientoOI() {
  const { perfil } = useSesion()
  const [rows, setRows] = useState([])
  const [mostrarEstatus, setMostrarEstatus] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fEtapa, setFEtapa] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fMes, setFMes] = useState('')
  const [fProv, setFProv] = useState('')
  const [fComp, setFComp] = useState('')
  const [sortK, setSortK] = useState('etapa')
  const [sortD, setSortD] = useState(1)

  async function cargar() {
    setLoading(true)
    setErr(null)
    try {
      const data = await cargarOI()
      const enriched = data.map(r => {
        const eta = r.seg?.eta || null
        const diasEta = eta ? Math.round((new Date(eta + 'T00:00:00') - new Date()) / 864e5) : null
        return { ...r, ...fechasSeg(r.seg), incoterm: r.seg?.incoterm || '', eta, diasEta }
      })
      setRows(enriched)
    } catch (e) {
      setErr(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250)
    return () => clearTimeout(t)
  }, [qInput])

  const proveedores = useMemo(() => [...new Set(rows.map(r => r.proveedor).filter(Boolean))].sort(), [rows])
  const compradores = useMemo(() => [...new Set(rows.map(r => r.comprador).filter(Boolean))].sort(), [rows])

  // Mes de la fecha programada de ingreso (o la confirmada, si la hay), igual
  // que el filtro de mes de Seguimiento OC.
  const mesDe = r => (r.fecha_confirmada || r.fecha_programada_ingreso)?.slice(0, 7)
  const meses = useMemo(() => [...new Set(rows.map(mesDe).filter(Boolean))].sort(), [rows])

  const kpis = useMemo(() => {
    const n = g => rows.filter(GRUPOS[g]).length
    const cuenta = e => rows.filter(r => r.etapa === e).length
    const nac = [4, 5, 6, 7, 8].map(e => [ETAPA_SHORT[e], cuenta(e)]).filter(x => x[1]).map(x => `${x[1]} ${x[0].toLowerCase()}`)
    return [
      { id: 'abiertas', lb: 'OI abiertas', vl: n('abiertas'), ic: 'caja', tono: 'azul', ft: `de ${fmt(rows.length)} líneas · ${fmt(cuenta(9))} completadas` },
      { id: 'prod', lb: 'En producción', vl: n('prod'), ic: 'reloj', tono: 'ambar', ft: 'esperando fin de producción' },
      { id: 'trans', lb: 'En tránsito', vl: n('trans'), ic: 'camion', tono: 'azul', ft: `${fmt(cuenta(2))} por recoger · ${fmt(cuenta(3))} en viaje` },
      { id: 'nac', lb: 'Nacionalización e ingreso', vl: n('nac'), ic: 'portapapeles', tono: n('nac') ? 'rojo' : 'azul', ft: nac.length ? nac.join(' · ') : 'ninguna en aduana' },
    ]
  }, [rows])

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase()
    let out = rows.filter(r => {
      if (qq) {
        const busca = `${r.oc} ${r.sku} ${r.descripcion || ''} ${r.proveedor || ''} ${r.comprador || ''}`.toLowerCase()
        if (!busca.includes(qq)) return false
      }
      if (fGrupo && !GRUPOS[fGrupo](r)) return false
      if (fEtapa && Number(fEtapa) !== r.etapa) return false
      // Completo = la OI ya ingreso toda a almacen (etapa Completado);
      // Pendiente = todavia en alguna etapa del proceso.
      if (fEstado === 'Completo' && r.etapa !== 9) return false
      if (fEstado === 'Pendiente' && r.etapa === 9) return false
      if (fMes && mesDe(r) !== fMes) return false
      if (fProv && r.proveedor !== fProv) return false
      if (fComp && r.comprador !== fComp) return false
      return true
    })
    out.sort((a, b) => {
      let x = a[sortK], y = b[sortK]
      if (x == null) x = ''
      if (y == null) y = ''
      return (x > y ? 1 : x < y ? -1 : 0) * sortD
    })
    return out
  }, [rows, q, fGrupo, fEtapa, fEstado, fMes, fProv, fComp, sortK, sortD])

  const selected = rows.find(r => r.id_entrega === selectedId)

  function toggleSort(k) {
    if (sortK === k) setSortD(d => -d)
    else { setSortK(k); setSortD(1) }
  }

  function actualizarFila(id, segPatch, ocPatch) {
    setRows(prev => prev.map(r => {
      if (r.id_entrega !== id) return r
      // Si cambio la fecha o el ajuste de cantidad, se recalculan saldo y
      // estado igual que al cargar (enrich).
      const base = ocPatch && Object.keys(ocPatch).length ? enrich({ ...r, estado_gestion: r.estadoGestionBase, ...ocPatch }) : r
      const newSeg = { ...(r.seg || {}), ...segPatch }
      const etapa = calcularEtapa(newSeg, base)
      const eta = newSeg.eta || null
      const diasEta = eta ? Math.round((new Date(eta + 'T00:00:00') - new Date()) / 864e5) : null
      return { ...base, ...fechasSeg(newSeg), seg: newSeg, etapa, etapaLabel: etapaLabel(etapa), incoterm: newSeg.incoterm || '', eta, diasEta }
    }))
  }

  function celda(r, k) {
    switch (k) {
      case 'etapa': {
        const total = 8
        const done = Math.min(r.etapa - 1, total)
        const pct = r.etapa === 9 ? 100 : Math.round((done / total) * 100)
        const color = r.etapa === 9 ? 'var(--grn)' : r.etapa >= 6 ? 'var(--amb)' : 'var(--blu)'
        return (
          <div className="oi-etapa-cell">
            <div className="oi-etapa-top">
              <span className="oi-etapa-icon">{ETAPA_ICON[r.etapa]}</span>
              <span className="oi-etapa-name">{ETAPA_SHORT[r.etapa]}</span>
              <span className="oi-etapa-num">{r.etapa === 9 ? '✓' : `${r.etapa}/8`}</span>
            </div>
            <div className="oi-etapa-bar">
              {Array.from({ length: total }, (_, i) => (
                <div
                  key={i}
                  className={`oi-seg ${i < done ? 'done' : ''} ${i === done && r.etapa <= total ? 'active' : ''}`}
                  style={{
                    background: i < done ? color : i === done && r.etapa <= total ? color : undefined,
                    opacity: i === done && r.etapa <= total ? 0.4 : undefined,
                  }}
                  title={ETAPAS[i]?.l || 'Completado'}
                />
              ))}
            </div>
          </div>
        )
      }
      case 'oc': return <span className="mono">{r.oc}</span>
      case 'sku': return <span className="mono">{r.sku}</span>
      case 'descripcion': return <div className="dsc">{r.descripcion || ''}</div>
      case 'proveedor': return <div className="prov">{r.proveedor || ''}</div>
      case 'comprador': return <span className={`nw ${!r.comprador ? 'dim' : ''}`}>{r.comprador || 'Sin asignar'}</span>
      case 'incoterm': return r.incoterm ? <span className="tag t-blu">{r.incoterm}</span> : <span className="dim">-</span>
      case 'cant_programada': return r.ajuste_cantidad
        ? <>{fmt(r.progEfectivo)}<div className="pct" style={{ margin: '2px 0 0', color: 'var(--amb)' }}>ajustado {r.ajuste_cantidad > 0 ? '+' : ''}{fmt(r.ajuste_cantidad)}</div></>
        : fmt(r.cant_programada)
      case 'cant_ingresada': return fmt(r.cant_ingresada)
      case 'saldo_pendiente': return r.saldo_pendiente > 0 ? <b style={{ fontWeight: 500 }}>{fmt(r.saldo_pendiente)}</b> : <span className="dim">0</span>
      case 'estado_ingreso': {
        const EST_TAG = { Completo: 't-grn', Pendiente: 't-blu' }
        return <span className={`tag ${EST_TAG[r.estado_ingreso] || 't-gry'}`}>{r.estado_ingreso}</span>
      }
      case 'finProduccion':
      case 'fechaRecojo':
      case 'etd':
      case 'eta': return r[k] ? <span className="mono">{fdate(r[k])}</span> : <span className="dim">-</span>
      case 'diasEta':
        if (r.diasEta == null) return <span className="dim">-</span>
        if (r.diasEta < 0) return <span style={{ color: 'var(--red)', fontWeight: 500 }}>{-r.diasEta} atraso</span>
        return <span className="dim">faltan {r.diasEta}</span>
      case 'fecha_programada_ingreso': return <span className="mono">{fdate(r.fecha_programada_ingreso)}</span>
      default: return null
    }
  }

  const esEditor = perfil?.rol === 'editor'

  return (
    <>
      {err && <div className="empty">No se pudo cargar: {err}</div>}
      {loading ? <div className="empty">Cargando OI...</div> : (
        <>
          <div className="kpis2">
            {kpis.map(k => (
              <div key={k.id} className={`kpi2 ${k.tono} ${fGrupo === k.id ? 'on' : ''}`} title="Clic para filtrar la tabla"
                onClick={() => { setFGrupo(g => g === k.id ? '' : k.id); setFEtapa('') }}>
                <Icono nombre={k.ic} tam={24} />
                <div className="lb">{k.lb}</div>
                <div className="vl">{fmt(k.vl)}</div>
                <div className="ft">{k.ft}</div>
              </div>
            ))}
          </div>

          <section className="oc-card">
            <div className="oc-card-h">
              <h2><Icono nombre="camion" tam={22} /> Órdenes de importación</h2>
              <div className="oc-acc">
                {esEditor && <button className="btn act" onClick={() => setMostrarEstatus(true)}><Icono nombre="campana" tam={16} /> Solicitar estatus a proveedores</button>}
              </div>
            </div>

            <div className="oc-filtros">
              <input type="text" placeholder="Buscar por OI, SKU, material o proveedor" value={qInput} onChange={e => setQInput(e.target.value)} />
              <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Completo">Completo</option>
              </select>
              <select value={fEtapa} onChange={e => { setFEtapa(e.target.value); setFGrupo('') }}>
                <option value="">Todas las etapas</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(e => <option key={e} value={e}>{ETAPA_SHORT[e]}</option>)}
              </select>
              <select value={fMes} onChange={e => setFMes(e.target.value)} title="Mes de la fecha programada de ingreso">
                <option value="">Todos los meses</option>
                {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
              </select>
              <select value={fProv} onChange={e => setFProv(e.target.value)}>
                <option value="">Todos los proveedores</option>
                {proveedores.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={fComp} onChange={e => setFComp(e.target.value)}>
                <option value="">Todos los compradores</option>
                {compradores.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="oc-conteo">
              <span>{fmt(filtradas.length)} líneas OI</span>
              <button className="btn-link" onClick={() => { setQInput(''); setQ(''); setFGrupo(''); setFEtapa(''); setFEstado(''); setFMes(''); setFProv(''); setFComp('') }}>Limpiar filtros</button>
            </div>

          <div className="tw">
            <div className="scroll">
              <table className="oi-tbl">
                <thead>
                  <tr>
                    {COLS_OI.map(c => (
                      <th key={c.k} {...propsCelda(c)} onClick={() => toggleSort(c.k)}>
                        {c.l}{sortK === c.k && <span className="ar">{sortD > 0 ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id_entrega} className={selectedId === r.id_entrega ? 'sel' : ''} onClick={() => setSelectedId(r.id_entrega)}>
                      {COLS_OI.map(c => <td key={c.k} {...propsCelda(c)}>{celda(r, c.k)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && <div className="empty">No hay OI con estos filtros.</div>}
            </div>
          </div>
          </section>
        </>
      )}

      {mostrarEstatus && (
        <EnviarRecordatorios rows={rows} tipo="oi" esEditor={esEditor} onClose={() => setMostrarEstatus(false)} />
      )}

      {selected && (
        <PanelOI row={selected} esEditor={esEditor} onClose={() => setSelectedId(null)} onSaved={(patch, ocPatch) => actualizarFila(selected.id_entrega, patch, ocPatch)} />
      )}
    </>
  )
}
