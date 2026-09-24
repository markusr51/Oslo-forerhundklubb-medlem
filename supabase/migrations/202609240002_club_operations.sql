begin;
-- Existing portal records remain the Oslo club's legacy records.
insert into public.portal_clubs(id,name,active) values('00000000-0000-4000-8000-000000000001','Oslo Førerhundklubb',true);
insert into public.portal_club_memberships(club_id,person_id,role)
 select '00000000-0000-4000-8000-000000000001',id,'member' from public.persons;
insert into public.portal_club_memberships(club_id,person_id,role)
 select '00000000-0000-4000-8000-000000000001',person_id,'club_admin' from public.app_users where app_role='admin' and active and person_id is not null on conflict do nothing;

-- Legacy membership access must not be inherited by new clinic/NAV/club accounts.
create or replace function public.current_app_role() returns text language sql stable security definer set search_path=public as $$
 select case when a.app_role='system_admin' then 'system_admin'
 when exists(select 1 from public.portal_club_memberships m where m.person_id=a.person_id and m.club_id='00000000-0000-4000-8000-000000000001' and m.active and m.role in ('member','club_admin')) then a.app_role
 else 'portal_user' end from public.app_users a where a.user_id=auth.uid() and a.active limit 1
$$;
create or replace function public.can_access_members() returns boolean language sql stable security definer set search_path=public as $$select public.current_app_role() in ('readonly','admin','system_admin')$$;
create or replace function public.can_manage_members() returns boolean language sql stable security definer set search_path=public as $$select public.current_app_role() in ('admin','system_admin')$$;

create table public.portal_club_tasks (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.portal_clubs,
 requester_id uuid not null references public.persons, helper_id uuid references public.persons,
 title text not null check(length(trim(title))>0), description text not null default '',
 status text not null default 'open' check(status in ('open','assigned','completed','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.portal_club_rates (
 club_id uuid not null references public.portal_clubs, year integer not null check(year between 2000 and 2200),
 individual_followup numeric(12,2) not null check(individual_followup>=0 and individual_followup::text<>'NaN'),
 day_event numeric(12,2) not null check(day_event>=0 and day_event::text<>'NaN'), weekend_event numeric(12,2) not null check(weekend_event>=0 and weekend_event::text<>'NaN'),
 mileage_rate numeric(12,4) not null check(mileage_rate>=0 and mileage_rate::text<>'NaN'),
 primary key(club_id,year)
);
create table public.portal_club_ledger (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.portal_clubs,
 person_id uuid not null references public.persons, task_id uuid references public.portal_club_tasks,
 kind text not null check(kind in ('work','expense')), occurred_on date not null,
 description text not null check(length(trim(description))>0), amount numeric(12,2) not null check(amount>=0 and amount::text<>'NaN'),
 activity_type text check(activity_type in ('individual_followup','day_event','weekend_event','other')),
 rate_snapshot numeric(12,2) check(rate_snapshot>=0 and rate_snapshot::text<>'NaN'), kilometers numeric(12,2) not null default 0 check(kilometers>=0 and kilometers::text<>'NaN'),
 mileage_rate_snapshot numeric(12,4) not null default 0 check(mileage_rate_snapshot>=0 and mileage_rate_snapshot::text<>'NaN'),
 status text not null default 'registered' check(status in ('registered','approved','rejected','paid')),
 receipt_name text, receipt_path text unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(receipt_path is null or receipt_path=club_id::text||'/'||id::text)
);
create function public.portal_helper_for(c uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.current_person_id() is not null and (public.has_active_person_role('hjelpetrener') or public.has_active_person_role('hjelpetreneraspirant')) and exists(select 1 from public.portal_club_memberships m join public.portal_clubs c1 on c1.id=m.club_id where m.club_id=c and m.person_id=public.current_person_id() and m.role='helper' and m.active and c1.active)
$$;
create function public.portal_club_member(c uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.portal_club_memberships m join public.portal_clubs c1 on c1.id=m.club_id where m.club_id=c and m.person_id=public.current_person_id() and m.active and c1.active)
$$;
do $$declare t text;begin
 foreach t in array array['portal_club_tasks','portal_club_rates','portal_club_ledger'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('revoke insert,update,delete on public.%I from authenticated',t);
 execute format('create trigger portal_audit after insert or update or delete on public.%I for each row execute function public.portal_audit_change()',t);
 end loop;
end $$;
create policy portal_task_read on public.portal_club_tasks for select to authenticated using(portal_club_admin(club_id) or requester_id=current_person_id() or helper_id=current_person_id() or (status='open' and portal_helper_for(club_id)));
create policy portal_rates_read on public.portal_club_rates for select to authenticated using(portal_club_admin(club_id) or portal_club_member(club_id));
create policy portal_ledger_read on public.portal_club_ledger for select to authenticated using(portal_club_admin(club_id) or person_id=current_person_id());

create function public.portal_club_action(action text, payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare pid uuid:=public.current_person_id(); c uuid; t public.portal_club_tasks; l public.portal_club_ledger; result_id uuid; state text; rates public.portal_club_rates; activity text; honor numeric; km numeric; kmrate numeric; total numeric;
begin
 if pid is null then raise exception 'Logg inn først.' using errcode='42501';end if;
 if action='create_task' then
 c:=(payload->>'club_id')::uuid;
 if not (public.portal_club_admin(c) or public.portal_club_member(c)) then raise exception 'Ingen tilgang til klubben.' using errcode='42501';end if;
 insert into public.portal_club_tasks(club_id,requester_id,title,description) values(c,pid,trim(payload->>'title'),coalesce(payload->>'description','')) returning id into result_id;
 elsif action in ('accept_task','complete_task','cancel_task') then
 select * into t from public.portal_club_tasks where id=(payload->>'id')::uuid for update;
 if not found then raise exception 'Oppdraget finnes ikke.';end if;
 if action='accept_task' then
 if t.status<>'open' or not public.portal_helper_for(t.club_id) then raise exception 'Oppdraget kan ikke tas.' using errcode='42501';end if;
 update public.portal_club_tasks set helper_id=pid,status='assigned',updated_at=now() where id=t.id;
 elsif action='complete_task' then
 if t.status<>'assigned' or not (t.helper_id=pid or public.portal_club_admin(t.club_id)) then raise exception 'Ingen tilgang til å fullføre.' using errcode='42501';end if;
 update public.portal_club_tasks set status='completed',updated_at=now() where id=t.id;
 else
 if t.status='completed' or not (t.requester_id=pid or public.portal_club_admin(t.club_id)) then raise exception 'Ingen tilgang til å avlyse.' using errcode='42501';end if;
 update public.portal_club_tasks set status='cancelled',updated_at=now() where id=t.id;
 end if;
 result_id:=t.id;
 elsif action='register_ledger' then
 c:=(payload->>'club_id')::uuid;
 if nullif(payload->>'task_id','') is not null then
 select * into t from public.portal_club_tasks where id=(payload->>'task_id')::uuid;
 if not found or t.helper_id is distinct from pid or t.status not in ('assigned','completed') then raise exception 'Ingen tilgang til oppdraget.' using errcode='42501';end if;
 if c is distinct from t.club_id then raise exception 'Oppdragets klubb må brukes.';end if;
 else
 if not (public.portal_helper_for(c) or public.portal_club_admin(c)) then raise exception 'Velg en klubb du arbeider for.' using errcode='42501';end if;
 end if;
 activity:=null; honor:=null; km:=0; kmrate:=0;
 if payload->>'kind'='work' then
 activity:=payload->>'activity_type';
 if activity is null or activity not in ('individual_followup','day_event','weekend_event','other') then raise exception 'Velg aktivitetstype.';end if;
 km:=coalesce(nullif(payload->>'kilometers','')::numeric,0);
 if km<0 then raise exception 'Kilometer kan ikke være negativt.';end if;
 select * into rates from public.portal_club_rates where club_id=c and year=extract(year from (payload->>'occurred_on')::date);
 if not found and (activity<>'other' or km>0) then raise exception 'Klubben må registrere satser for dette året først.';end if;
 honor:=case activity when 'individual_followup' then rates.individual_followup when 'day_event' then rates.day_event when 'weekend_event' then rates.weekend_event else (payload->>'amount')::numeric end;
 kmrate:=coalesce(rates.mileage_rate,0);
 if honor<0 or honor::text='NaN' or km::text='NaN' then raise exception 'Beløp og kilometer må være gyldige, positive tall.';end if;
 total:=round(honor+km*kmrate,2);
 else total:=(payload->>'amount')::numeric;
 end if;
 result_id:=gen_random_uuid();
 insert into public.portal_club_ledger(id,club_id,person_id,task_id,kind,occurred_on,description,amount,activity_type,rate_snapshot,kilometers,mileage_rate_snapshot,receipt_name,receipt_path)
 values(result_id,c,pid,t.id,payload->>'kind',(payload->>'occurred_on')::date,trim(payload->>'description'),total,activity,honor,km,kmrate,nullif(payload->>'receipt_name',''),case when nullif(payload->>'receipt_name','') is not null then c::text||'/'||result_id::text end);
 elsif action='prepare_receipt' then
 select * into l from public.portal_club_ledger where id=(payload->>'id')::uuid for update;
 if not found or not (public.portal_club_admin(l.club_id) or (l.person_id=pid and l.status='registered')) then raise exception 'Ingen tilgang til kvitteringen.' using errcode='42501';end if;
 if nullif(trim(payload->>'name'),'') is null then raise exception 'Velg en kvittering.';end if;
 update public.portal_club_ledger set receipt_name=payload->>'name',receipt_path=club_id::text||'/'||id::text,updated_at=now() where id=l.id;
 result_id:=l.id;
 elsif action='ledger_status' then
 select * into l from public.portal_club_ledger where id=(payload->>'id')::uuid for update;
 if not found or not public.portal_club_admin(l.club_id) then raise exception 'Ingen tilgang til oppgjøret.' using errcode='42501';end if;
 state:=payload->>'status';
 if not public.is_system_admin() and (l.status='paid' or (state='paid' and l.status<>'approved')) then raise exception 'Utbetaling krever godkjenning; betalte poster korrigeres av support.';end if;
 update public.portal_club_ledger set status=state,updated_at=now() where id=l.id;
 result_id:=l.id;
 elsif action='save_rates' then
 c:=(payload->>'club_id')::uuid;
 if not public.portal_club_admin(c) then raise exception 'Ingen tilgang til satsene.' using errcode='42501';end if;
 insert into public.portal_club_rates values(c,(payload->>'year')::integer,(payload->>'individual_followup')::numeric,(payload->>'day_event')::numeric,(payload->>'weekend_event')::numeric,(payload->>'mileage_rate')::numeric)
 on conflict(club_id,year) do update set individual_followup=excluded.individual_followup,day_event=excluded.day_event,weekend_event=excluded.weekend_event,mileage_rate=excluded.mileage_rate;
 else raise exception 'Ukjent handling.';end if;
 return jsonb_build_object('id',result_id);
end $$;
insert into storage.buckets(id,name,public,file_size_limit) values('portal-club-receipts','portal-club-receipts',false,26214400);
create function public.portal_receipt_access(p text, writing boolean default false) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.portal_club_ledger l where l.receipt_path=p and (public.portal_club_admin(l.club_id) or (l.person_id=public.current_person_id() and (not writing or l.status='registered'))))
$$;
create policy portal_receipt_read on storage.objects for select to authenticated using(bucket_id='portal-club-receipts' and portal_receipt_access(name));
create policy portal_receipt_upload on storage.objects for insert to authenticated with check(bucket_id='portal-club-receipts' and portal_receipt_access(name,true));
create policy portal_receipt_replace on storage.objects for update to authenticated using(bucket_id='portal-club-receipts' and portal_receipt_access(name,true)) with check(bucket_id='portal-club-receipts' and portal_receipt_access(name,true));
create policy portal_receipt_delete on storage.objects for delete to authenticated using(bucket_id='portal-club-receipts' and portal_receipt_access(name,true));
revoke all on function public.portal_club_action(text,jsonb) from public;
grant execute on function public.portal_club_action(text,jsonb) to authenticated;
revoke all on function public.portal_helper_for(uuid),public.portal_club_member(uuid),public.portal_receipt_access(text,boolean) from public;
grant execute on function public.portal_helper_for(uuid),public.portal_club_member(uuid),public.portal_receipt_access(text,boolean) to authenticated;
commit;
