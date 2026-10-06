create function public.guard_move_back_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h public.membership_classification_history%rowtype; state jsonb; target record; current_class record;
begin
  if new.status<>'open' or new.proposed_classification_id is null then return new; end if;
  perform 1 from public.memberships where id=new.membership_id for update;
  select * into h from public.membership_classification_history where membership_id=new.membership_id
    and producer_id=new.producer_id and division_id=new.division_id and ended_on is null;
  if not found or h.classification_id=new.proposed_classification_id then return new; end if;
  state:=private.classification_move_back_state(h.id);
  if (state->>'eligible')::boolean then return new; end if;
  select rank,eligibility_type into target from public.classifications where id=new.proposed_classification_id;
  select rank,eligibility_type into current_class from public.classifications where id=h.classification_id;
  if new.proposed_classification_id=(state->>'previousClassificationId')::uuid
    or (target.eligibility_type='skill' and current_class.eligibility_type='skill' and target.rank>current_class.rank and current_class.rank>0) then
    raise exception 'Move-back review requires % ropings after this move (% competed). Staff may approve a documented exception.',
      state->>'requiredRopings',state->>'completedRopings';
  end if;
  return new;
end;
$$;
create trigger classification_reviews_move_back_guard before insert or update on public.membership_classification_reviews
  for each row execute function public.guard_move_back_review();
revoke all on function public.guard_move_back_review() from public,anon,authenticated;
