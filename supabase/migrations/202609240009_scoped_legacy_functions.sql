begin;
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

  if public.is_system_admin() or exists(select 1 from public.library_folders f where f.id=target_folder and public.portal_club_admin(f.club_id)) then
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
          p.club_id=public.portal_current_club() and p.subject_type = 'app_role'
          and p.app_role = app_role_value
        )
        or (
          p.club_id=public.portal_current_club() and p.subject_type = 'role'
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
          p.club_id=public.portal_current_club() and p.subject_type = 'group'
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
create policy portal_library_folder_read_boundary on public.library_folders as restrictive for select to authenticated using(library_can(id,'read') or portal_club_admin(club_id));
create policy portal_library_folder_insert_boundary on public.library_folders as restrictive for insert to authenticated with check(portal_club_data_allowed(club_id));
create policy portal_library_folder_update_boundary on public.library_folders as restrictive for update to authenticated using(portal_club_data_allowed(club_id)) with check(portal_club_data_allowed(club_id));
create policy portal_library_folder_delete_boundary on public.library_folders as restrictive for delete to authenticated using(portal_club_data_allowed(club_id)) ;
create policy portal_library_permission_boundary on public.library_folder_permissions as restrictive for all to authenticated using(portal_club_data_allowed(club_id)) with check(portal_club_data_allowed(club_id));
CREATE OR REPLACE FUNCTION public.helper_rate_for(target_year integer, target_type text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select amount
    from public.helper_rates
    where club_id=public.portal_current_club() and year = target_year
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
    mileage_rate_snapshot = public.helper_entries.mileage_rate_snapshot;

  return new;
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
  where id = target_event_id and public.portal_club_data_allowed(club_id);

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


  if not exists(select 1 from public.events where id=target_event_id and public.portal_club_data_allowed(club_id)) then raise exception 'Ingen tilgang til arrangementet.' using errcode='42501';end if;
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
CREATE OR REPLACE FUNCTION public.admin_dashboard_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  role_value text;
  result jsonb;
begin
  role_value := public.current_app_role();

  if coalesce(role_value,'') not in ('admin','system_admin') then
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
            from public.portal_club_app_users a
            where a.club_id=public.portal_current_club() and a.active = true
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

        from public.portal_club_app_users a

        where a.club_id=public.portal_current_club() and a.active = true
          and a.must_change_password = true
      ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_helper_year_overview(target_year integer)
 RETURNS TABLE(person_id uuid, person_name text, honor numeric, mileage numeric, expenses numeric, total numeric, entry_count bigint)
 LANGUAGE sql
 STABLE SECURITY INVOKER
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

  from public.portal_club_contacts(public.portal_current_club()) p


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
commit;
