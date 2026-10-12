import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { useSesion } from './lib/auth'
import { fetchAll } from './lib/importer'
import {
  cargarContactos, guardarContacto,
} from './lib/recordatorioService'
import Login from './Login'
import './App.css'

function parseEmails(s) {
  if (!s) return []
  return s.split(/[;,]\s*/).map(e => e.trim()).filter(Boolean)
}

export default function Contactos() {
  const { sesion, perfil, cargando } = useSesion()
  const [proveedores, setProveedores] = useState([])
  const [contactos, setContactos] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null)
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState('all')
  const [toast, setToast] = useState(null)

  const [edCorreo, setEdCorreo] = useState('')
  const [edCc, setEdCc] = useState('')
  const [edTel, setEdTel] = useState('')

  async function cargar() {
    setLoading(true)
    try {
      const [provData, contData] = await Promise.all([
        fetchAll('programacion_oc', 'proveedor'),
        cargarContactos(),
      ])
      const unique = [...new Set((provData || []).map(r => r.proveedor).filter(Boolean))].sort()
      setProveedores(unique)
      setContactos(contData || [])
    } catch (e) {
      mostrarToast('Error cargando datos: ' + e.message, false)
    }
    setLoading(false)
  }

  useEffect(() => { if (sesion) cargar() }, [sesion?.user?.id])

  function getContacto(nombre) {
    const norm = s => (s || '').trim().toUpperCase().replace(/\s+/g, ' ')
    const exacto = contactos.find(c => c.nombre === nombre)
    if (exacto) return exacto
    const n = norm(nombre)
    return contactos.find(c => norm(c.nombre) === n) || null
  }

  function mostrarToast(msg, ok) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function iniciarEdicion(nombre) {
    const c = getContacto(nombre)
    setEditando(nombre)
    setEdCorreo(c?.correo || '')
    setEdCc(c?.correo_cc || '')
    setEdTel(c?.telefono || '')
  }

  async function guardar(nombre) {
    const c = getContacto(nombre)
    try {
      await guardarContacto({
        id: c?.id,
        nombre,
        correo: edCorreo.trim() || null,
        correo_cc: edCc.trim() || null,
        telefono: edTel.trim() || null,
      })
      const nuevos = await cargarContactos()
      setContactos(nuevos)
      setEditando(null)
      mostrarToast('Contacto guardado', true)
    } catch (e) {
      mostrarToast('Error: ' + e.message, false)
    }
  }

  const conCorreo = useMemo(() => proveedores.filter(p => { const c = getContacto(p); return c && c.correo }).length, [proveedores, contactos])
  const conCc = useMemo(() => proveedores.filter(p => { const c = getContacto(p); return c && c.correo_cc }).length, [proveedores, contactos])

  const filtrados = useMemo(() => {
    const q = buscar.toLowerCase()
    return proveedores.filter(p => {
      if (q && !p.toLowerCase().includes(q)) return false
      const c = getContacto(p)
      if (filtro === 'with' && !(c && c.correo)) return false
      if (filtro === 'without' && c && c.correo) return false
      return true
    })
  }, [proveedores, contactos, buscar, filtro])

  if (cargando) return <div className="empty">Cargando...</div>
  if (!sesion) return <Login />
  if (!perfil) return <div className="empty">Cargando tu perfil...</div>

  return (
    <div className="wrap">
      <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, color: 'var(--blu)', textDecoration: 'none', fontSize: 13 }}>
        &larr; Volver al seguimiento
      </a>
      <h1 style={{ marginBottom: 4 }}>Contactos de Proveedores</h1>
      <p style={{ color: 'var(--ink3)', fontSize: 13, marginBottom: 20 }}>
        Gestiona los correos y datos de contacto de cada proveedor para los recordatorios
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { n: proveedores.length, l: 'Proveedores' },
          { n: conCorreo, l: 'Con correo principal' },
          { n: conCc, l: 'Con correos CC' },
          { n: proveedores.length - conCorreo, l: 'Sin correo' },
        ].map(s => (
          <div key={s.l} className="kpi" style={{ cursor: 'default', minWidth: 140 }}>
            <div className="vl" style={{ fontSize: 22 }}>{s.n}</div>
            <div className="lb">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="bar" style={{ marginBottom: 16 }}>
        <input type="text" placeholder="Buscar proveedor..." value={buscar} onChange={e => setBuscar(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="all">Todos</option>
          <option value="with">Con correo</option>
          <option value="without">Sin correo</option>
        </select>
      </div>

      {loading ? <div className="empty">Cargando proveedores...</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(480px,1fr))', gap: 16 }}>
          {filtrados.map(nombre => {
            const c = getContacto(nombre)
            const hasEmail = c && c.correo
            const isEditing = editando === nombre

            return (
              <div key={nombre} style={{ background: 'var(--card)', borderRadius: 10, border: '1px solid var(--line)', overflow: 'hidden' }}>
                <div style={{ background: 'var(--acc)', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 13 }}>{nombre}</b>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, fontWeight: 500, background: hasEmail ? 'var(--grn)' : 'var(--amb)', color: '#fff' }}>
                    {hasEmail ? 'Configurado' : 'Sin correo'}
                  </span>
                </div>
                <div style={{ padding: 16 }}>
                  {isEditing ? (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <div className="lb" style={{ marginBottom: 4 }}>Correo principal (Para)</div>
                        <input className="fld" type="email" value={edCorreo} onChange={e => setEdCorreo(e.target.value)} placeholder="correo@proveedor.com" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }} />
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div className="lb" style={{ marginBottom: 4 }}>Correos en copia (CC) <span style={{ fontWeight: 400, color: 'var(--ink3)', fontSize: 11 }}>separar con punto y coma (;)</span></div>
                        <textarea value={edCc} onChange={e => setEdCc(e.target.value)} placeholder="ventas@prov.com; logistica@prov.com" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 36 }} />
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div className="lb" style={{ marginBottom: 4 }}>Telefono</div>
                        <input className="fld" type="text" value={edTel} onChange={e => setEdTel(e.target.value)} placeholder="999 999 999" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <div className="lb" style={{ marginBottom: 4 }}>Correo principal (Para)</div>
                        {hasEmail
                          ? <span className="tag t-blu" style={{ fontSize: 12 }}>{c.correo}</span>
                          : <span className="dim" style={{ fontSize: 12, fontStyle: 'italic' }}>Sin correo configurado</span>
                        }
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <div className="lb" style={{ marginBottom: 4 }}>Correos en copia (CC)</div>
                        {parseEmails(c?.correo_cc).length > 0
                          ? parseEmails(c.correo_cc).map(e => <span key={e} className="tag t-blu" style={{ fontSize: 12, marginRight: 4 }}>{e}</span>)
                          : <span className="dim" style={{ fontSize: 12, fontStyle: 'italic' }}>Sin correos en copia</span>
                        }
                      </div>
                      <div>
                        <div className="lb" style={{ marginBottom: 4 }}>Telefono</div>
                        <span style={{ fontSize: 12, color: c?.telefono ? 'var(--ink)' : 'var(--ink3)', fontStyle: c?.telefono ? 'normal' : 'italic' }}>
                          {c?.telefono || 'Sin telefono'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {isEditing ? (
                    <>
                      <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
                      <button className="btn act" onClick={() => guardar(nombre)}>Guardar</button>
                    </>
                  ) : (
                    <button className="btn" onClick={() => iniciarEdicion(nombre)}>Editar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {filtrados.length === 0 && !loading && (
        <div className="empty">No se encontraron proveedores con estos filtros.</div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, padding: '12px 20px', borderRadius: 8,
          color: '#fff', fontSize: 13, zIndex: 9999, background: toast.ok ? 'var(--grn)' : 'var(--red)',
          animation: 'fadeIn .3s',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
