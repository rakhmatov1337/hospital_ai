import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Card, ConfirmDialog, Input } from '../../ui';
import { errorCodeOf } from '../../lib/api-client';
import { useUpdateClinic, type ClinicUpdatePayload, type ClinicView } from './api';

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
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {/* Clinic details — patient-facing */}
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-h2 font-semibold text-text">{t('settings:sections.details')}</h2>
          <p className="mt-1 text-caption text-text-muted">{t('settings:hints.patientFacing')}</p>
        </div>
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
      </Card>

      {/* Working hours */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-h2 font-semibold text-text">{t('settings:sections.hours')}</h2>
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
      </Card>

      {/* On-call contacts */}
      <Card className="flex flex-col gap-4">
        <h2 className="text-h2 font-semibold text-text">{t('settings:sections.contacts')}</h2>
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
      </Card>

      {/* Escalation timings */}
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-h2 font-semibold text-text">{t('settings:sections.escalation')}</h2>
          <p className="mt-1 text-caption text-text-muted">{t('settings:hints.escalation')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}
      {saved && !isDirty && <Banner tone="success">{t('settings:saved')}</Banner>}

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" size="lg" disabled={!isDirty || updateClinic.isPending || timingInvalid}>
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
