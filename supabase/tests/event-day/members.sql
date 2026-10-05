create temporary table test_report (
  sequence integer generated always as identity,
  scenario text not null,
  detail jsonb not null
) on commit drop;

create function pg_temp.check_test(passed boolean, scenario text)
returns void language plpgsql as $$
begin
  if passed is distinct from true then raise exception 'TEST FAILED: %', scenario; end if;
  perform set_config('test.check_count',
    (coalesce(nullif(current_setting('test.check_count', true), ''), '0')::integer + 1)::text, true);
end;
$$;

create temporary table test_members (
  ordinal integer primary key,
  roper_id uuid not null,
  membership_id uuid not null,
  td_rank numeric not null,
  ba_classification_id uuid not null
) on commit drop;

do $$
declare
  fixture_producer_id uuid;
  manager_id uuid;
  td_division uuid;
  ba_division uuid;
  td_classes uuid[];
  ba_classes uuid[];
  prefix text;
  person_id uuid;
  membership_uuid uuid;
  td_class uuid;
  ba_class uuid;
  current_td numeric;
  member_no text;
  i integer;
begin
  select p.id, staff.user_id into strict fixture_producer_id, manager_id
  from public.producers p join public.producer_staff staff on staff.producer_id = p.id
  where p.slug = current_setting('test.producer_slug') and staff.role = 'owner' limit 1;
  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  perform set_config('test.producer_id', fixture_producer_id::text, true);
  select division_id into strict td_division from public.classifications
  where public.classifications.producer_id = fixture_producer_id and rank = 11.5 and is_active limit 1;
  select division_id into strict ba_division from public.roping_templates
  where public.roping_templates.producer_id = fixture_producer_id and competition_format = 'handicap' and is_active limit 1;
  select array_agg(id order by rank) into td_classes from public.classifications
  where public.classifications.producer_id = fixture_producer_id and division_id = td_division
    and eligibility_type = 'skill' and is_active;
  select array_agg(id order by rank, name) into ba_classes from public.classifications
  where public.classifications.producer_id = fixture_producer_id and division_id = ba_division
    and handicap_adjustment_seconds is not null and is_active;
  perform pg_temp.check_test(cardinality(td_classes) >= 2 and cardinality(ba_classes) >= 4,
    'Numbered and Open/A/B/C classifications are configured');
  prefix := case when current_setting('test.retain') = 'true' then 'TEST-V1-' else 'RUN-' || gen_random_uuid() || '-' end;
  perform set_config('test.fixture_prefix', prefix, true);

  for i in 1..96 loop
    member_no := prefix || lpad(i::text, 3, '0');
    select m.id, m.roper_id into membership_uuid, person_id from public.memberships m
    where m.producer_id = fixture_producer_id and m.member_number = member_no;
    td_class := td_classes[1 + ((i - 1) % cardinality(td_classes))];
    ba_class := ba_classes[1 + ((i - 1) % cardinality(ba_classes))];
    if membership_uuid is null then
      insert into public.ropers(first_name, last_name, email, birth_date, competition_gender)
      values (
        (case when i<=48 then array['Clay','Luke','Wade','Cole','Wyatt','Grant','Eli','Owen','Caleb','Reid','Travis','Brooks','Austin','Dylan','Levi','Garrett']
          else array['Emma','Avery','Paige','Riley','Abigail','Sadie','Morgan','Claire','Grace','Olivia','Harper','Brianna','Kelsey','Lauren','Madison','Tessa'] end)[1+((i-1)%16)],
        (array['Bennett','Carter','Hayes','Mitchell','Parker','Reed','Sullivan','Walker','Anderson','Campbell','Davis','Foster','Graham','Harris','Lawson','Turner','Collins','Edwards','Hughes','Reynolds','Spencer','Wallace','Watson','Wells'])[1+((i-1)/4)%24],
        lower(member_no) || '@example.com',
        case when i % 6 = 0 then '2016-01-01'::date when i % 6 = 1 then '1960-01-01'::date else '1995-01-01'::date end,
        case when i <= 48 then 'male' else 'female' end::public.competition_gender
      ) returning id into person_id;
      insert into public.memberships(producer_id, roper_id, member_number, status, joined_on)
      values(fixture_producer_id, person_id, member_no, 'active', '2026-01-01') returning id into membership_uuid;
      insert into public.membership_classification_history
        (producer_id, membership_id, division_id, classification_id, effective_on, reason, assigned_by)
      values (fixture_producer_id, membership_uuid, td_division, td_class, '2026-01-01', 'Automated test fixture', manager_id),
        (fixture_producer_id, membership_uuid, ba_division, ba_class, '2026-01-01', 'Automated test fixture', manager_id);
    end if;
    if current_setting('test.retain')='true' then
      update public.ropers set first_name=(case when i<=48 then array['Clay','Luke','Wade','Cole','Wyatt','Grant','Eli','Owen','Caleb','Reid','Travis','Brooks','Austin','Dylan','Levi','Garrett']
        else array['Emma','Avery','Paige','Riley','Abigail','Sadie','Morgan','Claire','Grace','Olivia','Harper','Brianna','Kelsey','Lauren','Madison','Tessa'] end)[1+((i-1)%16)],
        last_name=(array['Bennett','Carter','Hayes','Mitchell','Parker','Reed','Sullivan','Walker','Anderson','Campbell','Davis','Foster','Graham','Harris','Lawson','Turner','Collins','Edwards','Hughes','Reynolds','Spencer','Wallace','Watson','Wells'])[1+((i-1)/4)%24]
        where id=person_id and email=lower(member_no)||'@example.com' and auth_user_id is null;
    end if;
    select c.rank into current_td from public.membership_classification_history h join public.classifications c on c.id=h.classification_id
      where h.membership_id=membership_uuid and h.division_id=td_division and h.effective_on<='2026-11-07'
      order by h.effective_on desc,h.created_at desc limit 1;
    select h.classification_id into ba_class from public.membership_classification_history h
      where h.membership_id=membership_uuid and h.division_id=ba_division and h.effective_on<='2026-11-07'
      order by h.effective_on desc,h.created_at desc limit 1;
    insert into test_members values(i, person_id, membership_uuid,
      current_td, ba_class);
  end loop;
  insert into test_report(scenario, detail) values('Member pool',
    jsonb_build_object('members', 96, 'numberedClassifications', cardinality(td_classes),
      'handicapClassifications', cardinality(ba_classes), 'retained', current_setting('test.retain')::boolean));
end;
$$;
