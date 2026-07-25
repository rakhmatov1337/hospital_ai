import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Language } from '@hospital-ai/shared-types';
import { Button, Card, Input, Select, SelectItem } from '../../ui';
import { errorCodeOf } from '../../lib/api-client';
import { formatDate } from './format';
import {
  AGE_BANDS,
  LANGUAGE_OPTIONS,
  PROCEDURE_OPTIONS,
  PROCEDURE_TEMPLATES,
  useEnrolPatient,
  type EnrolmentResultView,
} from './api';

/** Consent version captured at enrolment; the patient re-consents in-app before activation. */
const DEFAULT_CONSENT_VERSION = 'v1.0';

/** Local-part (9 digits) of an Uzbek mobile; combined with the fixed +998 prefix. */
const LOCAL_PHONE = /^\d{9}$/;

interface FormState {
  name: string;
  phoneLocal: string;
  ageBand: string;
  procedureType: string;
  planTemplateId: string;
  dischargeDate: string;
  language: Language;
}

const EMPTY: FormState = {
  name: '',
  phoneLocal: '',
  ageBand: AGE_BANDS[1],
  procedureType: PROCEDURE_OPTIONS[0],
  planTemplateId: PROCEDURE_TEMPLATES[PROCEDURE_OPTIONS[0]][0].id,
  dischargeDate: '',
  language: Language.UZ,
};

/** D5 — Patient enrolment (create). On save → shows the generated 6-char code, printable. */
export function PatientCreatePage() {
  const { t, i18n } = useTranslation(['patient-detail', 'common', 'errors']);
  const lang = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const enrol = useEnrolPatient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [result, setResult] = useState<EnrolmentResultView | null>(null);

  const templates = PROCEDURE_TEMPLATES[form.procedureType] ?? [];

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('patient-detail:create.errors.nameRequired')),
        phoneLocal: z
          .string()
          .trim()
          .regex(LOCAL_PHONE, t('patient-detail:create.errors.phoneInvalid')),
        ageBand: z.string().min(1),
        procedureType: z.string().min(1),
        planTemplateId: z.string().min(1),
        dischargeDate: z.string().min(1, t('patient-detail:create.errors.dischargeRequired')),
        language: z.nativeEnum(Language),
      }),
    [t],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Keep the template selection valid when the procedure changes.
      if (key === 'procedureType') {
        const opts = PROCEDURE_TEMPLATES[value as string] ?? [];
        next.planTemplateId = opts[0]?.id ?? '';
      }
      return next;
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    enrol.mutate(
      {
        name: form.name.trim(),
        phone: `+998${form.phoneLocal.trim()}`,
        ageBand: form.ageBand,
        procedureType: form.procedureType,
        dischargeDate: form.dischargeDate,
        language: form.language,
        consentVersion: DEFAULT_CONSENT_VERSION,
        consentTextSnapshot: t('patient-detail:create.consentSnapshot', {
          version: DEFAULT_CONSENT_VERSION,
        }),
      },
      { onSuccess: (data) => setResult(data) },
    );
  }

  if (result) {
    return <EnrolmentSuccess result={result} lang={lang} onDone={() => navigate('/patients')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          to="/patients"
          className="inline-flex w-fit items-center gap-1 text-body font-semibold text-primary hover:underline"
        >
          <span aria-hidden="true">←</span>
          {t('patient-detail:backToList')}
        </Link>
        <h1 className="text-display font-bold text-text">{t('patient-detail:create.title')}</h1>
        <p className="text-body text-text-muted">{t('patient-detail:create.subtitle')}</p>
      </div>

      <Card className="p-6">
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Input
            label={t('patient-detail:fields.name')}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            error={fieldErrors.name}
            autoFocus
            required
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="phone-local" className="text-caption font-semibold text-text">
              {t('patient-detail:fields.phone')}
            </label>
            <div className="flex items-stretch gap-2">
              <span className="inline-flex h-input items-center rounded-input border border-border bg-background px-4 text-body font-semibold text-text-muted">
                +998
              </span>
              <Input
                id="phone-local"
                className="flex-1"
                inputMode="numeric"
                placeholder={t('patient-detail:create.phonePlaceholder')}
                value={form.phoneLocal}
                onChange={(e) => update('phoneLocal', e.target.value.replace(/\D/g, '').slice(0, 9))}
                error={fieldErrors.phoneLocal}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t('patient-detail:fields.ageBand')}
              value={form.ageBand}
              onValueChange={(v) => update('ageBand', v)}
            >
              {AGE_BANDS.map((band) => (
                <SelectItem key={band} value={band}>
                  {band}
                </SelectItem>
              ))}
            </Select>

            <Select
              label={t('patient-detail:fields.language')}
              value={form.language}
              onValueChange={(v) => update('language', v as Language)}
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <SelectItem key={l} value={l}>
                  {t(`patient-detail:languages.${l}`, { defaultValue: l })}
                </SelectItem>
              ))}
            </Select>
          </div>

          <Select
            label={t('patient-detail:fields.procedureType')}
            value={form.procedureType}
            onValueChange={(v) => update('procedureType', v)}
          >
            {PROCEDURE_OPTIONS.map((proc) => (
              <SelectItem key={proc} value={proc}>
                {t(`patient-detail:procedures.${proc}`, { defaultValue: proc })}
              </SelectItem>
            ))}
          </Select>

          <Select
            label={t('patient-detail:fields.planTemplate')}
            hint={t('patient-detail:create.planTemplateHint')}
            value={form.planTemplateId}
            onValueChange={(v) => update('planTemplateId', v)}
          >
            {templates.map((tpl) => (
              <SelectItem key={tpl.id} value={tpl.id}>
                {t(`patient-detail:${tpl.labelKey}`, { defaultValue: tpl.id })}
              </SelectItem>
            ))}
          </Select>

          <Input
            label={t('patient-detail:fields.dischargeDate')}
            type="date"
            value={form.dischargeDate}
            onChange={(e) => update('dischargeDate', e.target.value)}
            error={fieldErrors.dischargeDate}
            required
          />

          {enrol.isError && (
            <p role="alert" className="text-body text-tier-emergency">
              {t(`errors:${errorCodeOf(enrol.error)}`, { defaultValue: t('errors:default') })}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => navigate('/patients')}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={enrol.isPending}>
              {enrol.isPending
                ? t('patient-detail:create.enrolling')
                : t('patient-detail:create.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Post-enrolment: the generated code shown LARGE + printable (spec §4). */
function EnrolmentSuccess({
  result,
  lang,
  onDone,
}: {
  result: EnrolmentResultView;
  lang: string;
  onDone: () => void;
}) {
  const { t } = useTranslation('patient-detail');
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-bold text-text">{t('create.successTitle')}</h1>
        <p className="text-body text-text-muted">
          {t('create.successSubtitle', { name: result.patient.name })}
        </p>
      </div>

      {/* The printable enrolment-code card. */}
      <Card className="flex flex-col items-center gap-3 p-8 text-center print:border-2">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          {t('create.codeLabel')}
        </p>
        <p className="font-mono text-[64px] font-bold leading-none tracking-[0.25em] text-primary">
          {result.enrolmentCode}
        </p>
        <p className="text-caption text-text-muted">
          {t('create.codeExpires', { date: formatDate(result.codeExpiresAt, lang) })}
        </p>
        <p className="max-w-md text-body text-text-muted">{t('create.codeInstructions')}</p>
      </Card>

      <div className="flex flex-col gap-2 text-caption text-text-muted print:hidden">
        <span>{t('create.tasksGenerated', { count: result.tasksGenerated })}</span>
        <span>{t('create.patientRef', { ref: result.patient.patientRef })}</span>
      </div>

      <div className="flex justify-end gap-3 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          {t('create.print')}
        </Button>
        <Button onClick={onDone}>{t('create.done')}</Button>
      </div>
    </div>
  );
}
