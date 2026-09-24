begin;
alter table public.portal_club_memberships add column membership_kind text check(membership_kind in ('primary','secondary'));
update public.portal_club_memberships set membership_kind='primary' where role='member';
create unique index portal_one_primary_membership on public.portal_club_memberships(person_id) where role='member' and active and membership_kind='primary';
create function public.portal_membership_kind_default() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.role<>'member' then new.membership_kind:=null;
 elsif new.membership_kind is null then
 new.membership_kind:=case when exists(select 1 from public.portal_club_memberships m where m.person_id=new.person_id and m.role='member' and m.active and m.membership_kind='primary' and m.club_id<>new.club_id) then 'secondary' else 'primary' end;
 end if;
 return new;
end $$;
create trigger portal_membership_kind before insert or update on public.portal_club_memberships for each row execute function public.portal_membership_kind_default();
create function public.portal_set_membership(p uuid,c uuid,kind text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_system_admin() then raise exception 'Endring av primærklubb administreres av support.' using errcode='42501';end if;
 if kind not in ('primary','secondary') then raise exception 'Velg primært eller sekundært medlemskap.';end if;
 perform 1 from public.portal_person_identities where id=p for update;
 if not found then raise exception 'Personen finnes ikke.';end if;
 if kind='primary' then update public.portal_club_memberships set membership_kind='secondary' where person_id=p and role='member' and active and membership_kind='primary' and club_id<>c;end if;
 insert into public.portal_club_memberships(club_id,person_id,role,active,membership_kind) values(c,p,'member',true,kind)
 on conflict(club_id,person_id,role) do update set active=true,membership_kind=excluded.membership_kind;
end $$;
insert into public.roles(name,description,club_id)
 select 'Ekstern ekvipasje','Ekvipasje med sekundært medlemskap i klubben',id from public.portal_clubs
 on conflict(club_id,name) do nothing;
create function public.portal_sync_equipage_membership() returns trigger language plpgsql security definer set search_path=public as $$
declare target_name text; target_id uuid; qualified boolean;
begin
 if new.role<>'member' then return new;end if;
 select exists(select 1 from public.person_roles pr join public.roles r on r.id=pr.role_id where pr.person_id=new.person_id and pr.is_active and lower(r.name) in ('ekvipasje','ekstern ekvipasje')) into qualified;
 if not qualified then return new;end if;
 target_name:=case when new.membership_kind='secondary' then 'ekstern ekvipasje' else 'ekvipasje' end;
 update public.person_roles pr set is_active=false from public.roles r where r.id=pr.role_id and pr.person_id=new.person_id and pr.club_id=new.club_id and lower(r.name) in ('ekvipasje','ekstern ekvipasje');
 if new.active then
 select id into target_id from public.roles where club_id=new.club_id and lower(name)=target_name;
 if target_id is null then
 insert into public.roles(name,club_id) values(case when new.membership_kind='secondary' then 'Ekstern ekvipasje' else 'Ekvipasje' end,new.club_id) returning id into target_id;
 end if;
 insert into public.person_roles(person_id,role_id,is_active,club_id) values(new.person_id,target_id,true,new.club_id)
 on conflict(person_id,role_id) do update set is_active=true;
 end if;
 return new;
end $$;
create trigger portal_equipage_membership after insert or update on public.portal_club_memberships for each row execute function public.portal_sync_equipage_membership();
create table public.portal_club_fees(
 club_id uuid not null references public.portal_clubs,year integer not null check(year between 2000 and 2200),
 amount numeric(12,2) not null check(amount>=0 and amount::text<>'NaN'),primary key(club_id,year)
);
alter table public.portal_club_fees enable row level security;
create policy portal_fees_read on public.portal_club_fees for select to authenticated using(portal_club_member(club_id) or is_system_admin());
create policy portal_fees_manage on public.portal_club_fees for all to authenticated using(portal_club_admin(club_id)) with check(portal_club_admin(club_id));
grant select,insert,update,delete on public.portal_club_fees to authenticated;
create trigger portal_fees_audit after insert or update or delete on public.portal_club_fees for each row execute function public.portal_audit_change();
revoke all on function public.portal_membership_kind_default(),public.portal_set_membership(uuid,uuid,text),public.portal_sync_equipage_membership() from public;
grant execute on function public.portal_set_membership(uuid,uuid,text) to authenticated;
commit;
