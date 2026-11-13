import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate } from './lib/derive'

// Bloque "Rechazo de calidad" del panel de una entrega (OC u OI). Solo
// aparece si Calidad rechazo algo de esta entrega. Lo rechazado ya no
// cuenta como ingresado (lo descuenta el importador); aqui se ve cuanto se
// rechazo, si ya llego la reposicion, y se marca que la nota de credito del
// proveedor ya se envio a contabilidad (Johany: sin numero, solo el check).
//
// Solo en OI: si lo rechazado es mercaderia rota en el transporte, no es
// culpa del proveedor ni se repone; se marca "desmedro" y la linea se
// cierra como gasto por desmedro (la cantidad danada = la rechazada).
export default function RechazoCalidad({ row, tipo = 'oc', esEditor, onGuardado }) {
  const [nc, setNc] = useState(!!row.nc_enviada)
  const [desm, setDesm] = useState(!!row.desmedro)
  const [guardando, setGuardando] = useState(false)
  if (!(row.cant_rechazada > 0)) return null

  async function guardar(patch) {
    setGuardando(true)
    const { error } = await supabase.from('programacion_oc').update(patch).eq('id_entrega', row.id_entrega)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return false }
    onGuardado?.(patch)
    return true
  }

  async function cambiarNc(v) {
    if (await guardar({ nc_enviada: v })) setNc(v)
  }

  // Al marcar o desmarcar desmedro se recalcula el saldo al instante (igual
  // que lo hara el importador la proxima vez), para que la linea se cierre
  // o se reabra sin esperar a subir otro Excel.
  async function cambiarDesmedro(v) {
    if (v && !confirm(`¿Cerrar ${fmt(row.cant_rechazada)} unidades como gasto por desmedro (rotura en tránsito)? El proveedor no tendrá que reponerlas.`)) return
    const prog = row.progEfectivo ?? row.cant_programada ?? 0
    const saldo = Math.max(0, prog - (row.cant_ingresada || 0) - (v ? row.cant_rechazada : 0))
    const patch = {
      desmedro: v,
      saldo_pendiente: saldo,
      estado_ingreso: saldo > 0 ? 'Pendiente' : 'Completo',
      fecha_real_ingreso: saldo > 0 ? null : (row.fecha_real_ingreso || row.fecha_rechazo || null),
    }
    if (await guardar(patch)) setDesm(v)
  }

  const titulo = desm ? 'Desmedro en tránsito' : 'Rechazo de calidad'

  return (
    <div className={`sec rech-sec ${desm ? 'desm' : row.rechazoPend ? 'pend' : 'ok'}`}>
      <h3>{titulo}</h3>
      <div className="kv"><span>{desm ? 'Cantidad dañada' : 'Cantidad rechazada'}</span><b style={{ color: desm ? 'var(--amb)' : 'var(--red)' }}>{fmt(row.cant_rechazada)}</b></div>
      {row.fecha_rechazo && <div className="kv"><span>Fecha del lote</span><b>{fdate(row.fecha_rechazo)}</b></div>}
      {desm ? (
        <div className="kv"><span>Estado</span><b style={{ color: 'var(--amb)' }}>Cerrado como gasto por desmedro</b></div>
      ) : (
        <div className="kv">
          <span>Reposición del proveedor</span>
          <b style={{ color: row.rechazoPend ? 'var(--red)' : 'var(--grn)' }}>
            {row.rechazoPend ? `Pendiente: faltan ${fmt(row.saldo_pendiente)}` : 'Ya repuso'}
          </b>
        </div>
      )}

      {tipo === 'oi' && (
        <label className={`rech-nc ${desm ? 'on-amb' : ''}`}>
          <input type="checkbox" checked={desm} disabled={!esEditor || guardando} onChange={e => cambiarDesmedro(e.target.checked)} />
          Rotura en tránsito: cerrar como gasto por desmedro
        </label>
      )}
      {!desm && (
        <label className={`rech-nc ${nc ? 'on' : ''}`}>
          <input type="checkbox" checked={nc} disabled={!esEditor || guardando} onChange={e => cambiarNc(e.target.checked)} />
          Nota de crédito enviada a contabilidad
        </label>
      )}
      <div className="hint">
        {desm
          ? 'No es responsabilidad del proveedor: no se repone y no afecta su OTIF ni sus rechazos.'
          : 'Lo rechazado no cuenta como ingresado: la entrega sigue pendiente hasta que llegue la reposición aprobada.'}
      </div>
    </div>
  )
}
