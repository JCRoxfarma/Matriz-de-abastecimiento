// Iconos de linea simples (24x24, trazo). Se dibujan aqui mismo para no
// sumar dependencias.
const RUTAS = {
  carrito: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h2.6l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 7.5H6" /></>,
  alerta: <><path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4.2" /><path d="M12 17.2h.01" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  reloj: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.3 1.8M9.5 2.8h5" /></>,
  diana: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  monedas: <><ellipse cx="12" cy="6" rx="7" ry="2.8" /><path d="M5 6v4.5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6" /><path d="M5 10.5V15c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4.5" /></>,
  caja: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>,
  portapapeles: <><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><rect x="9" y="2.5" width="6" height="4" rx="1" /><path d="M9 11h6M9 15h4" /></>,
  capas: <><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" /></>,
  grafico: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  carpeta: <><path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z" /></>,
  excel: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /><path d="m9.5 12 5 5m0-5-5 5" /></>,
  subir: <><path d="M12 16V4M7 8.5 12 4l5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  historial: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v4h4" /><path d="M12 8v4.5l3 1.8" /></>,
  campana: <><path d="M6 9.5a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5Z" /><path d="M10 19.5a2 2 0 0 0 4 0" /></>,
  lista: <><path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  filtro: <><path d="M3.5 5h17l-6.5 7.8V19l-4 1.5v-7.7L3.5 5Z" /></>,
  camion: <><path d="M2.5 6.5h11v9.5h-11zM13.5 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.7" /><circle cx="17" cy="17.5" r="1.7" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
}

export default function Icono({ nombre, tam = 18, grosor = 1.8, className = '' }) {
  return (
    <svg className={`ico ${className}`} width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {RUTAS[nombre]}
    </svg>
  )
}
