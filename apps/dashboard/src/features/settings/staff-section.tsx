import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { StaffRole, type StaffAccount } from '@hospital-ai/shared-types';
import { Banner, Button, Card, Input, Select, Spinner } from '../../ui';
import { errorCodeOf } from '../../lib/api-client';
import { useAuth } from '../../lib/auth';
import {
  useCreateStaff,
  useStaff,
  useUpdateStaff,
  type CreateStaffPayload,
  type UpdateStaffPayload,
} from './api';

/** Local form state for the add/edit modal. */
interface StaffFormState {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
}

const EMPTY_FORM: StaffFormState = {
  name: '',
  email: '',
  password: '',
  role: StaffRole.staff,
};

/** D7 — staff account list + add/edit (clinical_lead only, enforced server-side). */
export function StaffSection() {
  const { t } = useTranslation(['settings', 'errors', 'common']);
  const { role } = useAuth();
  const isLead = role === StaffRole.clinical_lead;

  const staffQuery = useStaff();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();

  const [editing, setEditing] = useState<StaffAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const modalOpen = creating || editing !== null;
  const busy = createStaff.isPending || updateStaff.isPending;

  useEffect(() => {
    if (creating) {
      setForm(EMPTY_FORM);
    } else if (editing) {
      setForm({ name: editing.name, email: editing.email, password: '', role: editing.role });
    }
    setError(null);
  }, [creating, editing]);

  function closeModal(): void {
    setCreating(false);
    setEditing(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setError(null);
    try {
      if (editing) {
        const payload: UpdateStaffPayload = { name: form.name.trim(), role: form.role };
        if (form.password) payload.password = form.password;
        await updateStaff.mutateAsync({ id: editing.id, payload });
      } else {
        const payload: CreateStaffPayload = {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        };
        await createStaff.mutateAsync(payload);
      }
      closeModal();
    } catch (err) {
      const code = errorCodeOf(err);
      setError(t(`errors:${code}`, { defaultValue: t('settings:error') }));
    }
  }

  async function toggleActive(account: StaffAccount): Promise<void> {
    try {
      await updateStaff.mutateAsync({ id: account.id, payload: { active: !account.active } });
    } catch {
      /* surfaced by the query state on the next render; row stays as-is */
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-h2 font-semibold text-text">{t('settings:sections.staff')}</h2>
        {isLead && (
          <Button size="sm" onClick={() => setCreating(true)}>
            {t('settings:actions.addStaff')}
          </Button>
        )}
      </div>

      {!isLead && (
        <Banner tone="info">{t('settings:staff.leadOnly')}</Banner>
      )}

      {staffQuery.isLoading ? (
        <Spinner label={t('common:loading')} />
      ) : staffQuery.isError ? (
        <Banner tone="danger">{t('settings:error')}</Banner>
      ) : (staffQuery.data?.length ?? 0) === 0 ? (
        <p className="text-body text-text-muted">{t('settings:staff.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.name')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.email')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.role')}
                </th>
                <th scope="col" className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.status')}
                </th>
                {isLead && (
                  <th scope="col" className="px-4 py-3 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {t('settings:staff.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {staffQuery.data?.map((account) => (
                <tr key={account.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-text">{account.name}</td>
                  <td className="px-4 py-3 text-text-muted">{account.email}</td>
                  <td className="px-4 py-3 text-text">{t(`settings:roles.${account.role}`)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        account.active
                          ? 'inline-flex items-center rounded-input border border-success bg-surface px-2.5 py-0.5 text-caption font-semibold text-success'
                          : 'inline-flex items-center rounded-input border border-border bg-background px-2.5 py-0.5 text-caption font-semibold text-text-muted'
                      }
                    >
                      {account.active ? t('settings:staff.active') : t('settings:staff.inactive')}
                    </span>
                  </td>
                  {isLead && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(account)}>
                          {t('settings:actions.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void toggleActive(account)}
                        >
                          {account.active
                            ? t('settings:actions.deactivate')
                            : t('settings:actions.activate')}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4"
          onClick={closeModal}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label={editing ? t('settings:staffForm.editTitle') : t('settings:staffForm.addTitle')}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onSubmit(e)}
            className="flex w-full max-w-md flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-card"
            noValidate
          >
            <h3 className="text-h1 font-bold text-text">
              {editing ? t('settings:staffForm.editTitle') : t('settings:staffForm.addTitle')}
            </h3>

            <Input
              label={t('settings:staff.name')}
              value={form.name}
              required
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
            <Input
              label={t('settings:staff.email')}
              type="email"
              value={form.email}
              required={!editing}
              disabled={editing !== null}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
            <Select
              label={t('settings:staff.role')}
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as StaffRole }))}
            >
              <option value={StaffRole.staff}>{t('settings:roles.staff')}</option>
              <option value={StaffRole.clinical_lead}>{t('settings:roles.clinical_lead')}</option>
            </Select>
            <Input
              label={t('settings:staffForm.password')}
              type="password"
              autoComplete="new-password"
              value={form.password}
              required={!editing}
              hint={editing ? t('settings:staffForm.passwordEditHint') : t('settings:staffForm.passwordHint')}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />

            {error && <Banner tone="danger">{error}</Banner>}

            <div className="mt-2 flex justify-end gap-3">
              <Button variant="secondary" onClick={closeModal} disabled={busy}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? t('settings:staffForm.saving')
                  : editing
                    ? t('settings:staffForm.update')
                    : t('settings:staffForm.create')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
