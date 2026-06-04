import { CarePlanItem } from './care-plan.types';

/**
 * Deterministic cesarean care-plan fallback (BE-07). The demo must never break if
 * all AI providers are down — AI-02 replaces this with a grounded, AI-generated plan
 * when available. Content is grounded in the cesarean KB (NHS + MedlinePlus).
 */
export function templateCarePlan(
  _surgeryType: string,
  _surgeryDate: Date,
): CarePlanItem[] {
  return [
    {
      type: 'RESTRICTION',
      title: 'No heavy lifting',
      description:
        'Do not lift anything heavier than your baby for the first 6–8 weeks.',
      dayOffset: 0,
      scheduleTime: null,
    },
    {
      type: 'MEDICATION',
      title: 'Pain relief',
      description:
        'Take paracetamol/ibuprofen as advised. Avoid aspirin and codeine while breastfeeding unless your doctor says otherwise.',
      dayOffset: 0,
      scheduleTime: '08:00',
    },
    {
      type: 'ACTIVITY',
      title: 'Gentle walking',
      description:
        'Take short daily walks to aid healing and reduce the risk of blood clots. Build up slowly.',
      dayOffset: 1,
      scheduleTime: null,
    },
    {
      type: 'CHECKUP',
      title: 'Daily wound check',
      description:
        'Clean and dry the incision daily with mild soap and water. Watch for increasing redness, swelling, or pus.',
      dayOffset: 2,
      scheduleTime: '09:00',
    },
    {
      type: 'DIET',
      title: 'Hydrate & eat well',
      description:
        'Drink plenty of fluids and eat a balanced diet to support healing and (if breastfeeding) milk supply.',
      dayOffset: 1,
      scheduleTime: null,
    },
    {
      type: 'CHECKUP',
      title: 'Stitch/staple removal',
      description:
        'Non-dissolvable stitches or staples are removed by a nurse around day 5–7.',
      dayOffset: 6,
      scheduleTime: null,
    },
    {
      type: 'RESTRICTION',
      title: 'No driving',
      description:
        'Avoid driving for at least 2 weeks, and never while taking opioid pain medication.',
      dayOffset: 0,
      scheduleTime: null,
    },
    {
      type: 'CHECKUP',
      title: 'Postnatal check',
      description: 'Attend the ~6-week postnatal review with your provider.',
      dayOffset: 42,
      scheduleTime: null,
    },
  ];
}
