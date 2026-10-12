import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fmtM, fdate, days, SEM, CERRADAS, MOTIVOS, RESP, gestOpts } from './lib/derive'

export default function Panel({ row, esEditor, onClose, onSaved }) {
  const opcionesGestion = gestOpts(row)
  const [ges, setGes] = useState(opcionesGestion.includes(row.estado_gestion) ? row.estado_gestion : opcionesGestion[0])
  const [mot, setMot] = useState(row.motivo_demora || '')
  const [resp, setResp] = useState(row.responsable_accion || '')
  const [fec, setFec] = useState(row.fecha_programada_ingreso || '')
  const [fecConf, setFecConf] = useState(row.fecha_confirmada || '')
  const [com, setCom] = useState(row.observaciones || '')
  const [ajuste, setAjuste] = useState(row.ajuste_cantidad || 0)
  const [motAjuste, setMotAjuste] = useState(row.motivo_ajuste || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const s = SEM[row.sem2]
  const cerrada = CERRADAS.includes(row.estado_gestion) && !row.reabierta

  async function reabrir() {
    const { error } = await supabase.from('programacion_oc')
      .update({ reabierta: true, estado_gestion: 'En seguimiento' })
      .eq('id_entrega', row.id_entrega)
    if (error) { alert('No se pudo reabrir: ' + error.message); return }
    onSaved({ reabierta: true, estado_gestion: 'En seguimiento' })
  }

  async function anular() {
    if (!confirm('¿Anular esta orden? Ya no aparecerá como pendiente.')) return
    const { error } = await supabase.from('programacion_oc')
      .update({ estado_gestion: 'Orden Anulada', reabierta: false })
      .eq('id_entrega', row.id_entrega)
    if (error) { alert('No se pudo anular: ' + error.message); return }
    onSaved({ estado_gestion: 'Orden Anulada', reabierta: false })
  }

  async function guardar() {
    setSaving(true)
    const patch = { estado_gestion: ges, motivo_demora: mot || null, responsable_accion: resp || null, observaciones: com || null, fecha_confirmada: fecConf || null, ajuste_cantidad: Number(ajuste) || 0, motivo_ajuste: motAjuste || null }
    if (fec && fec !== row.fecha_programada_ingreso) {
      const hist = [...(row.hist || []), { de: row.fecha_programada_ingreso, a: fec, motivo: patch.motivo_demora, resp: patch.responsable_accion, coment: com }]
      patch.historial = hist
      patch.fecha_programada_ingreso = fec
      if (!CERRADAS.includes(ges)) patch.estado_gestion = 'Reprogramado'
    }
    if (CERRADAS.includes(patch.estado_gestion)) patch.reabierta = false
    const { error } = await supabase.from('programacion_oc').update(patch).eq('id_entrega', row.id_entrega)
    setSaving(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    onSaved(patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 1400)
  }

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="pn on">
        <div className="ph">
          <button className="x" onClick={onClose}>&times;</button>
          <h2>{row.descripcion || row.sku}</h2>
          <p>OC {row.oc} &middot; SKU {row.sku} &middot; entrega {row.entN} de {row.entTot}</p>
        </div>
        <div className="pb">
          <div className="sec">
            <span className={`tag ${s.t}`}>{s.l}</span>
            {row.abierto && row.dd == null && <span className="tag t-amb" style={{ marginLeft: 6 }}>sin fecha programada</span>}
            {row.abierto && row.dd != null && row.dd < 0 && <span className="tag t-red" style={{ marginLeft: 6 }}>{-row.dd} dias de atraso</span>}
            {row.abierto && row.dd != null && row.dd >= 0 && <span className="tag t-blu" style={{ marginLeft: 6 }}>faltan {row.dd} dias</span>}
            {row.hist.length > 0 && <span className="tag t-amb" style={{ marginLeft: 6 }}>Reprogramada {row.hist.length} {row.hist.length === 1 ? 'vez' : 'veces'}</span>}
            {row.tol && (
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 9, background: 'var(--grnbg)', padding: '9px 11px', borderRadius: 8, lineHeight: 1.45 }}>
                Cerrada con {(row.desv * 100).toFixed(1)}% de desviacion frente a lo programado. Se acepta dentro del rango de tolerancia, por eso no cuenta como atraso.
              </div>
            )}
            <div className="bigp"><i style={{ width: `${(row.avance * 100).toFixed(0)}%` }} /></div>
            <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{fmt(row.cant_ingresada)} de {fmt(row.progEfectivo)} recibidos ({(row.avance * 100).toFixed(0)}%)</div>
          </div>

          <div className="sec">
            <h3>Entrega</h3>
            <div className="kv"><span>Cantidad programada</span><b>{fmt(row.cant_programada)}{row.ajuste_cantidad ? <span style={{ color: 'var(--amb)', fontSize: 12 }}> {row.ajuste_cantidad > 0 ? '+' : ''}{fmt(row.ajuste_cantidad)} ajuste = {fmt(row.progEfectivo)}</span> : ''}</b></div>
            <div className="kv"><span>Cantidad ingresada</span><b>{fmt(row.cant_ingresada)}</b></div>
            <div className="kv"><span>Saldo pendiente</span><b style={{ color: row.saldo_pendiente > 0 ? (row.tol ? 'var(--grn)' : 'var(--red)') : 'var(--ink3)' }}>{fmt(row.saldo_pendiente)}</b></div>
            {row.ajuste_cantidad !== 0 && row.ajuste_cantidad != null && <div className="kv"><span>Ajuste excepcional</span><b style={{ color: 'var(--amb)' }}>{row.ajuste_cantidad > 0 ? '+' : ''}{fmt(row.ajuste_cantidad)}{row.motivo_ajuste ? ` (${row.motivo_ajuste})` : ''}</b></div>}
            {row.tol && <div className="kv"><span>Cierre dentro de tolerancia</span><b style={{ color: 'var(--grn)' }}>si, {(row.desv * 100).toFixed(1)}% de desviacion</b></div>}
            <div className="kv"><span>Fecha de ingreso</span><b style={{ color: 'var(--blu)' }}>{fdate(row.fecha_confirmada || row.fecha_programada_ingreso)}{row.fecha_confirmada ? ' (confirmada)' : ' (solicitada)'}</b></div>
            <div className="kv"><span>Fecha solicitada (programada)</span><b>{fdate(row.fecha_programada_ingreso)}{row.hist.length > 0 && <span className="rep">R{row.hist.length > 1 ? row.hist.length : ''}</span>}</b></div>
            <div className="kv"><span>Fecha confirmada proveedor</span><b>{row.fecha_confirmada ? fdate(row.fecha_confirmada) : <span className="dim">sin confirmar</span>}</b></div>
            {row.estado_confirmacion && <div className="kv"><span>Estado confirmacion</span><span className={`tag ${row.estado_confirmacion === 'Confirmada' ? 't-grn' : row.estado_confirmacion === 'Pendiente' ? 't-amb' : 't-red'}`}>{row.estado_confirmacion}</span></div>}
            {row.hist.length > 0 && <>
              <div className="kv"><span>Fecha original de la OC</span><b className="dim">{fdate(row.fprog0)}</b></div>
              <div className="kv"><span>Desviacion acumulada</span><b style={{ color: 'var(--amb)' }}>{days(row.fecha_programada_ingreso) - days(row.fprog0)} dias</b></div>
            </>}
            <div className="kv"><span>Fecha real de ingreso</span><b>{row.fecha_real_ingreso ? fdate(row.fecha_real_ingreso) : 'sin ingreso'}</b></div>
            <div className="kv"><span>Numero de entrega</span><b>{row.entN} de {row.entTot}{row.entTot > 1 ? ' programadas para esta OC y SKU' : ''}</b></div>
            <div className="kv"><span>Semana de ingreso</span><b>SEM {row.semana_ingreso || ''}</b></div>
            <div className="kv"><span>Almacen destino</span><b>{row.almacen_destino || 'sin definir'}</b></div>
          </div>

          <div className="sec">
            <h3>Comercial</h3>
            <div className="kv"><span>Proveedor</span><b style={{ maxWidth: 250 }}>{row.proveedor || ''}</b></div>
            <div className="kv"><span>Comprador</span><b>{row.comprador || 'Sin asignar'}</b></div>
            <div className="kv"><span>Fecha emision OC</span><b>{fdate(row.fecha_emision_oc)}</b></div>
            <div className="kv"><span>Condicion de pago</span><b>{row.condicion_pago || ''}</b></div>
            <div className="kv"><span>Precio unitario</span><b>{fmtM(row.precio_unitario, row.moneda)}</b></div>
            <div className="kv"><span>Valor de la entrega</span><b>{fmtM(row.valor_entrega, row.moneda)}</b></div>
            <div className="kv"><span>Valor pendiente</span><b>{fmtM(row.valor_pendiente, row.moneda)}</b></div>
          </div>

          {row.hist.length > 0 && (
            <div className="sec">
              <h3>Historial de reprogramaciones</h3>
              <div className="hst">
                {row.hist.map((h, i) => (
                  <div className="hit" key={i}>
                    <div className="hid">De {fdate(h.de)} a {fdate(h.a)}</div>
                    <div className="him">Reprogramacion {i + 1}{h.motivo ? ' · ' + h.motivo : ''}{h.resp ? ' · responsable ' + h.resp : ''}{h.coment ? <><br />"{h.coment}"</> : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sec">
            <h3>Gestion de la linea</h3>
            {!esEditor ? (
              <>
                <div className="lock">
                  <div className="lockt">Solo lectura</div>
                  <div className="lockd">Tu cuenta puede ver el seguimiento, pero no editarlo. Si algo debe cambiar, avisa a compras.</div>
                </div>
                <div className="kv"><span>Estado de gestion</span><b>{row.estado_gestion || 'sin definir'}</b></div>
                <div className="kv"><span>Motivo de demora</span><b>{row.motivo_demora || 'sin motivo'}</b></div>
                <div className="kv"><span>Responsable</span><b>{row.responsable_accion || 'sin asignar'}</b></div>
                <div className="kv"><span>Comentario</span><b>{row.observaciones || 'sin comentario'}</b></div>
              </>
            ) : cerrada ? (
              <>
                <div className="lock">
                  <div className="lockt">Linea cerrada{row.tol ? ' dentro de tolerancia' : ''}</div>
                  <div className="lockd">Esta entrega ya no requiere seguimiento, por eso los campos de gestion estan bloqueados. Solo se editan las lineas con saldo pendiente o en atraso.</div>
                </div>
                <div className="kv"><span>Estado de gestion</span><b>{row.estado_gestion || ''}</b></div>
                <div className="kv"><span>Motivo de demora</span><b>{row.motivo_demora || 'sin motivo'}</b></div>
                <div className="kv"><span>Responsable</span><b>{row.responsable_accion || 'sin asignar'}</b></div>
                <div className="kv"><span>Cerro el</span><b>{row.fecha_real_ingreso ? fdate(row.fecha_real_ingreso) : 'sin fecha'}</b></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="reab" onClick={reabrir}>Reabrir linea para editar</button>
                  {row.estado_gestion !== 'Orden Anulada' && (
                    <button className="reab" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={anular}>Anular orden</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="fld">
                  <label>Estado de gestion</label>
                  <select value={ges} onChange={e => setGes(e.target.value)}>
                    {opcionesGestion.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <div className="hint">
                    {row.estado_ingreso === 'Completo'
                      ? 'La entrega llego completa, por eso solo se puede cerrar.'
                      : ((row.cant_ingresada || 0) > 0
                        ? 'Si la cierras con saldo pendiente, queda marcada como cierre dentro de tolerancia y se calcula el porcentaje de desviacion.'
                        : 'Todavia no ingresa nada. Si la cierras se registrara como cierre con saldo, revisa antes con el proveedor.')}
                  </div>
                </div>
                <div className="fld">
                  <label>Motivo de demora</label>
                  <select value={mot} onChange={e => setMot(e.target.value)}>
                    {MOTIVOS.map(v => <option key={v || 'none'} value={v}>{v || 'sin motivo'}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>Responsable de la accion</label>
                  <select value={resp} onChange={e => setResp(e.target.value)}>
                    {RESP.map(v => <option key={v || 'none'} value={v}>{v || 'sin asignar'}</option>)}
                  </select>
                </div>
                <div className="fld">
                  <label>Nueva fecha solicitada</label>
                  <input type="date" value={fec || ''} onChange={e => setFec(e.target.value)} />
                  <div className="hint">Si cambias esta fecha, la linea se marca como reprogramada y queda el registro de la fecha anterior.</div>
                </div>
                <div className="fld">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ margin: 0 }}>Fecha confirmada por proveedor</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 400, cursor: 'pointer', color: 'var(--ink2)' }}>
                      <input type="checkbox" checked={fecConf === fec && !!fec} onChange={e => setFecConf(e.target.checked ? fec : '')} />
                      Misma fecha solicitada
                    </label>
                  </div>
                  <input type="date" value={fecConf || ''} onChange={e => setFecConf(e.target.value)} />
                  <div className="hint">Si el proveedor confirma otra fecha, ingresala manualmente.</div>
                </div>
                <div className="fld">
                  <label>Ajuste excepcional de cantidad</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" style={{ width: 100 }} value={ajuste} onChange={e => setAjuste(e.target.value)} />
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>Original: {fmt(row.cant_programada)} → Total: {fmt((row.cant_programada || 0) + (Number(ajuste) || 0))}</span>
                  </div>
                  {(Number(ajuste) || 0) !== 0 && (
                    <input type="text" style={{ marginTop: 6 }} placeholder="Motivo del ajuste (ej. ruptura de stock)" value={motAjuste} onChange={e => setMotAjuste(e.target.value)} />
                  )}
                  <div className="hint">Solo para casos excepcionales como ruptura de stock. Positivo para aumentar, negativo para reducir. El campo original del Excel no se modifica.</div>
                </div>
                <div className="fld">
                  <label>Comentario</label>
                  <input type="text" placeholder="Que dijo el proveedor" value={com} onChange={e => setCom(e.target.value)} />
                </div>
                <button className="save" onClick={guardar} disabled={saving}>
                  {saving ? 'Guardando...' : (saved ? 'Guardado' : 'Guardar seguimiento')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
