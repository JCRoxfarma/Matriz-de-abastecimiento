import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate } from './lib/derive'

// Bloque "Rechazo de calidad" del panel de una entrega (OC u OI). Solo
// aparece si Calidad rechazo algo de esta entrega. Lo rechazado ya no
// cuenta como ingresado (lo descuenta el importador); aqui se ve cuanto se
// rechazo, si ya llego la reposicion, y se marca que la nota de credito del
// proveedor ya se envio a contabilidad (Johany: sin numero, solo el check).
export default function RechazoCalidad({ row, esEditor, onGuardado }) {
  const [nc, setNc] = useState(!!row.nc_enviada)
  const [guardando, setGuardando] = useState(false)
  if (!(row.cant_rechazada > 0)) return null

  async function cambiarNc(v) {
    setGuardando(true)
    const { error } = await supabase.from('programacion_oc').update({ nc_enviada: v }).eq('id_entrega', row.id_entrega)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setNc(v)
    onGuardado?.({ nc_enviada: v })
  }

  return (
    <div className={`sec rech-sec ${row.rechazoPend ? 'pend' : 'ok'}`}>
      <h3>Rechazo de calidad</h3>
      <div className="kv"><span>Cantidad rechazada</span><b style={{ color: 'var(--red)' }}>{fmt(row.cant_rechazada)}</b></div>
      {row.fecha_rechazo && <div className="kv"><span>Fecha del lote rechazado</span><b>{fdate(row.fecha_rechazo)}</b></div>}
      <div className="kv">
        <span>Reposición del proveedor</span>
        <b style={{ color: row.rechazoPend ? 'var(--red)' : 'var(--grn)' }}>
          {row.rechazoPend ? `Pendiente: faltan ${fmt(row.saldo_pendiente)}` : 'Ya repuso'}
        </b>
      </div>
      <label className={`rech-nc ${nc ? 'on' : ''}`}>
        <input type="checkbox" checked={nc} disabled={!esEditor || guardando} onChange={e => cambiarNc(e.target.checked)} />
        Nota de crédito enviada a contabilidad
      </label>
      <div className="hint">Lo rechazado no cuenta como ingresado: la entrega sigue pendiente hasta que llegue la reposición aprobada.</div>
    </div>
  )
}
