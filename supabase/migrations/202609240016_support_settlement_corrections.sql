begin;
create function public.portal_correct_settlement(source_table text,entry_id uuid,new_amount numeric,reason text) returns void language plpgsql security definer set search_path=public as $$
declare row_before jsonb; mileage numeric;
begin
 if not public.is_system_admin() then raise exception 'Bare systemadministrator kan korrigere beløp.' using errcode='42501';end if;
 if source_table not in ('portal_club_ledger','helper_entries','helper_expenses') or source_table is null then raise exception 'Ugyldig oppgjørstype.';end if;
 if new_amount is null or new_amount<0 or new_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Beløpet må være et gyldig positivt tall eller null kroner.';end if;
 if length(trim(coalesce(reason,'')))<5 then raise exception 'Beskriv hvorfor beløpet korrigeres.';end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',source_table) into row_before using entry_id;
 if row_before is null then raise exception 'Registreringen finnes ikke.';end if;
 mileage:=coalesce((row_before->>'kilometers')::numeric,0)*coalesce((row_before->>'mileage_rate_snapshot')::numeric,0);
 if new_amount<mileage then raise exception 'Totalbeløpet kan ikke være lavere enn den registrerte kilometergodtgjørelsen.';end if;
 if source_table='helper_entries' then
 update public.helper_entries set activity_type='other',custom_amount=round(new_amount-mileage,2),updated_at=now() where id=entry_id;
 elsif source_table='portal_club_ledger' then
 update public.portal_club_ledger set amount=round(new_amount,2),activity_type=case when kind='work' then 'other' else activity_type end,rate_snapshot=case when kind='work' then round(new_amount-mileage,2) else rate_snapshot end,updated_at=now() where id=entry_id;
 else update public.helper_expenses set amount=round(new_amount,2),updated_at=now() where id=entry_id;
 end if;
 insert into public.portal_access_audit(actor_user_id,entity,entity_id,operation,old_value,new_value)
 values(auth.uid(),source_table,entry_id::text,'SUPPORT_CORRECTION',row_before,jsonb_build_object('amount',round(new_amount,2),'reason',trim(reason)));
end $$;
revoke all on function public.portal_correct_settlement(text,uuid,numeric,text) from public;
grant execute on function public.portal_correct_settlement(text,uuid,numeric,text) to authenticated;
commit;
