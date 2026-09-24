-- Isolated test database only: minimum existing portal/Supabase schema.
create role authenticated;
create role anon;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key);
create table public.persons(id uuid primary key,full_name text);
create table public.app_users(user_id uuid primary key references auth.users,person_id uuid references persons,app_role text,active boolean default true);
create table public.dogs(id uuid primary key default gen_random_uuid(),name text not null,chip_number text,birth_date date,status text default 'active',notes text,updated_at timestamptz default now());
create table public.dog_person_links(id uuid primary key default gen_random_uuid(),dog_id uuid references dogs,person_id uuid references persons,relation_type text default 'handler',active boolean default true,valid_from date,valid_to date);
create table public.dog_professional_assignments(id uuid primary key default gen_random_uuid(),dog_id uuid references dogs,professional_person_id uuid references persons,assignment_role text,active boolean default true,valid_from date,valid_to date);
create table public.roles(id uuid primary key,name text);
create table public.person_roles(person_id uuid,role_id uuid,is_active boolean,started_at date,ended_at date);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);
alter table public.dogs enable row level security;
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to authenticated;
grant select on public.dogs to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
CREATE OR REPLACE FUNCTION public.current_person_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select au.person_id
  from public.app_users au
  where au.user_id = auth.uid()
    and coalesce(au.active, true) = true
  limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.is_system_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and active = true
      and app_role = 'system_admin'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.has_active_person_role(target_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.person_roles pr
    join public.roles r
      on r.id = pr.role_id
    where pr.person_id = public.current_person_id()
      and pr.is_active = true
      and lower(r.name) = lower(target_role)
      and (
        pr.started_at is null
        or pr.started_at <= current_date
      )
      and (
        pr.ended_at is null
        or pr.ended_at >= current_date
      )
  );
$function$
;

alter table dog_person_links enable row level security;
alter table dog_professional_assignments enable row level security;
grant select on dog_person_links,dog_professional_assignments to authenticated;

create table guideview_sessions(id uuid primary key default gen_random_uuid(),dog_id uuid references dogs,created_by uuid references persons);
alter table guideview_sessions enable row level security;
grant select on guideview_sessions to authenticated;
