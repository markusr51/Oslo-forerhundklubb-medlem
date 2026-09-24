begin;
alter table public.guideview_sessions add column club_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.portal_clubs;
alter table public.dog_professional_assignments add column club_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.portal_clubs;
create index on public.guideview_sessions(club_id);
create function public.portal_gv_is_admin(c uuid default null, s uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select case when s is not null then exists(select 1 from public.guideview_sessions g where g.id=s and public.portal_club_admin(g.club_id)) else public.portal_club_admin(c) end
$$;
create function public.portal_gv_people(c uuid) returns setof uuid language sql stable security definer set search_path=public as $$
 select distinct m.person_id from public.portal_club_memberships m where m.club_id=c and m.active and public.portal_club_admin(c)
$$;
create function public.portal_gv_can_create(d uuid,c uuid,h uuid,k text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.portal_clubs where id=c and active) and (
 (public.portal_club_admin(c) and exists(select 1 from public.dog_person_links l join public.portal_club_memberships m on m.person_id=l.person_id and m.club_id=c and m.active
 where l.dog_id=d and l.person_id=h and l.active and l.relation_type='handler' and (l.valid_from is null or l.valid_from<=current_date) and (l.valid_to is null or l.valid_to>=current_date)))
 or exists(select 1 from public.dog_professional_assignments a where a.dog_id=d and a.club_id=c and a.professional_person_id=public.current_person_id() and a.active and (a.valid_from is null or a.valid_from<=current_date) and (a.valid_to is null or a.valid_to>=current_date)
 and ((k='school_training' and a.assignment_role='skoletrener') or (k='follow_up' and a.assignment_role in ('hjelpetrener','hjelpetreneraspirant')))))
$$;
create function public.portal_gv_assignment_allowed(c uuid,d uuid,p uuid,a uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select case when a is not null then exists(select 1 from public.dog_professional_assignments x where x.id=a and public.portal_club_admin(x.club_id)) else
 public.portal_club_admin(c) and exists(select 1 from public.portal_club_memberships m where m.club_id=c and m.person_id=p and m.active)
 and exists(select 1 from public.dog_person_links l join public.portal_club_memberships m on m.person_id=l.person_id and m.club_id=c and m.active where l.dog_id=d and l.active and l.relation_type in ('handler','co_handler','owner') and (l.valid_from is null or l.valid_from<=current_date) and (l.valid_to is null or l.valid_to>=current_date)) end
$$;
create policy portal_gv_support_read on public.guideview_sessions for select to authenticated using(is_system_admin());
revoke all on function public.portal_gv_is_admin(uuid,uuid),public.portal_gv_people(uuid),public.portal_gv_can_create(uuid,uuid,uuid,text),public.portal_gv_assignment_allowed(uuid,uuid,uuid,uuid) from public;
grant execute on function public.portal_gv_is_admin(uuid,uuid),public.portal_gv_people(uuid),public.portal_gv_can_create(uuid,uuid,uuid,text),public.portal_gv_assignment_allowed(uuid,uuid,uuid,uuid) to authenticated;
commit;
