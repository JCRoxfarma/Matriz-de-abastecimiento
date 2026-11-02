// Formas de enviar los recordatorios desde el Outlook de Johany, sin que la
// app tenga credenciales (TI no aprobo el envio desde la app, ver
// CLAUDE.md):
//   - Borrador .eml: archivo de correo listo (destinatario, CC, asunto y
//     cuerpo). Al abrirlo, Outlook de escritorio lo muestra como correo
//     nuevo para revisar y enviar.
//   - Abrir en Outlook: copia el cuerpo con formato y abre un correo nuevo
//     con destinatario, CC y asunto ya puestos (mailto:). Funciona con
//     cualquier Outlook.

// Igual que el envio automatico: Rosmery siempre va en copia.
export const SIEMPRE_CC = 'rramirez@roxfarma.com'

export function listaCc(correoCc) {
  const lista = String(correoCc || '').split(/[;,]\s*/).map(s => s.trim()).filter(Boolean)
  if (!lista.some(e => e.toLowerCase() === SIEMPRE_CC)) lista.push(SIEMPRE_CC)
  return lista
}

const b64 = texto => {
  const bytes = new TextEncoder().encode(texto)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// "X-Unsent: 1" hace que Outlook de escritorio abra el archivo como un
// correo nuevo sin enviar (con boton Enviar), no como uno ya recibido. Sin
// "From", Outlook usa la cuenta de quien lo abre. El cuerpo va como
// multipart/alternative (texto + HTML), que es como lo arma el propio
// Outlook: el nuevo Outlook dejaba el cuerpo vacio si solo venia el HTML.
const textoPlano = html => html
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h\d)>/gi, '\n').replace(/<\/t[dh]>/gi, '\t')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

const parteBase64 = texto => b64(texto).replace(/.{1,76}/g, '$&\r\n')

export function emlDeCorreo({ to, cc, subject, html }) {
  const limite = `----=_Recordatorio_${Date.now().toString(36)}`
  return [
    'X-Unsent: 1',
    `To: ${to}`,
    `Cc: ${cc.join(', ')}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    parteBase64(textoPlano(html)),
    `--${limite}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    parteBase64(html),
    `--${limite}--`,
    '',
  ].join('\r\n')
}

const nombreArchivo = texto => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'correo'

export function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function descargarBorrador(proveedor, correo) {
  descargar(`Recordatorio_${nombreArchivo(proveedor)}.eml`, emlDeCorreo(correo), 'message/rfc822')
}

// Varios archivos seguidos: el navegador puede pedir permiso una vez para
// "descargar varios archivos".
export async function descargarBorradores(lista) {
  for (const { proveedor, correo } of lista) {
    descargarBorrador(proveedor, correo)
    await new Promise(r => setTimeout(r, 400))
  }
}

// mailto: no puede llevar un cuerpo con formato: el cuerpo se copia y hay
// que pegarlo (Ctrl + V) en el correo que se abre.
export async function abrirEnOutlook({ to, cc, subject, html }) {
  await navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([subject], { type: 'text/plain' }),
  })])
  window.alert('El recordatorio quedó copiado.\n\nEn el correo que se abre en Outlook, haz clic en el espacio del mensaje y presiona Ctrl + V para pegar la tabla.')
  const q = new URLSearchParams({ cc: cc.join(','), subject }).toString().replace(/\+/g, '%20')
  window.location.href = `mailto:${encodeURIComponent(to)}?${q}`
}
