begin;
create or replace function public.portal_gv_can_create(d uuid,c uuid,h uuid,k text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.portal_clubs where id=c and active) and (
 (public.portal_club_admin(c) and exists(select 1 from public.dog_person_links l join public.portal_club_memberships m on m.person_id=l.person_id and m.club_id=c and m.active
 where l.dog_id=d and l.person_id=h and l.active and l.relation_type='handler' and (l.valid_from is null or l.valid_from<=current_date) and (l.valid_to is null or l.valid_to>=current_date)))
 or (exists(select 1 from public.dog_person_links l where l.dog_id=d and l.person_id=h and l.active and l.relation_type='handler' and (l.valid_from is null or l.valid_from<=current_date) and (l.valid_to is null or l.valid_to>=current_date)) and exists(select 1 from public.dog_professional_assignments a where a.dog_id=d and a.professional_person_id=public.current_person_id() and a.active and (a.valid_from is null or a.valid_from<=current_date) and (a.valid_to is null or a.valid_to>=current_date)
 and ((k='school_training' and a.assignment_role='skoletrener') or (k='follow_up' and a.assignment_role in ('hjelpetrener','hjelpetreneraspirant'))))))
$$;

create function public.portal_gv_options(c uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with links as (select l.* from public.dog_person_links l where l.active and l.relation_type='handler' and (l.valid_from is null or l.valid_from<=current_date) and (l.valid_to is null or l.valid_to>=current_date) and (
 (public.portal_club_admin(c) and exists(select 1 from public.portal_club_memberships m where m.person_id=l.person_id and m.club_id=c and m.active)) or exists(select 1 from public.dog_professional_assignments a where a.dog_id=l.dog_id and a.professional_person_id=public.current_person_id() and a.active and (a.valid_from is null or a.valid_from<=current_date) and (a.valid_to is null or a.valid_to>=current_date))))
 select jsonb_build_object('links',coalesce((select jsonb_agg(to_jsonb(l)) from links l),'[]'), 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name)) from public.portal_person_identities p where p.id in(select person_id from links)),'[]'),'dogs',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name)) from public.dogs d where d.id in(select dog_id from links)),'[]'))
$$;
create function public.portal_gv_my_roles() returns setof text language sql stable security definer set search_path=public as $$
 select assignment_role from public.dog_professional_assignments where professional_person_id=public.current_person_id() and active and (valid_from is null or valid_from<=current_date) and (valid_to is null or valid_to>=current_date)
 union select 'ekvipasje' from public.dog_person_links where person_id=public.current_person_id() and active and relation_type='handler' and (valid_from is null or valid_from<=current_date) and (valid_to is null or valid_to>=current_date)
$$;
revoke all on function public.portal_gv_options(uuid),public.portal_gv_my_roles() from public;
grant execute on function public.portal_gv_options(uuid),public.portal_gv_my_roles() to authenticated;
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
 elsif action in ('link_handler','link_school','link_helper','link_aspirant') then
 d:=(payload->>'dog_id')::uuid;p:=(payload->>'person_id')::uuid;
 if not exists(select 1 from public.dogs where id=d) or not exists(select 1 from public.portal_person_identities where id=p) then raise exception 'Velg hund og person.';end if;
 if action='link_handler' then
 if not exists(select 1 from public.dog_person_links where dog_id=d and person_id=p and relation_type='handler' and active and (valid_to is null or valid_to>=current_date)) then
 insert into public.dog_person_links(dog_id,person_id,relation_type,active,valid_from) values(d,p,'handler',true,current_date);
 end if;
 else
 r:=case action when 'link_helper' then 'hjelpetrener' when 'link_aspirant' then 'hjelpetreneraspirant' else 'skoletrener' end;
 if not exists(select 1 from public.dog_professional_assignments where dog_id=d and professional_person_id=p and assignment_role=r and club_id=coalesce((payload->>'club_id')::uuid,public.portal_current_club()) and active and (valid_to is null or valid_to>=current_date)) then
 insert into public.dog_professional_assignments(dog_id,professional_person_id,assignment_role,active,valid_from,club_id) values(d,p,r,true,current_date,coalesce((payload->>'club_id')::uuid,public.portal_current_club()));
 end if;
 end if;
 elsif action='revoke_handler' then
 update public.dog_person_links set active=false,valid_to=current_date where id=(payload->>'id')::uuid returning dog_id into d;
 if not found then raise exception 'Tilknytningen finnes ikke.';end if;
 elsif action='revoke_school' then
 update public.dog_professional_assignments set active=false,valid_to=current_date where id=(payload->>'id')::uuid returning dog_id into d;
 if not found then raise exception 'Tilknytningen finnes ikke.';end if;
 else raise exception 'Ukjent handling.';
 end if;
 return d;
end $$;

commit;
