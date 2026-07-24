import { ERROR_CODES } from '@hospital-ai/shared-types';
import { AppError } from '../common/errors';

/**
 * Care-plan selection guard (SP3-A design §2).
 *
 * The patient programme is assembled by SELECTING approved content-library items,
 * never by composing text. Every plan item must reference the library by a
 * content KEY (e.g. `medication.paracetamol_500`), never carry a patient-visible
 * literal. This module makes that an enforced invariant at the point where plan
 * items are materialised (the seed/enrolment path), so a "compose" item — an item
 * with no `content_ref`, or whose `content_ref` is actually inline free text —
 * fails loud instead of silently reaching a patient.
 *
 * This is the code half of the Layer-1 architectural proof: care-plan = SELECT
 * from the signed library, never generate.
 */

/**
 * Shape of a content-library key: dot-namespaced, lowercase alnum + underscore
 * segments, at least two segments (e.g. `wound_care.daily`,
 * `clinical.laparoscopic_appendectomy.day_1`). Deliberately rejects anything with
 * whitespace, uppercase, or sentence punctuation — i.e. anything that looks like
 * patient-visible prose rather than a library reference.
 */
export const CONTENT_KEY_PATTERN =
  /^[a-z0-9]+(?:_[a-z0-9]+)*(?:\.[a-z0-9]+(?:_[a-z0-9]+)*)+$/;

/** A plan item, reduced to the only field the selection guard cares about. */
export interface SelectablePlanItem {
  /** Content-library key. Must resolve to an approved library entry — never a literal. */
  contentRef?: string;
}

/** True when `ref` is a well-formed content-library key (a selection, not prose). */
export function isContentKey(ref: string): boolean {
  return CONTENT_KEY_PATTERN.test(ref);
}

/**
 * Asserts that every plan item is a pure SELECTION from the content library:
 *   - it has a non-empty `content_ref`, and
 *   - that `content_ref` is a content-library KEY, not inline patient free text.
 *
 * Throws `AppError(VALIDATION_ERROR)` on the first offending item, naming the
 * reason and index so the seed/enrolment path fails loud. A no-op for a
 * well-formed plan (never mutates), so it is safe to call before persisting.
 */
export function assertSelectionOnly(items: SelectablePlanItem[]): void {
  items.forEach((item, index) => {
    const ref = item.contentRef;

    // 1) Missing / empty content_ref — nothing was selected from the library.
    if (typeof ref !== 'string' || ref.trim() === '') {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Plan item is not a library selection: missing content_ref. ' +
          'Care plans must SELECT from the approved content library, never compose.',
        { index, reason: 'missing_content_ref' },
      );
    }

    // 2) content_ref that is actually inline free text (contains whitespace, or
    //    otherwise does not match the content-library key shape). This is the
    //    "compose" failure the guard exists to catch.
    if (!isContentKey(ref)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Plan item carries inline free text instead of a content-library key. ' +
          'Care plans must SELECT from the approved content library, never compose.',
        { index, reason: 'inline_free_text', contentRef: ref },
      );
    }
  });
}
