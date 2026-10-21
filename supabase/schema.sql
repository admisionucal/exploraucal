-- =============================================================
-- Registro Explora UCAL · Esquema de base de datos (Supabase)
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run
-- =============================================================

-- 1) Tablas -----------------------------------------------------

create table if not exists public.eventos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  fecha      date not null,
  creado_en  timestamptz not null default now()
);

create table if not exists public.registros (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.eventos(id) on delete cascade,
  nombre       text not null,
  celular      text,
  dni          text,
  id_prometeo  text,
  carrera      text,
  mundo        text,          -- ARQUITECTURA | COMUNICACIONES | DISEÑO | NEGOCIOS | PSICOLOGIA
  grado        text,          -- '3ero' | '4to' | '5to' | 'Ya acabo el colegio'
  egreso       int,
  colegio      text,
  cod_modular  text,
  confirmo     text,          -- 'Si' | 'No' (viene de la lista de inscritos)
  registrador  text,
  asistio      boolean not null default false,
  hora         timestamptz,   -- hora de llegada
  acomp        jsonb not null default '[]'::jsonb,  -- [{tipo, nombre, celular}]
  origen       text,          -- 'walkin' | 'import'
  usuario      uuid default auth.uid(),
  actualizado  timestamptz not null default now()
);
create index if not exists registros_evento_idx on public.registros(evento_id);

create table if not exists public.cortes (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.eventos(id) on delete cascade,
  hora       text not null,   -- 'HH:MM'
  label      text,
  total      int,
  by_mundo   jsonb,
  filas      jsonb,
  por        text,
  creado_en  timestamptz not null default now(),
  unique (evento_id, hora)
);

-- Columnas agregadas después (seguro volver a correr este archivo)
alter table public.registros add column if not exists distrito text;

-- Padrón de colegios (se sube desde la página: Importar > Colegios)
create table if not exists public.colegios (
  codigo_modular text primary key,   -- 7 dígitos, con ceros a la izquierda
  nombre         text not null,      -- CENTRO EDUCATIVO
  departamento   text,
  provincia      text,
  distrito       text,
  direccion      text
);

-- 2) Seguridad: solo usuarios con sesión y correo @ucal.edu.pe ---

create or replace function public.es_ucal() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@ucal.edu.pe'
$$;

alter table public.eventos   enable row level security;
alter table public.registros enable row level security;
alter table public.cortes    enable row level security;

drop policy if exists "ucal eventos"   on public.eventos;
drop policy if exists "ucal registros" on public.registros;
drop policy if exists "ucal cortes"    on public.cortes;

create policy "ucal eventos"   on public.eventos   for all to authenticated using (public.es_ucal()) with check (public.es_ucal());
create policy "ucal registros" on public.registros for all to authenticated using (public.es_ucal()) with check (public.es_ucal());
create policy "ucal cortes"    on public.cortes    for all to authenticated using (public.es_ucal()) with check (public.es_ucal());

alter table public.colegios enable row level security;
drop policy if exists "ucal colegios" on public.colegios;
create policy "ucal colegios"  on public.colegios  for all to authenticated using (public.es_ucal()) with check (public.es_ucal());

-- 3) Tiempo real (el corte se actualiza en todas las pantallas) --

do $$
begin
  begin alter publication supabase_realtime add table public.eventos;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.registros; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.cortes;    exception when duplicate_object then null; end;
end $$;
