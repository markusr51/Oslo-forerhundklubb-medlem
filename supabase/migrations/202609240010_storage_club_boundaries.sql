begin;
create function public.portal_legacy_file_access(bucket text,path text,operation text) returns boolean language plpgsql stable security definer set search_path=public as $$
declare first_id uuid; c uuid; pid uuid; st text;
begin
 if public.current_person_id() is null and not public.is_system_admin() then return false;end if;
 begin first_id:=split_part(path,'/',1)::uuid;exception when invalid_text_representation then return false;end;
 if bucket='event-documents' then
 select club_id into c from public.events where id=first_id;
 return c is not null and public.portal_club_admin(c);
 elsif bucket='event-template-documents' then
 select club_id into c from public.event_templates where id=first_id;
 return c is not null and public.portal_club_admin(c);
 elsif bucket='library-documents' then
 return public.library_can(first_id,case operation when 'insert' then 'upload' when 'update' then 'edit' when 'select' then 'read' else 'delete' end);
 elsif bucket in ('helper-receipts','general-expense-receipts') then
 if bucket='helper-receipts' then select club_id,person_id,status into c,pid,st from public.helper_expenses where receipt_storage_path=path;
 else select club_id,person_id,status into c,pid,st from public.general_expenses where receipt_storage_path=path;end if;
 if c is not null then return public.portal_club_admin(c) or (pid=public.current_person_id() and (operation='select' or st='registered'));end if;
 -- New uploads and cleanup of failed uploads have no metadata row yet.
 if operation in ('insert','delete') then
 return first_id=public.current_person_id() or public.is_system_admin() or exists(select 1 from public.portal_club_memberships m where m.person_id=first_id and m.active and public.portal_club_admin(m.club_id));
 end if;
 return false;
 end if;
 return false;
end $$;
DO $$declare r record; op text;begin
 for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname in (
 'event document storage read','event document storage insert','event document storage update','event document storage delete',
 'library storage read','library storage insert','library storage update','library storage delete',
 'helper receipts read','helper receipts insert','helper receipts delete',
 'template document storage read','template document storage insert','template document storage delete',
 'general expense receipts read','general expense receipts insert') loop
 execute format('drop policy %I on storage.objects',r.policyname);
 end loop;
 foreach op in array array['select','insert','update','delete'] loop
 execute format('create policy %I on storage.objects for %s to authenticated %s %s','portal_legacy_file_'||op,op,
 case when op<>'insert' then format('using (public.portal_legacy_file_access(bucket_id,name,%L))',op) else '' end,
 case when op in ('insert','update') then format('with check (public.portal_legacy_file_access(bucket_id,name,%L))',op) else '' end);
 end loop;
end $$;
revoke all on function public.portal_legacy_file_access(text,text,text) from public;
grant execute on function public.portal_legacy_file_access(text,text,text) to authenticated;
commit;
