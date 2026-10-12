import { useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate, fmtM } from './lib/derive'
import { ETAPAS, etapasVisibles, calcularEtapa, contarDocs, guardarSeguimientoOI } from './lib/seguimientoOI'

const INCOTERMS = ['EXW', 'FOB', 'CFR', 'CIF', 'DDP', 'DAP']
const TRANSPORTES = ['Maritimo', 'Aereo', 'Terrestre']

export default function PanelOI({ row, esEditor, onClose, onSaved }) {
  const s = row.seg || {}
  const [form, setForm] = useState({
    incoterm: s.incoterm || '',
    cantidad_lista: s.cantidad_lista ?? '',
    fecha_disponibilidad: s.fecha_disponibilidad || '',
    docs_preliminares: s.docs_preliminares || false,
    docs_preliminares_detalle: s.docs_preliminares_detalle || '',
    fecha_recojo: s.fecha_recojo || '',
    horario_carga: s.horario_carga || '',
    direccion_recojo: s.direccion_recojo || '',
    etd: s.etd || '',
    eta: s.eta || '',
    bl_awb: s.bl_awb || '',
    medio_transporte: s.medio_transporte || '',
    confirmacion_salida: s.confirmacion_salida || false,
    naviera_aerolinea: s.naviera_aerolinea || '',
    agente_carga: s.agente_carga || '',
    doc_factura_comercial: s.doc_factura_comercial || false,
    doc_packing_list: s.doc_packing_list || false,
    doc_bl_awb: s.doc_bl_awb || false,
    doc_certificado_origen: s.doc_certificado_origen || false,
    doc_seguro: s.doc_seguro || false,
    doc_ficha_tecnica: s.doc_ficha_tecnica || false,
    numero_dua: s.numero_dua || '',
    fecha_numeracion: s.fecha_numeracion || '',
    monto_preliquidacion: s.monto_preliquidacion ?? '',
    aprobacion_interna: s.aprobacion_interna || false,
    fecha_pago_derechos: s.fecha_pago_derechos || '',
    constancia_pago: s.constancia_pago || '',
    confirmacion_agente: s.confirmacion_agente || false,
    fecha_levante: s.fecha_levante || '',
    volante_enviado: s.volante_enviado || false,
    carga_liberada: s.carga_liberada || false,
    fecha_liberacion: s.fecha_liberacion || '',
    fecha_ingreso_almacen: s.fecha_ingreso_almacen || '',
    observaciones_ingreso: s.observaciones_ingreso || '',
  })
  const [fechaProg, setFechaProg] = useState(row.fecha_programada_ingreso || '')
  const [diasPostEta, setDiasPostEta] = useState(7)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandido, setExpandido] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const etapaActual = calcularEtapa(form, row)
  const visibles = etapasVisibles(form.incoterm)

  function calcularDesdeEta() {
    if (!form.eta) return
    const d = new Date(form.eta + 'T00:00:00')
    d.setDate(d.getDate() + diasPostEta)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setFechaProg(iso)
  }

  async function guardar() {
    setSaving(true)
    const patch = { ...form }
    patch.cantidad_lista = patch.cantidad_lista === '' ? null : Number(patch.cantidad_lista)
    patch.monto_preliquidacion = patch.monto_preliquidacion === '' ? null : Number(patch.monto_preliquidacion)
    for (const k of ['fecha_disponibilidad', 'fecha_recojo', 'etd', 'eta', 'fecha_numeracion', 'fecha_pago_derechos', 'fecha_levante', 'fecha_liberacion', 'fecha_ingreso_almacen']) {
      if (!patch[k]) patch[k] = null
    }
    for (const k of ['docs_preliminares_detalle', 'horario_carga', 'direccion_recojo', 'bl_awb', 'medio_transporte', 'naviera_aerolinea', 'agente_carga', 'numero_dua', 'constancia_pago', 'observaciones_ingreso', 'incoterm']) {
      if (!patch[k]) patch[k] = null
    }
    try {
      await guardarSeguimientoOI(row.id_entrega, patch)
      const fechaProgChanged = fechaProg && fechaProg !== row.fecha_programada_ingreso
      if (fechaProgChanged) {
        const { error } = await supabase.from('programacion_oc')
          .update({ fecha_programada_ingreso: fechaProg })
          .eq('id_entrega', row.id_entrega)
        if (error) throw error
      }
      onSaved(patch, fechaProgChanged ? fechaProg : null)
      setSaved(true)
      setTimeout(() => setSaved(false), 1400)
    } catch (err) {
      alert('No se pudo guardar: ' + err.message)
    }
    setSaving(false)
  }

  function stepClass(n) {
    if (etapaActual > n) return 'oi-step done'
    if (etapaActual === n) return 'oi-step active'
    return 'oi-step pending'
  }

  function toggleExpand(n) {
    setExpandido(prev => prev === n ? null : n)
  }

  function isExpanded(n) {
    return expandido === n || etapaActual === n
  }

  return (
    <>
      <div className="ov on" onClick={onClose} />
      <div className="pn on pn-oi">
        <div className="ph">
          <button className="x" onClick={onClose}>&times;</button>
          <h2>{row.descripcion || row.sku}</h2>
          <p>OI {row.oc} &middot; SKU {row.sku} &middot; entrega {row.entN} de {row.entTot}</p>
        </div>
        <div className="pb">
          <div className="sec">
            <h3>Datos de la OI</h3>
            <div className="kv"><span>Proveedor</span><b>{row.proveedor || ''}</b></div>
            <div className="kv"><span>Comprador</span><b>{row.comprador || 'Sin asignar'}</b></div>
            <div className="kv"><span>Cantidad programada</span><b>{fmt(row.cant_programada)}</b></div>
            <div className="kv"><span>Cantidad ingresada</span><b>{fmt(row.cant_ingresada)}</b></div>
            <div className="kv"><span>Saldo pendiente</span><b style={{ color: row.saldo_pendiente > 0 ? 'var(--red)' : 'var(--ink3)' }}>{fmt(row.saldo_pendiente)}</b></div>
            {esEditor ? (
              <div className="fld">
                <label>Fecha programada ingreso</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="date" value={fechaProg} onChange={e => setFechaProg(e.target.value)} />
                  {form.eta && (
                    <>
                      <span className="hint" style={{ margin: 0, whiteSpace: 'nowrap' }}>ETA +</span>
                      <input type="number" value={diasPostEta} onChange={e => setDiasPostEta(Number(e.target.value) || 0)} style={{ width: 50 }} min={0} />
                      <span className="hint" style={{ margin: 0 }}>d</span>
                      <button type="button" className="btn" onClick={calcularDesdeEta} style={{ whiteSpace: 'nowrap' }}>Calcular</button>
                    </>
                  )}
                </div>
                {form.eta && <div className="hint">ETA: {fdate(form.eta)}{fechaProg !== row.fecha_programada_ingreso ? ' — fecha modificada, se guardará al presionar Guardar' : ''}</div>}
              </div>
            ) : (
              <div className="kv"><span>Fecha programada</span><b>{fdate(row.fecha_programada_ingreso)}</b></div>
            )}
            {row.fecha_real_ingreso && <div className="kv"><span>Fecha real de ingreso</span><b style={{ color: 'var(--grn)' }}>{fdate(row.fecha_real_ingreso)}</b></div>}
            <div className="kv"><span>Precio unitario</span><b>{fmtM(row.precio_unitario, row.moneda)}</b></div>
            <div className="kv"><span>Valor entrega</span><b>{fmtM(row.valor_entrega, row.moneda)}</b></div>
          </div>

          {!esEditor && (
            <div className="sec">
              <div className="lock">
                <div className="lockt">Solo lectura</div>
                <div className="lockd">Tu cuenta puede ver el seguimiento, pero no editarlo.</div>
              </div>
            </div>
          )}

          <div className="sec">
            <h3>Seguimiento de importación</h3>
            {esEditor && (
              <div className="fld" style={{ marginBottom: 16 }}>
                <label>Incoterm</label>
                <select value={form.incoterm} onChange={e => set('incoterm', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {INCOTERMS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="hint">Determina qué etapas del seguimiento aplican.</div>
              </div>
            )}
            {!esEditor && form.incoterm && (
              <div className="kv" style={{ marginBottom: 12 }}><span>Incoterm</span><b>{form.incoterm}</b></div>
            )}

            <div className="oi-pipeline">
              {visibles.map(et => (
                <div key={et.n} className={stepClass(et.n)}>
                  <div className="oi-step-head" onClick={() => toggleExpand(et.n)}>
                    <span className="oi-dot" />
                    <span className="oi-step-label">{et.l}</span>
                    {etapaActual > et.n && <span className="tag t-grn" style={{ marginLeft: 'auto', fontSize: 11 }}>Completo</span>}
                    {etapaActual === et.n && <span className="tag t-blu" style={{ marginLeft: 'auto', fontSize: 11 }}>En curso</span>}
                  </div>

                  {isExpanded(et.n) && (
                    <div className="oi-step-body">
                      {et.n === 1 && <>
                        {esEditor ? <>
                          <div className="fld"><label>Cantidad lista</label><input type="number" value={form.cantidad_lista} onChange={e => set('cantidad_lista', e.target.value)} /></div>
                          <div className="fld"><label>Fecha de disponibilidad</label><input type="date" value={form.fecha_disponibilidad} onChange={e => set('fecha_disponibilidad', e.target.value)} /></div>
                          <div className="fld">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={form.docs_preliminares} onChange={e => set('docs_preliminares', e.target.checked)} />
                              Documentos preliminares recibidos
                            </label>
                          </div>
                          {form.docs_preliminares && <div className="fld"><label>Detalle de documentos</label><input type="text" value={form.docs_preliminares_detalle} onChange={e => set('docs_preliminares_detalle', e.target.value)} placeholder="Qué documentos enviaron" /></div>}
                        </> : <>
                          <div className="kv"><span>Cantidad lista</span><b>{form.cantidad_lista ? fmt(Number(form.cantidad_lista)) : '-'}</b></div>
                          <div className="kv"><span>Fecha disponibilidad</span><b>{fdate(form.fecha_disponibilidad) || '-'}</b></div>
                          <div className="kv"><span>Docs preliminares</span><b>{form.docs_preliminares ? 'Sí' : 'No'}</b></div>
                          {form.docs_preliminares_detalle && <div className="kv"><span>Detalle</span><b>{form.docs_preliminares_detalle}</b></div>}
                        </>}
                      </>}

                      {et.n === 2 && <>
                        {esEditor ? <>
                          <div className="fld"><label>Fecha de recojo</label><input type="date" value={form.fecha_recojo} onChange={e => set('fecha_recojo', e.target.value)} /></div>
                          <div className="fld"><label>Horario de carga</label><input type="text" value={form.horario_carga} onChange={e => set('horario_carga', e.target.value)} placeholder="Ej. 8:00 - 12:00" /></div>
                          <div className="fld"><label>Dirección de recojo</label><input type="text" value={form.direccion_recojo} onChange={e => set('direccion_recojo', e.target.value)} /></div>
                        </> : <>
                          <div className="kv"><span>Fecha recojo</span><b>{fdate(form.fecha_recojo) || '-'}</b></div>
                          <div className="kv"><span>Horario</span><b>{form.horario_carga || '-'}</b></div>
                          <div className="kv"><span>Dirección</span><b>{form.direccion_recojo || '-'}</b></div>
                        </>}
                      </>}

                      {et.n === 3 && <>
                        {esEditor ? <>
                          <div className="fld"><label>Medio de transporte</label>
                            <select value={form.medio_transporte} onChange={e => set('medio_transporte', e.target.value)}>
                              <option value="">Seleccionar</option>
                              {TRANSPORTES.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                          <div className="fld"><label>Naviera / Aerolínea</label><input type="text" value={form.naviera_aerolinea} onChange={e => set('naviera_aerolinea', e.target.value)} /></div>
                          <div className="fld"><label>Agente de carga</label><input type="text" value={form.agente_carga} onChange={e => set('agente_carga', e.target.value)} /></div>
                          <div className="fld"><label>ETD (salida estimada)</label><input type="date" value={form.etd} onChange={e => set('etd', e.target.value)} /></div>
                          <div className="fld"><label>ETA (llegada estimada)</label><input type="date" value={form.eta} onChange={e => set('eta', e.target.value)} /></div>
                          <div className="fld"><label>BL / AWB</label><input type="text" value={form.bl_awb} onChange={e => set('bl_awb', e.target.value)} /></div>
                          <div className="fld">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={form.confirmacion_salida} onChange={e => set('confirmacion_salida', e.target.checked)} />
                              Salida internacional confirmada
                            </label>
                          </div>
                        </> : <>
                          <div className="kv"><span>Transporte</span><b>{form.medio_transporte || '-'}</b></div>
                          <div className="kv"><span>Naviera / Aerolínea</span><b>{form.naviera_aerolinea || '-'}</b></div>
                          <div className="kv"><span>Agente de carga</span><b>{form.agente_carga || '-'}</b></div>
                          <div className="kv"><span>ETD</span><b>{fdate(form.etd) || '-'}</b></div>
                          <div className="kv"><span>ETA</span><b>{fdate(form.eta) || '-'}</b></div>
                          <div className="kv"><span>BL / AWB</span><b>{form.bl_awb || '-'}</b></div>
                          <div className="kv"><span>Salida confirmada</span><b>{form.confirmacion_salida ? 'Sí' : 'No'}</b></div>
                        </>}
                      </>}

                      {et.n === 4 && <>
                        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>{contarDocs(form)} de 6 documentos</div>
                        {esEditor ? <>
                          {[
                            ['doc_factura_comercial', 'Factura comercial'],
                            ['doc_packing_list', 'Packing list'],
                            ['doc_bl_awb', 'BL / AWB'],
                            ['doc_certificado_origen', 'Certificado de origen'],
                            ['doc_seguro', 'Seguro'],
                            ['doc_ficha_tecnica', 'Ficha técnica'],
                          ].map(([k, label]) => (
                            <label key={k} className="oi-check">
                              <input type="checkbox" checked={form[k]} onChange={e => set(k, e.target.checked)} />
                              {label}
                            </label>
                          ))}
                        </> : <>
                          {[
                            ['doc_factura_comercial', 'Factura comercial'],
                            ['doc_packing_list', 'Packing list'],
                            ['doc_bl_awb', 'BL / AWB'],
                            ['doc_certificado_origen', 'Certificado de origen'],
                            ['doc_seguro', 'Seguro'],
                            ['doc_ficha_tecnica', 'Ficha técnica'],
                          ].map(([k, label]) => (
                            <div key={k} className="kv"><span>{label}</span><b>{form[k] ? 'Sí' : 'No'}</b></div>
                          ))}
                        </>}
                      </>}

                      {et.n === 5 && <>
                        {esEditor ? <>
                          <div className="fld"><label>Número DUA</label><input type="text" value={form.numero_dua} onChange={e => set('numero_dua', e.target.value)} /></div>
                          <div className="fld"><label>Fecha de numeración</label><input type="date" value={form.fecha_numeracion} onChange={e => set('fecha_numeracion', e.target.value)} /></div>
                          <div className="fld"><label>Monto preliquidación</label><input type="number" value={form.monto_preliquidacion} onChange={e => set('monto_preliquidacion', e.target.value)} /></div>
                          <div className="fld">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={form.aprobacion_interna} onChange={e => set('aprobacion_interna', e.target.checked)} />
                              Aprobación interna obtenida
                            </label>
                          </div>
                        </> : <>
                          <div className="kv"><span>DUA</span><b>{form.numero_dua || '-'}</b></div>
                          <div className="kv"><span>Fecha numeración</span><b>{fdate(form.fecha_numeracion) || '-'}</b></div>
                          <div className="kv"><span>Monto preliquidación</span><b>{form.monto_preliquidacion ? fmt(Number(form.monto_preliquidacion)) : '-'}</b></div>
                          <div className="kv"><span>Aprobación interna</span><b>{form.aprobacion_interna ? 'Sí' : 'No'}</b></div>
                        </>}
                      </>}

                      {et.n === 6 && <>
                        {esEditor ? <>
                          <div className="fld"><label>Fecha de pago</label><input type="date" value={form.fecha_pago_derechos} onChange={e => set('fecha_pago_derechos', e.target.value)} /></div>
                          <div className="fld"><label>Constancia de pago</label><input type="text" value={form.constancia_pago} onChange={e => set('constancia_pago', e.target.value)} placeholder="Número o referencia" /></div>
                          <div className="fld">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={form.confirmacion_agente} onChange={e => set('confirmacion_agente', e.target.checked)} />
                              Confirmación de pago al agente de aduana
                            </label>
                          </div>
                        </> : <>
                          <div className="kv"><span>Fecha pago</span><b>{fdate(form.fecha_pago_derechos) || '-'}</b></div>
                          <div className="kv"><span>Constancia</span><b>{form.constancia_pago || '-'}</b></div>
                          <div className="kv"><span>Confirmación agente</span><b>{form.confirmacion_agente ? 'Sí' : 'No'}</b></div>
                        </>}
                      </>}

                      {et.n === 7 && <>
                        {esEditor ? <>
                          <div className="fld"><label>Fecha de levante</label><input type="date" value={form.fecha_levante} onChange={e => set('fecha_levante', e.target.value)} /></div>
                          <div className="fld">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={form.volante_enviado} onChange={e => set('volante_enviado', e.target.checked)} />
                              Volante enviado
                            </label>
                          </div>
                          <div className="fld">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={form.carga_liberada} onChange={e => set('carga_liberada', e.target.checked)} />
                              Carga liberada
                            </label>
                          </div>
                          {form.carga_liberada && <div className="fld"><label>Fecha de liberación</label><input type="date" value={form.fecha_liberacion} onChange={e => set('fecha_liberacion', e.target.value)} /></div>}
                        </> : <>
                          <div className="kv"><span>Fecha levante</span><b>{fdate(form.fecha_levante) || '-'}</b></div>
                          <div className="kv"><span>Volante enviado</span><b>{form.volante_enviado ? 'Sí' : 'No'}</b></div>
                          <div className="kv"><span>Carga liberada</span><b>{form.carga_liberada ? 'Sí' : 'No'}</b></div>
                          {form.carga_liberada && <div className="kv"><span>Fecha liberación</span><b>{fdate(form.fecha_liberacion) || '-'}</b></div>}
                        </>}
                      </>}

                      {et.n === 8 && <>
                        {row.cant_ingresada > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--grn)', marginBottom: 8, fontWeight: 500 }}>
                            Ingresado: {fmt(row.cant_ingresada)} de {fmt(row.cant_programada)} ({(row.avance * 100).toFixed(0)}%)
                            {row.saldo_pendiente > 0 && <span style={{ color: 'var(--amb)' }}> — faltan {fmt(row.saldo_pendiente)}</span>}
                          </div>
                        )}
                        {row.fecha_real_ingreso && (
                          <div className="kv"><span>Fecha real de ingreso</span><b style={{ color: 'var(--grn)' }}>{fdate(row.fecha_real_ingreso)}</b></div>
                        )}
                        {esEditor ? <>
                          <div className="fld"><label>Fecha ingreso a almacén</label><input type="date" value={form.fecha_ingreso_almacen} onChange={e => set('fecha_ingreso_almacen', e.target.value)} /></div>
                          <div className="fld"><label>Observaciones</label><input type="text" value={form.observaciones_ingreso} onChange={e => set('observaciones_ingreso', e.target.value)} placeholder="Notas sobre el ingreso" /></div>
                        </> : <>
                          <div className="kv"><span>Fecha ingreso</span><b>{fdate(form.fecha_ingreso_almacen) || '-'}</b></div>
                          <div className="kv"><span>Observaciones</span><b>{form.observaciones_ingreso || '-'}</b></div>
                        </>}
                      </>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {esEditor && (
            <button className="save" onClick={guardar} disabled={saving}>
              {saving ? 'Guardando...' : (saved ? 'Guardado' : 'Guardar seguimiento')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
