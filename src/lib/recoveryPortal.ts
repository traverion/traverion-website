import { fetchConsumerProfile } from '../data/supabase-consumer-profile';
import { fetchSupplierProfile } from '../data/supabase-supplier-profile';

/** After a recovery session exists, decide which portal shell to show. */
export async function resolvePasswordRecoveryPortal(userId: string): Promise<'partner' | 'traveler'> {
  const [supplierRow, consumerRow] = await Promise.all([
    fetchSupplierProfile(userId),
    fetchConsumerProfile(userId),
  ]);
  if (supplierRow && !consumerRow) return 'partner';
  if (supplierRow && consumerRow) return 'partner';
  return 'traveler';
}
