-- Qualification checks take shared locks to keep rules and standings consistent.
-- PostgREST runs STABLE RPCs in read-only transactions, which prohibit those locks.
alter function public.walk_up_entry_eligibility(uuid,uuid) volatile;
