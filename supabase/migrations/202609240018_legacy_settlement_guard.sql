begin;
create function public.portal_guard_legacy_settlement() returns trigger language plpgsql security invoker set search_path=public as $$
declare base numeric; km numeric;
begin
 -- Trusted security-definer procedures enforce approval/support rules themselves.
 if current_user not in ('authenticated','anon') then return coalesce(new,old);end if;
 if tg_op='DELETE' then
 if old.status<>'registered' and not public.is_system_admin() then raise exception 'Godkjente og utbetalte poster kan ikke slettes.' using errcode='42501';end if;return old;
 end if;
 if tg_op='UPDATE' then
 if new.person_id<>old.person_id or new.club_id<>old.club_id or new.status<>old.status or old.status<>'registered' then raise exception 'Status og godkjente oppgjør endres i samlet oppgjør.' using errcode='42501';end if;
 if tg_table_name='helper_entries' and (new.rate_snapshot is distinct from old.rate_snapshot or new.mileage_rate_snapshot is distinct from old.mileage_rate_snapshot) then raise exception 'Satser fastsettes av serveren.' using errcode='42501';end if;
 else
 if new.status<>'registered' then raise exception 'Nye poster skal være registrert, ikke godkjent eller utbetalt.' using errcode='42501';end if;
 end if;
 if tg_table_name='helper_entries' then
 if tg_op='INSERT' or new.activity_date is distinct from old.activity_date or new.activity_type is distinct from old.activity_type then
 select amount into base from public.helper_rates where club_id=new.club_id and year=extract(year from new.activity_date) and rate_type=new.activity_type;
 select amount into km from public.helper_rates where club_id=new.club_id and year=extract(year from new.activity_date) and rate_type='mileage';
 if new.activity_type<>'other' and base is null then raise exception 'Klubben må registrere satser for dette året.';end if;
 if coalesce(new.kilometers,0)>0 and km is null then raise exception 'Klubben må registrere kilometersats for dette året.';end if;
 new.rate_snapshot:=coalesce(base,0);new.mileage_rate_snapshot:=coalesce(km,0);
 end if;
 end if;
 return new;
end $$;
create trigger portal_settlement_guard before insert or update or delete on public.helper_entries for each row execute function public.portal_guard_legacy_settlement();
create trigger portal_settlement_guard before insert or update or delete on public.helper_expenses for each row execute function public.portal_guard_legacy_settlement();
revoke all on function public.portal_guard_legacy_settlement() from public;
-- Keep independently granted helper/staff roles when a membership ends.
create function public.portal_membership_status_access() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.membership_status is distinct from old.membership_status then
 update public.portal_club_memberships m set active=(new.membership_status='active'),membership_kind=case when new.membership_status='active' and exists(select 1 from public.portal_club_memberships x where x.person_id=m.person_id and x.club_id<>m.club_id and x.role='member' and x.active and x.membership_kind='primary') then 'secondary' else m.membership_kind end
 where m.club_id=new.club_id and m.person_id=new.id and m.role='member';
 end if;return new;
end $$;
create trigger portal_membership_status_access after update of membership_status on public.portal_member_profiles for each row execute function public.portal_membership_status_access();
revoke all on function public.portal_membership_status_access() from public;
CREATE OR REPLACE FUNCTION public.sync_helper_entry_from_event_person()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev record;
  activity_kind text;
  yr integer;
  base_rate numeric;
  km_rate numeric;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if lower(coalesce(new.function_name,'')) <> 'hjelpetrener' then
    return new;
  end if;

  select
    id,
    title,
    event_date,
    end_date,club_id
  into ev
  from public.events
  where id = new.event_id;

  if ev.id is null then
    return new;
  end if;

  if ev.end_date is not null
     and ev.end_date > ev.event_date then
    activity_kind := 'weekend_event';
  else
    activity_kind := 'day_event';
  end if;

  yr := extract(year from ev.event_date)::int;

  select coalesce(amount,0) into base_rate from public.helper_rates where club_id=ev.club_id and year=yr and rate_type=activity_kind;

  select coalesce(amount,0) into km_rate from public.helper_rates where club_id=ev.club_id and year=yr and rate_type='mileage';

  insert into public.helper_entries(
    club_id,person_id,
    event_id,
    source,
    activity_date,
    activity_type,
    description,
    rate_snapshot,
    mileage_rate_snapshot
  )
  values(
    ev.club_id,new.person_id,
    new.event_id,
    'event',
    ev.event_date,
    activity_kind,
    ev.title,
    base_rate,
    km_rate
  )
  on conflict (person_id, event_id, source)
  do update set
    activity_date = excluded.activity_date,
    activity_type = excluded.activity_type,
    description = excluded.description,
    rate_snapshot = public.helper_entries.rate_snapshot,
    mileage_rate_snapshot = public.helper_entries.mileage_rate_snapshot
    where public.helper_entries.status='registered';

  return new;
end;
$function$
;

update public.portal_club_memberships m set active=false from public.portal_member_profiles p where p.id=m.person_id and p.club_id=m.club_id and m.role='member' and m.active and p.membership_status in ('inactive','resigned');
commit;
