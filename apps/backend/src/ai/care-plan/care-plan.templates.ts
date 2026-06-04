import { CarePlanResult } from './care-plan.types';

/**
 * Non-AI fallback care plan for appendectomy. Used only if every AI provider
 * fails — the demo must never show an empty plan. Mirrors standard post-op
 * appendectomy guidance from the knowledge base.
 */
export function appendectomyTemplate(): CarePlanResult {
  return {
    confidence: 0.5,
    reasoning:
      'Generated from the standard appendectomy recovery template (AI providers unavailable).',
    items: [
      {
        type: 'MEDICATION',
        title: 'Paracetamol 1g',
        description:
          'Take for pain relief as directed. Do not exceed the daily limit.',
        dosage: '1g',
        frequency: 'up to four times daily',
        scheduleTimes: ['08:00', '14:00', '20:00'],
        startDay: 0,
        durationDays: 7,
      },
      {
        type: 'MEDICATION',
        title: 'Ibuprofen 400mg',
        description:
          'Anti-inflammatory for pain. Always take with food to protect your stomach.',
        dosage: '400mg',
        frequency: 'twice daily',
        scheduleTimes: ['08:00', '20:00'],
        startDay: 0,
        durationDays: 5,
      },
      {
        type: 'EXERCISE',
        title: 'Short walks',
        description:
          'Walk a little, often, from day one to prevent blood clots and aid recovery.',
        frequency: 'several times a day',
        startDay: 0,
      },
      {
        type: 'DIET',
        title: 'Light diet then normal, stay hydrated',
        description:
          'Start with light, easily digested food and build back to normal over a few days. Drink water regularly and eat fibre to prevent constipation.',
        startDay: 0,
      },
      {
        type: 'RESTRICTION',
        title: 'No heavy lifting',
        description:
          'Avoid lifting heavy objects and strenuous activity for about 2 weeks (longer after open surgery), or as your surgeon advises.',
        startDay: 0,
        durationDays: 14,
      },
    ],
  };
}
