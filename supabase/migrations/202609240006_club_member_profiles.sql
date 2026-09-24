begin;
-- One login/identity, separate membership details and notes in each club.
alter table public.persons rename to portal_person_identities;
create table public.portal_member_profiles (like public.portal_person_identities including defaults);
alter table public.portal_member_profiles add column club_id uuid not null references public.portal_clubs;
alter table public.portal_member_profiles add primary key(club_id,id);
alter table public.portal_member_profiles add foreign key(id) references public.portal_person_identities(id);
insert into public.portal_member_profiles select p.*,'00000000-0000-4000-8000-000000000001'::uuid from public.portal_person_identities p;
alter table public.portal_member_profiles enable row level security;
create function public.portal_member_directory(c uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_system_admin() or exists(select 1 from public.portal_club_memberships m where m.club_id=c and m.person_id=public.current_person_id() and m.active and m.role in ('member','club_admin'))
$$;
create policy portal_member_profiles_read on public.portal_member_profiles for select to authenticated using(club_id=public.portal_current_club() and (public.portal_member_directory(club_id) or id=public.current_person_id()));
grant select on public.portal_member_profiles to authenticated;
-- Identity metadata is available only to support and the identity's owner.
do $$declare r record;begin
 for r in select policyname from pg_policies where schemaname='public' and tablename='portal_person_identities' loop
 execute format('drop policy %I on public.portal_person_identities',r.policyname);
 end loop;
end $$;
create policy portal_identity_read on public.portal_person_identities for select to authenticated using(public.is_system_admin() or id=public.current_person_id());
create policy portal_identity_support on public.portal_person_identities for all to authenticated using(public.is_system_admin()) with check(public.is_system_admin());
-- This view intentionally applies its own authorization; it never exposes an
-- identity's profile from another club, even to a club administrator.
create view public.persons with (security_barrier=true) as
 select i.id,p.full_name,p.email,p.phone,p.membership_status,p.joined_date,p.resigned_date,p.notes,p.created_at,p.updated_at
 from public.portal_person_identities i join public.portal_member_profiles p on p.id=i.id
 where p.club_id=public.portal_current_club() and (public.portal_member_directory(p.club_id) or p.id=public.current_person_id());
grant select,insert,update,delete on public.persons to authenticated;
create function public.portal_write_member_profile() returns trigger language plpgsql security definer set search_path=public as $$
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
 insert into public.portal_member_profiles(id,club_id,full_name,email,phone,membership_status,joined_date,resigned_date,notes,created_at,updated_at)
 values(new.id,c,new.full_name,new.email,new.phone,coalesce(new.membership_status,'active'),new.joined_date,new.resigned_date,new.notes,now(),now());
 insert into public.portal_club_memberships(club_id,person_id,role,active) values(c,new.id,'member',true) on conflict do nothing;
 return new;
 elsif tg_op='UPDATE' then
 if new.id is distinct from old.id then raise exception 'Person-ID kan ikke endres.';end if;
 update public.portal_member_profiles set full_name=new.full_name,email=new.email,phone=new.phone,membership_status=new.membership_status,joined_date=new.joined_date,resigned_date=new.resigned_date,notes=new.notes,updated_at=now() where club_id=c and id=old.id;
 return new;
 else
 delete from public.portal_member_profiles where club_id=c and id=old.id;
 update public.portal_club_memberships set active=false where club_id=c and person_id=old.id and role in ('member','club_admin');
 return old;
 end if;
end $$;
create trigger portal_write_member instead of insert or update or delete on public.persons for each row execute function public.portal_write_member_profile();
create function public.portal_profile_for_membership() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.active and new.role in ('member','club_admin') then
 insert into public.portal_member_profiles(id,club_id,full_name,email,phone,membership_status,joined_date,created_at,updated_at)
 select id,new.club_id,full_name,email,phone,'active',current_date,now(),now() from public.portal_person_identities where id=new.person_id
 on conflict(club_id,id) do nothing;
 end if;
 return new;
end $$;
create trigger portal_membership_profile after insert or update on public.portal_club_memberships for each row execute function public.portal_profile_for_membership();
create trigger portal_member_profile_audit after insert or update or delete on public.portal_member_profiles for each row execute function public.portal_audit_change();
create view public.portal_oslo_people as select i.id,p.full_name,p.email,p.phone,p.membership_status,p.joined_date,p.resigned_date,p.notes,p.created_at,p.updated_at
 from public.portal_person_identities i join public.portal_member_profiles p on p.id=i.id where p.club_id='00000000-0000-4000-8000-000000000001';
revoke all on public.portal_oslo_people from public,anon,authenticated;
grant select on public.portal_oslo_people to service_role;
revoke all on function public.portal_member_directory(uuid),public.portal_write_member_profile(),public.portal_profile_for_membership() from public;
grant execute on function public.portal_member_directory(uuid) to authenticated,service_role;
commit;
