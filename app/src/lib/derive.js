// Formato de numeros y fechas al estilo peruano, igual que en el prototipo.
export const fmt = n => n == null ? '' : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 }).format(n)
export const fmtM = (n, m) => n == null ? '' : (m === 'DOLARES AMERICANOS' ? 'US$ ' : 'S/ ') +
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
export const fdate = s => {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

// "2026-09" -> "Septiembre 2026"
export const nombreMes = clave => {
  const [y, m] = clave.split('-')
  const nombre = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'long' })
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`
}

// Dias de calendario entre hoy y la fecha (negativo = ya paso). Se compara
// contra la medianoche de hoy, no contra la hora actual: si no, despues
// del mediodia una entrega con fecha de hoy salia como "1 dia de atraso".
export const days = s => {
  if (!s) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((new Date(s + 'T00:00:00') - hoy) / 864e5)
}

export const CERRADAS = ['Cerrado', 'Orden Anulada']

// Margen aceptado al cerrar una entrega con falta o demasia frente a lo
// programado. Dentro de este margen se acepta como cierre normal; mas alla,
// sigue necesitando que Johany lo cierre a mano, pero se marca aparte para
// que salte a la vista que puede afectar el abastecimiento.
export const TOLERANCIA_MARGEN = 0.08

export const SEM = {
  atrasado: { c: 'var(--red)', t: 't-red', l: 'Atrasado' },
  desviado: { c: 'var(--red)', t: 't-red', l: 'Cerrada fuera de tolerancia' },
  porllegar: { c: 'var(--amb)', t: 't-amb', l: 'Por llegar' },
  enfecha: { c: 'var(--blu)', t: 't-blu', l: 'En fecha' },
  sinfecha: { c: 'var(--amb)', t: 't-amb', l: 'Sin fecha programada' },
  tolerancia: { c: 'var(--grn)', t: 't-grn', l: 'Cerrada dentro de tolerancia' },
  cerrado: { c: 'var(--gry)', t: 't-gry', l: 'Cerrado' },
}
export const EST_TAG = { Completo: 't-grn', Pendiente: 't-blu' }
export const GES_TAG = { 'En seguimiento': 't-blu', Reprogramado: 't-amb', Atrasado: 't-red', Cerrado: 't-gry', 'Orden Anulada': 't-red' }
export const CONF_TAG = { Pendiente: 't-amb', Confirmada: 't-grn' }

// Motivos de demora / reprogramacion y su responsable (definidos por
// Johany, noviembre 2026). "Otros" lleva el motivo escrito
// ("Otros: <texto>") y el responsable se elige a mano.
export const MOTIVOS_OC = [
  { motivo: 'Demora de proveedor', responsable: 'Proveedor' },
  { motivo: 'Cambio en la demanda', responsable: 'Comercial' },
  { motivo: 'Falta de pagos', responsable: 'Finanzas' },
  { motivo: 'Falta de materia prima', responsable: 'Comprador de materia prima' },
  { motivo: 'Otros', responsable: null },
]
// En importaciones, ademas: roleo de carga y tramite aduanero.
export const MOTIVOS_OI = [
  ...MOTIVOS_OC.filter(m => m.motivo !== 'Otros'),
  { motivo: 'Roleo de carga', responsable: 'Transporte logístico' },
  { motivo: 'Trámite aduanero', responsable: 'Agente aduanero / SUNAT' },
  { motivo: 'Otros', responsable: null },
]
export const RESP = ['', 'Proveedor', 'Comercial', 'Finanzas', 'Comprador de materia prima', 'Transporte logístico', 'Agente aduanero / SUNAT', 'Compras', 'Planeamiento', 'Almacén', 'Calidad']

export const responsableDeMotivo = motivo => MOTIVOS_OI.find(m => m.motivo === motivo)?.responsable || null

// motivo_demora guardado -> { motivo, detalle } para el formulario. Un
// motivo de la lista anterior (ej. "Ingreso parcial") se muestra como
// "Otros" con ese texto, para no perderlo.
export function separarMotivo(valor) {
  const v = (valor || '').trim()
  if (!v) return { motivo: '', detalle: '' }
  if (v === 'Otros') return { motivo: 'Otros', detalle: '' }
  if (v.startsWith('Otros:')) return { motivo: 'Otros', detalle: v.slice(6).trim() }
  if (MOTIVOS_OI.some(m => m.motivo === v)) return { motivo: v, detalle: '' }
  return { motivo: 'Otros', detalle: v }
}

export const unirMotivo = (motivo, detalle) => !motivo ? null
  : motivo === 'Otros' ? (detalle.trim() ? `Otros: ${detalle.trim()}` : 'Otros') : motivo
export const G_ACT = ['En seguimiento', 'Reprogramado', 'Atrasado']

export function gestOpts(r) {
  if (r.estado_ingreso === 'Completo') return ['Cerrado', 'Orden Anulada']
  return G_ACT.concat(['Cerrado', 'Orden Anulada'])
}

// Le agrega a cada fila el numero de entrega y el total de entregas de su
// mismo OC+SKU, para mostrar "entrega 1 de 2" en la tabla.
export function withEntregas(rows) {
  const tot = {}
  rows.forEach(r => { const k = r.oc + '|' + r.sku; tot[k] = (tot[k] || 0) + 1 })
  return rows.map(r => ({
    ...r,
    entN: parseInt(String(r.n_entrega || 'E01').replace(/\D/g, ''), 10) || 1,
    entTot: tot[r.oc + '|' + r.sku],
  }))
}

// Le agrega a una fila los campos que se calculan en el navegador (no se
// guardan en la base, dependen de la fecha de hoy).
export function enrich(r) {
  const ajuste = r.ajuste_cantidad || 0
  const progEfectivo = (r.cant_programada || 0) + ajuste
  const saldo = Math.max(0, progEfectivo - (r.cant_ingresada || 0))
  const abierto = saldo > 0 && !CERRADAS.includes(r.estado_gestion)
  const tol = CERRADAS.includes(r.estado_gestion) && saldo > 0
  const dd = days(r.fecha_confirmada || r.fecha_programada_ingreso)
  const avance = progEfectivo ? Math.min(1, (r.cant_ingresada || 0) / progEfectivo) : 0
  const desv = progEfectivo ? ((r.cant_ingresada || 0) - progEfectivo) / progEfectivo : 0
  const dentroTolerancia = tol && Math.abs(desv) <= TOLERANCIA_MARGEN
  const fueraTolerancia = tol && Math.abs(desv) > TOLERANCIA_MARGEN
  let sem2
  if (dentroTolerancia) sem2 = 'tolerancia'
  else if (fueraTolerancia) sem2 = 'desviado'
  else if (!abierto) sem2 = 'cerrado'
  else if (dd == null) sem2 = 'sinfecha'
  else if (dd < 0) sem2 = 'atrasado'
  else if (dd <= 7) sem2 = 'porllegar'
  else sem2 = 'enfecha'
  const hist = Array.isArray(r.historial) ? r.historial : []
  const fprog0 = hist.length ? hist[0].de : r.fecha_programada_ingreso
  const estado_confirmacion = !abierto ? null
    : !r.fecha_confirmada ? 'Pendiente'
    : 'Confirmada'
  // La Gestion se recalcula sola, igual que los Dias: si ya no queda nada
  // pendiente (o alguien la cerro a mano), se ve Cerrado; si se paso la
  // fecha y sigue con saldo, Atrasado; si no, se respeta lo que haya
  // dejado la gente (Reprogramado, etc.) o "En seguimiento" por defecto.
  // "Atrasado" lo decide siempre la fecha, nunca lo guardado: si una
  // entrega se guardo como Atrasado y despues el proveedor confirmo o se
  // reprogramo a una fecha que aun no llega, ya no esta atrasada (pasa a
  // Reprogramado si se movio la fecha, o En seguimiento).
  const reprogramada = Array.isArray(r.historial) && r.historial.length > 0
  const guardado = r.estado_gestion === 'Atrasado' ? (reprogramada ? 'Reprogramado' : 'En seguimiento') : r.estado_gestion
  const estadoGestion = CERRADAS.includes(r.estado_gestion) ? r.estado_gestion
    : !abierto ? 'Cerrado'
    : (dd != null && dd < 0) ? 'Atrasado'
    : (guardado || 'En seguimiento')
  // Igual que Gestion: si el dato guardado quedo viejo (por ejemplo un
  // "Parcial" de antes de fusionar ese estado con Pendiente), no se
  // confia en el valor de la base, se calcula solo. "Pendiente" quiere
  // decir que la linea sigue abierta y necesita seguimiento: si ya la
  // cerraste (aunque sea con tolerancia y le falte un poco), ya no cuenta
  // como pendiente.
  const estadoIngreso = abierto ? 'Pendiente' : 'Completo'
  return { ...r, estado_gestion: estadoGestion, estado_ingreso: estadoIngreso, estado_confirmacion, abierto, tol, dentroTolerancia, fueraTolerancia, dd, avance, desv, sem2, hist, fprog0, saldo_pendiente: saldo, progEfectivo }
}
