import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { StaffRole, type StaffAccount } from '@hospital-ai/shared-types';
import { Banner, Button, ConfirmDialog, Input, Select, SelectItem, Spinner } from '../../ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  // Deactivating a colleague locks them out — confirm it, and surface toggle errors
  // in the section (the modal `error` above only covers add/edit).
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffAccount | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

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
    setToggleError(null);
    try {
      await updateStaff.mutateAsync({ id: account.id, payload: { active: !account.active } });
    } catch (err) {
      const code = errorCodeOf(err);
      setToggleError(t(`errors:${code}`, { defaultValue: t('settings:error') }));
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
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

      {toggleError && <Banner tone="danger">{toggleError}</Banner>}

      {staffQuery.isLoading ? (
        <Spinner label={t('common:loading')} />
      ) : staffQuery.isError ? (
        <Banner tone="danger">{t('settings:error')}</Banner>
      ) : (staffQuery.data?.length ?? 0) === 0 ? (
        <p className="text-body text-text-muted">{t('settings:staff.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <Table className="text-body">
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="px-4 py-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.name')}
                </TableHead>
                <TableHead className="px-4 py-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.email')}
                </TableHead>
                <TableHead className="px-4 py-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.role')}
                </TableHead>
                <TableHead className="px-4 py-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
                  {t('settings:staff.status')}
                </TableHead>
                {isLead && (
                  <TableHead className="px-4 py-3 text-right text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {t('settings:staff.actions')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffQuery.data?.map((account) => (
                <TableRow key={account.id} className="border-border">
                  <TableCell className="px-4 py-3 text-text">{account.name}</TableCell>
                  <TableCell className="px-4 py-3 text-text-muted">{account.email}</TableCell>
                  <TableCell className="px-4 py-3 text-text">{t(`settings:roles.${account.role}`)}</TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={
                        account.active
                          ? 'inline-flex items-center rounded-input border border-success bg-surface px-2.5 py-0.5 text-caption font-semibold text-success'
                          : 'inline-flex items-center rounded-input border border-border bg-background px-2.5 py-0.5 text-caption font-semibold text-text-muted'
                      }
                    >
                      {account.active ? t('settings:staff.active') : t('settings:staff.inactive')}
                    </span>
                  </TableCell>
                  {isLead && (
                    <TableCell className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(account)}>
                          {t('settings:actions.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            account.active
                              ? setConfirmDeactivate(account)
                              : void toggleActive(account)
                          }
                        >
                          {account.active
                            ? t('settings:actions.deactivate')
                            : t('settings:actions.activate')}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={modalOpen}
        onOpenChange={(next) => {
          if (!next) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-h1 font-bold text-text">
              {editing ? t('settings:staffForm.editTitle') : t('settings:staffForm.addTitle')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
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
              onValueChange={(v) => setForm((p) => ({ ...p, role: v as StaffRole }))}
            >
              <SelectItem value={StaffRole.staff}>{t('settings:roles.staff')}</SelectItem>
              <SelectItem value={StaffRole.clinical_lead}>
                {t('settings:roles.clinical_lead')}
              </SelectItem>
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

            <DialogFooter>
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDeactivate !== null}
        tone="danger"
        title={t('settings:staff.deactivateConfirm.title', {
          defaultValue: 'Deactivate {{name}}?',
          name: confirmDeactivate?.name ?? '',
        })}
        confirmLabel={t('settings:actions.deactivate')}
        busy={updateStaff.isPending}
        onCancel={() => setConfirmDeactivate(null)}
        onConfirm={() => {
          const account = confirmDeactivate;
          setConfirmDeactivate(null);
          if (account) void toggleActive(account);
        }}
      >
        {t('settings:staff.deactivateConfirm.body', {
          defaultValue: 'They will immediately lose access to the dashboard until reactivated.',
        })}
      </ConfirmDialog>
    </section>
  );
}
