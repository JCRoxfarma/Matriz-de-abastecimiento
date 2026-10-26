// Envio de recordatorios por Microsoft 365 (Microsoft Graph), en modo
// aplicacion: usa el registro de aplicacion corporativo de Roxfarma
// (client credentials) y envia desde un buzon de Roxfarma. No depende de la
// cuenta personal de nadie.
//
// Pendiente de TI: mientras TI no valide el mecanismo y entregue los datos,
// este endpoint responde "pendiente de configuracion" y no envia nada.
// No configurar otros metodos de envio (Resend, SMTP, etc.) sin validacion
// de TI.
//
// Variables en Vercel (las entrega TI):
//   M365_TENANT_ID       - ID del directorio (tenant) de Roxfarma
//   M365_CLIENT_ID       - ID de la aplicacion registrada en Entra ID
//   M365_CLIENT_SECRET   - valor del secreto autorizado por TI
//   M365_BUZON_REMITENTE - buzon desde el que salen los correos

const REQUERIDAS = ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET', 'M365_BUZON_REMITENTE']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' })
  }

  const faltan = REQUERIDAS.filter(k => !process.env[k])
  if (faltan.length > 0) {
    return res.status(503).json({
      error: 'El envio automatico por Microsoft 365 esta pendiente de configuracion por TI. Mientras tanto usa el boton "Copiar" y pega el correo en Outlook.',
      pendiente: true,
    })
  }

  const { to, cc, subject, html } = req.body
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Faltan campos: to, subject, html' })
  }

  const ALWAYS_CC = 'rramirez@roxfarma.com'
  const ccList = cc
    ? (Array.isArray(cc) ? cc : cc.split(/[;,]\s*/)).filter(Boolean)
    : []
  if (!ccList.some(e => e.toLowerCase() === ALWAYS_CC)) ccList.push(ALWAYS_CC)

  const { M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, M365_BUZON_REMITENTE } = process.env

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${M365_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: M365_CLIENT_ID,
          client_secret: M365_CLIENT_SECRET,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
      }
    )

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      const desc = tokenData.error_description || tokenData.error || 'desconocido'
      return res.status(500).json({ error: 'Error de autenticacion con Microsoft 365 (consultar con TI): ' + desc })
    }

    const toRecipients = (Array.isArray(to) ? to : [to]).map(addr => ({
      emailAddress: { address: addr },
    }))
    const ccRecipients = ccList.map(addr => ({
      emailAddress: { address: addr },
    }))

    const sendRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(M365_BUZON_REMITENTE)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: html },
            toRecipients,
            ccRecipients,
          },
          saveToSentItems: true,
        }),
      }
    )

    if (!sendRes.ok) {
      const errData = await sendRes.json().catch(() => ({}))
      const msg = errData.error?.message || `HTTP ${sendRes.status}`
      return res.status(sendRes.status).json({ error: 'Microsoft 365 rechazo el envio (consultar con TI): ' + msg })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
