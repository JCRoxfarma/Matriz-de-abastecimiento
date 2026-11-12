import { useEffect, useState } from 'react'
import Icono from './Icono'
import ImportButton from './ImportButton'
import ImportIngresosButton from './ImportIngresosButton'
import { listarImportaciones } from './lib/importaciones'

const fechaHora = s => new Date(s).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const TIPO = { programacion: 'OC programadas', ingresos: 'Ingresos reales' }

function TarjetaArchivo({ u, titulo, boton, esEditor }) {
  return (
    <div className="arch-card">
      <div className="arch-ico"><Icono nombre="excel" tam={26} /></div>
      <div className="arch-info">
        <h3>{titulo}</h3>
        <div className="arch-arch">{u ? u.archivo : <span className="dim">Todavía no se ha subido</span>}</div>
        {u && <span className="arch-ok"><Icono nombre="check" tam={13} grosor={2.4} /> Actualizado</span>}
        {u && <div className="arch-fecha">Última actualización: {fechaHora(u.creado_en)}{u.filas != null ? ` · ${u.filas} filas` : ''}</div>}
        {esEditor && <div className="arch-btn">{boton}</div>}
      </div>
    </div>
  )
}

// Pestana "Archivos": los dos archivos que alimentan el seguimiento (Excel
// de OC programadas e ingresos reales a almacen), cuando se subio cada uno
// y el historial de importaciones. Los botones de importar viven aqui (antes
// estaban en la barra de Seguimiento OC).
export default function Archivos({ esEditor, onImportado }) {
  const [hist, setHist] = useState(null)
  const [err, setErr] = useState(null)

  const cargar = () => listarImportaciones(20).then(setHist).catch(e => setErr(e.message))
  useEffect(() => { cargar() }, [])

  const ultimo = tipo => hist?.find(h => h.tipo === tipo)
  const despuesDeImportar = () => { cargar(); onImportado?.() }

  return (
    <div className="arch">
      <div className="arch-h">
        <Icono nombre="carpeta" tam={22} />
        <div>
          <h2>Centro de archivos</h2>
          <div className="sub">Gestión de archivos de programación e ingresos</div>
        </div>
      </div>
      {err && <div className="empty">No se pudo cargar el historial: {err}</div>}

      <div className="arch-grid">
        <TarjetaArchivo u={ultimo('programacion')} esEditor={esEditor} titulo="Órdenes de compra programadas" boton={<ImportButton onDone={despuesDeImportar} />} />
        <TarjetaArchivo u={ultimo('ingresos')} esEditor={esEditor} titulo="Ingresos reales a almacén" boton={<ImportIngresosButton onDone={despuesDeImportar} />} />
      </div>
      <div className="pct" style={{ margin: '8px 2px 18px', whiteSpace: 'normal' }}>
        La explosión de materiales y el stock del sistema se cargan desde la pestaña Explosión de materiales.
      </div>

      <div className="arch-hist">
        <h3><Icono nombre="historial" tam={18} /> Historial de importaciones</h3>
        {!hist ? <div className="dim">Cargando...</div> : hist.length === 0 ? <div className="dim">Sin importaciones todavía.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="expl-mini">
              <thead><tr><th>Archivo</th><th>Tipo</th><th>Fecha y hora</th><th className="num">Filas</th><th>Estado</th></tr></thead>
              <tbody>
                {hist.map((h, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td>{h.archivo}</td>
                    <td>{TIPO[h.tipo] || h.tipo}</td>
                    <td className="mono">{fechaHora(h.creado_en)}</td>
                    <td className="num">{h.filas ?? '-'}</td>
                    <td><span className="arch-ok"><Icono nombre="check" tam={13} grosor={2.4} /> Exitoso</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
