begin;
-- File requests may omit the selected-club header. Check the folder's own club.
create or replace function public.library_can(target_folder uuid,requested_action text) returns boolean language sql stable security definer set search_path=public as $$
 select public.current_person_id() is not null and exists(
 select 1 from public.library_folders f where f.id=target_folder and
 (public.portal_club_admin(f.club_id) or exists(
 select 1 from public.library_folder_permissions p where p.folder_id=f.id and p.club_id=f.club_id
 and (p.subject_type='all_authenticated' or (public.portal_club_member(f.club_id) and (
 (p.subject_type='app_role' and p.app_role=case when public.portal_club_admin(f.club_id) then 'admin' else 'readonly' end)
 or (p.subject_type='role' and exists(select 1 from public.person_roles pr where pr.person_id=public.current_person_id() and pr.role_id=p.role_id and pr.club_id=f.club_id and pr.is_active and (pr.started_at is null or pr.started_at<=current_date) and (pr.ended_at is null or pr.ended_at>=current_date)))
 or (p.subject_type='group' and exists(select 1 from public.group_members gm where gm.person_id=public.current_person_id() and gm.group_id=p.group_id and gm.club_id=f.club_id)))))
 and case requested_action when 'read' then p.can_read when 'upload' then p.can_upload when 'edit' then p.can_edit when 'delete' then p.can_delete else false end)))
$$;
-- Contact information for services includes helpers who are not club members.
-- It deliberately excludes private membership notes and financial information.
create view public.portal_service_contacts with(security_barrier=true) as
 select distinct i.id,i.full_name,i.email,i.phone,m.club_id from public.portal_person_identities i
 join public.portal_club_memberships m on m.person_id=i.id and m.active
 where public.portal_service_request();
revoke all on public.portal_service_contacts from public,anon,authenticated;
grant select on public.portal_service_contacts to service_role;
-- Existing helpers continue working for Oslo; later choices are controlled by each helper.
insert into public.portal_club_memberships(club_id,person_id,role,active)
 select distinct '00000000-0000-4000-8000-000000000001'::uuid,pr.person_id,'helper',true
 from public.person_roles pr join public.roles r on r.id=pr.role_id
 where pr.club_id='00000000-0000-4000-8000-000000000001' and pr.is_active and lower(r.name) in ('hjelpetrener','hjelpetreneraspirant') and (pr.started_at is null or pr.started_at<=current_date) and (pr.ended_at is null or pr.ended_at>=current_date)
 on conflict do nothing;
-- These table privileges bypass row policies and are never needed by a portal user.
do $$declare r record;begin
 for r in select tablename from pg_tables where schemaname='public' loop
 execute format('revoke truncate,references,trigger on public.%I from authenticated,anon',r.tablename);
 end loop;
end $$;
commit;
