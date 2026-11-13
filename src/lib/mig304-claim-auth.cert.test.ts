/**
 * Migration 304: claim accept must not trust a caller-supplied actor id,
 * and commercial helpers stay off the anon API.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const mig = readFileSync(
  resolve(root, 'supabase/migrations/304_revoke_commercial_claim_anon_execute.sql'),
  'utf8'
);
const edge = readFileSync(
  resolve(root, 'supabase/functions/stay-booking-request-action/index.ts'),
  'utf8'
);

describe('mig 304 claim authorization', () => {
  it('binds accept to the JWT user unless the caller is service_role', () => {
    expect(mig).toContain('v_jwt_user uuid := auth.uid()');
    expect(mig).toContain("v_jwt_role = 'service_role'");
    expect(mig).toContain('p_actor_id is distinct from v_jwt_user');
    expect(mig).toContain('approval_decided_by = v_actor');
    expect(mig).not.toMatch(/approval_decided_by = p_actor_id/);
  });

  it('revokes anon and authenticated execute on claim and freeze', () => {
    expect(mig).toMatch(
      /revoke all on function public\.claim_stay_booking_request_accept\(uuid, uuid\) from anon, authenticated/
    );
    expect(mig).toMatch(
      /grant execute on function public\.claim_stay_booking_request_accept\(uuid, uuid\) to service_role/
    );
    expect(mig).toMatch(
      /revoke all on function public\.freeze_booking_commercial_terms\(uuid\) from anon, authenticated/
    );
    expect(mig).toMatch(
      /revoke all on function public\.supplier_active_commercial_terms\(uuid, timestamptz\) from anon/
    );
    expect(mig).toMatch(
      /grant execute on function public\.supplier_active_commercial_terms\(uuid, timestamptz\) to authenticated, service_role/
    );
  });

  it('edge accept passes the verified user id, not a body actor', () => {
    expect(edge).toContain('auth.getUser()');
    expect(edge).toContain('p_actor_id: user.id');
    expect(edge).not.toMatch(/body\.actorId|body\.actor_id|p_actor_id:\s*body/);
  });
});
