import { useTranslation } from 'react-i18next';
import { IconPhone } from '@tabler/icons-react';
import { Card } from '../../ui';
import type { DashboardLanguage } from '../../lib/i18n';
import { procedureLabel } from '../../lib/labels';
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
  const { t } = useTranslation(['escalation', 'patient-detail']);

  const facts: Array<{ label: string; value: string }> = [
    { label: t('patient.ageBand'), value: patient.ageBand },
    { label: t('patient.procedure'), value: procedureLabel(t, patient.procedureType) },
    { label: t('patient.discharge'), value: formatDate(patient.dischargeDate, lang) },
    { label: t('patient.recoveryDay'), value: t('patient.dayValue', { n: patient.recoveryDay }) },
    { label: t('patient.ref'), value: patient.patientRef },
  ];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h1 font-bold text-text break-words">{patient.name}</h2>
          <p className="text-caption text-text-muted">{patient.patientRef}</p>
        </div>
        <a
          href={`tel:${patient.phone.replace(/\s+/g, '')}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-input border border-primary bg-card px-4 py-2 text-body font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('patient.callAria', { phone: patient.phone })}
        >
          <IconPhone className="size-4" aria-hidden="true" />
          <span className="tabular-nums">{patient.phone}</span>
        </a>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-caption text-text-muted">{f.label}</dt>
            <dd className="text-body text-text [overflow-wrap:anywhere]">{f.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
