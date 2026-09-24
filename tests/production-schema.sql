-- Schema-only snapshot: no production rows or credentials.
create role authenticated;create role anon;create role service_role bypassrls;
create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,owner uuid,owner_id text);
alter table storage.objects enable row level security;
grant usage on schema public,auth,storage to authenticated,anon,service_role;grant select,insert,update,delete on storage.objects to authenticated;
create table public."event_documents"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"storage_path" text not null,"original_name" text not null,"document_type" text default 'other'::text not null,"description" text,"mime_type" text,"size_bytes" bigint,"uploaded_by" uuid,"created_at" timestamp with time zone default now() not null);
alter table public."event_documents" enable row level security;
create table public."library_folders"("id" uuid default gen_random_uuid() not null,"parent_id" uuid,"name" text not null,"description" text,"sort_order" integer default 0 not null,"active" boolean default true not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."library_folders" enable row level security;
create table public."library_folder_permissions"("id" uuid default gen_random_uuid() not null,"folder_id" uuid not null,"subject_type" text not null,"role_id" uuid,"group_id" uuid,"app_role" text,"can_read" boolean default true not null,"can_upload" boolean default false not null,"can_edit" boolean default false not null,"can_delete" boolean default false not null,"created_at" timestamp with time zone default now() not null);
alter table public."library_folder_permissions" enable row level security;
create table public."library_documents"("id" uuid default gen_random_uuid() not null,"folder_id" uuid not null,"storage_path" text not null,"original_name" text not null,"description" text,"mime_type" text,"size_bytes" bigint,"uploaded_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."library_documents" enable row level security;
create table public."fiken_contacts"("id" uuid default gen_random_uuid() not null,"fiken_contact_id" bigint not null,"person_id" uuid,"name" text,"email" text,"phone" text,"customer_number" bigint,"inactive" boolean default false not null,"raw_json" jsonb default '{}'::jsonb not null,"synced_at" timestamp with time zone default now() not null);
alter table public."fiken_contacts" enable row level security;
create table public."fiken_invoices"("id" uuid default gen_random_uuid() not null,"fiken_invoice_id" bigint not null,"fiken_invoice_number" bigint,"fiken_customer_id" bigint,"person_id" uuid,"issue_date" date,"due_date" date,"settled" boolean default false not null,"status" text default 'unknown'::text not null,"amount_gross_cents" bigint,"order_reference" text,"invoice_source" text,"event_id" uuid,"membership_year" integer,"raw_json" jsonb default '{}'::jsonb not null,"synced_at" timestamp with time zone default now() not null,"created_at" timestamp with time zone default now() not null,"dispatch_method" text,"dispatch_fallback_used" boolean default false not null,"sent_at" timestamp with time zone,"created_by_portal" boolean default false not null,"fiken_credit_note_id" bigint,"fiken_credit_note_number" bigint,"credited_at" timestamp with time zone);
alter table public."fiken_invoices" enable row level security;
create table public."helper_rates"("id" uuid default gen_random_uuid() not null,"year" integer not null,"rate_type" text not null,"amount" numeric(12,2) default 0 not null,"updated_at" timestamp with time zone default now() not null);
alter table public."helper_rates" enable row level security;
create table public."helper_entries"("id" uuid default gen_random_uuid() not null,"person_id" uuid not null,"event_id" uuid,"source" text default 'manual'::text not null,"activity_date" date not null,"activity_type" text not null,"description" text,"rate_snapshot" numeric(12,2) default 0 not null,"custom_amount" numeric(12,2),"from_address" text,"to_address" text,"kilometers" numeric(10,1) default 0 not null,"mileage_rate_snapshot" numeric(12,2) default 0 not null,"status" text default 'registered'::text not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."helper_entries" enable row level security;
create table public."helper_expenses"("id" uuid default gen_random_uuid() not null,"person_id" uuid not null,"entry_id" uuid,"event_id" uuid,"expense_date" date default CURRENT_DATE not null,"amount" numeric(12,2) not null,"description" text not null,"receipt_storage_path" text,"receipt_original_name" text,"receipt_mime_type" text,"status" text default 'registered'::text not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."helper_expenses" enable row level security;
create table public."admin_notifications"("id" uuid default gen_random_uuid() not null,"notification_type" text not null,"title" text not null,"message" text not null,"related_person_id" uuid,"related_event_id" uuid,"related_expense_id" uuid,"is_read" boolean default false not null,"created_at" timestamp with time zone default now() not null,"related_general_expense_id" uuid);
alter table public."admin_notifications" enable row level security;
create table public."persons"("id" uuid default gen_random_uuid() not null,"full_name" text not null,"email" text,"phone" text,"membership_status" text default 'active'::text not null,"joined_date" date,"resigned_date" date,"notes" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."persons" enable row level security;
create table public."person_roles"("person_id" uuid not null,"role_id" uuid not null,"created_at" timestamp with time zone default now() not null,"is_active" boolean default true not null,"started_at" date,"ended_at" date);
alter table public."person_roles" enable row level security;
create table public."roles"("id" uuid default gen_random_uuid() not null,"name" text not null,"description" text,"created_at" timestamp with time zone default now() not null);
alter table public."roles" enable row level security;
create table public."audit_log"("id" bigint generated always as identity not null,"table_name" text not null,"record_id" uuid,"action" text not null,"old_data" jsonb,"new_data" jsonb,"changed_at" timestamp with time zone default now() not null,"changed_by_user_id" uuid,"changed_by_person_id" uuid);
alter table public."audit_log" enable row level security;
create table public."groups"("id" uuid default gen_random_uuid() not null,"name" text not null,"description" text,"created_at" timestamp with time zone default now() not null,"active" boolean default true not null,"updated_at" timestamp with time zone default now() not null);
alter table public."groups" enable row level security;
create table public."group_members"("group_id" uuid not null,"person_id" uuid not null,"created_at" timestamp with time zone default now() not null,"function_name" text,"note" text);
alter table public."group_members" enable row level security;
create table public."sms_campaigns"("id" uuid default gen_random_uuid() not null,"created_by" uuid,"message" text not null,"reply_enabled" boolean default false not null,"sender_text" text,"recipient_count" integer default 0 not null,"sms_units" integer default 0 not null,"created_at" timestamp with time zone default now() not null,"event_id" uuid);
alter table public."sms_campaigns" enable row level security;
create table public."fiken_billing_runs"("id" uuid default gen_random_uuid() not null,"run_type" text not null,"membership_year" integer,"event_id" uuid,"description" text not null,"unit_amount_cents" bigint not null,"due_days" integer default 14 not null,"send_mode" text default 'auto'::text not null,"bank_account_code" text not null,"income_account" text not null,"vat_type" text default 'NONE'::text not null,"guest_pricing" text,"created_by" uuid,"status" text default 'running'::text not null,"summary_json" jsonb default '{}'::jsonb not null,"created_at" timestamp with time zone default now() not null,"completed_at" timestamp with time zone);
alter table public."fiken_billing_runs" enable row level security;
create table public."event_templates"("id" uuid default gen_random_uuid() not null,"name" text not null,"event_title" text not null,"location" text,"description" text,"duration_days" integer default 1 not null,"start_time" time without time zone default '18:00:00'::time without time zone not null,"end_time" time without time zone,"registration_days_before" integer,"active" boolean default true not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."event_templates" enable row level security;
create table public."event_template_automations"("id" uuid default gen_random_uuid() not null,"template_id" uuid not null,"rule_type" text not null,"target_type" text default 'all'::text not null,"target_role_id" uuid,"target_group_id" uuid,"days_before" integer default 0 not null,"send_hour" integer default 18 not null,"channel" text default 'sms'::text not null,"sms_reply" boolean default false not null,"sms_message" text,"email_subject" text,"email_message" text,"enabled" boolean default true not null,"created_at" timestamp with time zone default now() not null);
alter table public."event_template_automations" enable row level security;
create table public."event_template_documents"("id" uuid default gen_random_uuid() not null,"template_id" uuid not null,"storage_path" text not null,"original_name" text not null,"document_type" text default 'other'::text not null,"description" text,"mime_type" text,"size_bytes" bigint,"uploaded_by" uuid,"created_at" timestamp with time zone default now() not null);
alter table public."event_template_documents" enable row level security;
create table public."fiken_billing_run_items"("id" uuid default gen_random_uuid() not null,"run_id" uuid not null,"person_id" uuid,"event_id" uuid,"membership_year" integer,"amount_cents" bigint,"fiken_invoice_id" bigint,"fiken_invoice_number" bigint,"item_status" text not null,"error_message" text,"created_at" timestamp with time zone default now() not null);
alter table public."fiken_billing_run_items" enable row level security;
create table public."app_users"("user_id" uuid not null,"display_name" text,"app_role" text not null,"active" boolean default true not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"person_id" uuid,"must_change_password" boolean default false not null,"first_login_completed_at" timestamp with time zone);
alter table public."app_users" enable row level security;
create table public."email_campaigns"("id" uuid default gen_random_uuid() not null,"created_by" uuid,"subject" text not null,"message" text not null,"recipient_count" integer default 0 not null,"sent_count" integer default 0 not null,"failed_count" integer default 0 not null,"attachment_count" integer default 0 not null,"created_at" timestamp with time zone default now() not null,"event_id" uuid);
alter table public."email_campaigns" enable row level security;
create table public."email_messages"("id" uuid default gen_random_uuid() not null,"campaign_id" uuid not null,"person_id" uuid,"email" text not null,"resend_id" text,"status" text default 'sent'::text not null,"error" text,"created_at" timestamp with time zone default now() not null);
alter table public."email_messages" enable row level security;
create table public."communication_history"("id" uuid default gen_random_uuid() not null,"event_id" uuid,"source" text not null,"source_table" text,"source_record_id" uuid,"automation_rule_id" uuid,"channel" text not null,"audience_type" text,"audience_label" text,"subject" text,"message" text,"recipient_count" integer default 0 not null,"sent_count" integer default 0 not null,"failed_count" integer default 0 not null,"status" text default 'pending'::text not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"completed_at" timestamp with time zone,"details" jsonb);
alter table public."communication_history" enable row level security;
create table public."sms_messages"("id" uuid default gen_random_uuid() not null,"campaign_id" uuid not null,"person_id" uuid,"phone" text not null,"sveve_message_id" bigint,"status" text default 'sent'::text not null,"error" text,"created_at" timestamp with time zone default now() not null);
alter table public."sms_messages" enable row level security;
create table public."sms_replies"("id" uuid default gen_random_uuid() not null,"sms_message_id" uuid,"sveve_message_id" bigint,"phone" text not null,"message" text not null,"matched_person_id" uuid,"received_at" timestamp with time zone default now() not null,"event_id" uuid,"interpreted_action" text,"auto_processed" boolean default false not null,"processing_note" text);
alter table public."sms_replies" enable row level security;
create table public."events"("id" uuid default gen_random_uuid() not null,"title" text not null,"description" text,"location" text,"event_date" date not null,"start_time" time without time zone not null,"end_time" time without time zone,"registration_deadline" date,"status" text default 'planned'::text not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"end_date" date,"allow_self_registration" boolean default false not null,"allow_guests" boolean default false not null,"max_guests" integer default 0 not null,"registration_form_enabled" boolean default false not null,"allow_email_reply_registration" boolean default false not null);
alter table public."events" enable row level security;
create table public."event_participants"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"person_id" uuid not null,"status" text default 'pending'::text not null,"guest_count" integer default 0 not null,"note" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."event_participants" enable row level security;
create table public."event_people"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"person_id" uuid not null,"function_name" text not null,"note" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."event_people" enable row level security;
create table public."event_notes"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"note" text not null,"created_by" uuid,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."event_notes" enable row level security;
create table public."general_expenses"("id" uuid default gen_random_uuid() not null,"person_id" uuid not null,"expense_date" date not null,"amount" numeric(12,2) not null,"description" text not null,"receipt_storage_path" text,"receipt_original_name" text,"receipt_mime_type" text,"status" text default 'registered'::text not null,"created_at" timestamp with time zone default now() not null,"reviewed_at" timestamp with time zone,"reviewed_by" uuid);
alter table public."general_expenses" enable row level security;
create table public."event_registration_fields"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"label" text not null,"field_type" text not null,"required" boolean default false not null,"options_json" jsonb default '[]'::jsonb not null,"sort_order" integer default 0 not null,"active" boolean default true not null,"created_at" timestamp with time zone default now() not null);
alter table public."event_registration_fields" enable row level security;
create table public."event_registration_answers"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"person_id" uuid not null,"field_id" uuid not null,"answer_text" text,"updated_at" timestamp with time zone default now() not null);
alter table public."event_registration_answers" enable row level security;
create table public."event_automation_rules"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"rule_type" text not null,"days_before" integer not null,"send_hour" integer default 18 not null,"channel" text not null,"sms_reply" boolean default false not null,"subject" text,"message" text not null,"enabled" boolean default true not null,"last_sent_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"target_type" text default 'all'::text not null,"target_group_id" uuid,"target_role_id" uuid,"sms_message" text,"email_subject" text,"email_message" text);
alter table public."event_automation_rules" enable row level security;
create table public."helper_requests"("id" uuid default gen_random_uuid() not null,"requester_person_id" uuid not null,"assigned_helper_person_id" uuid,"help_type" text not null,"location_text" text not null,"timing_type" text not null,"requested_date" date,"requested_time" time without time zone,"comment" text,"share_phone" boolean default false not null,"status" text default 'open'::text not null,"assigned_at" timestamp with time zone,"completed_at" timestamp with time zone,"cancelled_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null,"agreed_date" date,"agreed_time" time without time zone);
alter table public."helper_requests" enable row level security;
create table public."integration_sync_status"("integration" text not null,"last_started_at" timestamp with time zone,"last_success_at" timestamp with time zone,"last_failed_at" timestamp with time zone,"last_status" text,"last_error" text,"summary_json" jsonb default '{}'::jsonb not null,"updated_at" timestamp with time zone default now() not null);
alter table public."integration_sync_status" enable row level security;
create table public."event_email_reply_tokens"("id" uuid default gen_random_uuid() not null,"event_id" uuid not null,"person_id" uuid not null,"expected_email" text not null,"token_hash" text not null,"active" boolean default true not null,"expires_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"last_reply_status" text,"last_reply_at" timestamp with time zone,"last_resend_email_id" text);
alter table public."event_email_reply_tokens" enable row level security;
create table public."dog_media"("id" uuid default gen_random_uuid() not null,"dog_id" uuid not null,"session_id" uuid,"media_type" text not null,"storage_path" text,"status" text default 'pending'::text not null,"retention_until" timestamp with time zone,"created_by" uuid not null,"created_at" timestamp with time zone default now() not null,"deleted_at" timestamp with time zone);
alter table public."dog_media" enable row level security;
create table public."dogs"("id" uuid default gen_random_uuid() not null,"name" text not null,"chip_number" text,"birth_date" date,"status" text default 'active'::text not null,"notes" text,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."dogs" enable row level security;
create table public."dog_person_links"("id" uuid default gen_random_uuid() not null,"dog_id" uuid not null,"person_id" uuid not null,"relation_type" text default 'handler'::text not null,"valid_from" date,"valid_to" date,"active" boolean default true not null,"created_at" timestamp with time zone default now() not null,"created_by" uuid);
alter table public."dog_person_links" enable row level security;
create table public."dog_professional_assignments"("id" uuid default gen_random_uuid() not null,"dog_id" uuid not null,"professional_person_id" uuid not null,"assignment_role" text not null,"valid_from" date,"valid_to" date,"active" boolean default true not null,"notes" text,"created_at" timestamp with time zone default now() not null,"created_by" uuid);
alter table public."dog_professional_assignments" enable row level security;
create table public."guideview_sessions"("id" uuid default gen_random_uuid() not null,"dog_id" uuid not null,"session_type" text default 'follow_up'::text not null,"title" text,"problem_statement" text,"state" text default 'planned'::text not null,"scheduled_at" timestamp with time zone,"duration_minutes" integer,"livekit_room" text,"helper_request_id" uuid,"event_id" uuid,"created_by" uuid not null,"started_at" timestamp with time zone,"ended_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."guideview_sessions" enable row level security;
create table public."guideview_session_participants"("id" uuid default gen_random_uuid() not null,"session_id" uuid not null,"person_id" uuid not null,"portal_role" text not null,"session_role" text not null,"invited_by" uuid,"joined_at" timestamp with time zone,"left_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null);
alter table public."guideview_session_participants" enable row level security;
create table public."dog_consents"("id" uuid default gen_random_uuid() not null,"dog_id" uuid not null,"person_id" uuid not null,"consent_type" text not null,"scope" jsonb default '{}'::jsonb not null,"granted_at" timestamp with time zone,"revoked_at" timestamp with time zone,"created_at" timestamp with time zone default now() not null);
alter table public."dog_consents" enable row level security;
create table public."dog_notes"("id" uuid default gen_random_uuid() not null,"dog_id" uuid not null,"session_id" uuid,"category" text not null,"body" text not null,"visibility_scope" text default 'session'::text not null,"created_by" uuid not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."dog_notes" enable row level security;
create table public."guideview_session_invitations"("id" uuid default gen_random_uuid() not null,"session_id" uuid not null,"person_id" uuid not null,"status" text default 'pending'::text not null,"created_by" uuid not null,"created_at" timestamp with time zone default now() not null,"responded_at" timestamp with time zone);
alter table public."guideview_session_invitations" enable row level security;
create table public."guideview_media_routes"("id" uuid default gen_random_uuid() not null,"session_id" uuid not null,"source_person_id" uuid not null,"target_person_id" uuid not null,"audio_enabled" boolean default true not null,"video_enabled" boolean default true not null,"updated_at" timestamp with time zone default now() not null,"updated_by_person_id" uuid);
alter table public."guideview_media_routes" enable row level security;
create table public."forms"("id" uuid default gen_random_uuid() not null,"title" text not null,"description" text,"status" text default 'draft'::text not null,"response_mode" text default 'identified'::text not null,"opens_at" timestamp with time zone,"closes_at" timestamp with time zone,"created_by_person_id" uuid not null,"created_at" timestamp with time zone default now() not null,"updated_at" timestamp with time zone default now() not null);
alter table public."forms" enable row level security;
create table public."form_questions"("id" uuid default gen_random_uuid() not null,"form_id" uuid not null,"position" integer default 0 not null,"question_text" text not null,"help_text" text,"question_type" text not null,"required" boolean default false not null,"scale_min" integer,"scale_max" integer,"scale_min_label" text,"scale_max_label" text);
alter table public."form_questions" enable row level security;
create table public."form_question_options"("id" uuid default gen_random_uuid() not null,"question_id" uuid not null,"position" integer default 0 not null,"option_text" text not null);
alter table public."form_question_options" enable row level security;
create table public."form_recipients"("id" uuid default gen_random_uuid() not null,"form_id" uuid not null,"person_id" uuid not null);
alter table public."form_recipients" enable row level security;
create table public."form_responses"("id" uuid default gen_random_uuid() not null,"form_id" uuid not null,"person_id" uuid,"submitted_at" timestamp with time zone default now() not null);
alter table public."form_responses" enable row level security;
create table public."form_answers"("id" uuid default gen_random_uuid() not null,"response_id" uuid not null,"question_id" uuid not null,"answer_json" jsonb default 'null'::jsonb not null);
alter table public."form_answers" enable row level security;
alter table public."person_roles" add constraint "person_roles_pkey" PRIMARY KEY (person_id, role_id);
alter table public."groups" add constraint "groups_pkey" PRIMARY KEY (id);
alter table public."persons" add constraint "persons_membership_status_check" CHECK ((membership_status = ANY (ARRAY['active'::text, 'inactive'::text, 'resigned'::text])));
alter table public."persons" add constraint "persons_pkey" PRIMARY KEY (id);
alter table public."roles" add constraint "roles_pkey" PRIMARY KEY (id);
alter table public."roles" add constraint "roles_name_key" UNIQUE (name);
alter table public."groups" add constraint "groups_name_key" UNIQUE (name);
alter table public."group_members" add constraint "group_members_pkey" PRIMARY KEY (group_id, person_id);
alter table public."audit_log" add constraint "audit_log_pkey" PRIMARY KEY (id);
alter table public."person_roles" add constraint "person_roles_dates_valid" CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at)));
alter table public."app_users" add constraint "app_users_app_role_check" CHECK ((app_role = ANY (ARRAY['system_admin'::text, 'admin'::text, 'readonly'::text])));
alter table public."app_users" add constraint "app_users_pkey" PRIMARY KEY (user_id);
alter table public."sms_campaigns" add constraint "sms_campaigns_pkey" PRIMARY KEY (id);
alter table public."sms_messages" add constraint "sms_messages_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'delivered'::text, 'unknown'::text])));
alter table public."sms_messages" add constraint "sms_messages_pkey" PRIMARY KEY (id);
alter table public."sms_replies" add constraint "sms_replies_pkey" PRIMARY KEY (id);
alter table public."email_campaigns" add constraint "email_campaigns_pkey" PRIMARY KEY (id);
alter table public."email_messages" add constraint "email_messages_status_check" CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'unknown'::text])));
alter table public."email_messages" add constraint "email_messages_pkey" PRIMARY KEY (id);
alter table public."events" add constraint "events_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'cancelled'::text, 'completed'::text])));
alter table public."events" add constraint "events_pkey" PRIMARY KEY (id);
alter table public."event_participants" add constraint "event_participants_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'attending'::text, 'declined'::text])));
alter table public."event_participants" add constraint "event_participants_guest_count_check" CHECK (((guest_count >= 0) AND (guest_count <= 20)));
alter table public."event_participants" add constraint "event_participants_pkey" PRIMARY KEY (id);
alter table public."event_participants" add constraint "event_participants_event_id_person_id_key" UNIQUE (event_id, person_id);
alter table public."events" add constraint "events_end_date_check" CHECK (((end_date IS NULL) OR (end_date >= event_date)));
alter table public."sms_replies" add constraint "sms_replies_interpreted_action_check" CHECK (((interpreted_action IS NULL) OR (interpreted_action = ANY (ARRAY['attending'::text, 'declined'::text, 'unrecognized'::text]))));
alter table public."event_people" add constraint "event_people_pkey" PRIMARY KEY (id);
alter table public."event_people" add constraint "event_people_event_id_person_id_function_name_key" UNIQUE (event_id, person_id, function_name);
alter table public."event_notes" add constraint "event_notes_pkey" PRIMARY KEY (id);
alter table public."event_automation_rules" add constraint "event_automation_rules_rule_type_check" CHECK ((rule_type = ANY (ARRAY['invitation'::text, 'pending_reminder'::text, 'attending_reminder'::text])));
alter table public."event_automation_rules" add constraint "event_automation_rules_days_before_check" CHECK (((days_before >= 0) AND (days_before <= 365)));
alter table public."event_automation_rules" add constraint "event_automation_rules_send_hour_check" CHECK (((send_hour >= 0) AND (send_hour <= 23)));
alter table public."event_automation_rules" add constraint "event_automation_rules_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'both'::text])));
alter table public."event_automation_rules" add constraint "event_automation_rules_pkey" PRIMARY KEY (id);
alter table public."event_automation_rules" add constraint "event_automation_rules_event_id_rule_type_days_before_send__key" UNIQUE (event_id, rule_type, days_before, send_hour);
alter table public."event_automation_rules" add constraint "event_automation_rules_target_type_check" CHECK ((target_type = ANY (ARRAY['all'::text, 'role'::text, 'group'::text])));
alter table public."event_automation_rules" add constraint "event_automation_target_check" CHECK (((target_type = 'all'::text) OR ((target_type = 'role'::text) AND (target_role_id IS NOT NULL)) OR ((target_type = 'group'::text) AND (target_group_id IS NOT NULL))));
alter table public."event_documents" add constraint "event_documents_document_type_check" CHECK ((document_type = ANY (ARRAY['program'::text, 'invitation'::text, 'practical'::text, 'meeting_papers'::text, 'other'::text])));
alter table public."event_documents" add constraint "event_documents_pkey" PRIMARY KEY (id);
alter table public."event_documents" add constraint "event_documents_storage_path_key" UNIQUE (storage_path);
alter table public."library_folders" add constraint "library_folders_pkey" PRIMARY KEY (id);
alter table public."library_folders" add constraint "library_folders_parent_id_name_key" UNIQUE (parent_id, name);
alter table public."library_folder_permissions" add constraint "library_folder_permissions_subject_type_check" CHECK ((subject_type = ANY (ARRAY['all_authenticated'::text, 'role'::text, 'group'::text, 'app_role'::text])));
alter table public."library_folder_permissions" add constraint "library_folder_permissions_check" CHECK ((((subject_type = 'all_authenticated'::text) AND (role_id IS NULL) AND (group_id IS NULL) AND (app_role IS NULL)) OR ((subject_type = 'role'::text) AND (role_id IS NOT NULL) AND (group_id IS NULL) AND (app_role IS NULL)) OR ((subject_type = 'group'::text) AND (group_id IS NOT NULL) AND (role_id IS NULL) AND (app_role IS NULL)) OR ((subject_type = 'app_role'::text) AND (app_role IS NOT NULL) AND (role_id IS NULL) AND (group_id IS NULL))));
alter table public."library_folder_permissions" add constraint "library_folder_permissions_pkey" PRIMARY KEY (id);
alter table public."library_documents" add constraint "library_documents_pkey" PRIMARY KEY (id);
alter table public."library_documents" add constraint "library_documents_storage_path_key" UNIQUE (storage_path);
alter table public."helper_rates" add constraint "helper_rates_rate_type_check" CHECK ((rate_type = ANY (ARRAY['individual_followup'::text, 'day_event'::text, 'weekend_event'::text, 'mileage'::text])));
alter table public."helper_rates" add constraint "helper_rates_pkey" PRIMARY KEY (id);
alter table public."helper_rates" add constraint "helper_rates_year_rate_type_key" UNIQUE (year, rate_type);
alter table public."helper_entries" add constraint "helper_entries_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'event'::text])));
alter table public."helper_entries" add constraint "helper_entries_activity_type_check" CHECK ((activity_type = ANY (ARRAY['individual_followup'::text, 'day_event'::text, 'weekend_event'::text, 'other'::text])));
alter table public."helper_entries" add constraint "helper_entries_status_check" CHECK ((status = ANY (ARRAY['registered'::text, 'approved'::text, 'paid'::text])));
alter table public."helper_entries" add constraint "helper_entries_pkey" PRIMARY KEY (id);
alter table public."helper_entries" add constraint "helper_entries_person_id_event_id_source_key" UNIQUE (person_id, event_id, source);
alter table public."helper_expenses" add constraint "helper_expenses_amount_check" CHECK ((amount >= (0)::numeric));
alter table public."helper_expenses" add constraint "helper_expenses_status_check" CHECK ((status = ANY (ARRAY['registered'::text, 'approved'::text, 'paid'::text, 'rejected'::text])));
alter table public."helper_expenses" add constraint "helper_expenses_pkey" PRIMARY KEY (id);
alter table public."admin_notifications" add constraint "admin_notifications_pkey" PRIMARY KEY (id);
alter table public."event_templates" add constraint "event_templates_duration_days_check" CHECK (((duration_days >= 1) AND (duration_days <= 31)));
alter table public."integration_sync_status" add constraint "integration_sync_status_pkey" PRIMARY KEY (integration);
alter table public."event_templates" add constraint "event_templates_registration_days_before_check" CHECK (((registration_days_before IS NULL) OR ((registration_days_before >= 0) AND (registration_days_before <= 365))));
alter table public."event_templates" add constraint "event_templates_pkey" PRIMARY KEY (id);
alter table public."event_templates" add constraint "event_templates_name_key" UNIQUE (name);
alter table public."event_template_automations" add constraint "event_template_automations_rule_type_check" CHECK ((rule_type = ANY (ARRAY['invitation'::text, 'pending_reminder'::text, 'attending_reminder'::text])));
alter table public."event_template_automations" add constraint "event_template_automations_target_type_check" CHECK ((target_type = ANY (ARRAY['all'::text, 'role'::text, 'group'::text])));
alter table public."event_template_automations" add constraint "event_template_automations_days_before_check" CHECK (((days_before >= 0) AND (days_before <= 365)));
alter table public."event_template_automations" add constraint "event_template_automations_send_hour_check" CHECK (((send_hour >= 0) AND (send_hour <= 23)));
alter table public."event_template_automations" add constraint "event_template_automations_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'both'::text])));
alter table public."event_template_automations" add constraint "event_template_automations_check" CHECK (((target_type = 'all'::text) OR ((target_type = 'role'::text) AND (target_role_id IS NOT NULL)) OR ((target_type = 'group'::text) AND (target_group_id IS NOT NULL))));
alter table public."event_template_automations" add constraint "event_template_automations_pkey" PRIMARY KEY (id);
alter table public."event_template_documents" add constraint "event_template_documents_document_type_check" CHECK ((document_type = ANY (ARRAY['program'::text, 'invitation'::text, 'practical'::text, 'meeting_papers'::text, 'other'::text])));
alter table public."event_template_documents" add constraint "event_template_documents_pkey" PRIMARY KEY (id);
alter table public."event_template_documents" add constraint "event_template_documents_storage_path_key" UNIQUE (storage_path);
alter table public."communication_history" add constraint "communication_history_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'automatic'::text, 'system'::text])));
alter table public."communication_history" add constraint "communication_history_channel_check" CHECK ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'push'::text])));
alter table public."communication_history" add constraint "communication_history_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'partial'::text, 'failed'::text, 'test'::text])));
alter table public."communication_history" add constraint "communication_history_pkey" PRIMARY KEY (id);
alter table public."event_registration_fields" add constraint "event_registration_fields_field_type_check" CHECK ((field_type = ANY (ARRAY['text'::text, 'textarea'::text, 'yes_no'::text, 'number'::text, 'select'::text])));
alter table public."event_registration_fields" add constraint "event_registration_fields_pkey" PRIMARY KEY (id);
alter table public."event_registration_answers" add constraint "event_registration_answers_pkey" PRIMARY KEY (id);
alter table public."event_registration_answers" add constraint "event_registration_answers_event_id_person_id_field_id_key" UNIQUE (event_id, person_id, field_id);
alter table public."general_expenses" add constraint "general_expenses_amount_check" CHECK ((amount >= (0)::numeric));
alter table public."general_expenses" add constraint "general_expenses_status_check" CHECK ((status = ANY (ARRAY['registered'::text, 'approved'::text, 'paid'::text, 'rejected'::text])));
alter table public."general_expenses" add constraint "general_expenses_pkey" PRIMARY KEY (id);
alter table public."form_question_options" add constraint "form_question_options_pkey" PRIMARY KEY (id);
alter table public."event_email_reply_tokens" add constraint "event_email_reply_tokens_last_reply_status_check" CHECK (((last_reply_status IS NULL) OR (last_reply_status = ANY (ARRAY['attending'::text, 'declined'::text]))));
alter table public."event_email_reply_tokens" add constraint "event_email_reply_tokens_pkey" PRIMARY KEY (id);
alter table public."event_email_reply_tokens" add constraint "event_email_reply_tokens_token_hash_key" UNIQUE (token_hash);
alter table public."fiken_contacts" add constraint "fiken_contacts_pkey" PRIMARY KEY (id);
alter table public."fiken_contacts" add constraint "fiken_contacts_fiken_contact_id_key" UNIQUE (fiken_contact_id);
alter table public."fiken_invoices" add constraint "fiken_invoices_pkey" PRIMARY KEY (id);
alter table public."fiken_invoices" add constraint "fiken_invoices_fiken_invoice_id_key" UNIQUE (fiken_invoice_id);
alter table public."fiken_billing_runs" add constraint "fiken_billing_runs_run_type_check" CHECK ((run_type = ANY (ARRAY['membership'::text, 'event'::text])));
alter table public."fiken_billing_runs" add constraint "fiken_billing_runs_pkey" PRIMARY KEY (id);
alter table public."fiken_billing_run_items" add constraint "fiken_billing_run_items_pkey" PRIMARY KEY (id);
alter table public."helper_requests" add constraint "helper_requests_timing_type_check" CHECK ((timing_type = ANY (ARRAY['asap'::text, 'date'::text])));
alter table public."helper_requests" add constraint "helper_requests_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'assigned'::text, 'agreed'::text, 'completed'::text, 'cancelled'::text])));
alter table public."helper_requests" add constraint "helper_requests_pkey" PRIMARY KEY (id);
alter table public."dogs" add constraint "dogs_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text, 'deceased'::text, 'inactive'::text])));
alter table public."dogs" add constraint "dogs_pkey" PRIMARY KEY (id);
alter table public."dog_person_links" add constraint "dog_person_links_relation_type_check" CHECK ((relation_type = ANY (ARRAY['handler'::text, 'co_handler'::text, 'owner'::text, 'former_handler'::text])));
alter table public."dog_person_links" add constraint "dog_person_links_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)));
alter table public."dog_person_links" add constraint "dog_person_links_pkey" PRIMARY KEY (id);
alter table public."dog_professional_assignments" add constraint "dog_professional_assignments_assignment_role_check" CHECK ((assignment_role = ANY (ARRAY['hjelpetrener'::text, 'hjelpetreneraspirant'::text, 'skoletrener'::text])));
alter table public."dog_professional_assignments" add constraint "dog_professional_assignments_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)));
alter table public."dog_professional_assignments" add constraint "dog_professional_assignments_pkey" PRIMARY KEY (id);
alter table public."guideview_sessions" add constraint "guideview_sessions_session_type_check" CHECK ((session_type = ANY (ARRAY['follow_up'::text, 'school_training'::text, 'other'::text])));
alter table public."guideview_sessions" add constraint "guideview_sessions_state_check" CHECK ((state = ANY (ARRAY['planned'::text, 'open'::text, 'active'::text, 'completed'::text, 'cancelled'::text])));
alter table public."guideview_sessions" add constraint "guideview_sessions_duration_minutes_check" CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0)));
alter table public."guideview_sessions" add constraint "guideview_sessions_pkey" PRIMARY KEY (id);
alter table public."guideview_sessions" add constraint "guideview_sessions_livekit_room_key" UNIQUE (livekit_room);
alter table public."form_recipients" add constraint "form_recipients_pkey" PRIMARY KEY (id);
alter table public."form_recipients" add constraint "form_recipients_form_id_person_id_key" UNIQUE (form_id, person_id);
alter table public."guideview_session_participants" add constraint "guideview_session_participants_portal_role_check" CHECK ((portal_role = ANY (ARRAY['ekvipasje'::text, 'hjelpetrener'::text, 'hjelpetreneraspirant'::text, 'skoletrener'::text, 'admin'::text, 'system_admin'::text])));
alter table public."guideview_session_participants" add constraint "guideview_session_participants_session_role_check" CHECK ((session_role = ANY (ARRAY['user'::text, 'assistantTrainer'::text, 'trainer'::text, 'administrator'::text])));
alter table public."guideview_session_participants" add constraint "guideview_session_participants_pkey" PRIMARY KEY (id);
alter table public."guideview_session_participants" add constraint "guideview_session_participants_session_id_person_id_key" UNIQUE (session_id, person_id);
alter table public."guideview_session_invitations" add constraint "guideview_session_invitations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text, 'expired'::text])));
alter table public."guideview_session_invitations" add constraint "guideview_session_invitations_pkey" PRIMARY KEY (id);
alter table public."guideview_session_invitations" add constraint "guideview_session_invitations_session_id_person_id_key" UNIQUE (session_id, person_id);
alter table public."dog_consents" add constraint "dog_consents_pkey" PRIMARY KEY (id);
alter table public."dog_notes" add constraint "dog_notes_category_check" CHECK ((category = ANY (ARRAY['guideview'::text, 'school'::text, 'veterinary'::text, 'nav'::text, 'club'::text, 'user'::text])));
alter table public."dog_notes" add constraint "dog_notes_visibility_scope_check" CHECK ((visibility_scope = ANY (ARRAY['private'::text, 'session'::text, 'assigned_professionals'::text, 'handler'::text, 'admin_support'::text])));
alter table public."dog_notes" add constraint "dog_notes_pkey" PRIMARY KEY (id);
alter table public."dog_media" add constraint "dog_media_media_type_check" CHECK ((media_type = ANY (ARRAY['video'::text, 'map_track'::text, 'audio'::text, 'document'::text])));
alter table public."dog_media" add constraint "dog_media_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'temporary'::text, 'stored'::text, 'deleted'::text])));
alter table public."dog_media" add constraint "dog_media_pkey" PRIMARY KEY (id);
alter table public."guideview_media_routes" add constraint "guideview_media_routes_no_self" CHECK ((source_person_id <> target_person_id));
alter table public."guideview_media_routes" add constraint "guideview_media_routes_pkey" PRIMARY KEY (id);
alter table public."guideview_media_routes" add constraint "guideview_media_routes_unique" UNIQUE (session_id, source_person_id, target_person_id);
alter table public."forms" add constraint "forms_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text])));
alter table public."forms" add constraint "forms_response_mode_check" CHECK ((response_mode = ANY (ARRAY['identified'::text, 'anonymous'::text])));
alter table public."forms" add constraint "forms_pkey" PRIMARY KEY (id);
alter table public."form_questions" add constraint "form_questions_question_type_check" CHECK ((question_type = ANY (ARRAY['short_text'::text, 'long_text'::text, 'single_choice'::text, 'multiple_choice'::text, 'yes_no'::text, 'scale'::text, 'date'::text])));
alter table public."form_questions" add constraint "form_questions_pkey" PRIMARY KEY (id);
alter table public."form_responses" add constraint "form_responses_pkey" PRIMARY KEY (id);
alter table public."form_answers" add constraint "form_answers_pkey" PRIMARY KEY (id);
alter table public."form_answers" add constraint "form_answers_response_id_question_id_key" UNIQUE (response_id, question_id);
alter table public."person_roles" add constraint "person_roles_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."person_roles" add constraint "person_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
alter table public."group_members" add constraint "group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."group_members" add constraint "group_members_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."app_users" add constraint "app_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."sms_campaigns" add constraint "sms_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."sms_messages" add constraint "sms_messages_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES sms_campaigns(id) ON DELETE CASCADE;
alter table public."sms_messages" add constraint "sms_messages_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."sms_replies" add constraint "sms_replies_sms_message_id_fkey" FOREIGN KEY (sms_message_id) REFERENCES sms_messages(id) ON DELETE SET NULL;
alter table public."sms_replies" add constraint "sms_replies_matched_person_id_fkey" FOREIGN KEY (matched_person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."email_campaigns" add constraint "email_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."email_messages" add constraint "email_messages_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE;
alter table public."email_messages" add constraint "email_messages_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."events" add constraint "events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."event_participants" add constraint "event_participants_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_participants" add constraint "event_participants_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."sms_campaigns" add constraint "sms_campaigns_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."email_campaigns" add constraint "email_campaigns_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."sms_replies" add constraint "sms_replies_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."library_folders" add constraint "library_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."event_people" add constraint "event_people_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_people" add constraint "event_people_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."event_notes" add constraint "event_notes_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_notes" add constraint "event_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."event_automation_rules" add constraint "event_automation_rules_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_automation_rules" add constraint "event_automation_rules_target_group_id_fkey" FOREIGN KEY (target_group_id) REFERENCES groups(id) ON DELETE SET NULL;
alter table public."event_automation_rules" add constraint "event_automation_rules_target_role_id_fkey" FOREIGN KEY (target_role_id) REFERENCES roles(id) ON DELETE SET NULL;
alter table public."event_documents" add constraint "event_documents_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_documents" add constraint "event_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."app_users" add constraint "app_users_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."library_folders" add constraint "library_folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES library_folders(id) ON DELETE CASCADE;
alter table public."library_folder_permissions" add constraint "library_folder_permissions_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE;
alter table public."library_folder_permissions" add constraint "library_folder_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
alter table public."library_folder_permissions" add constraint "library_folder_permissions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
alter table public."library_documents" add constraint "library_documents_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE;
alter table public."library_documents" add constraint "library_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."helper_requests" add constraint "helper_requests_requester_person_id_fkey" FOREIGN KEY (requester_person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."helper_requests" add constraint "helper_requests_assigned_helper_person_id_fkey" FOREIGN KEY (assigned_helper_person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."helper_entries" add constraint "helper_entries_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."helper_entries" add constraint "helper_entries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."helper_entries" add constraint "helper_entries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."helper_expenses" add constraint "helper_expenses_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."helper_expenses" add constraint "helper_expenses_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES helper_entries(id) ON DELETE SET NULL;
alter table public."helper_expenses" add constraint "helper_expenses_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."helper_expenses" add constraint "helper_expenses_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."admin_notifications" add constraint "admin_notifications_related_person_id_fkey" FOREIGN KEY (related_person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."admin_notifications" add constraint "admin_notifications_related_event_id_fkey" FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."admin_notifications" add constraint "admin_notifications_related_expense_id_fkey" FOREIGN KEY (related_expense_id) REFERENCES helper_expenses(id) ON DELETE CASCADE;
alter table public."event_templates" add constraint "event_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."event_template_automations" add constraint "event_template_automations_template_id_fkey" FOREIGN KEY (template_id) REFERENCES event_templates(id) ON DELETE CASCADE;
alter table public."event_template_automations" add constraint "event_template_automations_target_role_id_fkey" FOREIGN KEY (target_role_id) REFERENCES roles(id) ON DELETE SET NULL;
alter table public."event_template_automations" add constraint "event_template_automations_target_group_id_fkey" FOREIGN KEY (target_group_id) REFERENCES groups(id) ON DELETE SET NULL;
alter table public."event_template_documents" add constraint "event_template_documents_template_id_fkey" FOREIGN KEY (template_id) REFERENCES event_templates(id) ON DELETE CASCADE;
alter table public."event_template_documents" add constraint "event_template_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."form_questions" add constraint "form_questions_form_id_fkey" FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE;
alter table public."communication_history" add constraint "communication_history_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."communication_history" add constraint "communication_history_automation_rule_id_fkey" FOREIGN KEY (automation_rule_id) REFERENCES event_automation_rules(id) ON DELETE SET NULL;
alter table public."communication_history" add constraint "communication_history_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."event_registration_fields" add constraint "event_registration_fields_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_registration_answers" add constraint "event_registration_answers_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_registration_answers" add constraint "event_registration_answers_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."event_registration_answers" add constraint "event_registration_answers_field_id_fkey" FOREIGN KEY (field_id) REFERENCES event_registration_fields(id) ON DELETE CASCADE;
alter table public."general_expenses" add constraint "general_expenses_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."admin_notifications" add constraint "admin_notifications_related_general_expense_id_fkey" FOREIGN KEY (related_general_expense_id) REFERENCES general_expenses(id) ON DELETE SET NULL;
alter table public."event_email_reply_tokens" add constraint "event_email_reply_tokens_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
alter table public."event_email_reply_tokens" add constraint "event_email_reply_tokens_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."fiken_contacts" add constraint "fiken_contacts_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."fiken_invoices" add constraint "fiken_invoices_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."fiken_invoices" add constraint "fiken_invoices_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."fiken_billing_runs" add constraint "fiken_billing_runs_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."fiken_billing_run_items" add constraint "fiken_billing_run_items_run_id_fkey" FOREIGN KEY (run_id) REFERENCES fiken_billing_runs(id) ON DELETE CASCADE;
alter table public."fiken_billing_run_items" add constraint "fiken_billing_run_items_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."fiken_billing_run_items" add constraint "fiken_billing_run_items_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."dog_person_links" add constraint "dog_person_links_dog_id_fkey" FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
alter table public."dog_person_links" add constraint "dog_person_links_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."dog_person_links" add constraint "dog_person_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES persons(id);
alter table public."form_question_options" add constraint "form_question_options_question_id_fkey" FOREIGN KEY (question_id) REFERENCES form_questions(id) ON DELETE CASCADE;
alter table public."dog_professional_assignments" add constraint "dog_professional_assignments_dog_id_fkey" FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
alter table public."dog_professional_assignments" add constraint "dog_professional_assignments_professional_person_id_fkey" FOREIGN KEY (professional_person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."dog_professional_assignments" add constraint "dog_professional_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES persons(id);
alter table public."guideview_sessions" add constraint "guideview_sessions_dog_id_fkey" FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE RESTRICT;
alter table public."guideview_sessions" add constraint "guideview_sessions_helper_request_id_fkey" FOREIGN KEY (helper_request_id) REFERENCES helper_requests(id) ON DELETE SET NULL;
alter table public."guideview_sessions" add constraint "guideview_sessions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
alter table public."guideview_sessions" add constraint "guideview_sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES persons(id);
alter table public."guideview_session_participants" add constraint "guideview_session_participants_session_id_fkey" FOREIGN KEY (session_id) REFERENCES guideview_sessions(id) ON DELETE CASCADE;
alter table public."guideview_session_participants" add constraint "guideview_session_participants_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."guideview_session_participants" add constraint "guideview_session_participants_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES persons(id);
alter table public."guideview_session_invitations" add constraint "guideview_session_invitations_session_id_fkey" FOREIGN KEY (session_id) REFERENCES guideview_sessions(id) ON DELETE CASCADE;
alter table public."guideview_session_invitations" add constraint "guideview_session_invitations_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."guideview_session_invitations" add constraint "guideview_session_invitations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES persons(id);
alter table public."dog_consents" add constraint "dog_consents_dog_id_fkey" FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
alter table public."dog_consents" add constraint "dog_consents_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."dog_notes" add constraint "dog_notes_dog_id_fkey" FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
alter table public."dog_notes" add constraint "dog_notes_session_id_fkey" FOREIGN KEY (session_id) REFERENCES guideview_sessions(id) ON DELETE SET NULL;
alter table public."dog_notes" add constraint "dog_notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES persons(id);
alter table public."dog_media" add constraint "dog_media_dog_id_fkey" FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE;
alter table public."dog_media" add constraint "dog_media_session_id_fkey" FOREIGN KEY (session_id) REFERENCES guideview_sessions(id) ON DELETE SET NULL;
alter table public."dog_media" add constraint "dog_media_created_by_fkey" FOREIGN KEY (created_by) REFERENCES persons(id);
alter table public."audit_log" add constraint "audit_log_changed_by_user_id_fkey" FOREIGN KEY (changed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."audit_log" add constraint "audit_log_changed_by_person_id_fkey" FOREIGN KEY (changed_by_person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."guideview_media_routes" add constraint "guideview_media_routes_session_id_fkey" FOREIGN KEY (session_id) REFERENCES guideview_sessions(id) ON DELETE CASCADE;
alter table public."guideview_media_routes" add constraint "guideview_media_routes_source_person_id_fkey" FOREIGN KEY (source_person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."guideview_media_routes" add constraint "guideview_media_routes_target_person_id_fkey" FOREIGN KEY (target_person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."guideview_media_routes" add constraint "guideview_media_routes_updated_by_person_id_fkey" FOREIGN KEY (updated_by_person_id) REFERENCES persons(id);
alter table public."forms" add constraint "forms_created_by_person_id_fkey" FOREIGN KEY (created_by_person_id) REFERENCES persons(id);
alter table public."form_recipients" add constraint "form_recipients_form_id_fkey" FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE;
alter table public."form_recipients" add constraint "form_recipients_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public."form_responses" add constraint "form_responses_form_id_fkey" FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE;
alter table public."form_responses" add constraint "form_responses_person_id_fkey" FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE SET NULL;
alter table public."form_answers" add constraint "form_answers_response_id_fkey" FOREIGN KEY (response_id) REFERENCES form_responses(id) ON DELETE CASCADE;
alter table public."form_answers" add constraint "form_answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES form_questions(id) ON DELETE CASCADE;
set check_function_bodies=off;
CREATE OR REPLACE FUNCTION public.current_app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select au.app_role
  from public.app_users au
  where au.user_id = auth.uid()
    and coalesce(au.active, true) = true
  limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.current_person_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select au.person_id
  from public.app_users au
  where au.user_id = auth.uid()
    and coalesce(au.active, true) = true
  limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.admin_helper_year_overview(target_year integer)
 RETURNS TABLE(person_id uuid, person_name text, honor numeric, mileage numeric, expenses numeric, total numeric, entry_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

  select
    p.id,
    p.full_name,

    coalesce(
      sum(
        case
          when h.activity_type =
            'other'

          then coalesce(
            h.custom_amount,
            0
          )

          else coalesce(
            h.rate_snapshot,
            0
          )
        end
      ),
      0
    )::numeric
    as honor,


    coalesce(
      sum(
        coalesce(
          h.kilometers,
          0
        )
        *
        coalesce(
          h.mileage_rate_snapshot,
          0
        )
      ),
      0
    )::numeric
    as mileage,


    coalesce(
      (
        select sum(
          x.amount
        )

        from public.helper_expenses x

        where
          x.person_id =
            p.id

          and extract(
                year
                from x.expense_date
              ) =
              target_year

          and x.status <>
              'rejected'
      ),
      0
    )::numeric
    as expenses,


    (
      coalesce(
        sum(
          case
            when h.activity_type =
              'other'

            then coalesce(
              h.custom_amount,
              0
            )

            else coalesce(
              h.rate_snapshot,
              0
            )
          end
        ),
        0
      )

      +

      coalesce(
        sum(
          coalesce(
            h.kilometers,
            0
          )
          *
          coalesce(
            h.mileage_rate_snapshot,
            0
          )
        ),
        0
      )

      +

      coalesce(
        (
          select sum(
            x.amount
          )

          from public.helper_expenses x

          where
            x.person_id =
              p.id

            and extract(
                  year
                  from x.expense_date
                ) =
                target_year

            and x.status <>
                'rejected'
        ),
        0
      )
    )::numeric
    as total,


    count(
      h.id
    )

  from public.persons p


  join public.person_roles pr
    on pr.person_id =
       p.id

   and pr.is_active =
       true


  join public.roles r
    on r.id =
       pr.role_id

   and lower(
         r.name
       ) =
       'hjelpetrener'


  left join public.helper_entries h
    on h.person_id =
       p.id

   and extract(
         year
         from h.activity_date
       ) =
       target_year

   and h.status <>
       'rejected'


  where
    public.current_app_role()
    in (
      'admin',
      'system_admin'
    )


  group by
    p.id,
    p.full_name


  order by
    p.full_name;

$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.log_person_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (
      table_name,
      record_id,
      action,
      new_data
    )
    values (
      tg_table_name,
      new.id,
      tg_op,
      to_jsonb(new)
    );

    return new;

  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (
      table_name,
      record_id,
      action,
      old_data,
      new_data
    )
    values (
      tg_table_name,
      new.id,
      tg_op,
      to_jsonb(old),
      to_jsonb(new)
    );

    return new;

  elsif tg_op = 'DELETE' then
    insert into public.audit_log (
      table_name,
      record_id,
      action,
      old_data
    )
    values (
      tg_table_name,
      old.id,
      tg_op,
      to_jsonb(old)
    );

    return old;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.can_manage_members()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and active = true
      and app_role in ('system_admin', 'admin')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_system_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and active = true
      and app_role = 'system_admin'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.sync_my_auth_email()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  pid uuid;
  mail text;
begin
  select person_id
  into pid
  from public.app_users
  where user_id = auth.uid()
    and active = true;

  select email
  into mail
  from auth.users
  where id = auth.uid();

  if pid is null or mail is null then
    return false;
  end if;

  update public.persons
  set email = mail
  where id = pid
    and email is distinct from mail;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.has_active_person_role(target_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.person_roles pr
    join public.roles r
      on r.id = pr.role_id
    where pr.person_id = public.current_person_id()
      and pr.is_active = true
      and lower(r.name) = lower(target_role)
      and (
        pr.started_at is null
        or pr.started_at <= current_date
      )
      and (
        pr.ended_at is null
        or pr.ended_at >= current_date
      )
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_guideview_session_participant(target_session uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.guideview_session_participants gsp
    where gsp.session_id = target_session
      and gsp.person_id = public.current_person_id()
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_last_system_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  active_system_admins integer;
begin
  select count(*)
  into active_system_admins
  from public.app_users
  where app_role = 'system_admin'
    and active = true;

  -- Sletting av aktiv systemadministrator
  if tg_op = 'DELETE'
     and old.app_role = 'system_admin'
     and old.active = true
     and active_system_admins <= 1 then
    raise exception
      'Kan ikke slette den siste aktive systemadministratoren.';
  end if;

  -- Deaktivering eller nedgradering av aktiv systemadministrator
  if tg_op = 'UPDATE'
     and old.app_role = 'system_admin'
     and old.active = true
     and (
       new.app_role <> 'system_admin'
       or new.active = false
     )
     and active_system_admins <= 1 then
    raise exception
      'Kan ikke deaktivere eller nedgradere den siste aktive systemadministratoren.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.log_app_user_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (
      table_name,
      record_id,
      action,
      new_data
    )
    values (
      'app_users',
      new.user_id,
      tg_op,
      to_jsonb(new)
    );

    return new;

  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (
      table_name,
      record_id,
      action,
      old_data,
      new_data
    )
    values (
      'app_users',
      new.user_id,
      tg_op,
      to_jsonb(old),
      to_jsonb(new)
    );

    return new;

  elsif tg_op = 'DELETE' then
    insert into public.audit_log (
      table_name,
      record_id,
      action,
      old_data
    )
    values (
      'app_users',
      old.user_id,
      tg_op,
      to_jsonb(old)
    );

    return old;
  end if;

  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.can_access_members()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and active = true
      and app_role in ('system_admin', 'admin', 'readonly')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_email_communication_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.communication_history
  set
    event_id =
      new.event_id,

    subject =
      new.subject,

    message =
      new.message,

    recipient_count =
      coalesce(
        new.recipient_count,
        0
      ),

    sent_count =
      coalesce(
        new.sent_count,
        0
      ),

    failed_count =
      coalesce(
        new.failed_count,
        0
      ),

    status =
      case
        when coalesce(new.sent_count,0) = 0
         and coalesce(new.failed_count,0) = 0
          then 'pending'

        when coalesce(new.failed_count,0) = 0
          then 'sent'

        when coalesce(new.sent_count,0) = 0
          then 'failed'

        else 'partial'
      end,

    completed_at =
      case
        when
          coalesce(new.sent_count,0)
          +
          coalesce(new.failed_count,0)
          > 0
          then now()

        else completed_at
      end

  where source_table = 'email_campaigns'
    and source_record_id = new.id;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.library_can(target_folder uuid, requested_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  app_role_value text;
  person_value uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select public.current_app_role()
  into app_role_value;

  if app_role_value in ('admin', 'system_admin') then
    return true;
  end if;

  select public.current_person_id()
  into person_value;

  return exists (
    select 1
    from public.library_folder_permissions p
    where p.folder_id = target_folder
      and (
        p.subject_type = 'all_authenticated'
        or (
          p.subject_type = 'app_role'
          and p.app_role = app_role_value
        )
        or (
          p.subject_type = 'role'
          and person_value is not null
          and exists (
            select 1
            from public.person_roles pr
            where pr.person_id = person_value
              and pr.role_id = p.role_id
              and pr.is_active = true
          )
        )
        or (
          p.subject_type = 'group'
          and person_value is not null
          and exists (
            select 1
            from public.group_members gm
            where gm.person_id = person_value
              and gm.group_id = p.group_id
          )
        )
      )
      and case requested_action
        when 'read' then p.can_read
        when 'upload' then p.can_upload
        when 'edit' then p.can_edit
        when 'delete' then p.can_delete
        else false
      end
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_current_person(target_person uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_person_id() = target_person, false)
$function$
;
CREATE OR REPLACE FUNCTION public.helper_rate_for(target_year integer, target_type text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select amount
    from public.helper_rates
    where year = target_year
      and rate_type = target_type
    limit 1
  ),0)
$function$
;
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
    end_date
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

  base_rate :=
    public.helper_rate_for(
      yr,
      activity_kind
    );

  km_rate :=
    public.helper_rate_for(
      yr,
      'mileage'
    );

  insert into public.helper_entries(
    person_id,
    event_id,
    source,
    activity_date,
    activity_type,
    description,
    rate_snapshot,
    mileage_rate_snapshot
  )
  values(
    new.person_id,
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
    rate_snapshot = excluded.rate_snapshot,
    mileage_rate_snapshot = excluded.mileage_rate_snapshot;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.complete_first_login()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget';
  end if;

  update public.app_users
  set
    must_change_password = false,
    first_login_completed_at = coalesce(
      first_login_completed_at,
      now()
    )
  where user_id = auth.uid()
    and active = true;

  get diagnostics affected = row_count;

  if affected <> 1 then
    raise exception
      'Fant ikke nøyaktig én aktiv portalbruker for innlogget konto';
  end if;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.my_portal_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pid uuid;
  result jsonb;
begin
  pid := public.current_person_id();

  if pid is null then
    return jsonb_build_object(
      'person', null,
      'roles', '[]'::jsonb,
      'groups', '[]'::jsonb,
      'events', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'helper', null
    );
  end if;

  select jsonb_build_object(
    'person',
      (
        select jsonb_build_object(
          'id', p.id,
          'name', p.full_name,
          'email', p.email,
          'phone', p.phone,
          'membership_status', p.membership_status
        )
        from public.persons p
        where p.id = pid
      ),

    'roles',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'name', r.name
          )
          order by r.name
        )
        from public.person_roles pr
        join public.roles r
          on r.id = pr.role_id
        where pr.person_id = pid
          and pr.is_active = true
      ), '[]'::jsonb),

    'groups',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'function_name', gm.function_name
          )
          order by g.name
        )
        from public.group_members gm
        join public.groups g
          on g.id = gm.group_id
        where gm.person_id = pid
          and g.active = true
      ), '[]'::jsonb),

    'events',
      coalesce((
        select jsonb_agg(
          x.obj
          order by x.event_date, x.start_time
        )
        from (
          select distinct on (e.id)
            e.event_date,
            e.start_time,

            jsonb_build_object(
              'id', e.id,
              'title', e.title,
              'event_date', e.event_date,
              'end_date', e.end_date,
              'start_time', e.start_time,
              'end_time', e.end_time,
              'location', e.location,
              'status', e.status,
              'participant_status', ep.status,
              'guest_count', coalesce(ep.guest_count, 0),
              'associated_function', evp.function_name
            ) as obj

          from public.events e

          left join public.event_participants ep
            on ep.event_id = e.id
           and ep.person_id = pid

          left join public.event_people evp
            on evp.event_id = e.id
           and evp.person_id = pid

          where e.status = 'planned'
            and e.event_date >= current_date
            and (
              ep.person_id is not null
              or evp.person_id is not null
            )

          order by
            e.id,
            e.event_date,
            e.start_time
        ) x
      ), '[]'::jsonb),

    'documents',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'name', d.original_name,
            'description', d.description,
            'created_at', d.created_at,
            'folder_id', f.id,
            'folder_name', f.name
          )
          order by d.created_at desc
        )
        from (
          select d.*
          from public.library_documents d
          where public.library_can(
            d.folder_id,
            'read'
          )
          order by d.created_at desc
          limit 10
        ) d

        join public.library_folders f
          on f.id = d.folder_id
      ), '[]'::jsonb),

    'helper',
      case
        when exists (
          select 1
          from public.person_roles pr
          join public.roles r
            on r.id = pr.role_id
          where pr.person_id = pid
            and pr.is_active = true
            and lower(r.name) = 'hjelpetrener'
        )
        then (
          select jsonb_build_object(
            'year',
              extract(year from current_date)::int,

            'honor',
              coalesce(
                sum(
                  case
                    when he.activity_type = 'other'
                      then coalesce(he.custom_amount, 0)
                    else coalesce(he.rate_snapshot, 0)
                  end
                ),
                0
              ),

            'mileage',
              coalesce(
                sum(
                  coalesce(he.kilometers, 0)
                  *
                  coalesce(he.mileage_rate_snapshot, 0)
                ),
                0
              ),

            'expenses',
              coalesce((
                select sum(hx.amount)
                from public.helper_expenses hx
                where hx.person_id = pid
                  and extract(
                    year from hx.expense_date
                  )::int =
                    extract(
                      year from current_date
                    )::int
                  and hx.status <> 'rejected'
              ), 0)
          )

          from public.helper_entries he

          where he.person_id = pid
            and extract(
              year from he.activity_date
            )::int =
              extract(
                year from current_date
              )::int
        )

        else null
      end
  )
  into result;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.log_sms_campaign_to_communication_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.communication_history(
    event_id,
    source,
    source_table,
    source_record_id,
    channel,
    audience_type,
    audience_label,
    message,
    recipient_count,
    sent_count,
    failed_count,
    status,
    created_by,
    created_at
  )
  values(
    new.event_id,
    'manual',
    'sms_campaigns',
    new.id,
    'sms',
    'manual',
    'Manuell SMS-utsendelse',
    new.message,
    coalesce(
      new.recipient_count,
      0
    ),
    0,
    0,
    'pending',
    new.created_by,
    coalesce(
      new.created_at,
      now()
    )
  )
  on conflict do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_sms_communication_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  campaign uuid;
  ok_count integer;
  fail_count integer;
  total_count integer;
begin
  campaign :=
    coalesce(
      new.campaign_id,
      old.campaign_id
    );

  select
    count(*) filter (
      where status = 'sent'
    ),
    count(*) filter (
      where status = 'failed'
    ),
    count(*)
  into
    ok_count,
    fail_count,
    total_count
  from public.sms_messages
  where campaign_id = campaign;

  update public.communication_history
  set
    sent_count =
      coalesce(
        ok_count,
        0
      ),

    failed_count =
      coalesce(
        fail_count,
        0
      ),

    status =
      case
        when coalesce(total_count,0) = 0
          then 'pending'

        when coalesce(fail_count,0) = 0
          then 'sent'

        when coalesce(ok_count,0) = 0
          then 'failed'

        else 'partial'
      end,

    completed_at =
      case
        when coalesce(total_count,0) > 0
          then now()

        else completed_at
      end

  where source_table = 'sms_campaigns'
    and source_record_id = campaign;

  return coalesce(
    new,
    old
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.log_email_campaign_to_communication_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.communication_history(
    event_id,
    source,
    source_table,
    source_record_id,
    channel,
    audience_type,
    audience_label,
    subject,
    message,
    recipient_count,
    sent_count,
    failed_count,
    status,
    created_by,
    created_at
  )
  values(
    new.event_id,
    'manual',
    'email_campaigns',
    new.id,
    'email',
    'manual',
    'Manuell e-postutsendelse',
    new.subject,
    new.message,
    coalesce(
      new.recipient_count,
      0
    ),
    coalesce(
      new.sent_count,
      0
    ),
    coalesce(
      new.failed_count,
      0
    ),

    case
      when coalesce(new.sent_count,0) = 0
       and coalesce(new.failed_count,0) = 0
        then 'pending'

      when coalesce(new.failed_count,0) = 0
        then 'sent'

      when coalesce(new.sent_count,0) = 0
        then 'failed'

      else 'partial'
    end,

    new.created_by,

    coalesce(
      new.created_at,
      now()
    )
  )
  on conflict do nothing;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_dashboard_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  role_value text;
  result jsonb;
begin
  role_value := public.current_app_role();

  if role_value not in ('admin','system_admin') then
    raise exception 'Ingen tilgang';
  end if;

  select jsonb_build_object(

    'counts',
      jsonb_build_object(

        'upcoming_events',
          (
            select count(*)
            from public.events e
            where e.status = 'planned'
              and e.event_date >= current_date
              and e.event_date <= current_date + 30
          ),

        'unread_notifications',
          (
            select count(*)
            from public.admin_notifications n
            where n.is_read = false
          ),

        'helper_entries_waiting',
          (
            select count(*)
            from public.helper_entries h
            where h.status = 'registered'
          ),

        'expenses_waiting',
          (
            select count(*)
            from public.helper_expenses x
            where x.status = 'registered'
          ),

        'pending_first_login',
          (
            select count(*)
            from public.app_users a
            where a.active = true
              and a.must_change_password = true
          )
      ),

    'events',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'event_date', e.event_date,
            'end_date', e.end_date,
            'start_time', e.start_time,
            'location', e.location,
            'registration_deadline', e.registration_deadline,

            'attending_count',
              (
                select count(*)
                from public.event_participants ep
                where ep.event_id = e.id
                  and ep.status = 'attending'
              ),

            'pending_count',
              (
                select count(*)
                from public.event_participants ep
                where ep.event_id = e.id
                  and ep.status = 'pending'
              )
          )
          order by e.event_date, e.start_time
        )

        from (
          select *
          from public.events
          where status = 'planned'
            and event_date >= current_date
          order by event_date, start_time
          limit 12
        ) e
      ), '[]'::jsonb),

    'automation_rules',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'event_id', r.event_id,
            'event_title', e.title,
            'rule_type', r.rule_type,
            'target_type', r.target_type,
            'days_before', r.days_before,
            'send_hour', r.send_hour,
            'channel', r.channel,
            'send_date', (e.event_date - r.days_before),
            'last_sent_at', r.last_sent_at
          )
          order by
            (e.event_date - r.days_before),
            r.send_hour
        )

        from public.event_automation_rules r

        join public.events e
          on e.id = r.event_id

        where r.enabled = true
          and r.last_sent_at is null
          and e.status = 'planned'
          and (e.event_date - r.days_before) >= current_date
          and (e.event_date - r.days_before) <= current_date + 14
      ), '[]'::jsonb),

    'helper_entries',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', h.id,
            'person_id', h.person_id,
            'person_name', p.full_name,
            'activity_date', h.activity_date,
            'activity_type', h.activity_type,
            'description', h.description,
            'rate_snapshot', h.rate_snapshot,
            'custom_amount', h.custom_amount,
            'kilometers', h.kilometers,
            'mileage_rate_snapshot', h.mileage_rate_snapshot,
            'status', h.status
          )
          order by h.activity_date
        )

        from (
          select *
          from public.helper_entries
          where status = 'registered'
          order by activity_date
          limit 30
        ) h

        join public.persons p
          on p.id = h.person_id
      ), '[]'::jsonb),

    'expenses',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'person_id', x.person_id,
            'person_name', p.full_name,
            'expense_date', x.expense_date,
            'amount', x.amount,
            'description', x.description,
            'has_receipt', (x.receipt_storage_path is not null),
            'status', x.status
          )
          order by x.expense_date
        )

        from (
          select *
          from public.helper_expenses
          where status = 'registered'
          order by expense_date
          limit 30
        ) x

        join public.persons p
          on p.id = x.person_id
      ), '[]'::jsonb),

    'notifications',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', n.id,
            'notification_type', n.notification_type,
            'title', n.title,
            'message', n.message,
            'created_at', n.created_at,
            'related_expense_id', n.related_expense_id,
            'related_person_id', n.related_person_id,
            'related_event_id', n.related_event_id
          )
          order by n.created_at desc
        )

        from (
          select *
          from public.admin_notifications
          where is_read = false
          order by created_at desc
          limit 30
        ) n
      ), '[]'::jsonb),

    'pending_users',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', a.user_id,
            'display_name', a.display_name,
            'app_role', a.app_role,
            'created_at', a.created_at,
            'person_id', a.person_id
          )
          order by a.created_at
        )

        from public.app_users a

        where a.active = true
          and a.must_change_password = true
      ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.library_my_permissions(target_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  person_uuid uuid;
  portal_role text;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Ikke innlogget';
  end if;

  select
    a.person_id,
    a.app_role
  into
    person_uuid,
    portal_role
  from public.app_users a
  where a.user_id = auth.uid()
    and a.active = true;

  if portal_role in ('admin','system_admin') then
    return jsonb_build_object(
      'can_read', true,
      'can_upload', true,
      'can_edit', true,
      'can_delete', true
    );
  end if;

  select jsonb_build_object(
    'can_read',
      coalesce(bool_or(p.can_read), false),

    'can_upload',
      coalesce(bool_or(p.can_upload), false),

    'can_edit',
      coalesce(bool_or(p.can_edit), false),

    'can_delete',
      coalesce(bool_or(p.can_delete), false)
  )
  into result
  from public.library_folder_permissions p
  where p.folder_id = target_folder_id
    and (
      p.subject_type = 'all_authenticated'

      or (
        p.subject_type = 'app_role'
        and p.app_role = portal_role
      )

      or (
        p.subject_type = 'role'
        and person_uuid is not null
        and exists (
          select 1
          from public.person_roles pr
          where pr.person_id = person_uuid
            and pr.role_id = p.role_id
            and pr.is_active = true
        )
      )

      or (
        p.subject_type = 'group'
        and person_uuid is not null
        and exists (
          select 1
          from public.group_members gm
          where gm.person_id = person_uuid
            and gm.group_id = p.group_id
        )
      )
    );

  return coalesce(
    result,
    jsonb_build_object(
      'can_read', false,
      'can_upload', false,
      'can_edit', false,
      'can_delete', false
    )
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_my_phone(new_phone text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pid uuid;
begin
  select person_id
  into pid
  from public.app_users
  where user_id = auth.uid()
    and active = true;

  if pid is null then
    raise exception 'Ingen personkobling';
  end if;

  update public.persons
  set phone = nullif(trim(new_phone), '')
  where id = pid;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_my_event_participation(target_event_id uuid, target_status text, target_guest_count integer DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pid uuid;
  ev record;
  n integer;
begin

  if target_status not in (
    'attending',
    'declined'
  ) then
    raise exception 'Ugyldig status';
  end if;

  select person_id
  into pid
  from public.app_users
  where user_id = auth.uid()
    and active = true;

  if pid is null then
    raise exception 'Ingen personkobling';
  end if;

  select *
  into ev
  from public.events
  where id = target_event_id;

  if ev.id is null
     or ev.allow_self_registration is not true then

    raise exception
      'Påmelding er ikke åpen';

  end if;

  if ev.registration_deadline is not null
     and current_date > ev.registration_deadline then

    raise exception
      'Påmeldingsfristen er utløpt';

  end if;

  n :=
    case

      when target_status = 'attending'
       and ev.allow_guests

      then greatest(
        0,
        least(
          coalesce(
            target_guest_count,
            0
          ),
          coalesce(
            ev.max_guests,
            0
          )
        )
      )

      else 0

    end;


  update public.event_participants
  set
    status = target_status,
    guest_count = n,
    updated_at = now()

  where event_id =
          target_event_id

    and person_id =
          pid;


  if not found then

    insert into
    public.event_participants (
      event_id,
      person_id,
      status,
      guest_count
    )

    values (
      target_event_id,
      pid,
      target_status,
      n
    );

  end if;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_my_registration_answers(target_event_id uuid, answers_json jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pid uuid;
  f record;
  val text;
begin

  select person_id
  into pid
  from public.app_users
  where user_id = auth.uid()
    and active = true;

  if pid is null then
    raise exception 'Ingen personkobling';
  end if;


  for f in

    select *
    from public.event_registration_fields

    where event_id =
            target_event_id

      and active = true

  loop

    val :=
      answers_json
      ->> f.id::text;


    if f.required
       and coalesce(
         trim(val),
         ''
       ) = '' then

      raise exception
        'Feltet "%" er obligatorisk',
        f.label;

    end if;


    insert into
    public.event_registration_answers (
      event_id,
      person_id,
      field_id,
      answer_text
    )

    values (
      target_event_id,
      pid,
      f.id,
      val
    )

    on conflict (
      event_id,
      person_id,
      field_id
    )

    do update
    set
      answer_text =
        excluded.answer_text,

      updated_at =
        now();

  end loop;

  return true;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.can_access_dog(target_dog uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (
      select 1
      from public.dog_person_links dpl
      where dpl.dog_id = target_dog
        and dpl.person_id = public.current_person_id()
        and dpl.active = true
        and (
          dpl.valid_from is null
          or dpl.valid_from <= current_date
        )
        and (
          dpl.valid_to is null
          or dpl.valid_to >= current_date
        )
    )
    or
    exists (
      select 1
      from public.dog_professional_assignments dpa
      where dpa.dog_id = target_dog
        and dpa.professional_person_id =
          public.current_person_id()
        and dpa.active = true
        and (
          dpa.valid_from is null
          or dpa.valid_from <= current_date
        )
        and (
          dpa.valid_to is null
          or dpa.valid_to >= current_date
        )
    );
$function$
;
CREATE OR REPLACE FUNCTION public.log_guideview_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_person_id uuid;
begin

  v_user_id := auth.uid();
  v_person_id := public.current_person_id();

  if tg_op = 'INSERT' then

    insert into public.audit_log (
      table_name,
      record_id,
      action,
      new_data,
      changed_by_user_id,
      changed_by_person_id
    )
    values (
      tg_table_name,
      new.id,
      tg_op,
      to_jsonb(new),
      v_user_id,
      v_person_id
    );

    return new;

  elsif tg_op = 'UPDATE' then

    insert into public.audit_log (
      table_name,
      record_id,
      action,
      old_data,
      new_data,
      changed_by_user_id,
      changed_by_person_id
    )
    values (
      tg_table_name,
      new.id,
      tg_op,
      to_jsonb(old),
      to_jsonb(new),
      v_user_id,
      v_person_id
    );

    return new;

  elsif tg_op = 'DELETE' then

    insert into public.audit_log (
      table_name,
      record_id,
      action,
      old_data,
      changed_by_user_id,
      changed_by_person_id
    )
    values (
      tg_table_name,
      old.id,
      tg_op,
      to_jsonb(old),
      v_user_id,
      v_person_id
    );

    return old;

  end if;

  return null;
end;
$function$
;
set check_function_bodies=on;
create policy "app users read" on "public"."app_users" as PERMISSIVE for SELECT to "authenticated" using (((auth.uid() = user_id) OR is_system_admin()));
create policy "app users insert" on "public"."app_users" as PERMISSIVE for INSERT to "authenticated" with check (is_system_admin());
create policy "app users update" on "public"."app_users" as PERMISSIVE for UPDATE to "authenticated" using (is_system_admin()) with check (is_system_admin());
create policy "app users delete" on "public"."app_users" as PERMISSIVE for DELETE to "authenticated" using (is_system_admin());
create policy "persons read" on "public"."persons" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "persons insert" on "public"."persons" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "persons update" on "public"."persons" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "persons delete" on "public"."persons" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "roles read" on "public"."roles" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "roles insert" on "public"."roles" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "roles update" on "public"."roles" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "roles delete" on "public"."roles" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "person roles read" on "public"."person_roles" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "person roles insert" on "public"."person_roles" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "person roles update" on "public"."person_roles" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "person roles delete" on "public"."person_roles" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "audit log read" on "public"."audit_log" as PERMISSIVE for SELECT to "authenticated" using (is_system_admin());
create policy "sms campaigns read" on "public"."sms_campaigns" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "sms messages read" on "public"."sms_messages" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "sms replies read" on "public"."sms_replies" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "email campaigns read" on "public"."email_campaigns" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "email messages read" on "public"."email_messages" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "events read" on "public"."events" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "events insert" on "public"."events" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "events update" on "public"."events" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "events delete" on "public"."events" as PERMISSIVE for DELETE to "authenticated" using (is_system_admin());
create policy "event participants read" on "public"."event_participants" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "event participants insert" on "public"."event_participants" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "event participants update" on "public"."event_participants" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "event participants delete" on "public"."event_participants" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "event people read" on "public"."event_people" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "event people write" on "public"."event_people" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "event people update" on "public"."event_people" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "event people delete" on "public"."event_people" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "event notes read" on "public"."event_notes" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "event notes write" on "public"."event_notes" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "event notes update" on "public"."event_notes" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "event notes delete" on "public"."event_notes" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "event automation read" on "public"."event_automation_rules" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "event automation write" on "public"."event_automation_rules" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "event automation update" on "public"."event_automation_rules" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "event automation delete" on "public"."event_automation_rules" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "groups read" on "public"."groups" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "groups insert" on "public"."groups" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "groups update" on "public"."groups" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "groups delete" on "public"."groups" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "group members read" on "public"."group_members" as PERMISSIVE for SELECT to "authenticated" using (can_access_members());
create policy "group members insert" on "public"."group_members" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "group members update" on "public"."group_members" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "group members delete" on "public"."group_members" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "event documents read" on "public"."event_documents" as PERMISSIVE for SELECT to "authenticated" using (can_manage_members());
create policy "event documents insert" on "public"."event_documents" as PERMISSIVE for INSERT to "authenticated" with check (can_manage_members());
create policy "event documents update" on "public"."event_documents" as PERMISSIVE for UPDATE to "authenticated" using (can_manage_members()) with check (can_manage_members());
create policy "event documents delete" on "public"."event_documents" as PERMISSIVE for DELETE to "authenticated" using (can_manage_members());
create policy "event document storage read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'event-documents'::text) AND can_manage_members()));
create policy "event document storage insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'event-documents'::text) AND can_manage_members()));
create policy "event document storage update" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using (((bucket_id = 'event-documents'::text) AND can_manage_members())) with check (((bucket_id = 'event-documents'::text) AND can_manage_members()));
create policy "event document storage delete" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'event-documents'::text) AND can_manage_members()));
create policy "library folders read" on "public"."library_folders" as PERMISSIVE for SELECT to "authenticated" using ((library_can(id, 'read'::text) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "library folders insert" on "public"."library_folders" as PERMISSIVE for INSERT to "authenticated" with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library folders update" on "public"."library_folders" as PERMISSIVE for UPDATE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library folders delete" on "public"."library_folders" as PERMISSIVE for DELETE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library permissions read" on "public"."library_folder_permissions" as PERMISSIVE for SELECT to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library permissions insert" on "public"."library_folder_permissions" as PERMISSIVE for INSERT to "authenticated" with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library permissions update" on "public"."library_folder_permissions" as PERMISSIVE for UPDATE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library permissions delete" on "public"."library_folder_permissions" as PERMISSIVE for DELETE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "library documents read" on "public"."library_documents" as PERMISSIVE for SELECT to "authenticated" using (library_can(folder_id, 'read'::text));
create policy "library documents insert" on "public"."library_documents" as PERMISSIVE for INSERT to "authenticated" with check (library_can(folder_id, 'upload'::text));
create policy "library documents update" on "public"."library_documents" as PERMISSIVE for UPDATE to "authenticated" using (library_can(folder_id, 'edit'::text)) with check (library_can(folder_id, 'edit'::text));
create policy "library documents delete" on "public"."library_documents" as PERMISSIVE for DELETE to "authenticated" using (library_can(folder_id, 'delete'::text));
create policy "library storage read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'library-documents'::text) AND (EXISTS ( SELECT 1
   FROM library_documents d
  WHERE ((d.storage_path = objects.name) AND library_can(d.folder_id, 'read'::text))))));
create policy "helper expenses insert" on "public"."helper_expenses" as PERMISSIVE for INSERT to "authenticated" with check ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "library storage insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'library-documents'::text) AND (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "library storage update" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using (((bucket_id = 'library-documents'::text) AND (EXISTS ( SELECT 1
   FROM library_documents d
  WHERE ((d.storage_path = objects.name) AND library_can(d.folder_id, 'edit'::text)))))) with check ((bucket_id = 'library-documents'::text));
create policy "library storage delete" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'library-documents'::text) AND (EXISTS ( SELECT 1
   FROM library_documents d
  WHERE ((d.storage_path = objects.name) AND library_can(d.folder_id, 'delete'::text))))));
create policy "app user reads self" on "public"."app_users" as PERMISSIVE for SELECT to "authenticated" using ((user_id = auth.uid()));
create policy "system admin reads app users" on "public"."app_users" as PERMISSIVE for SELECT to "authenticated" using (((user_id = auth.uid()) OR (current_app_role() = 'system_admin'::text)));
create policy "helper rates read" on "public"."helper_rates" as PERMISSIVE for SELECT to "authenticated" using (true);
create policy "admin notifications read" on "public"."admin_notifications" as PERMISSIVE for SELECT to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "helper rates admin write" on "public"."helper_rates" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "helper entries read" on "public"."helper_entries" as PERMISSIVE for SELECT to "authenticated" using ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "helper entries insert" on "public"."helper_entries" as PERMISSIVE for INSERT to "authenticated" with check ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "helper entries update" on "public"."helper_entries" as PERMISSIVE for UPDATE to "authenticated" using ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])))) with check ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "helper entries delete" on "public"."helper_entries" as PERMISSIVE for DELETE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "helper expenses read" on "public"."helper_expenses" as PERMISSIVE for SELECT to "authenticated" using ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "helper expenses update" on "public"."helper_expenses" as PERMISSIVE for UPDATE to "authenticated" using ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])))) with check ((is_current_person(person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "helper expenses delete" on "public"."helper_expenses" as PERMISSIVE for DELETE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "helper receipts read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'helper-receipts'::text) AND (EXISTS ( SELECT 1
   FROM helper_expenses e
  WHERE ((e.receipt_storage_path = objects.name) AND (is_current_person(e.person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))))))));
create policy "helper receipts insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check ((bucket_id = 'helper-receipts'::text));
create policy "helper receipts delete" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'helper-receipts'::text) AND (EXISTS ( SELECT 1
   FROM helper_expenses e
  WHERE ((e.receipt_storage_path = objects.name) AND (is_current_person(e.person_id) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))))))));
create policy "event templates admin" on "public"."event_templates" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "template automations admin" on "public"."event_template_automations" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "template documents admin" on "public"."event_template_documents" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "template document storage read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'event-template-documents'::text) AND (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "template document storage insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'event-template-documents'::text) AND (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "template document storage delete" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'event-template-documents'::text) AND (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "communication history admin read" on "public"."communication_history" as PERMISSIVE for SELECT to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "communication history admin write" on "public"."communication_history" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "admin notifications insert" on "public"."admin_notifications" as PERMISSIVE for INSERT to "authenticated" with check (((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])) OR (notification_type = 'helper_expense'::text)));
create policy "admin notifications update" on "public"."admin_notifications" as PERMISSIVE for UPDATE to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "registration fields read" on "public"."event_registration_fields" as PERMISSIVE for SELECT to "authenticated" using (((active = true) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "registration fields admin" on "public"."event_registration_fields" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "registration answers own read" on "public"."event_registration_answers" as PERMISSIVE for SELECT to "authenticated" using (((person_id = current_person_id()) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "dog consents own read" on "public"."dog_consents" as PERMISSIVE for SELECT to "authenticated" using ((person_id = current_person_id()));
create policy "registration answers admin" on "public"."event_registration_answers" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "general expenses own read" on "public"."general_expenses" as PERMISSIVE for SELECT to "authenticated" using (((person_id = current_person_id()) OR (current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))));
create policy "general expenses own insert" on "public"."general_expenses" as PERMISSIVE for INSERT to "authenticated" with check ((person_id = current_person_id()));
create policy "general expenses admin" on "public"."general_expenses" as PERMISSIVE for ALL to "authenticated" using ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text]))) with check ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])));
create policy "general expense receipts read" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'general-expense-receipts'::text) AND ((current_app_role() = ANY (ARRAY['admin'::text, 'system_admin'::text])) OR (EXISTS ( SELECT 1
   FROM general_expenses g
  WHERE ((g.receipt_storage_path = objects.name) AND (g.person_id = current_person_id())))))));
create policy "dog consents own insert" on "public"."dog_consents" as PERMISSIVE for INSERT to "authenticated" with check (((person_id = current_person_id()) AND can_access_dog(dog_id)));
create policy "general expense receipts insert" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'general-expense-receipts'::text) AND (split_part(name, '/'::text, 1) = (current_person_id())::text)));
create policy "dogs own or assigned read" on "public"."dogs" as PERMISSIVE for SELECT to "authenticated" using (can_access_dog(id));
create policy "dog person links own or related read" on "public"."dog_person_links" as PERMISSIVE for SELECT to "authenticated" using (((person_id = current_person_id()) OR can_access_dog(dog_id)));
create policy "dog professional assignments own or related read" on "public"."dog_professional_assignments" as PERMISSIVE for SELECT to "authenticated" using (((professional_person_id = current_person_id()) OR can_access_dog(dog_id)));
create policy "guideview sessions participant read" on "public"."guideview_sessions" as PERMISSIVE for SELECT to "authenticated" using ((is_guideview_session_participant(id) OR (created_by = current_person_id())));
create policy "guideview participants same session read" on "public"."guideview_session_participants" as PERMISSIVE for SELECT to "authenticated" using (((person_id = current_person_id()) OR is_guideview_session_participant(session_id)));
create policy "guideview invitations own or creator read" on "public"."guideview_session_invitations" as PERMISSIVE for SELECT to "authenticated" using (((person_id = current_person_id()) OR (created_by = current_person_id())));
create policy "guideview invitations own response" on "public"."guideview_session_invitations" as PERMISSIVE for UPDATE to "authenticated" using (((person_id = current_person_id()) AND (status = 'pending'::text))) with check (((person_id = current_person_id()) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text]))));
create policy "dog consents own update" on "public"."dog_consents" as PERMISSIVE for UPDATE to "authenticated" using ((person_id = current_person_id())) with check ((person_id = current_person_id()));
create policy "dog notes relevant read" on "public"."dog_notes" as PERMISSIVE for SELECT to "authenticated" using ((can_access_dog(dog_id) AND ((session_id IS NULL) OR is_guideview_session_participant(session_id) OR (created_by = current_person_id()))));
create policy "dog notes relevant insert" on "public"."dog_notes" as PERMISSIVE for INSERT to "authenticated" with check (((created_by = current_person_id()) AND can_access_dog(dog_id) AND ((session_id IS NULL) OR is_guideview_session_participant(session_id))));
create policy "dog media metadata relevant read" on "public"."dog_media" as PERMISSIVE for SELECT to "authenticated" using ((can_access_dog(dog_id) AND ((session_id IS NULL) OR is_guideview_session_participant(session_id))));
CREATE TRIGGER persons_set_updated_at BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER persons_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION log_person_changes();
CREATE TRIGGER app_users_set_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER protect_last_system_admin_trigger BEFORE DELETE OR UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION protect_last_system_admin();
CREATE TRIGGER app_users_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION log_app_user_changes();
CREATE TRIGGER events_set_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_participants_set_updated_at BEFORE UPDATE ON public.event_participants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_people_set_updated_at BEFORE UPDATE ON public.event_people FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_notes_set_updated_at BEFORE UPDATE ON public.event_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_automation_rules_set_updated_at BEFORE UPDATE ON public.event_automation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER library_folders_set_updated_at BEFORE UPDATE ON public.library_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER library_documents_set_updated_at BEFORE UPDATE ON public.library_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER helper_entries_set_updated_at BEFORE UPDATE ON public.helper_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER helper_expenses_set_updated_at BEFORE UPDATE ON public.helper_expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_people_sync_helper_entry AFTER INSERT OR UPDATE OF person_id, event_id, function_name ON public.event_people FOR EACH ROW EXECUTE FUNCTION sync_helper_entry_from_event_person();
CREATE TRIGGER event_templates_set_updated_at BEFORE UPDATE ON public.event_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sms_campaign_communication_history AFTER INSERT ON public.sms_campaigns FOR EACH ROW EXECUTE FUNCTION log_sms_campaign_to_communication_history();
CREATE TRIGGER sms_message_refresh_communication_history AFTER INSERT OR DELETE OR UPDATE ON public.sms_messages FOR EACH ROW EXECUTE FUNCTION refresh_sms_communication_history();
CREATE TRIGGER email_campaign_communication_history AFTER INSERT ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION log_email_campaign_to_communication_history();
CREATE TRIGGER email_campaign_refresh_communication_history AFTER UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION refresh_email_communication_history();
CREATE TRIGGER groups_set_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dogs_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.dogs FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER dog_person_links_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.dog_person_links FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER dog_professional_assignments_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.dog_professional_assignments FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER guideview_sessions_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.guideview_sessions FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER guideview_session_participants_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.guideview_session_participants FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER guideview_session_invitations_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.guideview_session_invitations FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER dog_consents_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.dog_consents FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER dog_notes_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.dog_notes FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
CREATE TRIGGER dog_media_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.dog_media FOR EACH ROW EXECUTE FUNCTION log_guideview_changes();
grant TRUNCATE on public."event_documents" to "anon";
grant REFERENCES on public."event_documents" to "anon";
grant TRIGGER on public."event_documents" to "anon";
grant INSERT on public."event_documents" to "authenticated";
grant SELECT on public."event_documents" to "authenticated";
grant UPDATE on public."event_documents" to "authenticated";
grant DELETE on public."event_documents" to "authenticated";
grant TRUNCATE on public."event_documents" to "authenticated";
grant REFERENCES on public."event_documents" to "authenticated";
grant TRIGGER on public."event_documents" to "authenticated";
grant INSERT on public."event_documents" to "service_role";
grant SELECT on public."event_documents" to "service_role";
grant UPDATE on public."event_documents" to "service_role";
grant DELETE on public."event_documents" to "service_role";
grant TRUNCATE on public."event_documents" to "service_role";
grant REFERENCES on public."event_documents" to "service_role";
grant TRIGGER on public."event_documents" to "service_role";
grant TRUNCATE on public."library_folders" to "anon";
grant REFERENCES on public."library_folders" to "anon";
grant TRIGGER on public."library_folders" to "anon";
grant INSERT on public."library_folders" to "authenticated";
grant SELECT on public."library_folders" to "authenticated";
grant UPDATE on public."library_folders" to "authenticated";
grant DELETE on public."library_folders" to "authenticated";
grant TRUNCATE on public."library_folders" to "authenticated";
grant REFERENCES on public."library_folders" to "authenticated";
grant TRIGGER on public."library_folders" to "authenticated";
grant TRUNCATE on public."library_folders" to "service_role";
grant REFERENCES on public."library_folders" to "service_role";
grant TRIGGER on public."library_folders" to "service_role";
grant TRUNCATE on public."library_folder_permissions" to "anon";
grant REFERENCES on public."library_folder_permissions" to "anon";
grant TRIGGER on public."library_folder_permissions" to "anon";
grant INSERT on public."library_folder_permissions" to "authenticated";
grant SELECT on public."library_folder_permissions" to "authenticated";
grant UPDATE on public."library_folder_permissions" to "authenticated";
grant DELETE on public."library_folder_permissions" to "authenticated";
grant TRUNCATE on public."library_folder_permissions" to "authenticated";
grant REFERENCES on public."library_folder_permissions" to "authenticated";
grant TRIGGER on public."library_folder_permissions" to "authenticated";
grant TRUNCATE on public."library_folder_permissions" to "service_role";
grant REFERENCES on public."library_folder_permissions" to "service_role";
grant TRIGGER on public."library_folder_permissions" to "service_role";
grant TRUNCATE on public."library_documents" to "anon";
grant REFERENCES on public."library_documents" to "anon";
grant TRIGGER on public."library_documents" to "anon";
grant INSERT on public."library_documents" to "authenticated";
grant SELECT on public."library_documents" to "authenticated";
grant UPDATE on public."library_documents" to "authenticated";
grant DELETE on public."library_documents" to "authenticated";
grant TRUNCATE on public."library_documents" to "authenticated";
grant REFERENCES on public."library_documents" to "authenticated";
grant TRIGGER on public."library_documents" to "authenticated";
grant TRUNCATE on public."library_documents" to "service_role";
grant REFERENCES on public."library_documents" to "service_role";
grant TRIGGER on public."library_documents" to "service_role";
grant INSERT on public."fiken_contacts" to "service_role";
grant SELECT on public."fiken_contacts" to "service_role";
grant UPDATE on public."fiken_contacts" to "service_role";
grant TRUNCATE on public."fiken_contacts" to "service_role";
grant REFERENCES on public."fiken_contacts" to "service_role";
grant TRIGGER on public."fiken_contacts" to "service_role";
grant INSERT on public."fiken_invoices" to "service_role";
grant SELECT on public."fiken_invoices" to "service_role";
grant UPDATE on public."fiken_invoices" to "service_role";
grant TRUNCATE on public."fiken_invoices" to "service_role";
grant REFERENCES on public."fiken_invoices" to "service_role";
grant TRIGGER on public."fiken_invoices" to "service_role";
grant TRUNCATE on public."helper_rates" to "anon";
grant REFERENCES on public."helper_rates" to "anon";
grant TRIGGER on public."helper_rates" to "anon";
grant INSERT on public."helper_rates" to "authenticated";
grant SELECT on public."helper_rates" to "authenticated";
grant UPDATE on public."helper_rates" to "authenticated";
grant DELETE on public."helper_rates" to "authenticated";
grant TRUNCATE on public."helper_rates" to "authenticated";
grant REFERENCES on public."helper_rates" to "authenticated";
grant TRIGGER on public."helper_rates" to "authenticated";
grant TRUNCATE on public."helper_rates" to "service_role";
grant REFERENCES on public."helper_rates" to "service_role";
grant TRIGGER on public."helper_rates" to "service_role";
grant TRUNCATE on public."helper_entries" to "anon";
grant REFERENCES on public."helper_entries" to "anon";
grant TRIGGER on public."helper_entries" to "anon";
grant INSERT on public."helper_entries" to "authenticated";
grant SELECT on public."helper_entries" to "authenticated";
grant UPDATE on public."helper_entries" to "authenticated";
grant DELETE on public."helper_entries" to "authenticated";
grant TRUNCATE on public."helper_entries" to "authenticated";
grant REFERENCES on public."helper_entries" to "authenticated";
grant TRIGGER on public."helper_entries" to "authenticated";
grant SELECT on public."helper_entries" to "service_role";
grant TRUNCATE on public."helper_entries" to "service_role";
grant REFERENCES on public."helper_entries" to "service_role";
grant TRIGGER on public."helper_entries" to "service_role";
grant TRUNCATE on public."helper_expenses" to "anon";
grant REFERENCES on public."helper_expenses" to "anon";
grant TRIGGER on public."helper_expenses" to "anon";
grant INSERT on public."helper_expenses" to "authenticated";
grant SELECT on public."helper_expenses" to "authenticated";
grant UPDATE on public."helper_expenses" to "authenticated";
grant DELETE on public."helper_expenses" to "authenticated";
grant TRUNCATE on public."helper_expenses" to "authenticated";
grant REFERENCES on public."helper_expenses" to "authenticated";
grant TRIGGER on public."helper_expenses" to "authenticated";
grant SELECT on public."helper_expenses" to "service_role";
grant TRUNCATE on public."helper_expenses" to "service_role";
grant REFERENCES on public."helper_expenses" to "service_role";
grant TRIGGER on public."helper_expenses" to "service_role";
grant TRUNCATE on public."admin_notifications" to "anon";
grant REFERENCES on public."admin_notifications" to "anon";
grant TRIGGER on public."admin_notifications" to "anon";
grant INSERT on public."admin_notifications" to "authenticated";
grant SELECT on public."admin_notifications" to "authenticated";
grant UPDATE on public."admin_notifications" to "authenticated";
grant TRUNCATE on public."admin_notifications" to "authenticated";
grant REFERENCES on public."admin_notifications" to "authenticated";
grant TRIGGER on public."admin_notifications" to "authenticated";
grant INSERT on public."admin_notifications" to "service_role";
grant TRUNCATE on public."admin_notifications" to "service_role";
grant REFERENCES on public."admin_notifications" to "service_role";
grant TRIGGER on public."admin_notifications" to "service_role";
grant INSERT on public."persons" to "authenticated";
grant SELECT on public."persons" to "authenticated";
grant UPDATE on public."persons" to "authenticated";
grant DELETE on public."persons" to "authenticated";
grant TRUNCATE on public."persons" to "authenticated";
grant REFERENCES on public."persons" to "authenticated";
grant TRIGGER on public."persons" to "authenticated";
grant SELECT on public."persons" to "service_role";
grant TRUNCATE on public."persons" to "service_role";
grant REFERENCES on public."persons" to "service_role";
grant TRIGGER on public."persons" to "service_role";
grant INSERT on public."person_roles" to "authenticated";
grant SELECT on public."person_roles" to "authenticated";
grant UPDATE on public."person_roles" to "authenticated";
grant DELETE on public."person_roles" to "authenticated";
grant TRUNCATE on public."person_roles" to "authenticated";
grant REFERENCES on public."person_roles" to "authenticated";
grant TRIGGER on public."person_roles" to "authenticated";
grant SELECT on public."person_roles" to "service_role";
grant TRUNCATE on public."person_roles" to "service_role";
grant REFERENCES on public."person_roles" to "service_role";
grant TRIGGER on public."person_roles" to "service_role";
grant INSERT on public."roles" to "authenticated";
grant SELECT on public."roles" to "authenticated";
grant UPDATE on public."roles" to "authenticated";
grant DELETE on public."roles" to "authenticated";
grant TRUNCATE on public."roles" to "authenticated";
grant REFERENCES on public."roles" to "authenticated";
grant TRIGGER on public."roles" to "authenticated";
grant SELECT on public."roles" to "service_role";
grant TRUNCATE on public."roles" to "service_role";
grant REFERENCES on public."roles" to "service_role";
grant TRIGGER on public."roles" to "service_role";
grant SELECT on public."audit_log" to "authenticated";
grant TRUNCATE on public."audit_log" to "authenticated";
grant REFERENCES on public."audit_log" to "authenticated";
grant TRIGGER on public."audit_log" to "authenticated";
grant TRUNCATE on public."audit_log" to "service_role";
grant REFERENCES on public."audit_log" to "service_role";
grant TRIGGER on public."audit_log" to "service_role";
grant INSERT on public."groups" to "authenticated";
grant SELECT on public."groups" to "authenticated";
grant UPDATE on public."groups" to "authenticated";
grant DELETE on public."groups" to "authenticated";
grant TRUNCATE on public."groups" to "authenticated";
grant REFERENCES on public."groups" to "authenticated";
grant TRIGGER on public."groups" to "authenticated";
grant INSERT on public."groups" to "service_role";
grant SELECT on public."groups" to "service_role";
grant UPDATE on public."groups" to "service_role";
grant DELETE on public."groups" to "service_role";
grant TRUNCATE on public."groups" to "service_role";
grant REFERENCES on public."groups" to "service_role";
grant TRIGGER on public."groups" to "service_role";
grant INSERT on public."group_members" to "authenticated";
grant SELECT on public."group_members" to "authenticated";
grant UPDATE on public."group_members" to "authenticated";
grant DELETE on public."group_members" to "authenticated";
grant TRUNCATE on public."group_members" to "authenticated";
grant REFERENCES on public."group_members" to "authenticated";
grant TRIGGER on public."group_members" to "authenticated";
grant INSERT on public."group_members" to "service_role";
grant SELECT on public."group_members" to "service_role";
grant UPDATE on public."group_members" to "service_role";
grant DELETE on public."group_members" to "service_role";
grant TRUNCATE on public."group_members" to "service_role";
grant REFERENCES on public."group_members" to "service_role";
grant TRIGGER on public."group_members" to "service_role";
grant SELECT on public."sms_campaigns" to "authenticated";
grant TRUNCATE on public."sms_campaigns" to "authenticated";
grant REFERENCES on public."sms_campaigns" to "authenticated";
grant TRIGGER on public."sms_campaigns" to "authenticated";
grant INSERT on public."sms_campaigns" to "service_role";
grant SELECT on public."sms_campaigns" to "service_role";
grant UPDATE on public."sms_campaigns" to "service_role";
grant DELETE on public."sms_campaigns" to "service_role";
grant TRUNCATE on public."sms_campaigns" to "service_role";
grant REFERENCES on public."sms_campaigns" to "service_role";
grant TRIGGER on public."sms_campaigns" to "service_role";
grant INSERT on public."fiken_billing_runs" to "service_role";
grant SELECT on public."fiken_billing_runs" to "service_role";
grant UPDATE on public."fiken_billing_runs" to "service_role";
grant TRUNCATE on public."fiken_billing_runs" to "service_role";
grant REFERENCES on public."fiken_billing_runs" to "service_role";
grant TRIGGER on public."fiken_billing_runs" to "service_role";
grant TRUNCATE on public."event_templates" to "anon";
grant REFERENCES on public."event_templates" to "anon";
grant TRIGGER on public."event_templates" to "anon";
grant INSERT on public."event_templates" to "authenticated";
grant SELECT on public."event_templates" to "authenticated";
grant UPDATE on public."event_templates" to "authenticated";
grant DELETE on public."event_templates" to "authenticated";
grant TRUNCATE on public."event_templates" to "authenticated";
grant REFERENCES on public."event_templates" to "authenticated";
grant TRIGGER on public."event_templates" to "authenticated";
grant TRUNCATE on public."event_templates" to "service_role";
grant REFERENCES on public."event_templates" to "service_role";
grant TRIGGER on public."event_templates" to "service_role";
grant TRUNCATE on public."event_template_automations" to "anon";
grant REFERENCES on public."event_template_automations" to "anon";
grant TRIGGER on public."event_template_automations" to "anon";
grant INSERT on public."event_template_automations" to "authenticated";
grant SELECT on public."event_template_automations" to "authenticated";
grant UPDATE on public."event_template_automations" to "authenticated";
grant DELETE on public."event_template_automations" to "authenticated";
grant TRUNCATE on public."event_template_automations" to "authenticated";
grant REFERENCES on public."event_template_automations" to "authenticated";
grant TRIGGER on public."event_template_automations" to "authenticated";
grant TRUNCATE on public."event_template_automations" to "service_role";
grant REFERENCES on public."event_template_automations" to "service_role";
grant TRIGGER on public."event_template_automations" to "service_role";
grant TRUNCATE on public."event_template_documents" to "anon";
grant REFERENCES on public."event_template_documents" to "anon";
grant TRIGGER on public."event_template_documents" to "anon";
grant INSERT on public."event_template_documents" to "authenticated";
grant SELECT on public."event_template_documents" to "authenticated";
grant UPDATE on public."event_template_documents" to "authenticated";
grant DELETE on public."event_template_documents" to "authenticated";
grant TRUNCATE on public."event_template_documents" to "authenticated";
grant REFERENCES on public."event_template_documents" to "authenticated";
grant TRIGGER on public."event_template_documents" to "authenticated";
grant TRUNCATE on public."event_template_documents" to "service_role";
grant REFERENCES on public."event_template_documents" to "service_role";
grant TRIGGER on public."event_template_documents" to "service_role";
grant INSERT on public."fiken_billing_run_items" to "service_role";
grant SELECT on public."fiken_billing_run_items" to "service_role";
grant UPDATE on public."fiken_billing_run_items" to "service_role";
grant TRUNCATE on public."fiken_billing_run_items" to "service_role";
grant REFERENCES on public."fiken_billing_run_items" to "service_role";
grant TRIGGER on public."fiken_billing_run_items" to "service_role";
grant INSERT on public."app_users" to "authenticated";
grant SELECT on public."app_users" to "authenticated";
grant UPDATE on public."app_users" to "authenticated";
grant DELETE on public."app_users" to "authenticated";
grant TRUNCATE on public."app_users" to "authenticated";
grant REFERENCES on public."app_users" to "authenticated";
grant TRIGGER on public."app_users" to "authenticated";
grant INSERT on public."app_users" to "service_role";
grant SELECT on public."app_users" to "service_role";
grant UPDATE on public."app_users" to "service_role";
grant TRUNCATE on public."app_users" to "service_role";
grant REFERENCES on public."app_users" to "service_role";
grant TRIGGER on public."app_users" to "service_role";
grant SELECT on public."email_campaigns" to "authenticated";
grant TRUNCATE on public."email_campaigns" to "authenticated";
grant REFERENCES on public."email_campaigns" to "authenticated";
grant TRIGGER on public."email_campaigns" to "authenticated";
grant INSERT on public."email_campaigns" to "service_role";
grant SELECT on public."email_campaigns" to "service_role";
grant UPDATE on public."email_campaigns" to "service_role";
grant DELETE on public."email_campaigns" to "service_role";
grant TRUNCATE on public."email_campaigns" to "service_role";
grant REFERENCES on public."email_campaigns" to "service_role";
grant TRIGGER on public."email_campaigns" to "service_role";
grant SELECT on public."email_messages" to "authenticated";
grant TRUNCATE on public."email_messages" to "authenticated";
grant REFERENCES on public."email_messages" to "authenticated";
grant TRIGGER on public."email_messages" to "authenticated";
grant INSERT on public."email_messages" to "service_role";
grant SELECT on public."email_messages" to "service_role";
grant UPDATE on public."email_messages" to "service_role";
grant DELETE on public."email_messages" to "service_role";
grant TRUNCATE on public."email_messages" to "service_role";
grant REFERENCES on public."email_messages" to "service_role";
grant TRIGGER on public."email_messages" to "service_role";
grant TRUNCATE on public."communication_history" to "anon";
grant REFERENCES on public."communication_history" to "anon";
grant TRIGGER on public."communication_history" to "anon";
grant INSERT on public."communication_history" to "authenticated";
grant SELECT on public."communication_history" to "authenticated";
grant UPDATE on public."communication_history" to "authenticated";
grant DELETE on public."communication_history" to "authenticated";
grant TRUNCATE on public."communication_history" to "authenticated";
grant REFERENCES on public."communication_history" to "authenticated";
grant TRIGGER on public."communication_history" to "authenticated";
grant INSERT on public."communication_history" to "service_role";
grant SELECT on public."communication_history" to "service_role";
grant UPDATE on public."communication_history" to "service_role";
grant DELETE on public."communication_history" to "service_role";
grant TRUNCATE on public."communication_history" to "service_role";
grant REFERENCES on public."communication_history" to "service_role";
grant TRIGGER on public."communication_history" to "service_role";
grant SELECT on public."sms_messages" to "authenticated";
grant TRUNCATE on public."sms_messages" to "authenticated";
grant REFERENCES on public."sms_messages" to "authenticated";
grant TRIGGER on public."sms_messages" to "authenticated";
grant INSERT on public."sms_messages" to "service_role";
grant SELECT on public."sms_messages" to "service_role";
grant UPDATE on public."sms_messages" to "service_role";
grant DELETE on public."sms_messages" to "service_role";
grant TRUNCATE on public."sms_messages" to "service_role";
grant REFERENCES on public."sms_messages" to "service_role";
grant TRIGGER on public."sms_messages" to "service_role";
grant SELECT on public."sms_replies" to "authenticated";
grant TRUNCATE on public."sms_replies" to "authenticated";
grant REFERENCES on public."sms_replies" to "authenticated";
grant TRIGGER on public."sms_replies" to "authenticated";
grant INSERT on public."sms_replies" to "service_role";
grant SELECT on public."sms_replies" to "service_role";
grant UPDATE on public."sms_replies" to "service_role";
grant DELETE on public."sms_replies" to "service_role";
grant TRUNCATE on public."sms_replies" to "service_role";
grant REFERENCES on public."sms_replies" to "service_role";
grant TRIGGER on public."sms_replies" to "service_role";
grant INSERT on public."events" to "authenticated";
grant SELECT on public."events" to "authenticated";
grant UPDATE on public."events" to "authenticated";
grant DELETE on public."events" to "authenticated";
grant TRUNCATE on public."events" to "authenticated";
grant REFERENCES on public."events" to "authenticated";
grant TRIGGER on public."events" to "authenticated";
grant SELECT on public."events" to "service_role";
grant TRUNCATE on public."events" to "service_role";
grant REFERENCES on public."events" to "service_role";
grant TRIGGER on public."events" to "service_role";
grant INSERT on public."event_participants" to "authenticated";
grant SELECT on public."event_participants" to "authenticated";
grant UPDATE on public."event_participants" to "authenticated";
grant DELETE on public."event_participants" to "authenticated";
grant TRUNCATE on public."event_participants" to "authenticated";
grant REFERENCES on public."event_participants" to "authenticated";
grant TRIGGER on public."event_participants" to "authenticated";
grant INSERT on public."event_participants" to "service_role";
grant SELECT on public."event_participants" to "service_role";
grant UPDATE on public."event_participants" to "service_role";
grant DELETE on public."event_participants" to "service_role";
grant TRUNCATE on public."event_participants" to "service_role";
grant REFERENCES on public."event_participants" to "service_role";
grant TRIGGER on public."event_participants" to "service_role";
grant TRUNCATE on public."event_people" to "anon";
grant REFERENCES on public."event_people" to "anon";
grant TRIGGER on public."event_people" to "anon";
grant INSERT on public."event_people" to "authenticated";
grant SELECT on public."event_people" to "authenticated";
grant UPDATE on public."event_people" to "authenticated";
grant DELETE on public."event_people" to "authenticated";
grant TRUNCATE on public."event_people" to "authenticated";
grant REFERENCES on public."event_people" to "authenticated";
grant TRIGGER on public."event_people" to "authenticated";
grant INSERT on public."event_people" to "service_role";
grant SELECT on public."event_people" to "service_role";
grant UPDATE on public."event_people" to "service_role";
grant DELETE on public."event_people" to "service_role";
grant TRUNCATE on public."event_people" to "service_role";
grant REFERENCES on public."event_people" to "service_role";
grant TRIGGER on public."event_people" to "service_role";
grant TRUNCATE on public."event_notes" to "anon";
grant REFERENCES on public."event_notes" to "anon";
grant TRIGGER on public."event_notes" to "anon";
grant INSERT on public."event_notes" to "authenticated";
grant SELECT on public."event_notes" to "authenticated";
grant UPDATE on public."event_notes" to "authenticated";
grant DELETE on public."event_notes" to "authenticated";
grant TRUNCATE on public."event_notes" to "authenticated";
grant REFERENCES on public."event_notes" to "authenticated";
grant TRIGGER on public."event_notes" to "authenticated";
grant INSERT on public."event_notes" to "service_role";
grant SELECT on public."event_notes" to "service_role";
grant UPDATE on public."event_notes" to "service_role";
grant DELETE on public."event_notes" to "service_role";
grant TRUNCATE on public."event_notes" to "service_role";
grant REFERENCES on public."event_notes" to "service_role";
grant TRIGGER on public."event_notes" to "service_role";
grant TRUNCATE on public."general_expenses" to "anon";
grant REFERENCES on public."general_expenses" to "anon";
grant TRIGGER on public."general_expenses" to "anon";
grant TRUNCATE on public."general_expenses" to "authenticated";
grant REFERENCES on public."general_expenses" to "authenticated";
grant TRIGGER on public."general_expenses" to "authenticated";
grant INSERT on public."general_expenses" to "service_role";
grant SELECT on public."general_expenses" to "service_role";
grant UPDATE on public."general_expenses" to "service_role";
grant TRUNCATE on public."general_expenses" to "service_role";
grant REFERENCES on public."general_expenses" to "service_role";
grant TRIGGER on public."general_expenses" to "service_role";
grant TRUNCATE on public."event_registration_fields" to "anon";
grant REFERENCES on public."event_registration_fields" to "anon";
grant TRIGGER on public."event_registration_fields" to "anon";
grant TRUNCATE on public."event_registration_fields" to "authenticated";
grant REFERENCES on public."event_registration_fields" to "authenticated";
grant TRIGGER on public."event_registration_fields" to "authenticated";
grant SELECT on public."event_registration_fields" to "service_role";
grant TRUNCATE on public."event_registration_fields" to "service_role";
grant REFERENCES on public."event_registration_fields" to "service_role";
grant TRIGGER on public."event_registration_fields" to "service_role";
grant TRUNCATE on public."event_registration_answers" to "anon";
grant REFERENCES on public."event_registration_answers" to "anon";
grant TRIGGER on public."event_registration_answers" to "anon";
grant TRUNCATE on public."event_registration_answers" to "authenticated";
grant REFERENCES on public."event_registration_answers" to "authenticated";
grant TRIGGER on public."event_registration_answers" to "authenticated";
grant SELECT on public."event_registration_answers" to "service_role";
grant TRUNCATE on public."event_registration_answers" to "service_role";
grant REFERENCES on public."event_registration_answers" to "service_role";
grant TRIGGER on public."event_registration_answers" to "service_role";
grant TRUNCATE on public."event_automation_rules" to "anon";
grant REFERENCES on public."event_automation_rules" to "anon";
grant TRIGGER on public."event_automation_rules" to "anon";
grant INSERT on public."event_automation_rules" to "authenticated";
grant SELECT on public."event_automation_rules" to "authenticated";
grant UPDATE on public."event_automation_rules" to "authenticated";
grant DELETE on public."event_automation_rules" to "authenticated";
grant TRUNCATE on public."event_automation_rules" to "authenticated";
grant REFERENCES on public."event_automation_rules" to "authenticated";
grant TRIGGER on public."event_automation_rules" to "authenticated";
grant INSERT on public."event_automation_rules" to "service_role";
grant SELECT on public."event_automation_rules" to "service_role";
grant UPDATE on public."event_automation_rules" to "service_role";
grant DELETE on public."event_automation_rules" to "service_role";
grant TRUNCATE on public."event_automation_rules" to "service_role";
grant REFERENCES on public."event_automation_rules" to "service_role";
grant TRIGGER on public."event_automation_rules" to "service_role";
grant INSERT on public."helper_requests" to "service_role";
grant SELECT on public."helper_requests" to "service_role";
grant UPDATE on public."helper_requests" to "service_role";
grant TRUNCATE on public."helper_requests" to "service_role";
grant REFERENCES on public."helper_requests" to "service_role";
grant TRIGGER on public."helper_requests" to "service_role";
grant INSERT on public."integration_sync_status" to "service_role";
grant SELECT on public."integration_sync_status" to "service_role";
grant UPDATE on public."integration_sync_status" to "service_role";
grant TRUNCATE on public."integration_sync_status" to "service_role";
grant REFERENCES on public."integration_sync_status" to "service_role";
grant TRIGGER on public."integration_sync_status" to "service_role";
grant INSERT on public."event_email_reply_tokens" to "service_role";
grant SELECT on public."event_email_reply_tokens" to "service_role";
grant UPDATE on public."event_email_reply_tokens" to "service_role";
grant TRUNCATE on public."event_email_reply_tokens" to "service_role";
grant REFERENCES on public."event_email_reply_tokens" to "service_role";
grant TRIGGER on public."event_email_reply_tokens" to "service_role";
grant TRUNCATE on public."dog_media" to "anon";
grant REFERENCES on public."dog_media" to "anon";
grant TRIGGER on public."dog_media" to "anon";
grant INSERT on public."dog_media" to "service_role";
grant SELECT on public."dog_media" to "service_role";
grant UPDATE on public."dog_media" to "service_role";
grant DELETE on public."dog_media" to "service_role";
grant TRUNCATE on public."dog_media" to "service_role";
grant REFERENCES on public."dog_media" to "service_role";
grant TRIGGER on public."dog_media" to "service_role";
grant SELECT on public."dog_media" to "authenticated";
grant TRUNCATE on public."dogs" to "anon";
grant REFERENCES on public."dogs" to "anon";
grant TRIGGER on public."dogs" to "anon";
grant INSERT on public."dogs" to "service_role";
grant SELECT on public."dogs" to "service_role";
grant UPDATE on public."dogs" to "service_role";
grant DELETE on public."dogs" to "service_role";
grant TRUNCATE on public."dogs" to "service_role";
grant REFERENCES on public."dogs" to "service_role";
grant TRIGGER on public."dogs" to "service_role";
grant SELECT on public."dogs" to "authenticated";
grant TRUNCATE on public."dog_person_links" to "anon";
grant REFERENCES on public."dog_person_links" to "anon";
grant TRIGGER on public."dog_person_links" to "anon";
grant INSERT on public."dog_person_links" to "service_role";
grant SELECT on public."dog_person_links" to "service_role";
grant UPDATE on public."dog_person_links" to "service_role";
grant DELETE on public."dog_person_links" to "service_role";
grant TRUNCATE on public."dog_person_links" to "service_role";
grant REFERENCES on public."dog_person_links" to "service_role";
grant TRIGGER on public."dog_person_links" to "service_role";
grant SELECT on public."dog_person_links" to "authenticated";
grant TRUNCATE on public."dog_professional_assignments" to "anon";
grant REFERENCES on public."dog_professional_assignments" to "anon";
grant TRIGGER on public."dog_professional_assignments" to "anon";
grant INSERT on public."dog_professional_assignments" to "service_role";
grant SELECT on public."dog_professional_assignments" to "service_role";
grant UPDATE on public."dog_professional_assignments" to "service_role";
grant DELETE on public."dog_professional_assignments" to "service_role";
grant TRUNCATE on public."dog_professional_assignments" to "service_role";
grant REFERENCES on public."dog_professional_assignments" to "service_role";
grant TRIGGER on public."dog_professional_assignments" to "service_role";
grant SELECT on public."dog_professional_assignments" to "authenticated";
grant TRUNCATE on public."guideview_sessions" to "anon";
grant REFERENCES on public."guideview_sessions" to "anon";
grant TRIGGER on public."guideview_sessions" to "anon";
grant INSERT on public."guideview_sessions" to "service_role";
grant SELECT on public."guideview_sessions" to "service_role";
grant UPDATE on public."guideview_sessions" to "service_role";
grant DELETE on public."guideview_sessions" to "service_role";
grant TRUNCATE on public."guideview_sessions" to "service_role";
grant REFERENCES on public."guideview_sessions" to "service_role";
grant TRIGGER on public."guideview_sessions" to "service_role";
grant SELECT on public."guideview_sessions" to "authenticated";
grant TRUNCATE on public."guideview_session_participants" to "anon";
grant REFERENCES on public."guideview_session_participants" to "anon";
grant TRIGGER on public."guideview_session_participants" to "anon";
grant INSERT on public."guideview_session_participants" to "service_role";
grant SELECT on public."guideview_session_participants" to "service_role";
grant UPDATE on public."guideview_session_participants" to "service_role";
grant DELETE on public."guideview_session_participants" to "service_role";
grant TRUNCATE on public."guideview_session_participants" to "service_role";
grant REFERENCES on public."guideview_session_participants" to "service_role";
grant TRIGGER on public."guideview_session_participants" to "service_role";
grant SELECT on public."guideview_session_participants" to "authenticated";
grant TRUNCATE on public."dog_consents" to "anon";
grant REFERENCES on public."dog_consents" to "anon";
grant TRIGGER on public."dog_consents" to "anon";
grant INSERT on public."dog_consents" to "service_role";
grant SELECT on public."dog_consents" to "service_role";
grant UPDATE on public."dog_consents" to "service_role";
grant DELETE on public."dog_consents" to "service_role";
grant TRUNCATE on public."dog_consents" to "service_role";
grant REFERENCES on public."dog_consents" to "service_role";
grant TRIGGER on public."dog_consents" to "service_role";
grant INSERT on public."dog_consents" to "authenticated";
grant SELECT on public."dog_consents" to "authenticated";
grant UPDATE on public."dog_consents" to "authenticated";
grant TRUNCATE on public."dog_notes" to "anon";
grant REFERENCES on public."dog_notes" to "anon";
grant TRIGGER on public."dog_notes" to "anon";
grant INSERT on public."dog_notes" to "service_role";
grant SELECT on public."dog_notes" to "service_role";
grant UPDATE on public."dog_notes" to "service_role";
grant DELETE on public."dog_notes" to "service_role";
grant TRUNCATE on public."dog_notes" to "service_role";
grant REFERENCES on public."dog_notes" to "service_role";
grant TRIGGER on public."dog_notes" to "service_role";
grant INSERT on public."dog_notes" to "authenticated";
grant SELECT on public."dog_notes" to "authenticated";
grant TRUNCATE on public."guideview_session_invitations" to "anon";
grant REFERENCES on public."guideview_session_invitations" to "anon";
grant TRIGGER on public."guideview_session_invitations" to "anon";
grant INSERT on public."guideview_session_invitations" to "service_role";
grant SELECT on public."guideview_session_invitations" to "service_role";
grant UPDATE on public."guideview_session_invitations" to "service_role";
grant DELETE on public."guideview_session_invitations" to "service_role";
grant TRUNCATE on public."guideview_session_invitations" to "service_role";
grant REFERENCES on public."guideview_session_invitations" to "service_role";
grant TRIGGER on public."guideview_session_invitations" to "service_role";
grant SELECT on public."guideview_session_invitations" to "authenticated";
grant UPDATE on public."guideview_session_invitations" to "authenticated";
grant TRUNCATE on public."guideview_media_routes" to "anon";
grant REFERENCES on public."guideview_media_routes" to "anon";
grant TRIGGER on public."guideview_media_routes" to "anon";
grant TRUNCATE on public."guideview_media_routes" to "authenticated";
grant REFERENCES on public."guideview_media_routes" to "authenticated";
grant TRIGGER on public."guideview_media_routes" to "authenticated";
grant INSERT on public."guideview_media_routes" to "service_role";
grant SELECT on public."guideview_media_routes" to "service_role";
grant UPDATE on public."guideview_media_routes" to "service_role";
grant DELETE on public."guideview_media_routes" to "service_role";
grant TRUNCATE on public."guideview_media_routes" to "service_role";
grant REFERENCES on public."guideview_media_routes" to "service_role";
grant TRIGGER on public."guideview_media_routes" to "service_role";
grant TRUNCATE on public."forms" to "anon";
grant REFERENCES on public."forms" to "anon";
grant TRIGGER on public."forms" to "anon";
grant TRUNCATE on public."forms" to "authenticated";
grant REFERENCES on public."forms" to "authenticated";
grant TRIGGER on public."forms" to "authenticated";
grant INSERT on public."forms" to "service_role";
grant SELECT on public."forms" to "service_role";
grant UPDATE on public."forms" to "service_role";
grant DELETE on public."forms" to "service_role";
grant TRUNCATE on public."forms" to "service_role";
grant REFERENCES on public."forms" to "service_role";
grant TRIGGER on public."forms" to "service_role";
grant TRUNCATE on public."form_questions" to "anon";
grant REFERENCES on public."form_questions" to "anon";
grant TRIGGER on public."form_questions" to "anon";
grant TRUNCATE on public."form_questions" to "authenticated";
grant REFERENCES on public."form_questions" to "authenticated";
grant TRIGGER on public."form_questions" to "authenticated";
grant INSERT on public."form_questions" to "service_role";
grant SELECT on public."form_questions" to "service_role";
grant UPDATE on public."form_questions" to "service_role";
grant DELETE on public."form_questions" to "service_role";
grant TRUNCATE on public."form_questions" to "service_role";
grant REFERENCES on public."form_questions" to "service_role";
grant TRIGGER on public."form_questions" to "service_role";
grant TRUNCATE on public."form_question_options" to "anon";
grant REFERENCES on public."form_question_options" to "anon";
grant TRIGGER on public."form_question_options" to "anon";
grant TRUNCATE on public."form_question_options" to "authenticated";
grant REFERENCES on public."form_question_options" to "authenticated";
grant TRIGGER on public."form_question_options" to "authenticated";
grant INSERT on public."form_question_options" to "service_role";
grant SELECT on public."form_question_options" to "service_role";
grant UPDATE on public."form_question_options" to "service_role";
grant DELETE on public."form_question_options" to "service_role";
grant TRUNCATE on public."form_question_options" to "service_role";
grant REFERENCES on public."form_question_options" to "service_role";
grant TRIGGER on public."form_question_options" to "service_role";
grant TRUNCATE on public."form_recipients" to "anon";
grant REFERENCES on public."form_recipients" to "anon";
grant TRIGGER on public."form_recipients" to "anon";
grant TRUNCATE on public."form_recipients" to "authenticated";
grant REFERENCES on public."form_recipients" to "authenticated";
grant TRIGGER on public."form_recipients" to "authenticated";
grant INSERT on public."form_recipients" to "service_role";
grant SELECT on public."form_recipients" to "service_role";
grant UPDATE on public."form_recipients" to "service_role";
grant DELETE on public."form_recipients" to "service_role";
grant TRUNCATE on public."form_recipients" to "service_role";
grant REFERENCES on public."form_recipients" to "service_role";
grant TRIGGER on public."form_recipients" to "service_role";
grant TRUNCATE on public."form_responses" to "anon";
grant REFERENCES on public."form_responses" to "anon";
grant TRIGGER on public."form_responses" to "anon";
grant TRUNCATE on public."form_responses" to "authenticated";
grant REFERENCES on public."form_responses" to "authenticated";
grant TRIGGER on public."form_responses" to "authenticated";
grant INSERT on public."form_responses" to "service_role";
grant SELECT on public."form_responses" to "service_role";
grant UPDATE on public."form_responses" to "service_role";
grant DELETE on public."form_responses" to "service_role";
grant TRUNCATE on public."form_responses" to "service_role";
grant REFERENCES on public."form_responses" to "service_role";
grant TRIGGER on public."form_responses" to "service_role";
grant TRUNCATE on public."form_answers" to "anon";
grant REFERENCES on public."form_answers" to "anon";
grant TRIGGER on public."form_answers" to "anon";
grant TRUNCATE on public."form_answers" to "authenticated";
grant REFERENCES on public."form_answers" to "authenticated";
grant TRIGGER on public."form_answers" to "authenticated";
grant INSERT on public."form_answers" to "service_role";
grant SELECT on public."form_answers" to "service_role";
grant UPDATE on public."form_answers" to "service_role";
grant DELETE on public."form_answers" to "service_role";
grant TRUNCATE on public."form_answers" to "service_role";
grant REFERENCES on public."form_answers" to "service_role";
grant TRIGGER on public."form_answers" to "service_role";