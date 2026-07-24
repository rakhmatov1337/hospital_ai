import { useTranslation } from 'react-i18next';
import { Card } from '../../ui';
import type { DashboardLanguage } from '../../lib/i18n';
import type { EscalationPatient } from './api';
import { formatDate } from './format';

/** Patient header: identity + procedure facts + click-to-call phone. */
export function PatientPanel({
  patient,
  lang,
}: {
  patient: EscalationPatient;
  lang: DashboardLanguage;
}) {
  const { t } = useTranslation('escalation');

  const facts: Array<{ label: string; value: string }> = [
    { label: t('patient.ageBand'), value: patient.ageBand },
    { label: t('patient.procedure'), value: patient.procedureType },
    { label: t('patient.discharge'), value: formatDate(patient.dischargeDate, lang) },
    { label: t('patient.recoveryDay'), value: t('patient.dayValue', { n: patient.recoveryDay }) },
    { label: t('patient.ref'), value: patient.patientRef },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h1 font-bold text-text">{patient.name}</h2>
          <p className="text-caption text-text-muted">{patient.patientRef}</p>
        </div>
        <a
          href={`tel:${patient.phone.replace(/\s+/g, '')}`}
          className="inline-flex items-center gap-2 rounded-input border border-primary bg-surface px-4 py-2 text-button font-semibold text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('patient.callAria', { phone: patient.phone })}
        >
          <span aria-hidden="true">☎</span>
          <span>{patient.phone}</span>
        </a>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-caption text-text-muted">{f.label}</dt>
            <dd className="text-body text-text">{f.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
