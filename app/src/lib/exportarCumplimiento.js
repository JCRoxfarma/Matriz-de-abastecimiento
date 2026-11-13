import ExcelJS from 'exceljs'

// Excel de cumplimiento de proveedores (OTIF) de un mes, para enviarlo al
// proveedor o revisarlo. Usa exactamente las mismas entregas evaluadas que
// la pestana Indicadores (evaluarEntrega): mismas reglas, misma fecha base.
//   Hoja "Resumen": una fila por proveedor (o solo el elegido).
//   Hoja "Detalle": cada entrega medida, con su fecha comprometida, su
//   llegada y si cumplio a tiempo / completo.

const AZUL = 'FF00167B'
const VERDE = 'FF3F7D54'
const ROJO = 'FFC0392B'
const GRIS = 'FF667085'

const aFecha = s => {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const mesLargo = k => {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
}
const pct = (a, b) => (b ? a / b : null)
const limpiarNombre = s => String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim()

function resumir(lista) {
  const n = lista.length
  const aTiempo = lista.filter(e => e.aTiempo).length
  const completas = lista.filter(e => e.completo).length
  const otif = lista.filter(e => e.otif).length
  const tarde = lista.filter(e => !e.pendiente && e.atraso > 0)
  const atrasoProm = tarde.length ? Math.round(tarde.reduce((a, e) => a + e.atraso, 0) / tarde.length * 10) / 10 : 0
  return { n, aTiempo, completas, otif, atrasoProm, pendientes: lista.filter(e => e.pendiente).length }
}

function observacion(e) {
  const r = e.r
  const notas = []
  if (e.pendiente) notas.push('Aún no llega')
  if (r.conDesmedro) notas.push(`Desmedro en tránsito (${r.cant_rechazada} und, no imputable al proveedor)`)
  else if ((r.cant_rechazada || 0) > 0) notas.push(`Rechazo de calidad: ${r.cant_rechazada} und${r.rechazoPend ? ', reposición pendiente' : ', repuesto'}`)
  if (r.estado_gestion === 'Cerrado' && (r.saldo_pendiente || 0) > 0) notas.push('Cerrada con saldo')
  return notas.join(' · ')
}

function encabezado(ws, titulo, lineas, ancho) {
  ws.mergeCells(1, 1, 1, ancho)
  const t = ws.getCell(1, 1)
  t.value = titulo
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  t.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26
  lineas.forEach((l, i) => {
    ws.mergeCells(2 + i, 1, 2 + i, ancho)
    const c = ws.getCell(2 + i, 1)
    c.value = l
    c.font = { size: 10, color: { argb: GRIS } }
  })
  return 2 + lineas.length + 1 // fila donde empieza la tabla
}

function estiloCabecera(row) {
  row.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = { bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } } }
  })
  row.height = 32
}

function siNo(cell, ok) {
  cell.value = ok ? 'Sí' : 'No'
  cell.font = { bold: true, color: { argb: ok ? VERDE : ROJO } }
  cell.alignment = { horizontal: 'center' }
}

export async function exportarCumplimiento({ evaluadas, mes, proveedor, base, meta }) {
  const delMes = evaluadas.filter(e => e.compromiso.slice(0, 7) === mes && (!proveedor || e.r.proveedor === proveedor))
  if (!delMes.length) throw new Error('No hay entregas medidas para ese mes y proveedor.')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Roxfarma - Seguimiento de abastecimiento'
  const lineas = [
    `Proveedor: ${proveedor || 'Todos'}   ·   Mes: ${mesLargo(mes)}   ·   Medido contra la fecha ${base === 'original' ? 'original (antes de reprogramar)' : 'vigente (confirmada o reprogramada)'}`,
    `A tiempo = llegó el mismo día o antes de la fecha comprometida · Completa = llegó al menos el 95% de lo programado · OTIF = a tiempo y completa · Meta ${meta}%`,
    `Generado el ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}`,
  ]

  // --- Hoja Resumen ---
  const ws = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 6 }] })
  const cols = ['Proveedor', 'Entregas medidas', 'A tiempo', '% A tiempo', 'Completas', '% Completas', 'OTIF', '% OTIF', 'Cumple meta', 'Atraso promedio (días)', 'Aún no llegan']
  const fila0 = encabezado(ws, 'Roxfarma S.A. — Cumplimiento de entregas (OTIF)', lineas, cols.length)
  ws.getRow(fila0).values = cols
  estiloCabecera(ws.getRow(fila0))

  const porProv = new Map()
  for (const e of delMes) {
    const k = e.r.proveedor || 'Sin proveedor'
    if (!porProv.has(k)) porProv.set(k, [])
    porProv.get(k).push(e)
  }
  const grupos = [...porProv.entries()].map(([nombre, lista]) => ({ nombre, ...resumir(lista) }))
    .sort((a, b) => (pct(a.otif, a.n) ?? 0) - (pct(b.otif, b.n) ?? 0) || b.n - a.n)
  if (grupos.length > 1) grupos.push({ nombre: 'TOTAL', total: true, ...resumir(delMes) })

  let f = fila0 + 1
  for (const g of grupos) {
    const row = ws.getRow(f++)
    const pOtif = pct(g.otif, g.n)
    row.values = [g.nombre, g.n, g.aTiempo, pct(g.aTiempo, g.n), g.completas, pct(g.completas, g.n), g.otif, pOtif, null, g.atrasoProm, g.pendientes]
    ;[4, 6, 8].forEach(i => { row.getCell(i).numFmt = '0.0%' })
    siNo(row.getCell(9), pOtif != null && pOtif * 100 >= meta)
    row.getCell(8).font = { bold: true, color: { argb: pOtif != null && pOtif * 100 >= meta ? VERDE : ROJO } }
    if (g.total) row.eachCell(c => { c.font = { ...(c.font || {}), bold: true }; c.border = { top: { style: 'thin' } } })
  }
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 42 : 13 })

  // --- Hoja Detalle ---
  const wd = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 6 }] })
  const colsD = ['Proveedor', 'OC / OI', 'SKU', 'Material', 'Entrega', 'Fecha comprometida', 'Fecha de llegada', 'Cant. programada', 'Cant. recibida', '% recibido', 'A tiempo', 'Completa', 'OTIF', 'Días de atraso', 'Observación']
  const filaD = encabezado(wd, `Detalle de entregas — ${mesLargo(mes)}`, lineas, colsD.length)
  wd.getRow(filaD).values = colsD
  estiloCabecera(wd.getRow(filaD))

  const orden = [...delMes].sort((a, b) => (a.r.proveedor || '').localeCompare(b.r.proveedor || '') || a.compromiso.localeCompare(b.compromiso))
  let fd = filaD + 1
  for (const e of orden) {
    const r = e.r
    const prog = r.progEfectivo || r.cant_programada || 0
    const recibido = (r.cant_ingresada || 0) + (r.conDesmedro ? r.cant_rechazada || 0 : 0)
    const row = wd.getRow(fd++)
    row.values = [
      r.proveedor || '', r.oc, r.sku, r.descripcion || '', r.n_entrega || '',
      aFecha(e.compromiso), aFecha(e.llegada), prog, recibido, prog ? recibido / prog : null,
      null, null, null, e.pendiente ? null : e.atraso, observacion(e),
    ]
    row.getCell(6).numFmt = 'dd/mm/yyyy'
    row.getCell(7).numFmt = 'dd/mm/yyyy'
    row.getCell(8).numFmt = '#,##0'
    row.getCell(9).numFmt = '#,##0'
    row.getCell(10).numFmt = '0%'
    siNo(row.getCell(11), e.aTiempo)
    siNo(row.getCell(12), e.completo)
    siNo(row.getCell(13), e.otif)
    if (!e.otif) row.getCell(15).font = { color: { argb: ROJO } }
  }
  wd.autoFilter = { from: { row: filaD, column: 1 }, to: { row: fd - 1, column: colsD.length } }
  const anchos = [34, 13, 12, 42, 9, 13, 13, 13, 13, 10, 9, 10, 8, 10, 46]
  wd.columns.forEach((c, i) => { c.width = anchos[i] })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Cumplimiento OTIF ${mesLargo(mes)}${proveedor ? ' - ' + limpiarNombre(proveedor) : ''}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
