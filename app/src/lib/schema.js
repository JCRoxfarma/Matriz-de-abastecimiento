// Mapea las columnas del Excel de Johany a los nombres de columna en Supabase.
// "editable" = el importador NO pisa este campo si la fila ya existe (lo dejó alguien en la app).
// "computed" = lo recalcula el importador a partir de ingresos_sistema, no viene directo del Excel.

export const PROGRAMACION_COLUMNS = [
  { header: 'Fecha emisión OC', field: 'fecha_emision_oc', type: 'date' },
  { header: 'OC', field: 'oc', type: 'int' },
  // 'Tipo documento' ya existe en el Excel de Johany ('OC' u 'OI'). 'origen'
  // no se lee del Excel: el importador la calcula sola a partir de esta
  // columna ('OC' -> 'Local', 'OI' -> 'Importado'), para no tener que
  // agregar ni tocar ninguna columna en el archivo de Johany.
  { header: 'Tipo documento', field: 'tipo_documento', type: 'text' },
  { header: 'Proveedor', field: 'proveedor', type: 'text' },
  { header: 'Comprador', field: 'comprador', type: 'text' },
  { header: 'Moneda', field: 'moneda', type: 'text' },
  { header: 'Condición de pago', field: 'condicion_pago', type: 'text' },
  { header: 'Archivo origen', field: 'archivo_origen', type: 'text' },
  { header: 'Fecha carga automática', field: 'fecha_carga_automatica', type: 'date' },
  { header: 'Estado carga', field: 'estado_carga', type: 'text' },
  { header: 'SKU', field: 'sku', type: 'text' },
  { header: 'Descripción', field: 'descripcion', type: 'text' },
  { header: 'Precio unitario', field: 'precio_unitario', type: 'number' },
  { header: 'Cant. Programada', field: 'cant_programada', type: 'number' },
  { header: 'Valor entrega', field: 'valor_entrega', type: 'number' },
  { header: 'N° entrega', field: 'n_entrega', type: 'text' },
  { header: 'ID entrega', field: 'id_entrega', type: 'text' },
  { header: 'Fecha programada de ingreso', field: 'fecha_programada_ingreso', type: 'date' },
  { header: 'Mes de consumo', field: 'mes_consumo', type: 'text' },
  { header: 'Semana de ingreso', field: 'semana_ingreso', type: 'int' },
  { header: 'Almacén destino', field: 'almacen_destino', type: 'text' },
  { header: 'Cantidad de bultos', field: 'cantidad_bultos', type: 'number' },
  { header: 'Requiere almacén externo', field: 'requiere_almacen_externo', type: 'text' },
  { header: 'Orden entrega', field: 'orden_entrega', type: 'int' },
  { header: 'Programado anterior', field: 'programado_anterior', type: 'number' },
  { header: 'Fecha requerida Planeamiento', field: 'fecha_requerida_planeamiento', type: 'date' },
  { header: 'Prioridad producción', field: 'prioridad_produccion', type: 'text' },
  { header: 'Producto / OP relacionada', field: 'producto_op_relacionada', type: 'text' },
  { header: 'Riesgo producción', field: 'riesgo_produccion', type: 'text' },
]

// Campos que llegan del Excel pero solo se toman en cuenta la primera vez
// que se crea la fila. Después los maneja la gente desde la app.
export const EDITABLE_ON_APP = [
  { header: 'Estado gestión', field: 'estado_gestion', type: 'text' },
  { header: 'Motivo demora', field: 'motivo_demora', type: 'text' },
  { header: 'Responsable acción', field: 'responsable_accion', type: 'text' },
  { header: 'Criticidad', field: 'criticidad', type: 'text' },
  { header: 'Observaciones', field: 'observaciones', type: 'text' },
  { header: 'Cierre manual', field: 'cierre_manual', type: 'text' },
  { header: 'Motivo cierre', field: 'motivo_cierre', type: 'text' },
]

// Campos que la app recalcula sola cada vez que entra un ingreso nuevo.
export const COMPUTED_FIELDS = [
  'cant_ingresada', 'saldo_pendiente', 'pct_ingreso',
  'estado_ingreso', 'fecha_real_ingreso', 'dias_atraso',
  'valor_ingresado', 'valor_pendiente',
]

// Colores de cabecera sacados del Excel original de Johany (tema de Office,
// colores de acento), para que la exportacion se vea igual.
const VERDE = '4EA72E'
const AZUL = '156082'
const MORADO = 'A02B93'
const NARANJA = 'AF5526'
const VERDE_OSCURO = '275417'

// Orden completo de columnas para exportar, igual al Excel original de
// Johany, mezclando las que vienen del Excel con las que calcula la app.
export const EXPORT_COLUMNS = [
  { header: 'Fecha emisión OC', field: 'fecha_emision_oc', type: 'date', color: VERDE },
  { header: 'OC', field: 'oc', color: VERDE },
  { header: 'Tipo documento', field: 'tipo_documento', color: VERDE },
  { header: 'Origen', field: 'origen', color: VERDE },
  { header: 'Proveedor', field: 'proveedor', color: VERDE },
  { header: 'Comprador', field: 'comprador', color: VERDE },
  { header: 'Moneda', field: 'moneda', color: VERDE },
  { header: 'Condición de pago', field: 'condicion_pago', color: VERDE },
  { header: 'Archivo origen', field: 'archivo_origen', color: VERDE },
  { header: 'Fecha carga automática', field: 'fecha_carga_automatica', type: 'date', color: VERDE },
  { header: 'Estado carga', field: 'estado_carga', color: VERDE },
  { header: 'SKU', field: 'sku', color: AZUL },
  { header: 'Descripción', field: 'descripcion', color: AZUL },
  { header: 'Precio unitario', field: 'precio_unitario', color: AZUL },
  { header: 'Cant. Programada', field: 'cant_programada', color: AZUL },
  { header: 'Valor entrega', field: 'valor_entrega', color: AZUL },
  { header: 'N° entrega', field: 'n_entrega', color: MORADO },
  { header: 'ID entrega', field: 'id_entrega', color: MORADO },
  { header: 'Fecha programada de ingreso', field: 'fecha_programada_ingreso', type: 'date', color: MORADO },
  { header: 'Mes de consumo', field: 'mes_consumo', color: MORADO },
  { header: 'Semana de ingreso', field: 'semana_ingreso', color: MORADO },
  { header: 'Almacén destino', field: 'almacen_destino', color: MORADO },
  { header: 'Cantidad de bultos', field: 'cantidad_bultos', color: MORADO },
  { header: 'Requiere almacén externo', field: 'requiere_almacen_externo', color: MORADO },
  { header: 'Cant. Ingresada', field: 'cant_ingresada', color: NARANJA },
  { header: 'Saldo pendiente', field: 'saldo_pendiente', color: NARANJA },
  { header: '% ingreso', field: 'pct_ingreso', color: NARANJA },
  { header: 'Estado ingreso', field: 'estado_ingreso', color: NARANJA },
  { header: 'Cierre manual', field: 'cierre_manual', color: NARANJA },
  { header: 'Motivo cierre', field: 'motivo_cierre', color: NARANJA },
  { header: 'Fecha real ingreso', field: 'fecha_real_ingreso', type: 'date', color: NARANJA },
  { header: 'Días atraso', field: 'dias_atraso', color: NARANJA },
  { header: 'Estado gestión', field: 'estado_gestion' },
  { header: 'Motivo demora', field: 'motivo_demora' },
  { header: 'Responsable acción', field: 'responsable_accion' },
  { header: 'Criticidad', field: 'criticidad' },
  { header: 'Fecha requerida Planeamiento', field: 'fecha_requerida_planeamiento', type: 'date' },
  { header: 'Prioridad producción', field: 'prioridad_produccion' },
  { header: 'Producto / OP relacionada', field: 'producto_op_relacionada' },
  { header: 'Riesgo producción', field: 'riesgo_produccion' },
  { header: 'Observaciones', field: 'observaciones' },
  { header: 'Orden entrega', field: 'orden_entrega', color: MORADO },
  { header: 'Programado anterior', field: 'programado_anterior' },
  { header: 'Valor ingresado', field: 'valor_ingresado', color: VERDE_OSCURO },
  { header: 'Valor pendiente', field: 'valor_pendiente', color: VERDE_OSCURO },
]

export const INGRESOS_COLUMNS = [
  { header: 'Archivo origen ingreso', field: 'archivo_origen_ingreso', type: 'text' },
  { header: 'Fecha ingreso', field: 'fecha_ingreso', type: 'date' },
  { header: 'OC', field: 'oc', type: 'int' },
  { header: 'Código', field: 'codigo', type: 'text' },
  { header: 'Descripción', field: 'descripcion', type: 'text' },
  { header: 'Proveedor', field: 'proveedor', type: 'text' },
  { header: 'Cantidad ingresada', field: 'cantidad_ingresada', type: 'number' },
  { header: 'Moneda', field: 'moneda', type: 'text' },
  { header: 'Precio', field: 'precio', type: 'number' },
  { header: 'Número análisis', field: 'numero_analisis', type: 'text' },
  { header: 'Lote', field: 'lote', type: 'text' },
  { header: 'Fecha OC', field: 'fecha_oc', type: 'date' },
  { header: 'Estado ingreso sistema', field: 'estado_ingreso_sistema', type: 'text' },
  { header: 'Ingreso acumulado', field: 'ingreso_acumulado', type: 'number' },
]

// El archivo de ingresos que Johany descarga aparte del sistema (antes lo
// copiaba a mano dentro de IngresosSistema). Trae nombres de columna
// tecnicos, distintos a los del Excel combinado.
export const INGRESOS_RAW_COLUMNS = [
  { header: 'fechadoc', field: 'fecha_ingreso', type: 'date' },
  { header: 'descrip', field: 'descripcion', type: 'text' },
  { header: 'codigo', field: 'codigo', type: 'text' },
  { header: 'prov', field: 'proveedor', type: 'text' },
  { header: 'cantidad', field: 'cantidad_ingresada', type: 'number' },
  { header: 'moneda', field: 'moneda', type: 'text' },
  { header: 'precio', field: 'precio', type: 'number' },
  { header: 'nanalisis', field: 'numero_analisis', type: 'text' },
  { header: 'lote', field: 'lote', type: 'text' },
  { header: 'oc', field: 'oc', type: 'oc' },
  { header: 'fecha_oc', field: 'fecha_oc', type: 'date' },
  { header: 'est', field: 'estado_ingreso_sistema', type: 'text' },
]

// Opciones fijas, sacadas de la hoja "info" del Excel. No son datos, son catálogo.
export const OPCIONES = {
  estado_gestion: [
    { valor: 'Programado', ayuda: 'Ya tienes fecha tentativa de ingreso, pero aún no está 100% validada' },
    { valor: 'Confirmado', ayuda: 'El proveedor confirmó entrega/despacho en fecha' },
    { valor: 'Reprogramado', ayuda: 'Cambió la fecha inicialmente programada' },
    { valor: 'En riesgo', ayuda: 'No hay confirmación, hay demora o puede afectar producción' },
  ],
  requiere_almacen_externo: ['Si', 'No', 'Por evaluar'],
  responsable_accion: ['Proveedor', 'Comercial', 'Finanzas', 'Comprador de materia prima', 'Transporte logístico', 'Agente aduanero / SUNAT', 'Compras', 'Planeamiento', 'Almacén', 'Calidad'],
  prioridad_produccion: ['Alta', 'Media', 'Baja'],
  riesgo_produccion: ['Sin riesgo', 'En seguimiento', 'En riesgo'],
  // Ver MOTIVOS_OC / MOTIVOS_OI en derive.js (con su responsable).
  motivo_demora: ['Demora de proveedor', 'Cambio en la demanda', 'Falta de pagos', 'Falta de materia prima', 'Roleo de carga', 'Trámite aduanero', 'Otros'],
}
