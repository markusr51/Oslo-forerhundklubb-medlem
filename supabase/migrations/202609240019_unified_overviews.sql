begin;
create or replace function public.admin_helper_year_overview(target_year integer) returns table(person_id uuid,person_name text,honor numeric,mileage numeric,expenses numeric,total numeric,entry_count bigint) language sql stable security invoker set search_path=public as $$
 select l.person_id,p.full_name,
 coalesce(sum(l.amount-l.kilometers*l.mileage_rate_snapshot) filter(where l.kind='work'),0),
 coalesce(sum(l.kilometers*l.mileage_rate_snapshot) filter(where l.kind='work'),0),
 coalesce(sum(l.amount) filter(where l.kind='expense'),0),sum(l.amount),count(*)
 from public.portal_club_settlement l join public.portal_club_contacts(public.portal_current_club()) p on p.id=l.person_id
 where public.portal_club_admin(l.club_id) and l.club_id=public.portal_current_club() and extract(year from l.occurred_on)=target_year and l.status<>'rejected' group by l.person_id,p.full_name order by p.full_name
$$;
alter function public.admin_dashboard_data() rename to portal_previous_admin_dashboard;
create function public.admin_dashboard_data() returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; workrows jsonb; expenses jsonb;
begin
 result:=public.portal_previous_admin_dashboard();
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into workrows from (
 select l.id,l.source_table,l.person_id,p.full_name person_name,l.occurred_on activity_date,l.activity_type,l.description,(l.amount-l.kilometers*l.mileage_rate_snapshot) rate_snapshot,(l.amount-l.kilometers*l.mileage_rate_snapshot) custom_amount,l.kilometers,l.mileage_rate_snapshot,l.status from public.portal_club_settlement l left join public.portal_club_contacts(public.portal_current_club()) p on p.id=l.person_id where l.club_id=public.portal_current_club() and l.status='registered' and l.kind='work' order by l.occurred_on) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into expenses from (
 select l.id,l.source_table,l.person_id,p.full_name person_name,l.occurred_on expense_date,l.amount,l.description,(l.receipt_path is not null) has_receipt,l.status from public.portal_club_settlement l left join public.portal_club_contacts(public.portal_current_club()) p on p.id=l.person_id where l.club_id=public.portal_current_club() and l.status='registered' and l.kind='expense' order by l.occurred_on) x;
 return jsonb_set(jsonb_set(result||jsonb_build_object('helper_entries',workrows,'expenses',expenses),'{counts,helper_entries_waiting}',to_jsonb(jsonb_array_length(workrows))),'{counts,expenses_waiting}',to_jsonb(jsonb_array_length(expenses)));
end $$;
alter function public.my_portal_dashboard() rename to portal_previous_my_dashboard;
create function public.my_portal_dashboard() returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; summary jsonb;
begin
 result:=public.portal_previous_my_dashboard();
 select jsonb_build_object('year',extract(year from current_date),'honor',coalesce(sum(amount-kilometers*mileage_rate_snapshot) filter(where kind='work'),0),'mileage',coalesce(sum(kilometers*mileage_rate_snapshot) filter(where kind='work'),0),'expenses',coalesce(sum(amount) filter(where kind='expense'),0)) into summary from public.portal_club_settlement where club_id=public.portal_current_club() and person_id=public.current_person_id() and extract(year from occurred_on)=extract(year from current_date) and status<>'rejected';
 return result||jsonb_build_object('helper',summary);
end $$;
revoke all on function public.admin_dashboard_data(),public.my_portal_dashboard() from public;
grant execute on function public.admin_dashboard_data(),public.my_portal_dashboard() to authenticated;
create function public.portal_new_ledger_notification() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.admin_notifications(notification_type,title,message,related_person_id,club_id)
 values(case when new.kind='work' then 'helper_activity' else 'helper_expense' end,'Ny registrering til oppgjør',new.description||' – '||new.amount::text||' kr. Behandles under Klubber og oppdrag.',new.person_id,new.club_id);
 return new;
end $$;
create trigger portal_new_ledger_notification after insert on public.portal_club_ledger for each row execute function public.portal_new_ledger_notification();
revoke all on function public.portal_new_ledger_notification() from public;
commit;
