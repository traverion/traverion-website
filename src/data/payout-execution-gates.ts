import { supabase } from '../lib/supabase';

/** Platform payout switches. A read only — this does not sync or change a connected account. */
export async function fetchPayoutExecutionGates(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('commercial_runtime_config')
    .select('key, value_int')
    .in('key', ['payout_execution_enabled', 'stripe_connect_transfers_enabled']);
  if (error) return false;
  const on = (key: string) => (data ?? []).some((row) => row.key === key && Number(row.value_int) === 1);
  return on('payout_execution_enabled') && on('stripe_connect_transfers_enabled');
}
