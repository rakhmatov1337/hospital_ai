import { useTranslation } from 'react-i18next';
import { Card } from '../../ui';
import type { EscalationAnswer } from './api';

/**
 * The check-in answers VERBATIM — every question paired with the patient's exact
 * answer. Never summarised, never re-ordered, never hidden.
 */
export function AnswersPanel({ answers }: { answers: EscalationAnswer[] }) {
  const { t } = useTranslation('escalation');

  return (
    <Card>
      <h2 className="text-h2 font-semibold text-text">{t('answers.title')}</h2>
      <p className="mt-1 text-caption text-text-muted">{t('answers.subtitle')}</p>

      {answers.length === 0 ? (
        <p className="mt-4 text-body text-text-muted">{t('answers.empty')}</p>
      ) : (
        <dl className="mt-4 divide-y divide-border">
          {answers.map((a, i) => (
            <div
              key={`${a.questionRef}-${i}`}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <dt className="text-body text-text-muted sm:w-1/2">
                {t(`questions.${a.questionRef}`, { defaultValue: a.questionRef })}
              </dt>
              <dd className="text-body font-semibold text-text sm:w-1/2">
                {t(`answerValues.${a.answerValue}`, { defaultValue: a.answerValue })}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
