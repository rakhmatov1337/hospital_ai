import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner, Button, ConfirmDialog, Input } from '../../ui';
import { errorCodeOf } from '../../lib/api-client';
import { useUpdateClinic, type ClinicUpdatePayload, type ClinicView } from './api';

/** A settings section: title + description on the left, fields on the right. */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-8 gap-y-4 py-6 md:grid-cols-3">
      <div className="md:col-span-1">
        <h2 className="text-body font-semibold text-text">{title}</h2>
        {description && <p className="mt-1 text-caption text-text-muted">{description}</p>}
      </div>
      <div className="flex flex-col gap-3.5 md:col-span-2">{children}</div>
    </div>
  );
}

/** All clinic fields as strings for controlled inputs (minutes parsed on submit). */
interface ClinicFormState {
  name: string;
  phone: string;
  emergencyNumber: string;
  workingHours: string;
  workingDays: string;
  onDutyContact: string;
  backupContact: string;
  headContact: string;
  notifyMinutes: string;
  ackMinutes: string;
  breachMinutes: string;
}

/** Fields whose change is patient-facing + audit-logged (require confirmation). */
const SENSITIVE_FIELDS = ['name', 'phone', 'emergencyNumber'] as const;
type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

const NUMBER_FIELDS = ['notifyMinutes', 'ackMinutes', 'breachMinutes'] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

function toForm(clinic: ClinicView): ClinicFormState {
  return {
    name: clinic.name,
    phone: clinic.phone,
    emergencyNumber: clinic.emergencyNumber,
    workingHours: clinic.workingHours,
    workingDays: clinic.workingDays,
    onDutyContact: clinic.onDutyContact ?? '',
    backupContact: clinic.backupContact ?? '',
    headContact: clinic.headContact ?? '',
    notifyMinutes: String(clinic.notifyMinutes),
    ackMinutes: String(clinic.ackMinutes),
    breachMinutes: String(clinic.breachMinutes),
  };
}

/** The current, saved value of a form field as a string (for change detection). */
function original(clinic: ClinicView, key: keyof ClinicFormState): string {
  return toForm(clinic)[key];
}

export interface ClinicSettingsFormProps {
  clinic: ClinicView;
}

/** D7 — the clinic configuration form. Sensitive changes go through a confirm dialog. */
export function ClinicSettingsForm({ clinic }: ClinicSettingsFormProps) {
  const { t } = useTranslation(['settings', 'errors', 'common']);
  const updateClinic = useUpdateClinic();

  const [form, setForm] = useState<ClinicFormState>(() => toForm(clinic));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the saved clinic changes (after a successful save or refetch).
  useEffect(() => {
    setForm(toForm(clinic));
  }, [clinic]);

  const set = (key: keyof ClinicFormState) => (e: { target: { value: string } }) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setSaved(false);
  };

  /** Build the partial payload of only the fields that actually changed. */
  const payload = useMemo<ClinicUpdatePayload>(() => {
    const out: ClinicUpdatePayload = {};
    (Object.keys(form) as Array<keyof ClinicFormState>).forEach((key) => {
      const value = form[key];
      if (value === original(clinic, key)) return;
      if ((NUMBER_FIELDS as readonly string[]).includes(key)) {
        const n = Number(value);
        if (Number.isFinite(n)) out[key as NumberField] = n;
      } else {
        out[key as Exclude<keyof ClinicFormState, NumberField>] = value.trim();
      }
    });
    return out;
  }, [form, clinic]);

  const changedSensitive = useMemo<SensitiveField[]>(
    () => SENSITIVE_FIELDS.filter((f) => f in payload),
    [payload],
  );

  const isDirty = Object.keys(payload).length > 0;

  // P1-1 — the escalation ladder must never decrease: notify ≤ ack ≤ breach.
  // Guards the queue's tier routing against a save that would corrupt the ladder.
  const timingInvalid = useMemo<boolean>(() => {
    const notify = Number(form.notifyMinutes);
    const ack = Number(form.ackMinutes);
    const breach = Number(form.breachMinutes);
    if (![notify, ack, breach].every(Number.isFinite)) return false;
    return !(notify <= ack && ack <= breach);
  }, [form.notifyMinutes, form.ackMinutes, form.breachMinutes]);

  async function persist(): Promise<void> {
    setError(null);
    try {
      await updateClinic.mutateAsync(payload);
      setSaved(true);
      setConfirmOpen(false);
    } catch (err) {
      const code = errorCodeOf(err);
      setError(t(`errors:${code}`, { defaultValue: t('settings:error') }));
      setConfirmOpen(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!isDirty || updateClinic.isPending || timingInvalid) return;
    if (changedSensitive.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void persist();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col divide-y divide-border overflow-hidden rounded-input border border-border bg-card px-5 [&_input]:h-10 [&_input]:px-3 [&_input]:text-body sm:px-6"
      noValidate
    >
      {/* Clinic details — patient-facing */}
      <FormSection
        title={t('settings:sections.details')}
        description={t('settings:hints.patientFacing')}
      >
        <Input
          label={`${t('settings:fields.name')} · ${t('settings:hints.patientFacingTag')}`}
          value={form.name}
          onChange={set('name')}
        />
        <Input
          label={`${t('settings:fields.phone')} · ${t('settings:hints.patientFacingTag')}`}
          value={form.phone}
          onChange={set('phone')}
          inputMode="tel"
        />
        <Input
          label={`${t('settings:fields.emergencyNumber')} · ${t('settings:hints.patientFacingTag')}`}
          value={form.emergencyNumber}
          onChange={set('emergencyNumber')}
          inputMode="tel"
        />
      </FormSection>

      {/* Working hours */}
      <FormSection title={t('settings:sections.hours')}>
        <Input
          label={t('settings:fields.workingHours')}
          value={form.workingHours}
          onChange={set('workingHours')}
          hint={t('settings:hints.workingHours')}
        />
        <Input
          label={t('settings:fields.workingDays')}
          value={form.workingDays}
          onChange={set('workingDays')}
          hint={t('settings:hints.workingDays')}
        />
      </FormSection>

      {/* On-call contacts */}
      <FormSection title={t('settings:sections.contacts')}>
        <Input
          label={t('settings:fields.onDutyContact')}
          value={form.onDutyContact}
          onChange={set('onDutyContact')}
          inputMode="tel"
        />
        <Input
          label={t('settings:fields.backupContact')}
          value={form.backupContact}
          onChange={set('backupContact')}
          inputMode="tel"
        />
        <Input
          label={t('settings:fields.headContact')}
          value={form.headContact}
          onChange={set('headContact')}
          inputMode="tel"
        />
      </FormSection>

      {/* Escalation timings */}
      <FormSection
        title={t('settings:sections.escalation')}
        description={t('settings:hints.escalation')}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label={t('settings:fields.notifyMinutes')}
            type="number"
            min={0}
            max={1440}
            value={form.notifyMinutes}
            onChange={set('notifyMinutes')}
            aria-invalid={timingInvalid || undefined}
          />
          <Input
            label={t('settings:fields.ackMinutes')}
            type="number"
            min={0}
            max={1440}
            value={form.ackMinutes}
            onChange={set('ackMinutes')}
            aria-invalid={timingInvalid || undefined}
          />
          <Input
            label={t('settings:fields.breachMinutes')}
            type="number"
            min={0}
            max={1440}
            value={form.breachMinutes}
            onChange={set('breachMinutes')}
            aria-invalid={timingInvalid || undefined}
          />
        </div>
        {timingInvalid && (
          <p role="alert" className="text-caption text-destructive">
            {t('settings:timing.order')}
          </p>
        )}
      </FormSection>

      {(error || (saved && !isDirty)) && (
        <div className="py-4">
          {error && <Banner tone="danger">{error}</Banner>}
          {saved && !isDirty && <Banner tone="success">{t('settings:saved')}</Banner>}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 py-4">
        <Button type="submit" disabled={!isDirty || updateClinic.isPending || timingInvalid}>
          {updateClinic.isPending ? t('settings:actions.saving') : t('settings:actions.save')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('settings:confirm.title')}
        confirmLabel={t('settings:confirm.confirm')}
        cancelLabel={t('settings:confirm.cancel')}
        busy={updateClinic.isPending}
        onConfirm={() => void persist()}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>{t('settings:confirm.body')}</p>
        <p className="mt-3 font-semibold text-text">{t('settings:confirm.changes')}</p>
        <ul className="mt-1 flex flex-col gap-1">
          {changedSensitive.map((field) => (
            <li key={field} className="text-body text-text">
              <span className="font-semibold">{t(`settings:fields.${field}`)}:</span>{' '}
              <span className="text-text-muted">
                {original(clinic, field) || t('settings:confirm.empty')}
              </span>{' '}
              <span aria-hidden="true">{t('settings:confirm.arrow')}</span>{' '}
              <span>{(payload[field] as string) || t('settings:confirm.empty')}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </form>
  );
}
