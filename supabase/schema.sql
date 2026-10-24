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
alter table public.registros add column if not exists asesor text;
alter table public.registros add column if not exists subcanal text;
alter table public.registros add column if not exists comentario text;
alter table public.registros add column if not exists ya_alumno boolean not null default false;


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

-- 2b) Registro desde la página: solo se pueden crear cuentas @ucal.edu.pe
create or replace function public.solo_correos_ucal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) not like '%@ucal.edu.pe' then
    raise exception 'Solo correos @ucal.edu.pe';
  end if;
  return new;
end $$;

drop trigger if exists solo_correos_ucal on auth.users;
create trigger solo_correos_ucal before insert or update of email on auth.users
  for each row execute function public.solo_correos_ucal();

-- 3) Tiempo real (el corte se actualiza en todas las pantallas) --

do $$
begin
  begin alter publication supabase_realtime add table public.eventos;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.registros; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.cortes;    exception when duplicate_object then null; end;
end $$;

-- 4) Nombre Propio ------------------------------------------------
-- Todo texto libre se guarda como Nombre Propio ("JUAN DE LA CRUZ" → "Juan de la Cruz"),
-- lo escriba quien lo escriba (página, importación o Table Editor).
-- No se tocan los catálogos que usa la página: mundo, carrera, grado, confirmo, origen.
create or replace function public.nombre_propio(t text) returns text
language plpgsql immutable as $$
declare
  w text; r text; salida text := ''; i int;
  partes text[];
  particulas constant text[] := array['de','del','y','e','da','di','van','von'];
  articulos  constant text[] := array['la','las','los','el'];   -- en minúscula solo después de de/del
  siglas constant text[] := array['ie','iep','iei','iee','ep','ceba','cebe','cetpro','pronoei','ugel','pnp','fap','sac','srl','eirl','ucal','ads','tv','ii','iii','iv','vi','vii','viii','ix','xi','xii','xx','xxi'];
begin
  if t is null then return null; end if;
  t := regexp_replace(btrim(t), '\s+', ' ', 'g');
  if t = '' then return t; end if;
  partes := string_to_array(lower(t), ' ');
  for i in 1 .. array_length(partes, 1) loop
    w := partes[i];
    if i > 1 and (w = any(particulas) or (w = any(articulos) and partes[i-1] in ('de','del'))) then
      r := w;                                                             -- de, del, y · "de la", "de los"
    elsif w = any(siglas) or w ~ '[[:alpha:]]\.[[:alpha:]]' then r := upper(w);   -- IEP, I.E.P., UGEL, II…
    else r := initcap(w);                                                 -- Juan, O'Brien, Jean-Pierre
    end if;
    salida := salida || case when i > 1 then ' ' else '' end || r;
  end loop;
  return salida;
end $$;

create or replace function public.tg_nombre_propio() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'registros' then
    new.nombre      := public.nombre_propio(new.nombre);
    new.asesor      := public.nombre_propio(new.asesor);
    new.subcanal    := public.nombre_propio(new.subcanal);
    new.colegio     := public.nombre_propio(new.colegio);
    new.distrito    := public.nombre_propio(new.distrito);
    new.registrador := public.nombre_propio(new.registrador);
    if jsonb_typeof(new.acomp) = 'array' then
      new.acomp := coalesce((
        select jsonb_agg(case when jsonb_typeof(a) = 'object' and a->>'nombre' is not null
                              then jsonb_set(a, '{nombre}', to_jsonb(public.nombre_propio(a->>'nombre')))
                              else a end order by n)
        from jsonb_array_elements(new.acomp) with ordinality as x(a, n)), '[]'::jsonb);
    end if;
  elsif tg_table_name = 'colegios' then
    new.nombre       := public.nombre_propio(new.nombre);
    new.departamento := public.nombre_propio(new.departamento);
    new.provincia    := public.nombre_propio(new.provincia);
    new.distrito     := public.nombre_propio(new.distrito);
    new.direccion    := public.nombre_propio(new.direccion);
  elsif tg_table_name = 'eventos' then
    new.nombre := public.nombre_propio(new.nombre);
  end if;
  return new;
end $$;

drop trigger if exists nombre_propio on public.registros;
drop trigger if exists nombre_propio on public.colegios;
drop trigger if exists nombre_propio on public.eventos;
create trigger nombre_propio before insert or update on public.registros for each row execute function public.tg_nombre_propio();
create trigger nombre_propio before insert or update on public.colegios  for each row execute function public.tg_nombre_propio();
create trigger nombre_propio before insert or update on public.eventos   for each row execute function public.tg_nombre_propio();

-- Corrige lo que ya estaba guardado (solo toca las filas que cambian)
update public.eventos set nombre = nombre where nombre is distinct from public.nombre_propio(nombre);
update public.colegios set nombre = nombre
 where nombre is distinct from public.nombre_propio(nombre) or departamento is distinct from public.nombre_propio(departamento)
    or provincia is distinct from public.nombre_propio(provincia) or distrito is distinct from public.nombre_propio(distrito)
    or direccion is distinct from public.nombre_propio(direccion);
update public.registros set nombre = nombre;
