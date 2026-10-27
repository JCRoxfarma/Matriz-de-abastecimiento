-- Guarda el refresh token de Outlook mas reciente (modo delegado, ver
-- app/api/enviar-recordatorio.js). Microsoft entrega uno nuevo en cada
-- envio y cada uno vence a los ~90 dias; guardandolo aqui la autorizacion
-- no vence mientras se use.
--
-- RLS activo y SIN politicas: nadie puede leerla ni escribirla desde el
-- navegador. Solo el servidor, con SUPABASE_SERVICE_ROLE_KEY.
--
-- Correr una sola vez desde el SQL Editor de Supabase.

create table if not exists correo_credenciales (
  id int primary key check (id = 1),
  refresh_token text not null,
  actualizado_en timestamptz not null default now()
);

alter table correo_credenciales enable row level security;
