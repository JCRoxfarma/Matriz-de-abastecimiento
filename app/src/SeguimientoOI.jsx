import { useEffect, useMemo, useState } from 'react'
import { fmt, fdate, enrich } from './lib/derive'
import { cargarOI, ETAPAS, etapaLabel, calcularEtapa } from './lib/seguimientoOI'
import PanelOI from './PanelOI'
import { useSesion } from './lib/auth'

const ETAPA_SHORT = {
  1: 'Producción', 2: 'Recojo', 3: 'En tránsito', 4: 'Documentos',
  5: 'Numeración', 6: 'Pago', 7: 'Desaduanaje', 8: 'Ingreso', 9: 'Completado',
}

const ETAPA_ICON = {
  1: '🏭', 2: '🚛', 3: '🚢', 4: '📄', 5: '📋', 6: '💰', 7: '🏛', 8: '📦', 9: '✅',
}

const COLS_OI = [
  { k: 'etapa', l: 'Etapa', w: '240px' },
  { k: 'oc', l: 'OI' },
  { k: 'sku', l: 'SKU' },
  { k: 'descripcion', l: 'Material' },
  { k: 'proveedor', l: 'Proveedor' },
  { k: 'comprador', l: 'Comprador', w: '104px' },
  { k: 'incoterm', l: 'Incoterm', w: '80px' },
  { k: 'cant_programada', l: 'Programado', n: 1 },
  { k: 'cant_ingresada', l: 'Ingresado', n: 1 },
  { k: 'saldo_pendiente', l: 'Saldo', n: 1 },
  { k: 'estado_ingreso', l: 'Ingreso' },
  { k: 'eta', l: 'ETA' },
  { k: 'diasEta', l: 'Dias ETA', n: 1 },
  { k: 'fecha_programada_ingreso', l: 'F. programada' },
]

export default function SeguimientoOI() {
  const { perfil } = useSesion()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [fEtapa, setFEtapa] = useState('')
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
        return { ...r, incoterm: r.seg?.incoterm || '', eta, diasEta }
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

  const kpis = useMemo(() => {
    const byEtapa = {}
    for (let i = 1; i <= 9; i++) byEtapa[i] = 0
    rows.forEach(r => { byEtapa[r.etapa] = (byEtapa[r.etapa] || 0) + 1 })
    return [
      { id: '', lb: 'Total OI', vl: rows.length, cl: '', icon: '📊' },
      { id: '1', lb: 'Producción', vl: byEtapa[1], cl: byEtapa[1] > 0 ? 'a' : '', icon: '🏭' },
      { id: '3', lb: 'En tránsito', vl: byEtapa[2] + byEtapa[3], cl: '', icon: '🚢' },
      { id: '4', lb: 'Documentos', vl: byEtapa[4], cl: '', icon: '📄' },
      { id: '5', lb: 'Numeración', vl: byEtapa[5], cl: '', icon: '📋' },
      { id: '6', lb: 'Pago', vl: byEtapa[6], cl: byEtapa[6] > 0 ? 'r' : '', icon: '💰' },
      { id: '7', lb: 'Desaduanaje', vl: byEtapa[7], cl: byEtapa[7] > 0 ? 'a' : '', icon: '🏛' },
      { id: '8', lb: 'Ingreso', vl: byEtapa[8], cl: '', icon: '📦' },
      { id: '9', lb: 'Completadas', vl: byEtapa[9], cl: 'g', icon: '✅' },
    ]
  }, [rows])

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase()
    let out = rows.filter(r => {
      if (qq) {
        const busca = `${r.oc} ${r.sku} ${r.descripcion || ''} ${r.proveedor || ''} ${r.comprador || ''}`.toLowerCase()
        if (!busca.includes(qq)) return false
      }
      if (fEtapa) {
        if (fEtapa === '3') { if (r.etapa !== 2 && r.etapa !== 3) return false }
        else if (Number(fEtapa) !== r.etapa) return false
      }
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
  }, [rows, q, fEtapa, fProv, fComp, sortK, sortD])

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
      return { ...base, seg: newSeg, etapa, etapaLabel: etapaLabel(etapa), incoterm: newSeg.incoterm || '', eta, diasEta }
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
      case 'eta': return r.eta ? <span className="mono">{fdate(r.eta)}</span> : <span className="dim">-</span>
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
          <div className="kpis">
            {kpis.map(k => (
              <div key={k.lb} className={`kpi ${k.cl} ${fEtapa === k.id && k.id ? 'on' : ''}`}
                onClick={() => { if (!k.id) return; setFEtapa(prev => prev === k.id ? '' : k.id) }}>
                <div className="lb">{k.icon} {k.lb}</div>
                <div className="vl">{fmt(k.vl)}</div>
              </div>
            ))}
          </div>

          <div className="bar">
            <input type="text" placeholder="Buscar por OI, SKU, material o proveedor" value={qInput} onChange={e => setQInput(e.target.value)} />
            <select value={fProv} onChange={e => setFProv(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fComp} onChange={e => setFComp(e.target.value)}>
              <option value="">Todos los compradores</option>
              {compradores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="btn" onClick={() => { setQInput(''); setQ(''); setFEtapa(''); setFProv(''); setFComp('') }}>Limpiar</button>
            <span className="count">{fmt(filtradas.length)} líneas OI</span>
          </div>

          <div className="tw">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    {COLS_OI.map(c => (
                      <th key={c.k} className={c.n ? 'num' : ''} style={c.w ? { width: c.w } : undefined} onClick={() => toggleSort(c.k)}>
                        {c.l}{sortK === c.k && <span className="ar">{sortD > 0 ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id_entrega} className={selectedId === r.id_entrega ? 'sel' : ''} onClick={() => setSelectedId(r.id_entrega)}>
                      {COLS_OI.map(c => <td key={c.k} className={c.n ? 'num' : ''}>{celda(r, c.k)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && <div className="empty">No hay OI con estos filtros.</div>}
            </div>
          </div>
        </>
      )}

      {selected && (
        <PanelOI row={selected} esEditor={esEditor} onClose={() => setSelectedId(null)} onSaved={(patch, ocPatch) => actualizarFila(selected.id_entrega, patch, ocPatch)} />
      )}
    </>
  )
}
