begin;
create table public.portal_gv_media_ack(session_id uuid not null references public.guideview_sessions on delete cascade,person_id uuid not null references public.portal_person_identities,participant_sid text not null,route_version text not null,primary key(session_id,person_id));
alter table public.portal_gv_media_ack enable row level security;
revoke all on public.portal_gv_media_ack from public,anon,authenticated;
grant select,insert,update,delete on public.portal_gv_media_ack to service_role;
commit;
