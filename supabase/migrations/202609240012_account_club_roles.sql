begin;
create function public.portal_sync_account_club_role() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.person_id is null then return new;end if;
 if new.app_role='admin' then
 insert into public.portal_club_memberships(club_id,person_id,role,active) values(public.portal_current_club(),new.person_id,'club_admin',true)
 on conflict(club_id,person_id,role) do update set active=true;
 elsif tg_op='UPDATE' and old.app_role='admin' and new.app_role='readonly' then
 update public.portal_club_memberships set active=false where club_id=public.portal_current_club() and person_id=new.person_id and role='club_admin';
 end if;
 return new;
end $$;
create trigger portal_account_club_role after insert or update of app_role on public.app_users for each row execute function public.portal_sync_account_club_role();
revoke all on function public.portal_sync_account_club_role() from public;
commit;
