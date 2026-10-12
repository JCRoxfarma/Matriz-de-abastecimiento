export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' })
  }

  const { AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET, OUTLOOK_REFRESH_TOKEN } = process.env
  if (!AZURE_CLIENT_ID || !AZURE_TENANT_ID || !AZURE_CLIENT_SECRET || !OUTLOOK_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Faltan variables de Azure en Vercel (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET, OUTLOOK_REFRESH_TOKEN).' })
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

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: AZURE_CLIENT_ID,
          client_secret: AZURE_CLIENT_SECRET,
          refresh_token: OUTLOOK_REFRESH_TOKEN,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
        }),
      }
    )

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      return res.status(500).json({ error: 'Error obteniendo token de Azure: ' + (tokenData.error_description || tokenData.error || 'desconocido') })
    }

    const toRecipients = (Array.isArray(to) ? to : [to]).map(addr => ({
      emailAddress: { address: addr },
    }))
    const ccRecipients = ccList.map(addr => ({
      emailAddress: { address: addr },
    }))

    const sendRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
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
          ccRecipients: ccRecipients.length > 0 ? ccRecipients : undefined,
        },
      }),
    })

    if (!sendRes.ok) {
      const errData = await sendRes.json().catch(() => ({}))
      return res.status(sendRes.status).json({ error: errData?.error?.message || 'Error enviando correo via Outlook' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
