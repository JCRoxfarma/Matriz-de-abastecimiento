// A partir de las filas ya comparadas de compararExplosiones (parte 1) y
// lo que ya esta pendiente de recibir por OC (programacion_oc), calcula
// si de verdad hace falta comprar mas, cuanto, y si la fecha de entrega
// que ya tienes programada alcanza a tiempo.

const MARGEN_AJUSTADO_DIAS = 5

function mermaPorGrupo(grupo) {
  if (grupo === 1 || grupo === 2) return 10
  if (grupo === 3 || grupo === 4) return 5
  return 0
}

// Los "tubos" tienen su propia regla de compra, aparte del grupo: el
// proveedor solo los vende en lotes de 20,000 unidades como minimo, y la
// merma es siempre 10% (no la del grupo que le haya tocado). Se detectan
// por la palabra "TUBO" en la descripcion -- unico criterio hoy; si
// aparecen otras categorias con lote minimo, hay que ampliar esto.
const LOTE_MINIMO_TUBO = 20000
const MERMA_TUBO = 10
function esTubo(descripcion) {
  return /\btubo\b/i.test(descripcion || '')
}

// Tope de cobertura de stock por grupo (confirmado con Johany): no tiene
// sentido comprar para tener guardado mas de esto, aunque el consumo
// futuro total de la explosion sea mayor -- se vuelve a comprar mas
// adelante cuando toque. Se usa el maximo del rango que dio Johany para
// Grupo 3/4 (1.5 a 2 meses).
function coberturaMesesPorGrupo(grupo) {
  if (grupo === 1 || grupo === 2) return 2.5
  if (grupo === 3 || grupo === 4) return 2
  return null // sin grupo conocido: no se limita, usa todo el horizonte
}

// Suma el consumo en firme desde el mes actual (calendario real, no el
// primer mes de la explosion) hacia adelante, hasta completar
// "mesesCobertura" meses. Un mes que cae aunque sea parcialmente dentro de
// la ventana se cuenta completo (redondeando la cantidad de meses hacia
// arriba), no a prorrata por dias: el consumo real de un mes suele ser una
// corrida de produccion puntual, no algo repartido parejo dia a dia -- si
// se necesitan 20,000 unidades en noviembre, hacen falta las 20,000 ese
// mes, no la mitad aunque noviembre caiga a mitad de la ventana de
// cobertura. Si mesesCobertura es null, usa todo el horizonte disponible
// (mismo comportamiento que antes de tener el tope por grupo).
function necesidadHastaCobertura(meses, mesesCobertura) {
  const ordenados = [...meses].sort((a, b) => a.mes.localeCompare(b.mes))
  if (mesesCobertura == null) return ordenados.reduce((a, m) => a + (m.actual || 0), 0)

  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const futuros = ordenados.filter(m => m.mes >= mesActual)

  const mesesEnteros = Math.ceil(mesesCobertura)
  return futuros.slice(0, mesesEnteros).reduce((a, m) => a + (m.actual || 0), 0)
}

// El stock que trae la explosion queda congelado en la fecha del archivo
// (fecha_corte): si una OC ingresa despues de esa fecha, deja de contar
// como "pendiente" pero el stock del archivo todavia no la tiene -- se
// veia como si esas unidades hubieran desaparecido. Se suma aparte lo que
// ya ingreso a almacen despues del corte (ingresosPorSku, sacado de
// ingresos_sistema) para que el stock efectivo sea real, sin esperar a
// que Johany suba una explosion mas nueva.
// Si el mes de fabricacion mas proximo del snapshot ya paso, busca el
// siguiente mes con consumo que aun no haya pasado y recalcula la fecha
// requerida (dia 10 del mes anterior). Asi la tabla siempre muestra el
// proximo mes relevante, no uno que ya quedo atras.
function mesFabricacionEfectivo(mesFabOriginal, fechaReqOriginal, meses) {
  if (!mesFabOriginal) return { mesFab: null, fechaReq: null }
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  if (mesFabOriginal >= mesActual) return { mesFab: mesFabOriginal, fechaReq: fechaReqOriginal }
  const proximo = [...meses]
    .filter(m => m.mes >= mesActual && (m.actual || 0) > 0)
    .sort((a, b) => a.mes.localeCompare(b.mes))[0]
  if (!proximo) return { mesFab: mesFabOriginal, fechaReq: fechaReqOriginal }
  const [y, mo] = proximo.mes.split('-').map(Number)
  const req = new Date(y, mo - 2, 10)
  const fechaReq = `${req.getFullYear()}-${String(req.getMonth() + 1).padStart(2, '0')}-${String(req.getDate()).padStart(2, '0')}`
  return { mesFab: proximo.mes, fechaReq }
}

export function calcularCompraSugerida(filas, ocPorSku, ingresosPorSku = new Map(), fechaCorte = null, stockDiario = null) {
  return filas.map(f => {
    const tubo = esTubo(f.descripcion)
    const mermaPct = tubo ? MERMA_TUBO : mermaPorGrupo(f.grupo)
    const loteMinimo = tubo ? LOTE_MINIMO_TUBO : null
    const mesesCobertura = coberturaMesesPorGrupo(f.grupo)
    const necesidad = necesidadHastaCobertura(f.meses, mesesCobertura)
    const oc = ocPorSku.get(f.codigo) || { saldoPendiente: 0, fechaProgramada: null, entregas: [] }
    const stockDiarioEntry = stockDiario?.get(f.codigo) || null
    const ingresosPosterioresAlCorte = stockDiarioEntry ? 0 : (ingresosPorSku.get(f.codigo) || 0)
    const stock = stockDiarioEntry ? stockDiarioEntry.total : ((f.stock || 0) + ingresosPosterioresAlCorte)

    const { mesFab, fechaReq } = mesFabricacionEfectivo(
      f.mesFabricacionProximo, f.fechaRequeridaIngreso, f.meses)

    const faltanteReal = Math.max(0, necesidad - stock - oc.saldoPendiente)
    // La merma se aplica sobre lo que de verdad falta comprar, no sobre
    // toda la necesidad -- si el stock y las OC ya cubren el consumo, no
    // hace falta agregar margen de merma a algo que no se va a comprar.
    const conMerma = Math.ceil(faltanteReal * (1 + mermaPct / 100))
    // El lote minimo es un piso del proveedor, no se le suma merma aparte:
    // si el faltante ya alcanza para pedir mas de un lote, se compra
    // exactamente lo que hace falta (+ merma), sin redondear a multiplos.
    const loteMinimoAplicado = faltanteReal > 0 && loteMinimo && faltanteReal < loteMinimo
    const compraSugerida = faltanteReal <= 0 ? 0 : loteMinimoAplicado ? loteMinimo : conMerma

    let estadoAbastecimiento
    if (faltanteReal <= 0) {
      estadoAbastecimiento = 'cubierto'
    } else if (oc.saldoPendiente > 0 && oc.fechaProgramada) {
      if (!fechaReq) {
        estadoAbastecimiento = 'sin_dato'
      } else {
        const diasDiferencia = Math.round(
          (new Date(oc.fechaProgramada) - new Date(fechaReq)) / 86400000
        )
        if (diasDiferencia <= 0) estadoAbastecimiento = 'a_tiempo'
        else if (diasDiferencia <= MARGEN_AJUSTADO_DIAS) estadoAbastecimiento = 'ajustado'
        else estadoAbastecimiento = 'en_riesgo'
      }
    } else if (fechaReq && new Date(fechaReq) < new Date()) {
      estadoAbastecimiento = 'quiebre'
    } else if (!oc.fechaProgramada && oc.saldoPendiente <= 0) {
      estadoAbastecimiento = 'sin_oc'
    } else if (!fechaReq) {
      estadoAbastecimiento = 'sin_dato'
    } else {
      estadoAbastecimiento = 'en_riesgo'
    }

    // Meses de cobertura: cuantos meses de produccion puede cubrir con
    // lo que tiene (stock) mas lo que viene (OC pendiente).
    const consumoMensual = f.meses.length
      ? f.meses.reduce((a, m) => a + (m.actual || 0), 0) / f.meses.length
      : 0
    const mesesCubiertos = consumoMensual > 0
      ? Math.round(((stock + oc.saldoPendiente) / consumoMensual) * 10) / 10
      : null

    // Anticipacion: dias entre la fecha del archivo de explosion y la
    // fecha en que el material necesitaba estar en almacen. Si es negativo,
    // la explosion pidio algo que ya debia haber llegado → "pedido tardio":
    // evidencia de que planeamiento/produccion lo solicito fuera de fecha.
    let diasAnticipacion = null
    let pedidoTardio = false
    if (fechaCorte && fechaReq) {
      diasAnticipacion = Math.round(
        (new Date(fechaReq) - new Date(fechaCorte + 'T00:00:00')) / 86400000
      )
      pedidoTardio = diasAnticipacion < 0
    }

    return {
      ...f,
      mesFabricacionProximo: mesFab,
      fechaRequeridaIngreso: fechaReq,
      mermaPct,
      loteMinimoAplicado,
      mesesCobertura,
      necesidadCobertura: necesidad,
      ocPendiente: oc.saldoPendiente,
      ocEntregas: oc.entregas,
      fechaEntregaProgramada: oc.fechaProgramada,
      stockEfectivo: stock,
      stockDiarioEntry,
      usaStockDiario: !!stockDiarioEntry,
      ingresosPosterioresAlCorte,
      faltanteReal,
      compraSugerida,
      estadoAbastecimiento,
      mesesCubiertos,
      consumoMensual,
      diasAnticipacion,
      pedidoTardio,
    }
  })
}
