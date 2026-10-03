alter table public.disciplines
  add column male_classification_discipline_id uuid references public.disciplines(id) on delete restrict,
  add column male_minimum_classification_number numeric(6, 2)
    check (male_minimum_classification_number >= 0),
  add constraint discipline_male_classification_exception_valid check (
    (
      gender_policy = 'open'
      and male_classification_discipline_id is null
      and male_minimum_classification_number is null
    )
    or (
      gender_policy = 'women_only'
      and (
        (
          male_classification_discipline_id is null
          and male_minimum_classification_number is null
        )
        or (
          male_classification_discipline_id is not null
          and male_minimum_classification_number is not null
        )
      )
    )
  );

create function public.producer_male_exception_applies(
  target_discipline_id uuid,
  target_person_id uuid,
  target_membership_id uuid,
  eligibility_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  discipline_record public.disciplines%rowtype;
  person_record public.people%rowtype;
  contestant_age integer;
  age_matches boolean := false;
  classification_matches boolean := false;
begin
  select * into discipline_record
  from public.disciplines
  where id = target_discipline_id;

  select * into person_record
  from public.people
  where id = target_person_id;

  if person_record.birth_date is not null then
    contestant_age := extract(
      year from age(eligibility_date, person_record.birth_date)
    )::integer;
    age_matches := (
      discipline_record.male_youth_maximum_age is not null
      and contestant_age <= discipline_record.male_youth_maximum_age
    ) or (
      discipline_record.male_senior_minimum_age is not null
      and contestant_age >= discipline_record.male_senior_minimum_age
    );
  end if;

  if discipline_record.male_classification_discipline_id is not null
    and discipline_record.male_minimum_classification_number is not null
    and target_membership_id is not null then
    select exists (
      select 1
      from public.member_classifications assignment
      join public.classifications classification
        on classification.id = assignment.classification_id
      where assignment.membership_id = target_membership_id
        and assignment.discipline_id = discipline_record.male_classification_discipline_id
        and assignment.effective_on <= eligibility_date
        and (
          assignment.ended_on is null
          or assignment.ended_on >= eligibility_date
        )
        and classification.eligibility_type = 'skill'
        and classification.rank >= discipline_record.male_minimum_classification_number
    ) into classification_matches;
  end if;

  return age_matches or classification_matches;
end;
$$;

do $migration$
declare
  definition text;
  old_block text := $old$elsif discipline_record.gender_policy = 'women_only' then
    if contestant_record.competition_gender is null then
      eligibility_failure := 'Competition gender is required for this breakaway division';
    elsif contestant_record.competition_gender = 'male' then
      if division_record.male_eligibility_policy <> 'producer_default' then
        male_exception_applies := public.event_male_exception_applies(
          division_record.id, contestant_record.id, new.membership_id
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this roping''s male breakaway exception';
        end if;
      elsif discipline_record.male_youth_maximum_age is null
        and discipline_record.male_senior_minimum_age is null then
        eligibility_failure := 'This breakaway division is limited to female contestants';
      elsif contestant_record.birth_date is null then
        eligibility_failure := 'A birth date is required to verify the male breakaway exception';
      else
        contestant_age := extract(year from age(division_record.scheduled_date, contestant_record.birth_date))::integer;
        male_exception_applies := (
          discipline_record.male_youth_maximum_age is not null
          and contestant_age <= discipline_record.male_youth_maximum_age
        ) or (
          discipline_record.male_senior_minimum_age is not null
          and contestant_age >= discipline_record.male_senior_minimum_age
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this producer''s male breakaway age exception';
        end if;
      end if;
    end if;
  end if;$old$;
  new_block text := $new$elsif discipline_record.gender_policy = 'women_only' then
    if contestant_record.competition_gender is null then
      eligibility_failure := 'Competition gender is required for this breakaway division';
    elsif contestant_record.competition_gender = 'male' then
      if division_record.male_eligibility_policy <> 'producer_default' then
        male_exception_applies := public.event_male_exception_applies(
          division_record.id, contestant_record.id, new.membership_id
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this roping''s male breakaway exception';
        end if;
      elsif discipline_record.male_youth_maximum_age is null
        and discipline_record.male_senior_minimum_age is null
        and discipline_record.male_classification_discipline_id is null then
        eligibility_failure := 'This breakaway division is limited to female contestants';
      else
        male_exception_applies := public.producer_male_exception_applies(
          discipline_record.id,
          contestant_record.id,
          new.membership_id,
          division_record.scheduled_date
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this producer''s male breakaway exception';
        end if;
      end if;
    end if;
  end if;$new$;
begin
  select pg_get_functiondef(
    'public.enforce_entry_classification_eligibility()'::regprocedure
  ) into definition;
  if position(old_block in definition) = 0 then
    raise exception 'Unable to update the current entry eligibility function';
  end if;
  execute replace(definition, old_block, new_block);
end;
$migration$;

revoke all on function public.producer_male_exception_applies(
  uuid, uuid, uuid, date
) from public;
