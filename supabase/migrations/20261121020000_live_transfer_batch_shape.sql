-- Allow a live transfer batch row only as an explicit live-money record.
-- Test batches remain non-live. Inserting a row does not execute a transfer.
-- The executor still refuses live mode while LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED is false.

alter table public.supplier_transfer_batches
  drop constraint if exists supplier_transfer_batches_no_live_money;

alter table public.supplier_transfer_batches
  add constraint supplier_transfer_batches_no_live_money
  check (
    (environment = 'test' and live_money_enabled = false)
    or (environment = 'live' and live_money_enabled = true)
  );
