import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Contactos from './Contactos.jsx'
import ConfirmarProveedor from './ConfirmarProveedor.jsx'

const path = window.location.pathname
const page = path === '/contactos' ? <Contactos />
  : path === '/confirmar' ? <ConfirmarProveedor />
  : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
