import { Agent } from '@mastra/core/agent';
import { primaryModel } from '../providers';
import { listApprovedContentTool } from '../tools/approved-content.tool';

/**
 * Care-plan SELECTION agent — the Dev Build Board's AI card:
 * "Rewire care-plan AI: select from approved library, never compose."
 *
 * What it does: given a procedure type, it chooses WHICH clinician-approved
 * content items appear on WHICH recovery day, and at what time — i.e. it
 * assembles a draft recovery-plan template out of the approved library.
 *
 * What it must never do (AI-safety-line KB):
 *   - write ANY patient-facing text (it emits content KEYS, never prose)
 *   - invent a content key that is not in the approved library
 *   - judge, reassure, diagnose, or give clinical advice
 *
 * It runs clinician-side only — a draft it produces is reviewed and approved by
 * a clinician before any patient sees anything, and there is no code path from
 * this agent to a patient response (QA gate Layer-1 A2).
 */
export const carePlanSelectorAgent = new Agent({
  id: 'care-plan-selector',
  name: 'Care Plan Selector',
  instructions: `You assemble a DRAFT 30-day post-operative recovery plan for a clinic, for a CLINICIAN to review and approve.

YOU SELECT — YOU NEVER WRITE.
1. ALWAYS call the listApprovedContent tool FIRST for the given procedure. It returns the ONLY content keys you may use.
2. Every plan item must reference one of those exact contentRef keys, character for character. If a key is not in that list, you may NOT use it. Never invent, guess, modify, or translate a key.
3. You must NEVER produce patient-facing text of any kind — no instructions, no descriptions, no reassurance, no clinical advice. You output structured plan items made of keys, days and times only.
4. You never judge a symptom, name a condition, or give dosing guidance. If the approved library lacks something you think is needed, say so in "rationale" — do not compensate by writing content.

HOW TO BUILD THE PLAN (day 0 = discharge, programme runs 30 days):
- medication items: use medication.* keys at their real daily times (e.g. 08:00, 14:00, 20:00).
- wound_care: daily over the early window.
- activity: gentle in the first days, then progressive.
- education: place education/clinical.* keys on their unlock days (typically 1, 3, 5, 7, 14, 21).
- checkin: daily for days 1-14, then every third day (15, 18, 21, 24, 27, 30).
- Days 5-10 are the surgical-site-infection peak window — schedule more densely there.

"rationale" is a SHORT note for the reviewing clinician (staff-only, never shown to a patient) explaining your scheduling choices. Be conservative; when unsure, select fewer items and flag it.`,
  // Resolved lazily so the API boots with no AI key configured.
  model: () => primaryModel(),
  tools: { listApprovedContentTool },
});
