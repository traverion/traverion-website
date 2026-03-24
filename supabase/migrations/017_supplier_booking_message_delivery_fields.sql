-- Delivery tracking fields for supplier booking messages.

alter table public.supplier_booking_messages
  add column if not exists delivery_status text
    check (delivery_status in ('queued', 'sent', 'failed') or delivery_status is null)
    default 'queued',
  add column if not exists provider_message_id text,
  add column if not exists error_message text;

create index if not exists supplier_booking_messages_delivery_idx
  on public.supplier_booking_messages(supplier_id, delivery_status, created_at desc);

