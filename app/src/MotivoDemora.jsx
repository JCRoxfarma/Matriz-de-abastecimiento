import { MOTIVOS_OC, MOTIVOS_OI, RESP, responsableDeMotivo } from './lib/derive'

// Motivo de demora / reprogramacion y su responsable (definido por Johany):
// cada motivo tiene su responsable fijo, que se asigna solo; con "Otros"
// se escribe el motivo y se elige el responsable a mano. En OI hay dos
// motivos mas: roleo de carga y tramite aduanero.
export default function MotivoDemora({ tipo = 'oc', mot, setMot, det, setDet, resp, setResp }) {
  const motivos = tipo === 'oi' ? MOTIVOS_OI : MOTIVOS_OC
  const fijo = responsableDeMotivo(mot)

  function cambiarMotivo(nuevo) {
    setMot(nuevo)
    const r = responsableDeMotivo(nuevo)
    if (r) setResp(r)
    else if (nuevo === '') setResp('')
  }

  return (
    <>
      <div className="fld">
        <label>Motivo de demora / reprogramación</label>
        <select value={mot} onChange={e => cambiarMotivo(e.target.value)}>
          <option value="">sin motivo</option>
          {motivos.map(m => <option key={m.motivo} value={m.motivo}>{m.motivo}</option>)}
        </select>
        {mot === 'Otros' && (
          <input type="text" style={{ marginTop: 6 }} placeholder="Indica el motivo" value={det} onChange={e => setDet(e.target.value)} />
        )}
      </div>
      <div className="fld">
        <label>Responsable de la acción</label>
        {fijo ? (
          <div className="ro-val">{fijo}</div>
        ) : (
          <select value={resp} onChange={e => setResp(e.target.value)} disabled={!mot}>
            <option value="">sin asignar</option>
            {RESP.filter(Boolean).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        {fijo && <div className="hint">Se asigna solo según el motivo.</div>}
      </div>
    </>
  )
}
