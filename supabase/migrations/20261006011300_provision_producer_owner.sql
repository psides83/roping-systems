-- Producer creation and its initial owner invitation succeed or fail together.
create function public.provision_producer(producer_name text, producer_slug text, owner_email text)
returns table(producer_id uuid, invitation_id uuid)
language plpgsql security definer set search_path='' as $$
declare created_producer uuid; created_invitation uuid;
begin
  if not public.is_platform_owner() then
    raise exception 'Only the platform owner can create producers.';
  end if;
  created_producer := public.create_producer_internal(producer_name,producer_slug);
  created_invitation := public.invite_producer_staff(created_producer,owner_email,'owner');
  return query select created_producer,created_invitation;
end;
$$;
revoke all on function public.provision_producer(text,text,text) from public,anon;
grant execute on function public.provision_producer(text,text,text) to authenticated;
