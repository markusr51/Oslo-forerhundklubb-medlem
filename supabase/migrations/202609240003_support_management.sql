begin;
-- Support can maintain ownership and school assignments without exposing these
-- mutations to NAV, veterinarians or club administrators.
create function public.portal_support_dog(action text, payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare d uuid; p uuid; r text;
begin
 if not public.is_system_admin() then raise exception 'Bare systemadministrator har tilgang.' using errcode='42501';end if;
 if action='create' then
 p:=(payload->>'person_id')::uuid;
 if not exists(select 1 from public.persons where id=p) then raise exception 'Velg bruker som skal ha hunden.';end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'Hundens navn må fylles ut.';end if;
 insert into public.dogs(name) values(trim(payload->>'name')) returning id into d;
 insert into public.dog_person_links(dog_id,person_id,relation_type,active,valid_from) values(d,p,'handler',true,current_date);
 elsif action in ('link_handler','link_school') then
 d:=(payload->>'dog_id')::uuid;p:=(payload->>'person_id')::uuid;
 if not exists(select 1 from public.dogs where id=d) or not exists(select 1 from public.persons where id=p) then raise exception 'Velg hund og person.';end if;
 if action='link_handler' then
 if not exists(select 1 from public.dog_person_links where dog_id=d and person_id=p and relation_type='handler' and active and (valid_to is null or valid_to>=current_date)) then
 insert into public.dog_person_links(dog_id,person_id,relation_type,active,valid_from) values(d,p,'handler',true,current_date);
 end if;
 else
 if not exists(select 1 from public.dog_professional_assignments where dog_id=d and professional_person_id=p and assignment_role='skoletrener' and active and (valid_to is null or valid_to>=current_date)) then
 insert into public.dog_professional_assignments(dog_id,professional_person_id,assignment_role,active,valid_from) values(d,p,'skoletrener',true,current_date);
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
revoke all on function public.portal_support_dog(text,jsonb) from public;
grant execute on function public.portal_support_dog(text,jsonb) to authenticated;
create policy portal_support_links_read on public.dog_person_links for select to authenticated using(is_system_admin());
create policy portal_support_assignments_read on public.dog_professional_assignments for select to authenticated using(is_system_admin());
create trigger portal_link_audit after insert or update or delete on public.dog_person_links for each row execute function public.portal_audit_change();
create trigger portal_assignment_audit after insert or update or delete on public.dog_professional_assignments for each row execute function public.portal_audit_change();
commit;
