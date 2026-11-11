import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// sesion: undefined mientras carga, null si no hay nadie logueado, o la sesion real.
// perfil: nombre y rol (editor | lector) de la persona logueada.
export function useSesion() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [errorPerfil, setErrorPerfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => setSesion(session))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sesion) { setPerfil(null); setErrorPerfil(null); return }
    let vigente = true
    const pedir = () => supabase.from('perfiles').select('nombre,rol').eq('id', sesion.user.id).maybeSingle()
    ;(async () => {
      let { data, error } = await pedir()
      // Si la sesion guardada en el navegador ya vencio, Supabase rechaza
      // la consulta (401) y la app se quedaba para siempre en "Cargando tu
      // perfil...". Se intenta renovar la sesion una vez; si no se puede,
      // se cierra y vuelve a aparecer la pantalla de inicio de sesion.
      if (error) {
        const { error: errRenovar } = await supabase.auth.refreshSession()
        if (errRenovar) { await supabase.auth.signOut(); return }
        ;({ data, error } = await pedir())
      }
      if (!vigente) return
      if (error) { setErrorPerfil(error.message); return }
      if (!data) { setErrorPerfil('Tu usuario no tiene un perfil asignado en la app. Pídele a Johany que lo agregue.'); return }
      setErrorPerfil(null)
      setPerfil(data)
    })()
    return () => { vigente = false }
    // Se compara el id de usuario, no el objeto sesion completo: Supabase
    // genera una sesion "nueva" cada vez que renueva el token al volver a
    // la pestaña, y no hace falta pedir el perfil de nuevo por eso.
  }, [sesion?.user?.id])

  return { sesion, perfil, errorPerfil, cargando: sesion === undefined }
}
