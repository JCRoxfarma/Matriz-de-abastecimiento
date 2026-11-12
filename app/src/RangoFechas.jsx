import { useEffect, useRef, useState } from 'react'
import Icono from './Icono'

// Selector de rango de fechas en UN solo calendario: el primer clic marca el
// inicio y el segundo el fin (si el segundo es anterior, se invierten). Doble
// clic en un dia = solo ese dia. Trabaja con fechas 'YYYY-MM-DD'.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const corta = s => { if (!s) return ''; const d = deIso(s); return `${d.getDate()} ${MESES[d.getMonth()]}` }
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']

function atajos() {
  const h = new Date(); h.setHours(0, 0, 0, 0)
  const mas = n => { const d = new Date(h); d.setDate(d.getDate() + n); return d }
  const lunes = mas(-((h.getDay() + 6) % 7))
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
  return [
    ['Hoy', h, h],
    ['Mañana', mas(1), mas(1)],
    ['Esta semana', lunes, domingo],
    ['Próximos 7 días', h, mas(6)],
    ['Este mes', new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 1, 0)],
    ['Mes siguiente', new Date(h.getFullYear(), h.getMonth() + 1, 1), new Date(h.getFullYear(), h.getMonth() + 2, 0)],
  ]
}

export default function RangoFechas({ desde, hasta, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const [mes, setMes] = useState(() => { const d = desde ? deIso(desde) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [inicio, setInicio] = useState(null) // primer clic pendiente de cerrar
  const [sobre, setSobre] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = e => { if (ref.current && !ref.current.contains(e.target)) { setAbierto(false); setInicio(null) } }
    const esc = e => { if (e.key === 'Escape') { setAbierto(false); setInicio(null) } }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  function elegir(dia) {
    if (!inicio) { setInicio(dia); return }
    const [a, b] = inicio <= dia ? [inicio, dia] : [dia, inicio]
    onChange(a, b); setInicio(null); setAbierto(false)
  }

  // Rango que se pinta: el que se esta eligiendo (inicio + dia bajo el mouse) o el aplicado.
  const [ra, rb] = inicio ? (sobre && sobre < inicio ? [sobre, inicio] : [inicio, sobre || inicio]) : [desde, hasta]

  const primero = new Date(mes)
  const offset = (primero.getDay() + 6) % 7
  const celdas = Array.from({ length: 42 }, (_, i) => { const d = new Date(mes); d.setDate(1 - offset + i); return d })
  const hoy = iso(new Date())
  const titulo = mes.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })

  const etiqueta = desde ? (desde === hasta ? corta(desde) : `${corta(desde)} – ${corta(hasta)}`) : 'Elegir fechas'

  return (
    <div className="rf" ref={ref}>
      <button type="button" className={`btn rf-btn ${desde ? 'on' : ''}`} onClick={() => { setAbierto(v => !v); setInicio(null) }}>
        <Icono nombre="calendario" tam={15} /> {etiqueta}
      </button>
      {desde && <button type="button" className="btn-link" onClick={() => onChange('', '')}>quitar</button>}
      {abierto && (
        <div className="rf-pop">
          <div className="rf-atajos">
            {atajos().map(([lb, a, b]) => (
              <button type="button" key={lb} onClick={() => { onChange(iso(a), iso(b)); setInicio(null); setAbierto(false) }}>{lb}</button>
            ))}
          </div>
          <div className="rf-cal">
            <div className="rf-cab">
              <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mes anterior">‹</button>
              <b>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</b>
              <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Mes siguiente">›</button>
            </div>
            <div className="rf-grid" onMouseLeave={() => setSobre(null)}>
              {DIAS.map(d => <span key={d} className="rf-dn">{d}</span>)}
              {celdas.map(d => {
                const s = iso(d)
                const cls = [
                  'rf-d',
                  d.getMonth() !== mes.getMonth() ? 'fuera' : '',
                  s === hoy ? 'hoy' : '',
                  ra && rb && s > ra && s < rb ? 'en' : '',
                  s === ra || s === rb ? 'borde' : '',
                ].join(' ')
                return <button type="button" key={s} className={cls} onMouseEnter={() => setSobre(s)} onClick={() => elegir(s)}>{d.getDate()}</button>
              })}
            </div>
            <div className="rf-ayuda">{inicio ? `Desde ${corta(inicio)}: ahora elige el día final` : 'Elige el día inicial y luego el final (clic dos veces en un día para solo ese día)'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
