import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { modalOverlay, modalPanel } from '@/lib/motion';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    // Lock the page behind the dialog.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
          />
          <motion.div
            variants={modalPanel}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            className={cn(
              'surface relative flex max-h-[92dvh] w-full flex-col overflow-hidden',
              'rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-slate-950/20',
              widths[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base leading-tight font-semibold">{title}</h2>
                {description && <p className="text-secondary mt-1 text-[13px]">{description}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-muted -mt-1 -mr-1 rounded-lg p-1.5 transition-colors duration-150 hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-2 border-t bg-[color:var(--surface-sunken)] px-5 py-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant={tone} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-secondary text-sm leading-relaxed">{message}</p>
    </Modal>
  );
}
