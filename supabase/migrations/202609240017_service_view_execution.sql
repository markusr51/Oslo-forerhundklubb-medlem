begin;
-- Views still check their functions' EXECUTE privileges for service requests.
-- service_role already manages these records, but needs these explicit grants.
grant execute on function public.current_person_id(),public.is_system_admin(),public.portal_club_admin(uuid),public.portal_member_directory(uuid),public.portal_current_club(),public.portal_service_request() to service_role;
grant select on public.portal_clubs,public.portal_club_memberships to service_role;
notify pgrst,'reload schema';
commit;
