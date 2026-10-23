-- TEST readiness only. Live money still blocked without Edge STRIPE_CONNECT_TRANSFERS_ENABLED=test + sk_test_.
UPDATE public.commercial_runtime_config
SET value_int = 1,
    note = '1=TEST transfers allowed on Edge when STRIPE_CONNECT_TRANSFERS_ENABLED=test. Live never enabled by config alone.'
WHERE key = 'stripe_connect_transfers_enabled';

SELECT key, value_int, note
FROM public.commercial_runtime_config
WHERE key = 'stripe_connect_transfers_enabled';
