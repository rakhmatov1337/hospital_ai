/**
 * Recovery-plan template definitions for the seed.
 *
 * Two procedures are seeded — `laparoscopic_appendectomy` and `open_hernia_repair`
 * — each a 30-day RecoveryPlan whose PlanItem rows come from the single shared
 * cadence in buildPlanItemTemplates() (../plans/task-generation.service.ts):
 *
 *   - medication: Paracetamol 500mg 3×/day (08:00/14:00/20:00) days 1–10;
 *                 Antibiotic 1×/day (09:00) days 1–7
 *   - wound_care: daily days 1–14
 *   - activity:   gentle movement days 1–3, then progressive walking days 4–30
 *   - education:  unlocks days 1/3/5/7/14/21 (procedure-specific content keys)
 *   - checkin:    daily days 1–14, then every 3rd day (15/18/21/24/27/30)
 *
 * The two procedures share the cadence; they differ only in the clinical education
 * content keys (`clinical.{procedure}.day_{n}`), which the content pack provides.
 */

export {
  buildPlanItemTemplates,
  type PlanItemTemplate,
} from '../plans/task-generation.service';

export interface PlanTemplateDef {
  procedureType: string;
  name: string;
  durationDays: number;
}

/** The two seeded recovery-plan templates. */
export const PLAN_TEMPLATES: PlanTemplateDef[] = [
  {
    procedureType: 'laparoscopic_appendectomy',
    name: 'Laparoscopic Appendectomy — 30-Day Recovery',
    durationDays: 30,
  },
  {
    procedureType: 'open_hernia_repair',
    name: 'Open Hernia Repair — 30-Day Recovery',
    durationDays: 30,
  },
];
