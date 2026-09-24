begin;
create function public.portal_service_request() returns boolean language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',nullif(current_setting('request.jwt.claim.role',true),''),'')='service_role'
$$;
create view public.portal_club_app_users with(security_barrier=true) as
 select a.user_id,a.display_name,
 case when a.app_role='system_admin' then 'system_admin' when exists(select 1 from public.portal_club_memberships m where m.person_id=a.person_id and m.club_id=c.id and m.role='club_admin' and m.active) then 'admin' else 'readonly' end as app_role,
 a.active,a.created_at,a.updated_at,a.person_id,a.must_change_password,a.first_login_completed_at,c.id as club_id
 from public.app_users a cross join public.portal_clubs c
 where (a.app_role='system_admin' or exists(select 1 from public.portal_club_memberships m where m.person_id=a.person_id and m.club_id=c.id and m.active))
 and (public.portal_service_request() or a.user_id=auth.uid() or public.is_system_admin() or public.portal_club_admin(c.id));
grant select on public.portal_club_app_users to authenticated,service_role;
grant select,insert,update,delete on public.portal_member_profiles to service_role;
create function public.portal_seed_club_roles() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.roles(name,description,club_id) select name,description,new.id from public.roles where club_id='00000000-0000-4000-8000-000000000001' and new.id<>club_id on conflict(club_id,name) do nothing;
 return new;
end $$;
create trigger portal_new_club_roles after insert on public.portal_clubs for each row execute function public.portal_seed_club_roles();
create function public.portal_seed_helper_roles() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.active and new.role='helper' then
 insert into public.person_roles(person_id,role_id,is_active,club_id)
 select distinct new.person_id,dst.id,true,new.club_id from public.person_roles pr join public.roles src on src.id=pr.role_id join public.roles dst on lower(dst.name)=lower(src.name) and dst.club_id=new.club_id
 where pr.person_id=new.person_id and pr.is_active and lower(src.name) in ('hjelpetrener','hjelpetreneraspirant') and (pr.started_at is null or pr.started_at<=current_date) and (pr.ended_at is null or pr.ended_at>=current_date)
 on conflict(person_id,role_id) do update set is_active=true;
 end if;
 return new;
end $$;
create trigger portal_helper_roles after insert or update on public.portal_club_memberships for each row execute function public.portal_seed_helper_roles();
-- Helper qualification is global to the person; club selection remains separate.
-- Member details never follow a helper-only membership.
create function public.portal_club_contacts(c uuid) returns table(id uuid,full_name text,email text,phone text) language sql stable security definer set search_path=public as $$
 select distinct i.id,coalesce(p.full_name,i.full_name),coalesce(p.email,i.email),coalesce(p.phone,i.phone)
 from public.portal_person_identities i join public.portal_club_memberships m on m.person_id=i.id and m.club_id=c and m.active left join public.portal_member_profiles p on p.id=i.id and p.club_id=c
 where public.portal_club_admin(c) or i.id=public.current_person_id()
$$;
revoke all on function public.portal_service_request(),public.portal_seed_club_roles(),public.portal_seed_helper_roles(),public.portal_club_contacts(uuid) from public;
grant execute on function public.portal_service_request(),public.portal_club_contacts(uuid) to authenticated,service_role;
commit;
