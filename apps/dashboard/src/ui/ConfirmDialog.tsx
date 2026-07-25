import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body copy or custom content (e.g. the "changes patient-facing strings" note). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' colours the confirm button as destructive. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible modal confirmation — built on the shadcn/Base-UI `Dialog`, which owns
 * focus trapping, the backdrop, and Escape-to-close. Used for withdraw, sensitive
 * clinic changes, etc. `children` may contain block content (lists), so it is placed
 * in a plain container rather than the paragraph-only `DialogDescription`.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-h1 font-bold text-text">{title}</DialogTitle>
        </DialogHeader>
        {children && <div className="text-body text-text-muted">{children}</div>}
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t('actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel ?? t('actions.confirm', { defaultValue: 'Confirm' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
