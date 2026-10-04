import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mig = readFileSync(
  resolve(__dirname, '../../supabase/migrations/237_content_reports_and_review_hide.sql'),
  'utf8'
);
const modal = readFileSync(resolve(__dirname, '../components/ListingReviewsModal.tsx'), 'utf8');
const reviewsData = readFileSync(resolve(__dirname, '../data/supabase-reviews.ts'), 'utf8');
const adminEdge = readFileSync(
  resolve(__dirname, '../../supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const adminDash = readFileSync(resolve(__dirname, '../pages/AdminDashboard.tsx'), 'utf8');

describe('content reports + review hide (founder readiness)', () => {
  it('migration creates reports RPC and hides reviews from public SELECT', () => {
    expect(mig).toContain('create table if not exists public.content_reports');
    expect(mig).toContain('submit_content_report');
    expect(mig).toContain('hidden_at');
    expect(mig).toMatch(/reviews\.hidden_at is null/);
    expect(mig).toContain("check (target_type in ('review', 'listing', 'message', 'supplier'))");
  });

  it('traveler UI can report a review via RPC helper', () => {
    expect(reviewsData).toContain('submitReviewContentReport');
    expect(reviewsData).toContain("p_target_type: 'review'");
    expect(modal).toContain('Report');
    expect(modal).toContain('submitReviewContentReport');
    expect(modal).toContain('Sign in to report a review');
  });

  it('admin can list reports, resolve, and hide reviews', () => {
    expect(adminEdge).toContain("action === 'content_reports_list'");
    expect(adminEdge).toContain("action === 'resolve_content_report'");
    expect(adminEdge).toContain("action === 'hide_review'");
    expect(adminDash).toContain('AdminContentReportsPanel');
    expect(adminDash).toContain("'reports'");
  });
});
