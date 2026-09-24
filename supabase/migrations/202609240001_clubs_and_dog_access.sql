-- Additive foundation. Do not activate extra clubs until legacy access paths are migrated.
begin;
create table public.portal_clubs (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name))>0),
 active boolean not null default false, created_at timestamptz not null default now()
);
create table public.portal_club_memberships (
 club_id uuid not null references public.portal_clubs(id), person_id uuid not null references public.persons(id),
 role text not null check(role in ('member','helper','club_admin')), active boolean not null default true,
 primary key(club_id,person_id,role)
);
create table public.portal_clinics (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name))>0), active boolean not null default true
);
create table public.portal_staff_access (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.persons(id),
 role text not null check(role in ('veterinarian','nav')), clinic_id uuid references public.portal_clinics(id),
 active boolean not null default true,
 check((role='veterinarian' and clinic_id is not null) or (role='nav' and clinic_id is null))
);
create unique index portal_staff_unique on public.portal_staff_access(person_id,role,coalesce(clinic_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.portal_dog_clinics (
 dog_id uuid primary key references public.dogs(id), clinic_id uuid not null references public.portal_clinics(id),
 updated_at timestamptz not null default now()
);
create table public.portal_dog_records (
 id uuid primary key default gen_random_uuid(), dog_id uuid not null references public.dogs(id),
 title text not null check(length(trim(title))>0), body text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.portal_dog_documents (
 id uuid primary key default gen_random_uuid(), dog_id uuid not null references public.dogs(id),
 name text not null check(length(trim(name))>0), storage_path text not null unique,
 created_at timestamptz not null default now(),
 check(storage_path=dog_id::text || '/' || id::text)
);
create table public.portal_access_audit (
 id bigint generated always as identity primary key, actor_user_id uuid, happened_at timestamptz not null default now(),
 entity text not null, entity_id text, operation text not null, old_value jsonb, new_value jsonb
);
create function public.portal_audit_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.portal_access_audit(actor_user_id,entity,entity_id,operation,old_value,new_value)
 values(auth.uid(),tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'dog_id',to_jsonb(old)->>'dog_id'),tg_op,to_jsonb(old),to_jsonb(new));
 return coalesce(new,old);
end $$;
create function public.portal_owns_dog(d uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.dog_person_links l where l.dog_id=d and l.person_id=public.current_person_id()
 and l.active and l.relation_type in ('handler','co_handler','owner')
 and (l.valid_from is null or l.valid_from<=current_date) and (l.valid_to is null or l.valid_to>=current_date))
$$;
create function public.portal_can_dog(d uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.current_person_id() is not null and (
 public.is_system_admin() or public.portal_owns_dog(d)
 or exists(select 1 from public.portal_staff_access s where s.person_id=public.current_person_id() and s.active and
   (s.role='nav' or (s.role='veterinarian' and exists(select 1 from public.portal_dog_clinics dc join public.portal_clinics c on c.id=dc.clinic_id where dc.dog_id=d and dc.clinic_id=s.clinic_id and c.active))))
 or exists(select 1 from public.dog_professional_assignments a where a.dog_id=d and a.professional_person_id=public.current_person_id()
 and a.assignment_role='skoletrener' and a.active and (a.valid_from is null or a.valid_from<=current_date) and (a.valid_to is null or a.valid_to>=current_date)))
$$;
create function public.portal_club_admin(c uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_system_admin() or exists(select 1 from public.portal_club_memberships m where m.club_id=c and m.person_id=public.current_person_id() and m.role='club_admin' and m.active)
$$;
create function public.portal_my_clubs() returns table(club_id uuid,name text,roles text[]) language sql stable security definer set search_path=public as $$
 select c.id,c.name,coalesce(array_agg(m.role) filter(where m.role is not null),array[]::text[]) from public.portal_clubs c
 left join public.portal_club_memberships m on m.club_id=c.id and m.person_id=public.current_person_id() and m.active
 where public.current_person_id() is not null and c.active and (public.is_system_admin() or m.person_id is not null)
 group by c.id,c.name order by c.name
$$;
create function public.portal_set_helper_clubs(club_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare pid uuid:=public.current_person_id();
begin
 if pid is null or not (public.has_active_person_role('hjelpetrener') or public.has_active_person_role('hjelpetreneraspirant') or public.is_system_admin()) then raise exception 'Ingen hjelpetrenerrolle.' using errcode='42501';end if;
 if club_ids is null or exists(select 1 from unnest(club_ids) x where not exists(select 1 from public.portal_clubs c where c.id=x and c.active)) then raise exception 'Ugyldig klubbvalg.';end if;
 update public.portal_club_memberships set active=false where person_id=pid and role='helper' and active;
 insert into public.portal_club_memberships(club_id,person_id,role,active) select distinct unnest(club_ids),pid,'helper',true
 on conflict(club_id,person_id,role) do update set active=true;
end $$;

-- Direct table operations use RLS, including support actions; no service-role client needed.
do $$ declare t text;begin
 foreach t in array array['portal_clubs','portal_club_memberships','portal_clinics','portal_staff_access','portal_dog_clinics','portal_dog_records','portal_dog_documents','portal_access_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 if t<>'portal_access_audit' then
 execute format('create trigger portal_audit after insert or update or delete on public.%I for each row execute function public.portal_audit_change()',t);
 end if;
 end loop;
end $$;
create policy portal_clubs_read on public.portal_clubs for select to authenticated using (current_person_id() is not null and (active or is_system_admin()));
create policy portal_clubs_support on public.portal_clubs for all to authenticated using(is_system_admin()) with check(is_system_admin());
create policy portal_members_read on public.portal_club_memberships for select to authenticated using(person_id=current_person_id() or portal_club_admin(club_id));
create policy portal_members_support on public.portal_club_memberships for all to authenticated using(is_system_admin()) with check(is_system_admin());
create policy portal_clinics_read on public.portal_clinics for select to authenticated using(current_person_id() is not null and (active or is_system_admin()));
create policy portal_clinics_support on public.portal_clinics for all to authenticated using(is_system_admin()) with check(is_system_admin());
create policy portal_staff_self on public.portal_staff_access for select to authenticated using(person_id=current_person_id());
create policy portal_staff_support on public.portal_staff_access for all to authenticated using(is_system_admin()) with check(is_system_admin());
create policy portal_dog_clinic_read on public.portal_dog_clinics for select to authenticated using(portal_can_dog(dog_id));
create policy portal_dog_clinic_owner on public.portal_dog_clinics for all to authenticated
 using(is_system_admin() or portal_owns_dog(dog_id)) with check((is_system_admin() or portal_owns_dog(dog_id)) and exists(select 1 from public.portal_clinics c where c.id=clinic_id and c.active));
create policy portal_dog_read on public.dogs for select to authenticated using(portal_can_dog(id));
create policy portal_dog_records_all on public.portal_dog_records for all to authenticated using(portal_can_dog(dog_id)) with check(portal_can_dog(dog_id));
create policy portal_dog_docs_all on public.portal_dog_documents for all to authenticated using(portal_can_dog(dog_id)) with check(portal_can_dog(dog_id));
create policy portal_audit_support_read on public.portal_access_audit for select to authenticated using(is_system_admin());
revoke insert,update,delete on public.portal_access_audit from authenticated;

-- Updating selected profile fields through an allowlisted, authorized procedure prevents changing dog identity.
create function public.portal_save_dog(d uuid, dog_name text, chip text, birthday date, dog_notes text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.portal_can_dog(d) then raise exception 'Ingen tilgang til hunden.' using errcode='42501';end if;
 if dog_name is null or length(trim(dog_name))=0 then raise exception 'Hundens navn må fylles ut.';end if;
 update public.dogs set name=trim(dog_name),chip_number=nullif(trim(chip),''),birth_date=birthday,notes=dog_notes,updated_at=now() where id=d;
 if not found then raise exception 'Hunden finnes ikke.';end if;
end $$;
create trigger portal_dog_audit after update on public.dogs for each row execute function public.portal_audit_change();
insert into storage.buckets(id,name,public,file_size_limit) values('portal-dog-documents','portal-dog-documents',false,26214400);
create function public.portal_can_dog_document(p text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.portal_dog_documents d where d.storage_path=p and public.portal_can_dog(d.dog_id))
$$;
create policy portal_dog_file_read on storage.objects for select to authenticated using(bucket_id='portal-dog-documents' and public.portal_can_dog_document(name));
create policy portal_dog_file_upload on storage.objects for insert to authenticated with check(bucket_id='portal-dog-documents' and public.portal_can_dog_document(name));
create policy portal_dog_file_delete on storage.objects for delete to authenticated using(bucket_id='portal-dog-documents' and public.portal_can_dog_document(name));

-- Restrict function invocation explicitly; RLS helpers expose only caller-relative booleans.
revoke all on function public.portal_audit_change() from public;
do $$ declare r record;begin
 for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'portal_%' and p.proname<>'portal_audit_change' loop
 execute format('revoke all on function %s from public',r.sig);
 execute format('grant execute on function %s to authenticated',r.sig);
 end loop;
end $$;
commit;
