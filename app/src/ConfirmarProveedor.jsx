import { useEffect, useState } from 'react'
import './App.css'

const fmt = n => n == null ? '' : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(n)
const fdate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y.slice(2)}` }

export default function ConfirmarProveedor() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')

  const [proveedor, setProveedor] = useState('')
  const [entregas, setEntregas] = useState([])
  const [fechas, setFechas] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (!token) { setError('No se proporcionó un token válido.'); setCargando(false); return }
    fetch(`/api/confirmar-entregas?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setCargando(false); return }
        setProveedor(data.proveedor)
        setEntregas(data.entregas)
        const f = {}
        data.entregas.forEach(e => { f[e.id] = e.fecha_confirmada || e.fecha_programada })
        setFechas(f)
        setCargando(false)
      })
      .catch(e => { setError(e.message); setCargando(false) })
  }, [token])

  function setFecha(id, val) {
    setFechas(prev => ({ ...prev, [id]: val }))
  }

  function usarMismaFecha(id) {
    const ent = entregas.find(e => e.id === id)
    if (ent) setFecha(id, ent.fecha_programada)
  }

  async function enviar() {
    setEnviando(true)
    setResultado(null)
    const confirmaciones = entregas.map(e => ({ id: e.id, fecha: fechas[e.id] || null })).filter(c => c.fecha)
    try {
      const res = await fetch('/api/confirmar-entregas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, confirmaciones }),
      })
      const data = await res.json()
      if (data.error) { setResultado({ ok: false, msg: data.error }); setEnviando(false); return }
      setResultado({ ok: true, msg: `${data.confirmados} entrega${data.confirmados > 1 ? 's' : ''} confirmada${data.confirmados > 1 ? 's' : ''} exitosamente.` })
      setEntregas(prev => prev.map(e => ({ ...e, fecha_confirmada: fechas[e.id] || e.fecha_confirmada })))
    } catch (e) {
      setResultado({ ok: false, msg: e.message })
    }
    setEnviando(false)
  }

  const yaConfirmadas = entregas.filter(e => e.fecha_confirmada).length
  const sinConfirmar = entregas.length - yaConfirmadas

  if (cargando) return (
    <div className="conf-page">
      <div className="conf-card">
        <div className="conf-loading">Cargando entregas...</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="conf-page">
      <div className="conf-card">
        <div className="conf-header-bar">
          <h1>Confirmación de entregas</h1>
        </div>
        <div className="conf-error">{error}</div>
      </div>
    </div>
  )

  return (
    <div className="conf-page">
      <div className="conf-card">
        <div className="conf-header-bar">
          <div>
            <h1>Confirmación de fechas de entrega</h1>
            <p className="conf-subtitle">Roxfarma S.A. — Materiales de empaque</p>
          </div>
        </div>

        <div className="conf-proveedor">
          <span className="conf-prov-label">Proveedor</span>
          <span className="conf-prov-nombre">{proveedor}</span>
        </div>

        {sinConfirmar > 0 && (
          <div className="conf-aviso-pend">
            Tiene <b>{sinConfirmar}</b> entrega{sinConfirmar > 1 ? 's' : ''} pendiente{sinConfirmar > 1 ? 's' : ''} de confirmar.
            Por favor revise las fechas y confirme.
          </div>
        )}

        {resultado && (
          <div className={`conf-resultado ${resultado.ok ? 'conf-ok' : 'conf-err'}`}>
            {resultado.msg}
          </div>
        )}

        <div className="conf-tabla-wrap">
          <table className="conf-tabla">
            <thead>
              <tr>
                <th>OC</th>
                <th>SKU</th>
                <th>Material</th>
                <th style={{ textAlign: 'right' }}>Cant. pendiente</th>
                <th>F. solicitada</th>
                <th>Confirmar fecha</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map(e => {
                const confirmada = e.fecha_confirmada || (resultado?.ok && fechas[e.id])
                return (
                  <tr key={e.id} className={confirmada ? 'conf-fila-ok' : ''}>
                    <td className="conf-mono">{e.oc}</td>
                    <td className="conf-mono">{e.sku}</td>
                    <td>{e.descripcion || ''}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(e.cantidad)}</td>
                    <td className="conf-mono">{fdate(e.fecha_programada)}</td>
                    <td>
                      <div className="conf-fecha-cell">
                        <input
                          type="date"
                          value={fechas[e.id] || ''}
                          onChange={ev => setFecha(e.id, ev.target.value)}
                          disabled={resultado?.ok}
                          className="conf-date-input"
                        />
                        {fechas[e.id] !== e.fecha_programada && !resultado?.ok && (
                          <button className="conf-btn-misma" onClick={() => usarMismaFecha(e.id)} title="Usar fecha solicitada">
                            = solicitada
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {confirmada
                        ? <span className="tag t-grn">Confirmada</span>
                        : <span className="tag t-amb">Pendiente</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {entregas.length === 0 && (
          <div className="conf-empty">No tiene entregas pendientes en este momento.</div>
        )}

        {entregas.length > 0 && !resultado?.ok && (
          <div className="conf-footer">
            <p className="conf-hint">
              Revise cada fecha. Si la fecha de entrega cambia, modifíquela directamente.
              Al confirmar, Roxfarma recibirá la notificación automáticamente.
            </p>
            <button
              className="conf-btn-enviar"
              onClick={enviar}
              disabled={enviando}
            >
              {enviando ? 'Confirmando...' : `Confirmar ${entregas.length} entrega${entregas.length > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {resultado?.ok && (
          <div className="conf-footer">
            <p className="conf-gracias">
              Gracias por confirmar sus entregas. Roxfarma ya recibió la información.
              Puede cerrar esta página.
            </p>
          </div>
        )}

        <div className="conf-pie">
          Sistema de seguimiento de materiales de empaque — Roxfarma S.A.
        </div>
      </div>
    </div>
  )
}
