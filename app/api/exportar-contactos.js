import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const { data, error } = await supabase
    .from('proveedores_contacto')
    .select('nombre, correo, correo_cc, telefono')
    .order('nombre')

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json(data || [])
}
