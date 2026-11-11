import { useEffect, useState } from 'react'
import { fdate } from './lib/derive'
import { obtenerLeadTimes, leadTimeEsperado, leadTimeReal } from './lib/leadTime'

// Las tablas de lead time son chicas: se piden una sola vez y se comparten
// entre todos los paneles que se abran.
let cacheLeadTimes = null
const cargarLeadTimes = () => (cacheLeadTimes ||= obtenerLeadTimes().catch(() => null))

const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Bloque "Lead time" del panel de una entrega (OC u OI): desde la emision
// de la orden, cuanto se esperaba que demore (lead time configurado), para
// cuando se programo y cuanto demoro de verdad.
export default function LeadTimeEntrega({ row, etiqueta = 'OC' }) {
  const [leadTimes, setLeadTimes] = useState(null)
  useEffect(() => { cargarLeadTimes().then(setLeadTimes) }, [])

  if (!row.fecha_emision_oc) return null
  const esperado = leadTimeEsperado(row, leadTimes)
  const real = leadTimeReal(row)
  const fechaProg = row.fecha_confirmada || row.fecha_programada_ingreso
  const plazoProgramado = fechaProg ? Math.round((new Date(fechaProg + 'T00:00:00') - new Date(row.fecha_emision_oc + 'T00:00:00')) / 864e5) : null

  let comparacion = null
  if (real && real.dias < 0) {
    comparacion = { color: 'var(--amb)', texto: `El ingreso figura ${-real.dias} días antes de la emisión de la ${etiqueta}: revisar fechas (¿${etiqueta} de regularización?).` }
  } else if (esperado?.dias != null && real?.llego) {
    const dif = real.dias - esperado.dias
    comparacion = dif < 0
      ? { color: 'var(--grn)', texto: `Llegó ${-dif} días antes del lead time.` }
      : dif === 0 ? { color: 'var(--grn)', texto: 'Llegó justo en el lead time.' }
        : { color: 'var(--red)', texto: `Llegó ${dif} días después del lead time.` }
  } else if (esperado?.dias != null && plazoProgramado != null) {
    const dif = plazoProgramado - esperado.dias
    comparacion = dif < 0
      ? { color: 'var(--blu)', texto: `Está programada ${-dif} días antes de cumplir el lead time.` }
      : dif === 0 ? { color: 'var(--ink2)', texto: 'Está programada justo al cumplir el lead time.' }
        : { color: 'var(--amb)', texto: `Está programada ${dif} días después del lead time.` }
  }

  return (
    <div className="sec">
      <h3>Lead time</h3>
      <div className="kv"><span>Fecha de emisión {etiqueta}</span><b>{fdate(row.fecha_emision_oc)}</b></div>
      <div className="kv">
        <span>Lead time esperado</span>
        <b>{esperado?.dias != null
          ? <>{esperado.dias} días <span className="dim" style={{ fontWeight: 400 }}>({esperado.tipoLabel}, {esperado.origen}{esperado.fuente === 'propio' ? ', propio del código' : ''}) → {fdate(sumarDias(row.fecha_emision_oc, esperado.dias))}</span></>
          : <span className="dim">sin configurar</span>}</b>
      </div>
      {plazoProgramado != null && <div className="kv"><span>Plazo programado</span><b>{plazoProgramado} días <span className="dim" style={{ fontWeight: 400 }}>(emisión → {fdate(fechaProg)})</span></b></div>}
      <div className="kv">
        <span>Lead time real</span>
        <b>{real?.llego ? `${real.dias} días` : real ? <span className="dim">en curso: {real.dias} días desde la emisión</span> : '-'}</b>
      </div>
      {comparacion && <div className="hint" style={{ color: comparacion.color, fontWeight: 600, marginTop: 6 }}>{comparacion.texto}</div>}
    </div>
  )
}
