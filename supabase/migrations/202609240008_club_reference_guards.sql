begin;
create function public.portal_validate_club_references() returns trigger language plpgsql security definer set search_path=public as $$
declare row_data jsonb:=to_jsonb(new); ref jsonb; target_club uuid; ref_id uuid;
begin
 if tg_op='UPDATE' and old.club_id is distinct from new.club_id then raise exception 'En registrering kan ikke flyttes mellom klubber.' using errcode='42501';end if;
 for ref in select value from jsonb_array_elements(tg_argv[0]::jsonb) loop
 if nullif(row_data->>(ref->>0),'') is not null then
 ref_id:=(row_data->>(ref->>0))::uuid;
 if ref->>1='persons' then
 if not exists(select 1 from public.portal_club_memberships m where m.club_id=new.club_id and m.person_id=ref_id and m.active) and not exists(select 1 from public.portal_member_profiles p where p.club_id=new.club_id and p.id=ref_id) then
 raise exception 'Personen tilhører ikke denne klubben.' using errcode='42501';end if;
 else
 execute format('select club_id from public.%I where id=$1',ref->>1) into target_club using ref_id;
 if target_club is distinct from new.club_id then raise exception 'Tilknyttede opplysninger tilhører en annen klubb.' using errcode='42501';end if;
 end if;
 end if;
 end loop;
 return new;
end $$;
create trigger portal_club_references before insert or update on public.admin_notifications for each row execute function public.portal_validate_club_references('[["related_person_id", "persons"], ["related_event_id", "events"], ["related_expense_id", "helper_expenses"], ["related_general_expense_id", "general_expenses"]]');
create trigger portal_club_references before insert or update on public.communication_history for each row execute function public.portal_validate_club_references('[["event_id", "events"], ["automation_rule_id", "event_automation_rules"]]');
create trigger portal_club_references before insert or update on public.email_campaigns for each row execute function public.portal_validate_club_references('[["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.email_messages for each row execute function public.portal_validate_club_references('[["campaign_id", "email_campaigns"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.event_automation_rules for each row execute function public.portal_validate_club_references('[["event_id", "events"], ["target_group_id", "groups"], ["target_role_id", "roles"]]');
create trigger portal_club_references before insert or update on public.event_documents for each row execute function public.portal_validate_club_references('[["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.event_email_reply_tokens for each row execute function public.portal_validate_club_references('[["event_id", "events"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.event_notes for each row execute function public.portal_validate_club_references('[["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.event_participants for each row execute function public.portal_validate_club_references('[["event_id", "events"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.event_people for each row execute function public.portal_validate_club_references('[["event_id", "events"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.event_registration_answers for each row execute function public.portal_validate_club_references('[["event_id", "events"], ["person_id", "persons"], ["field_id", "event_registration_fields"]]');
create trigger portal_club_references before insert or update on public.event_registration_fields for each row execute function public.portal_validate_club_references('[["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.event_template_automations for each row execute function public.portal_validate_club_references('[["template_id", "event_templates"], ["target_role_id", "roles"], ["target_group_id", "groups"]]');
create trigger portal_club_references before insert or update on public.event_template_documents for each row execute function public.portal_validate_club_references('[["template_id", "event_templates"]]');
create trigger portal_club_references before insert or update on public.fiken_billing_run_items for each row execute function public.portal_validate_club_references('[["run_id", "fiken_billing_runs"], ["person_id", "persons"], ["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.fiken_billing_runs for each row execute function public.portal_validate_club_references('[["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.fiken_contacts for each row execute function public.portal_validate_club_references('[["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.fiken_invoices for each row execute function public.portal_validate_club_references('[["person_id", "persons"], ["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.form_answers for each row execute function public.portal_validate_club_references('[["response_id", "form_responses"], ["question_id", "form_questions"]]');
create trigger portal_club_references before insert or update on public.form_question_options for each row execute function public.portal_validate_club_references('[["question_id", "form_questions"]]');
create trigger portal_club_references before insert or update on public.form_questions for each row execute function public.portal_validate_club_references('[["form_id", "forms"]]');
create trigger portal_club_references before insert or update on public.form_recipients for each row execute function public.portal_validate_club_references('[["form_id", "forms"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.form_responses for each row execute function public.portal_validate_club_references('[["form_id", "forms"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.general_expenses for each row execute function public.portal_validate_club_references('[["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.group_members for each row execute function public.portal_validate_club_references('[["group_id", "groups"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.helper_entries for each row execute function public.portal_validate_club_references('[["person_id", "persons"], ["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.helper_expenses for each row execute function public.portal_validate_club_references('[["person_id", "persons"], ["entry_id", "helper_entries"], ["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.helper_requests for each row execute function public.portal_validate_club_references('[["requester_person_id", "persons"], ["assigned_helper_person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.library_documents for each row execute function public.portal_validate_club_references('[["folder_id", "library_folders"]]');
create trigger portal_club_references before insert or update on public.library_folder_permissions for each row execute function public.portal_validate_club_references('[["folder_id", "library_folders"], ["role_id", "roles"], ["group_id", "groups"]]');
create trigger portal_club_references before insert or update on public.library_folders for each row execute function public.portal_validate_club_references('[["parent_id", "library_folders"]]');
create trigger portal_club_references before insert or update on public.person_roles for each row execute function public.portal_validate_club_references('[["person_id", "persons"], ["role_id", "roles"]]');
create trigger portal_club_references before insert or update on public.sms_campaigns for each row execute function public.portal_validate_club_references('[["event_id", "events"]]');
create trigger portal_club_references before insert or update on public.sms_messages for each row execute function public.portal_validate_club_references('[["campaign_id", "sms_campaigns"], ["person_id", "persons"]]');
create trigger portal_club_references before insert or update on public.sms_replies for each row execute function public.portal_validate_club_references('[["sms_message_id", "sms_messages"], ["matched_person_id", "persons"], ["event_id", "events"]]');
revoke all on function public.portal_validate_club_references() from public;
commit;
