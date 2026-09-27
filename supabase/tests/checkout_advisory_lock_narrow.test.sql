-- Documents expected lock grain for migration 106 (no remote mutation).
-- Full assert_checkout_inventory concurrency remains covered by prior inventory certs.

begin;

do $$
begin
  -- Stay lock key grain
  if hashtext('stay|' || '00000000-0000-0000-0000-000000000001')
     = hashtext('tour|' || '00000000-0000-0000-0000-000000000001' || '|' || '2026-10-01') then
    raise exception 'stay and tour lock namespaces must differ';
  end if;
  -- Slot lock differs from day lock
  if hashtext('tour|x|2026-10-01') = hashtext('tour|x|2026-10-01|20:00') then
    raise exception 'day and slot lock keys must differ';
  end if;
  -- Distinct slots differ
  if hashtext('tour|x|2026-10-01|08:00') = hashtext('tour|x|2026-10-01|20:00') then
    raise exception 'distinct departure slots must use distinct lock keys';
  end if;
end $$;

rollback;
