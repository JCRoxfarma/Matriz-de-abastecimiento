import { useEffect, useMemo, useState } from 'react'
import { TIPOS, TIPO_LABEL, guardarLeadTimeTipo, guardarLeadTimeMaterial } from './lib/leadTime'

// Campo de dias que guarda al salir del cuadro (o con Enter), no en cada
// tecla. Vacio = sin valor.
function CampoDias({ valor, placeholder, disabled, onGuardar }) {
  const [texto, setTexto] = useState(valor ?? '')
  const [estado, setEstado] = useState(null)
  useEffect(() => { setTexto(valor ?? '') }, [valor])

  async function guardar() {
    const limpio = String(texto).trim()
    const nuevo = limpio === '' ? null : parseInt(limpio, 10)
    if (limpio !== '' && (isNaN(nuevo) || nuevo < 0)) { setTexto(valor ?? ''); return }
    if (nuevo === (valor ?? null)) return
    setEstado('guardando')
    try {
      await onGuardar(nuevo)
      setEstado('ok')
      setTimeout(() => setEstado(null), 1200)
    } catch (e) {
      setEstado(null)
      setTexto(valor ?? '')
      alert('No se pudo guardar: ' + e.message)
    }
  }

  return (
    <span className="lt-campo">
      <input
        type="number" min="0" className="lt-in" value={texto} placeholder={placeholder}
        disabled={disabled} onChange={e => setTexto(e.target.value)} onBlur={guardar}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      />
      {estado === 'guardando' && <span className="pct">guardando…</span>}
      {estado === 'ok' && <span className="pct" style={{ color: 'var(--grn)' }}>✓</span>}
    </span>
  )
}

export default function LeadTimeConfig({ filas, leadTimes, esEditor, onCambio }) {
  const [qInput, setQInput] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fOrigen, setFOrigen] = useState('')

  const conteoPorTipo = useMemo(() => {
    const c = {}
    for (const f of filas) c[f.tipo] = (c[f.tipo] || 0) + 1
    return c
  }, [filas])

  const codigos = useMemo(() => {
    const qq = qInput.trim().toLowerCase()
    return filas.filter(f => {
      if (qq && !`${f.codigo} ${f.descripcion || ''}`.toLowerCase().includes(qq)) return false
      if (fTipo && f.tipo !== fTipo) return false
      if (fOrigen && f.origen !== fOrigen) return false
      return true
    })
  }, [filas, qInput, fTipo, fOrigen])

  if (!leadTimes) {
    return (
      <div className="expl-card">
        <h3>Falta un paso en Supabase</h3>
        <p className="lt-p">
          Para guardar los lead time hay que crear dos tablas nuevas una sola vez. En Supabase: <b>SQL Editor</b> → <b>New query</b> →
          pegar el contenido del archivo <span className="mono">supabase/lead_time.sql</span> del repositorio → <b>Run</b>. Después recarga esta página.
        </p>
      </div>
    )
  }

  async function guardarTipo(tipo, campo, dias) {
    await guardarLeadTimeTipo(tipo, { [campo]: dias })
    await onCambio()
  }

  async function guardarMaterial(f, cambios) {
    const actual = leadTimes.materiales.get(f.codigo) || { origen: null, dias: null }
    await guardarLeadTimeMaterial(f.codigo, { ...actual, ...cambios })
    await onCambio()
  }

  const VISIBLES = 300

  return (
    <>
      <div className="expl-card" style={{ marginBottom: 14 }}>
        <h3>Lead time por tipo de material</h3>
        <p className="lt-p">Días desde que se emite la OC hasta que el material llega a almacén. El tipo se reconoce por la descripción del material.</p>
        <table className="expl-mini lt-tipos">
          <thead>
            <tr><th>Tipo</th><th className="num">Materiales</th><th>Local (días)</th><th>Importado (días)</th></tr>
          </thead>
          <tbody>
            {TIPOS.map(t => {
              const v = leadTimes.tipos.get(t.id) || {}
              return (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td className="num">{conteoPorTipo[t.id] || 0}</td>
                  <td><CampoDias valor={v.local} disabled={!esEditor} onGuardar={d => guardarTipo(t.id, 'dias_local', d)} /></td>
                  <td><CampoDias valor={v.importado} disabled={!esEditor} onGuardar={d => guardarTipo(t.id, 'dias_importado', d)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="expl-card">
        <h3>Cada material</h3>
        <p className="lt-p">
          El origen sale de la última OC (Local) u OI (Importado) del material. Si nunca se compró, se asume Local.
          Si un material no calza con su tipo, cámbiale el origen o ponle su propio lead time aquí; deja el campo vacío para volver al valor por defecto.
        </p>
        <div className="bar" style={{ border: 'none', padding: '0 0 10px', margin: 0 }}>
          <input type="text" placeholder="Buscar por código o descripción" value={qInput} onChange={e => setQInput(e.target.value)} />
          <select value={fTipo} onChange={e => setFTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={fOrigen} onChange={e => setFOrigen(e.target.value)}>
            <option value="">Local e importado</option>
            <option value="Local">Local</option>
            <option value="Importado">Importado</option>
          </select>
          <span className="count">{codigos.length} materiales</span>
        </div>
        <div className="scroll">
          <table className="expl-mini">
            <thead>
              <tr><th>Código</th><th>Descripción</th><th>Tipo</th><th>Origen</th><th>Lead time propio</th><th className="num">Lead time usado</th></tr>
            </thead>
            <tbody>
              {codigos.slice(0, VISIBLES).map(f => {
                const exc = leadTimes.materiales.get(f.codigo)
                const ltTipo = leadTimes.tipos.get(f.tipo) || {}
                const porDefecto = f.origen === 'Importado' ? ltTipo.importado : ltTipo.local
                return (
                  <tr key={f.codigo} style={{ cursor: 'default' }}>
                    <td className="mono">{f.codigo}</td>
                    <td><div className="dsc">{f.descripcion || ''}</div></td>
                    <td>{TIPO_LABEL[f.tipo]}</td>
                    <td>
                      <select
                        className="lt-sel" value={exc?.origen || ''} disabled={!esEditor}
                        onChange={e => guardarMaterial(f, { origen: e.target.value || null }).catch(er => alert('No se pudo guardar: ' + er.message))}
                      >
                        <option value="">{f.origenCompra ? `Según última compra (${f.origenCompra})` : 'Sin compras (Local)'}</option>
                        <option value="Local">Local</option>
                        <option value="Importado">Importado</option>
                      </select>
                    </td>
                    <td>
                      <CampoDias
                        valor={exc?.dias} placeholder={porDefecto != null ? String(porDefecto) : '-'} disabled={!esEditor}
                        onGuardar={d => guardarMaterial(f, { dias: d })}
                      />
                    </td>
                    <td className="num">
                      {f.leadTime != null ? `${f.leadTime} días` : <span className="dim">sin dato</span>}
                      {f.leadTimeFuente === 'manual' && <div className="pct" style={{ margin: '2px 0 0' }}>propio</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {codigos.length > VISIBLES && <div className="pct" style={{ marginTop: 8 }}>Se muestran los primeros {VISIBLES}. Usa la búsqueda para encontrar el resto.</div>}
      </div>
    </>
  )
}
