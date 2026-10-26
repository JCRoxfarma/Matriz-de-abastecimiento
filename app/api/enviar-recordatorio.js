export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY no esta configurada en Vercel. Ve a Settings > Environment Variables y agregala.' })
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
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.CORREO_REMITENTE || 'Roxfarma Compras <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        cc: ccList.length > 0 ? ccList : undefined,
        subject,
        html,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Error enviando correo' })
    }

    return res.status(200).json({ id: data.id, ok: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
