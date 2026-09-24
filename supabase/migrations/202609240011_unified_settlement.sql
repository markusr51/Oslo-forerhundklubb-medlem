begin;
-- Preserve the original rows and rate snapshots; a union exposes each exactly once.
create view public.portal_club_settlement with(security_invoker=true) as
 select l.*, 'portal_club_ledger'::text as source_table,'portal-club-receipts'::text as receipt_bucket from public.portal_club_ledger l
 union all
 select h.id,h.club_id,h.person_id,null::uuid,'work'::text,h.activity_date,coalesce(h.description,'Arbeid'),
 (case when h.activity_type='other' then coalesce(h.custom_amount,0) else coalesce(h.rate_snapshot,0) end+coalesce(h.kilometers,0)*coalesce(h.mileage_rate_snapshot,0))::numeric,
 h.activity_type,h.rate_snapshot,coalesce(h.kilometers,0),coalesce(h.mileage_rate_snapshot,0),h.status,null::text,null::text,h.created_at,h.updated_at,'helper_entries'::text,null::text from public.helper_entries h
 union all
 select e.id,e.club_id,e.person_id,null::uuid,'expense'::text,e.expense_date,e.description,e.amount,
 null::text,null::numeric,0::numeric,0::numeric,e.status,e.receipt_original_name,e.receipt_storage_path,e.created_at,e.updated_at,'helper_expenses'::text,'helper-receipts'::text from public.helper_expenses e;
grant select on public.portal_club_settlement to authenticated;
create function public.portal_set_settlement_status(source_table text,entry_id uuid,new_status text) returns void language plpgsql security definer set search_path=public as $$
declare c uuid; previous text;
begin
 if source_table not in ('portal_club_ledger','helper_entries','helper_expenses') then raise exception 'Ugyldig oppgjørstype.';end if;
 execute format('select club_id,status from public.%I where id=$1 for update',source_table) into c,previous using entry_id;
 if c is null or not public.portal_club_admin(c) then raise exception 'Ingen tilgang til oppgjøret.' using errcode='42501';end if;
 if new_status not in ('registered','approved','rejected','paid') then raise exception 'Ugyldig status.';end if;
 if not public.is_system_admin() and (previous='paid' or (new_status='paid' and previous<>'approved')) then raise exception 'Utbetaling krever godkjenning. Betalte poster korrigeres av support.';end if;
 execute format('update public.%I set status=$1,updated_at=now() where id=$2',source_table) using new_status,entry_id;
end $$;
alter table public.helper_entries drop constraint helper_entries_status_check;
alter table public.helper_entries add constraint helper_entries_status_check check(status in ('registered','approved','rejected','paid'));
create trigger portal_old_entry_audit after update or delete on public.helper_entries for each row execute function public.portal_audit_change();
create trigger portal_old_expense_audit after update or delete on public.helper_expenses for each row execute function public.portal_audit_change();
-- Import only rates, never financial transactions. Keep both editors consistent.
insert into public.portal_club_rates(club_id,year,individual_followup,day_event,weekend_event,mileage_rate)
 select club_id,year,coalesce(max(amount) filter(where rate_type='individual_followup'),0),coalesce(max(amount) filter(where rate_type='day_event'),0),coalesce(max(amount) filter(where rate_type='weekend_event'),0),coalesce(max(amount) filter(where rate_type='mileage'),0)
 from public.helper_rates group by club_id,year;
create function public.portal_sync_rates() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if pg_trigger_depth()>1 then return new;end if;
 if tg_table_name='portal_club_rates' then
 insert into public.helper_rates(club_id,year,rate_type,amount) values
 (new.club_id,new.year,'individual_followup',new.individual_followup),(new.club_id,new.year,'day_event',new.day_event),(new.club_id,new.year,'weekend_event',new.weekend_event),(new.club_id,new.year,'mileage',new.mileage_rate)
 on conflict(club_id,year,rate_type) do update set amount=excluded.amount,updated_at=now();
 else
 insert into public.portal_club_rates(club_id,year,individual_followup,day_event,weekend_event,mileage_rate)
 select club_id,year,coalesce(max(amount) filter(where rate_type='individual_followup'),0),coalesce(max(amount) filter(where rate_type='day_event'),0),coalesce(max(amount) filter(where rate_type='weekend_event'),0),coalesce(max(amount) filter(where rate_type='mileage'),0)
 from public.helper_rates where club_id=new.club_id and year=new.year group by club_id,year
 on conflict(club_id,year) do update set individual_followup=excluded.individual_followup,day_event=excluded.day_event,weekend_event=excluded.weekend_event,mileage_rate=excluded.mileage_rate;
 end if;
 return new;
end $$;
create trigger portal_rates_to_legacy after insert or update on public.portal_club_rates for each row execute function public.portal_sync_rates();
create trigger portal_rates_from_legacy after insert or update on public.helper_rates for each row execute function public.portal_sync_rates();
revoke all on function public.portal_set_settlement_status(text,uuid,text),public.portal_sync_rates() from public;
grant execute on function public.portal_set_settlement_status(text,uuid,text) to authenticated;
commit;
