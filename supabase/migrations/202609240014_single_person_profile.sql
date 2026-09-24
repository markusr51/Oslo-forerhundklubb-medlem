begin;
create or replace view public.persons with(security_barrier=true) as select i.id,i.full_name,i.email,i.phone,p.membership_status,p.joined_date,p.resigned_date,p.notes,p.created_at,p.updated_at,m.membership_kind from public.portal_person_identities i join public.portal_member_profiles p on p.id=i.id left join public.portal_club_memberships m on m.person_id=i.id and m.club_id=p.club_id and m.role='member' where p.club_id=public.portal_current_club() and (public.portal_service_request() or public.portal_member_directory(p.club_id) or p.id=public.current_person_id());
create or replace view public.portal_oslo_people as select i.id,i.full_name,i.email,i.phone,p.membership_status,p.joined_date,p.resigned_date,p.notes,p.created_at,p.updated_at,m.membership_kind from public.portal_person_identities i join public.portal_member_profiles p on p.id=i.id left join public.portal_club_memberships m on m.person_id=i.id and m.club_id=p.club_id and m.role='member' where p.club_id='00000000-0000-4000-8000-000000000001';
create view public.portal_scoped_members with(security_barrier=true) as select i.id,i.full_name,i.email,i.phone,p.membership_status,p.joined_date,p.resigned_date,p.notes,p.created_at,p.updated_at,m.membership_kind,p.club_id from public.portal_person_identities i join public.portal_member_profiles p on p.id=i.id left join public.portal_club_memberships m on m.person_id=i.id and m.club_id=p.club_id and m.role='member' where public.portal_service_request() or public.is_system_admin() or p.id=public.current_person_id() or (p.club_id=public.portal_current_club() and public.portal_member_directory(p.club_id));
grant select on public.portal_scoped_members to authenticated,service_role;
create or replace function public.portal_write_member_profile() returns trigger language plpgsql security definer set search_path=public as $$
declare c uuid:=public.portal_current_club(); admin_ok boolean:=public.portal_club_admin(c);
begin
 if admin_ok is not true then
 if tg_op<>'UPDATE' or old.id is distinct from public.current_person_id() or
 (to_jsonb(new)-array['phone','email','updated_at']) is distinct from (to_jsonb(old)-array['phone','email','updated_at']) then
 raise exception 'Ingen tilgang til å endre medlemsopplysningene.' using errcode='42501';end if;
 end if;
 if tg_op='INSERT' then
 new.id:=coalesce(new.id,gen_random_uuid());
 if exists(select 1 from public.portal_person_identities where id=new.id) then
 if not public.is_system_admin() then raise exception 'Eksisterende identiteter knyttes til ny klubb av support.' using errcode='42501';end if;
 else
 insert into public.portal_person_identities(id,full_name,email,phone,membership_status,joined_date,resigned_date,notes)
 values(new.id,new.full_name,new.email,new.phone,coalesce(new.membership_status,'active'),new.joined_date,new.resigned_date,null);
 end if;
 insert into public.portal_member_profiles(id,club_id,membership_status,joined_date,resigned_date,notes,created_at,updated_at)
 values(new.id,c,coalesce(new.membership_status,'active'),new.joined_date,new.resigned_date,new.notes,now(),now());
 insert into public.portal_club_memberships(club_id,person_id,role,active,membership_kind) values(c,new.id,'member',true,new.membership_kind) on conflict do nothing;
 return new;
 elsif tg_op='UPDATE' then
 if new.id is distinct from old.id then raise exception 'Person-ID kan ikke endres.';end if;
 if new.membership_kind is distinct from old.membership_kind then raise exception 'Medlemskapstype endres under Support og klubbtilganger.';end if;
 update public.portal_person_identities set full_name=new.full_name,email=new.email,phone=new.phone,updated_at=now() where id=old.id;
 update public.portal_member_profiles set membership_status=new.membership_status,joined_date=new.joined_date,resigned_date=new.resigned_date,notes=new.notes,updated_at=now() where club_id=c and id=old.id;
 return new;
 else
 delete from public.portal_member_profiles where club_id=c and id=old.id;
 update public.portal_club_memberships set active=false where club_id=c and person_id=old.id and role in ('member','club_admin');
 return old;
 end if;
end $$;
create or replace function public.portal_profile_for_membership() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.active and new.role in ('member','club_admin') then
 insert into public.portal_member_profiles(id,club_id,membership_status,joined_date,created_at,updated_at)
 select id,new.club_id,'active',current_date,now(),now() from public.portal_person_identities where id=new.person_id
 on conflict(club_id,id) do nothing;
 end if;
 return new;
end $$;
alter table public.portal_member_profiles drop column full_name,drop column email,drop column phone;
create or replace function public.portal_club_contacts(c uuid) returns table(id uuid,full_name text,email text,phone text) language sql stable security definer set search_path=public as $$
 select distinct i.id,i.full_name,i.email,i.phone from public.portal_person_identities i join public.portal_club_memberships m on m.person_id=i.id and m.club_id=c and m.active
 where public.portal_club_admin(c) or i.id=public.current_person_id()
$$;
create or replace function public.portal_support_dog(action text, payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare d uuid; p uuid; r text;
begin
 if not public.is_system_admin() then raise exception 'Bare systemadministrator har tilgang.' using errcode='42501';end if;
 if action='create' then
 p:=(payload->>'person_id')::uuid;
 if not exists(select 1 from public.portal_person_identities where id=p) then raise exception 'Velg bruker som skal ha hunden.';end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'Hundens navn må fylles ut.';end if;
 insert into public.dogs(name) values(trim(payload->>'name')) returning id into d;
 insert into public.dog_person_links(dog_id,person_id,relation_type,active,valid_from) values(d,p,'handler',true,current_date);
 elsif action in ('link_handler','link_school') then
 d:=(payload->>'dog_id')::uuid;p:=(payload->>'person_id')::uuid;
 if not exists(select 1 from public.dogs where id=d) or not exists(select 1 from public.portal_person_identities where id=p) then raise exception 'Velg hund og person.';end if;
 if action='link_handler' then
 if not exists(select 1 from public.dog_person_links where dog_id=d and person_id=p and relation_type='handler' and active and (valid_to is null or valid_to>=current_date)) then
 insert into public.dog_person_links(dog_id,person_id,relation_type,active,valid_from) values(d,p,'handler',true,current_date);
 end if;
 else
 if not exists(select 1 from public.dog_professional_assignments where dog_id=d and professional_person_id=p and assignment_role='skoletrener' and club_id=coalesce((payload->>'club_id')::uuid,public.portal_current_club()) and active and (valid_to is null or valid_to>=current_date)) then
 insert into public.dog_professional_assignments(dog_id,professional_person_id,assignment_role,active,valid_from,club_id) values(d,p,'skoletrener',true,current_date,coalesce((payload->>'club_id')::uuid,public.portal_current_club()));
 end if;
 end if;
 elsif action='revoke_handler' then
 update public.dog_person_links set active=false,valid_to=current_date where id=(payload->>'id')::uuid returning dog_id into d;
 if not found then raise exception 'Tilknytningen finnes ikke.';end if;
 elsif action='revoke_school' then
 update public.dog_professional_assignments set active=false,valid_to=current_date where id=(payload->>'id')::uuid and assignment_role='skoletrener' returning dog_id into d;
 if not found then raise exception 'Tilknytningen finnes ikke.';end if;
 else raise exception 'Ukjent handling.';
 end if;
 return d;
end $$;
commit;
