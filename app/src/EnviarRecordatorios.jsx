import { useEffect, useMemo, useState } from 'react'
import { fmt } from './lib/derive'
import {
  cargarContactos, guardarContacto, cargarHistorial, registrarEnvio,
  generarAsunto, generarEmailHtml, enviarRecordatorio,
  nombreCorto, generarToken, estadoOutlook, autorizarOutlook,
} from './lib/recordatorioService'

function hace(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `hace ${min} min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const dias = Math.floor(hrs / 24)
  return `hace ${dias} dia${dias > 1 ? 's' : ''}`
}

const ALWAYS_CC = 'rramirez@roxfarma.com'
const BASE_URL = window.location.origin

function linkConfirmacion(proveedor) {
  return `${BASE_URL}/confirmar?token=${encodeURIComponent(generarToken(proveedor))}`
}

const norm = s => (s || '').trim().toUpperCase().replace(/\s+/g, ' ')

function buscarContacto(contactos, nombre) {
  const exacto = contactos.find(c => c.nombre === nombre)
  if (exacto) return exacto
  const n = norm(nombre)
  return contactos.find(c => norm(c.nombre) === n) || null
}

export default function EnviarRecordatorios({ rows, esEditor, avisoOutlook, onClose }) {
  const [contactos, setContactos] = useState([])
  const [historial, setHistorial] = useState([])
  const [rango, setRango] = useState('todas')
  const [buscar, setBuscar] = useState('')
  const [editEmail, setEditEmail] = useState({})
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [enviando, setEnviando] = useState(null)
  const [resultado, setResultado] = useState({})
  const [cargando, setCargando] = useState(true)
  const [errContactos, setErrContactos] = useState(null)
  const [aprobados, setAprobados] = useState({})
  const [confirmar, setConfirmar] = useState(false)
  const [asuntoEditado, setAsuntoEditado] = useState({})
  const [outlook, setOutlook] = useState(null)
  const [autorizando, setAutorizando] = useState(false)

  useEffect(() => {
    if (esEditor) estadoOutlook().then(setOutlook).catch(e => setOutlook({ error: e.message }))
  }, [esEditor])

  async function clickAutorizar() {
    setAutorizando(true)
    try {
      await autorizarOutlook()
    } catch (e) {
      alert(e.message)
      setAutorizando(false)
    }
  }

  useEffect(() => {
    Promise.all([
      cargarContactos().catch(e => { setErrContactos(e.message); return [] }),
      cargarHistorial().catch(() => []),
    ]).then(([c, h]) => {
      setContactos(c)
      setHistorial(h)
      setCargando(false)
    })
  }, [])

  const mesesDisponibles = useMemo(() => {
    const set = new Set()
    for (const r of rows) {
      if (r.abierto && r.fecha_programada_ingreso) set.add(r.fecha_programada_ingreso.slice(0, 7))
    }
    return [...set].sort()
  }, [rows])

  const porProveedor = useMemo(() => {
    const abiertas = rows.filter(r => r.abierto).filter(r => {
      if (rango === 'todas') return true
      const clave = r.fecha_programada_ingreso?.slice(0, 7)
      return clave === rango
    })

    const groups = new Map()
    for (const r of abiertas) {
      const prov = r.proveedor || 'Sin proveedor'
      if (!groups.has(prov)) groups.set(prov, [])
      groups.get(prov).push(r)
    }

    const bb = buscar.toLowerCase()
    return [...groups.entries()]
      .filter(([nombre]) => !bb || nombre.toLowerCase().includes(bb))
      .map(([nombre, filas]) => {
        const contacto = buscarContacto(contactos, nombre)
        const atrasadas = filas.filter(r => r.dd != null && r.dd < 0).length
        const ultimoEnvio = historial.find(h => h.proveedor === nombre)
        return { nombre, filas, contacto, atrasadas, ultimoEnvio }
      })
      .sort((a, b) => b.atrasadas - a.atrasadas || b.filas.length - a.filas.length)
  }, [rows, contactos, historial, rango, buscar])

  const conCorreo = porProveedor.filter(p => p.contacto?.correo)

  function toggleAprobado(nombre) {
    setAprobados(prev => ({ ...prev, [nombre]: !prev[nombre] }))
  }

  function aprobarTodos() {
    const nuevos = {}
    conCorreo.forEach(p => { nuevos[p.nombre] = true })
    setAprobados(nuevos)
  }

  function desaprobarTodos() {
    setAprobados({})
  }

  const aprobadosLista = conCorreo.filter(p => aprobados[p.nombre])

  async function guardarEmail(nombre, correo) {
    const existente = contactos.find(c => c.nombre === nombre)
    try {
      await guardarContacto({ id: existente?.id, nombre, correo })
      const nuevos = await cargarContactos()
      setContactos(nuevos)
    } catch (err) {
      alert('Error guardando contacto: ' + err.message)
    }
    setEditEmail(prev => { const n = { ...prev }; delete n[nombre]; return n })
  }

  async function enviarAprobados() {
    setConfirmar(false)
    for (const prov of aprobadosLista) {
      if (resultado[prov.nombre] === 'ok') continue
      setEnviando(prov.nombre)
      setResultado(prev => ({ ...prev, [prov.nombre]: null }))
      const html = generarEmailHtml(prov.nombre, prov.filas, linkConfirmacion(prov.nombre))
      const asuntoBase = generarAsunto(prov.nombre, prov.filas)
      const asunto = asuntoEditado[prov.nombre] || asuntoBase
      try {
        await enviarRecordatorio(
          prov.contacto.correo,
          prov.contacto.correo_cc || null,
          asunto,
          html,
        )
        await registrarEnvio(prov.nombre, prov.contacto.correo, prov.filas.length)
        setResultado(prev => ({ ...prev, [prov.nombre]: 'ok' }))
        setAprobados(prev => ({ ...prev, [prov.nombre]: false }))
      } catch (err) {
        setResultado(prev => ({ ...prev, [prov.nombre]: err.message }))
      }
      setEnviando(null)
    }
    const h = await cargarHistorial().catch(() => [])
    setHistorial(h)
  }

  async function copiarEmail(prov) {
    const html = generarEmailHtml(prov.nombre, prov.filas, linkConfirmacion(prov.nombre))
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([`Recordatorio de entregas pendientes - ${prov.nombre}`], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      setResultado(prev => ({ ...prev, [prov.nombre]: 'copiado' }))
      setTimeout(() => setResultado(prev => ({ ...prev, [prov.nombre]: null })), 2000)
    } catch {
      alert('No se pudo copiar. Usa "Vista previa" y copia desde ahi.')
    }
  }

  // --- Pantalla de confirmacion ---
  if (confirmar) {
    return (
      <div className="mdl-ov" onClick={() => setConfirmar(false)}>
        <div className="mdl" onClick={e => e.stopPropagation()}>
          <div className="mdl-h">
            <h2>Confirmar envio</h2>
            <button className="btn" onClick={() => setConfirmar(false)}>Cancelar</button>
          </div>
          <div className="mdl-b">
            <div className="conf-aviso">
              Vas a enviar <b>{aprobadosLista.length}</b> correo{aprobadosLista.length > 1 ? 's' : ''} de recordatorio a:
            </div>
            <div className="conf-lista">
              {aprobadosLista.map(p => (
                <div key={p.nombre} className="conf-fila">
                  <b>{p.nombre}</b>
                  <span className="dim">{p.contacto.correo}</span>
                  <span>{p.filas.length} entrega{p.filas.length > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            <div className="conf-btns">
              <button className="btn" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button className="btn act" onClick={enviarAprobados}>
                Si, enviar {aprobadosLista.length} correo{aprobadosLista.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Vista previa de un correo ---
  if (vistaPrevia) {
    const prov = porProveedor.find(p => p.nombre === vistaPrevia)
    if (!prov) { setVistaPrevia(null); return null }
    const html = generarEmailHtml(prov.nombre, prov.filas, linkConfirmacion(prov.nombre))
    const asuntoBase = generarAsunto(prov.nombre, prov.filas)
    const asuntoActual = asuntoEditado[prov.nombre] ?? asuntoBase
    const ccProv = prov.contacto?.correo_cc
    const ccCompleto = ccProv
      ? (ccProv.includes(ALWAYS_CC) ? ccProv : `${ccProv}; ${ALWAYS_CC}`)
      : ALWAYS_CC
    return (
      <div className="mdl-ov" onClick={() => setVistaPrevia(null)}>
        <div className="mdl mdl-wide" onClick={e => e.stopPropagation()}>
          <div className="mdl-h">
            <h2>Revisar correo — {prov.nombre}</h2>
            <a
              href="/contactos"
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ background: 'var(--acc)', color: '#fff', textDecoration: 'none', marginRight: 'auto' }}
            >Gestionar contactos</a>
            <button className="btn" onClick={() => setVistaPrevia(null)}>Volver</button>
          </div>
          <div className="mdl-b">
            <div className="prev-info">
              <span><b>Para:</b> {prov.contacto?.correo || '(sin correo)'}</span>
              <span><b>CC:</b> {ccCompleto}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b>Asunto:</b>
                <input
                  type="text"
                  value={asuntoActual}
                  onChange={e => setAsuntoEditado(prev => ({ ...prev, [prov.nombre]: e.target.value }))}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 4, fontSize: '12.5px' }}
                />
              </span>
              <span><b>Entregas:</b> {prov.filas.length} pendiente{prov.filas.length > 1 ? 's' : ''}{prov.atrasadas > 0 ? `, ${prov.atrasadas} atrasada${prov.atrasadas > 1 ? 's' : ''}` : ''}</span>
            </div>
            <div className="prev-frame">
              <iframe
                title="Vista previa"
                srcDoc={html}
                style={{ width: '100%', height: '500px', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }}
              />
            </div>
            <div className="prev-acts">
              <button className="btn act" onClick={() => copiarEmail(prov)}>
                {resultado[prov.nombre] === 'copiado' ? 'Copiado' : 'Copiar para pegar en Outlook'}
              </button>
              {prov.contacto?.correo && esEditor && (
                <label className="rec-check" style={{ marginLeft: 'auto' }}>
                  <input
                    type="checkbox"
                    checked={!!aprobados[prov.nombre]}
                    onChange={() => toggleAprobado(prov.nombre)}
                  />
                  Aprobar para envio
                </label>
              )}
            </div>
            {resultado[prov.nombre] === 'ok' && <div className="rec-ok">Enviado correctamente</div>}
            {resultado[prov.nombre] && resultado[prov.nombre] !== 'ok' && resultado[prov.nombre] !== 'copiado' && (
              <div className="rec-err">{resultado[prov.nombre]}</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- Lista principal ---
  return (
    <div className="mdl-ov" onClick={onClose}>
      <div className="mdl mdl-wide" onClick={e => e.stopPropagation()}>
        <div className="mdl-h">
          <h2>Recordatorios por correo</h2>
          <a
            href="/contactos"
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{ background: 'var(--acc)', color: '#fff', textDecoration: 'none' }}
          >Gestionar contactos</a>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="mdl-b">
          {avisoOutlook && (
            <div className={`rec-outlook ${avisoOutlook.ok ? 'ok' : 'err'}`}>
              {avisoOutlook.ok ? 'Listo: tu cuenta de Outlook quedó autorizada para enviar.' : `No se pudo autorizar Outlook: ${avisoOutlook.msg || 'error desconocido'}`}
            </div>
          )}
          {esEditor && outlook && (
            <div className="rec-outlook">
              {outlook.error ? <span>Outlook: {outlook.error}</span>
                : !outlook.configurado ? <span>Envío por Outlook: falta configurar en Vercel ({outlook.faltan.join(', ')}).</span>
                : outlook.autorizado ? <span>Envío desde <b>{outlook.cuenta || outlook.cuentaEsperada}</b>{outlook.actualizado_en ? ` · autorizado ${hace(outlook.actualizado_en)}` : ''}</span>
                : <span>Falta autorizar tu cuenta de Outlook ({outlook.cuentaEsperada}) para enviar.</span>}
              {outlook.configurado && !outlook.error && (
                <button className="btn-sm" onClick={clickAutorizar} disabled={autorizando}>
                  {autorizando ? 'Abriendo Microsoft…' : outlook.autorizado ? 'Volver a autorizar' : 'Autorizar Outlook'}
                </button>
              )}
            </div>
          )}
          <div className="mdl-ctrl">
            <select value={rango} onChange={e => setRango(e.target.value)}>
              <option value="todas">Todas las pendientes</option>
              {mesesDisponibles.map(m => (
                <option key={m} value={m}>{nombreCorto(m)}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Buscar proveedor..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>

          {cargando ? <div className="mdl-empty">Cargando contactos...</div> : (
            <>
              {errContactos && (
                <div className="rec-err" style={{ marginBottom: 10 }}>
                  No se pudieron cargar los contactos: {errContactos}. Los correos no van a aparecer hasta que se resuelva.
                </div>
              )}

              <div className="rec-resumen">
                <span>{fmt(porProveedor.length)} proveedores con entregas pendientes</span>
                <span className="dim">
                  {conCorreo.length} con correo, {porProveedor.length - conCorreo.length} sin correo
                </span>
                {aprobadosLista.length > 0 && (
                  <span className="rec-aprobados-cnt">{aprobadosLista.length} aprobado{aprobadosLista.length > 1 ? 's' : ''} para envio</span>
                )}
              </div>

              <div className="rec-lista">
                {porProveedor.length === 0 && (
                  <div className="mdl-empty">No hay proveedores con entregas pendientes en este periodo.</div>
                )}
                {porProveedor.map(prov => (
                  <div key={prov.nombre} className={`rec-prov ${prov.atrasadas > 0 ? 'rec-prov-atraso' : ''} ${aprobados[prov.nombre] ? 'rec-prov-ok' : ''} ${resultado[prov.nombre] === 'ok' ? 'rec-prov-sent' : ''}`}>
                    <div className="rec-prov-head">
                      <div className="rec-prov-nombre">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {prov.contacto?.correo && esEditor && (
                            <input
                              type="checkbox"
                              checked={!!aprobados[prov.nombre]}
                              onChange={() => toggleAprobado(prov.nombre)}
                              disabled={resultado[prov.nombre] === 'ok'}
                              title="Aprobar para envio"
                            />
                          )}
                          <b>{prov.nombre}</b>
                          {resultado[prov.nombre] === 'ok' && <span className="rec-tag-ok">Enviado</span>}
                          {aprobados[prov.nombre] && resultado[prov.nombre] !== 'ok' && <span className="rec-tag-aprob">Aprobado</span>}
                        </div>
                        <span className="rec-prov-cnt">
                          {prov.filas.length} entrega{prov.filas.length > 1 ? 's' : ''}
                          {prov.atrasadas > 0 && <span className="rec-atraso">{prov.atrasadas} atrasada{prov.atrasadas > 1 ? 's' : ''}</span>}
                        </span>
                      </div>
                      <div className="rec-prov-acciones">
                        <button className="btn-sm" onClick={() => setVistaPrevia(prov.nombre)}>Revisar correo</button>
                        <button className="btn-sm" onClick={() => copiarEmail(prov)}>
                          {resultado[prov.nombre] === 'copiado' ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                    <div className="rec-prov-email">
                      {editEmail[prov.nombre] !== undefined ? (
                        <form onSubmit={e => { e.preventDefault(); guardarEmail(prov.nombre, editEmail[prov.nombre]) }} className="rec-email-form">
                          <input
                            type="email"
                            placeholder="correo@proveedor.com"
                            value={editEmail[prov.nombre]}
                            onChange={e => setEditEmail(prev => ({ ...prev, [prov.nombre]: e.target.value }))}
                            autoFocus
                          />
                          <button type="submit" className="btn-sm">Guardar</button>
                          <button type="button" className="btn-sm" onClick={() => setEditEmail(prev => { const n = { ...prev }; delete n[prov.nombre]; return n })}>
                            Cancelar
                          </button>
                        </form>
                      ) : prov.contacto?.correo ? (
                        <span className="rec-email-val">
                          {prov.contacto.correo}
                          {esEditor && <button className="btn-link" onClick={() => setEditEmail(prev => ({ ...prev, [prov.nombre]: prov.contacto.correo }))}>editar</button>}
                        </span>
                      ) : (
                        <span className="rec-email-val dim">
                          Sin correo
                          {esEditor && <button className="btn-link" onClick={() => setEditEmail(prev => ({ ...prev, [prov.nombre]: '' }))}>+ agregar</button>}
                        </span>
                      )}
                      {prov.ultimoEnvio && (
                        <span className="rec-ultimo">Ultimo envio: {hace(prov.ultimoEnvio.enviado_en)}</span>
                      )}
                    </div>
                    {enviando === prov.nombre && <div className="rec-enviando">Enviando...</div>}
                    {resultado[prov.nombre] && resultado[prov.nombre] !== 'ok' && resultado[prov.nombre] !== 'copiado' && (
                      <div className="rec-err">{resultado[prov.nombre]}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="rec-footer">
                <div className="rec-footer-left">
                  {esEditor && conCorreo.length > 0 && (
                    <>
                      <button className="btn-sm" onClick={aprobadosLista.length === conCorreo.length ? desaprobarTodos : aprobarTodos}>
                        {aprobadosLista.length === conCorreo.length ? 'Desmarcar todos' : 'Aprobar todos'}
                      </button>
                    </>
                  )}
                </div>
                {esEditor && aprobadosLista.length > 0 && (
                  <button
                    className="btn act"
                    disabled={!!enviando}
                    onClick={() => setConfirmar(true)}
                  >
                    {enviando ? 'Enviando...' : `Enviar ${aprobadosLista.length} correo${aprobadosLista.length > 1 ? 's' : ''} aprobado${aprobadosLista.length > 1 ? 's' : ''}`}
                  </button>
                )}
              </div>

              {historial.length > 0 && (
                <div className="rec-hist">
                  <h3>Ultimos envios</h3>
                  {historial.slice(0, 10).map(h => (
                    <div key={h.id} className="rec-hist-fila">
                      <span><b>{h.proveedor}</b> — {h.correo_destino}</span>
                      <span>{h.entregas_incluidas} entregas</span>
                      <span className="dim">{hace(h.enviado_en)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="hint" style={{ marginTop: 12 }}>
            Revisa cada correo con "Revisar correo", marca los que apruebes, y dale "Enviar aprobados". Tambien puedes copiar y pegar directo en Outlook.
          </div>
        </div>
      </div>
    </div>
  )
}
