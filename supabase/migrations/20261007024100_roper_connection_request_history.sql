-- Producer names are readable here without opening the staff-only producer table.
create function public.my_membership_link_requests()
returns table(id uuid,status text,member_number text,producer_name text)
language sql stable security definer set search_path='' as $$
  select q.id,q.status,q.member_number,p.name from public.membership_link_requests q
  join public.producers p on p.id=q.producer_id where q.user_id=auth.uid() order by q.created_at desc,q.id;
$$;
revoke all on function public.my_membership_link_requests() from public,anon;
grant execute on function public.my_membership_link_requests() to authenticated;
