import { fmt } from './derive'

// Aviso cuando el archivo trae un N° de analisis que ya estaba guardado pero
// con otra OC u otro codigo (Calidad reutilizo el numero). Johany decide si
// el ingreso nuevo reemplaza al guardado.
const linea = r => `OC ${r.oc ?? '?'} · ${r.codigo ?? '?'} ${r.descripcion ? '· ' + String(r.descripcion).slice(0, 40) : ''} · ${fmt(r.cantidad_ingresada)} und`

export function confirmarReutilizados(lista) {
  const detalle = lista.slice(0, 8).map(x =>
    `${x.numero_analisis}\n   Guardado:  ${linea(x.antes)}\n   En el archivo:  ${linea(x.ahora)}`).join('\n\n')
  const mas = lista.length > 8 ? `\n\n... y ${lista.length - 8} más.` : ''
  return Promise.resolve(window.confirm(
    `${lista.length === 1 ? 'Este número de análisis ya estaba guardado' : `Estos ${lista.length} números de análisis ya estaban guardados`} con otra OC u otro código. ` +
    `Parece que Calidad reutilizó el número.\n\n${detalle}${mas}\n\n` +
    `Aceptar: reemplazar lo guardado por lo que trae el archivo.\nCancelar: dejar lo guardado como está (el ingreso del archivo no se carga).`))
}

export const textoReutilizados = r =>
  (r.reemplazados ? `, ${r.reemplazados} análisis reemplazados (número reutilizado)` : '') +
  (r.reutilizadosOmitidos ? `, ${r.reutilizadosOmitidos} análisis con número reutilizado sin cargar` : '')
