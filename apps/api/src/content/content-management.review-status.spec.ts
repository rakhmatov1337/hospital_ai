import { ContentStatus } from '@hospital-ai/shared-types';
import { reviewStatusOf } from './content-management.service';

/**
 * Unit test for the pure review-status derivation used across the D8 surface:
 *  - a draft row is 'draft';
 *  - an approved-status placeholder is 'needs_review' (no real clinician sign-off);
 *  - an approved, non-placeholder row is 'approved' (real sign-off).
 */
describe('reviewStatusOf', () => {
  it('maps a draft row to draft', () => {
    expect(reviewStatusOf({ status: ContentStatus.draft, isPlaceholder: false })).toBe('draft');
    expect(reviewStatusOf({ status: ContentStatus.draft, isPlaceholder: true })).toBe('draft');
  });

  it('maps an approved placeholder to needs_review', () => {
    expect(reviewStatusOf({ status: ContentStatus.approved, isPlaceholder: true })).toBe(
      'needs_review',
    );
  });

  it('maps an approved non-placeholder to approved', () => {
    expect(reviewStatusOf({ status: ContentStatus.approved, isPlaceholder: false })).toBe(
      'approved',
    );
  });
});
