import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { invalidatePlacements } from '@/lib/invalidate';

const COPY = {
  overtime: { noun: 'overtime request', done: 'Overtime', placeholder: "e.g. Overtime wasn't pre-approved for this sprint." },
  invoice: { noun: 'invoice', done: 'Invoice', placeholder: 'e.g. Hours exceed the approved allocation — please revise.' },
  assignment: { noun: 'assignment request', done: 'Assignment', placeholder: 'e.g. SKYIQ has no headroom this sprint — try after the UAT freeze.' },
  leave: { noun: 'leave request', done: 'Leave', placeholder: "e.g. Clashes with the UAT window — could you shift it a week?" },
} as const;

/**
 * Inline approve/reject used everywhere a decision is made (dashboard, OT queue,
 * invoice queue, assignment queue). Approving is one tap; rejecting asks for a
 * reason, because the person on the other end gets that note in their
 * notification.
 */
export function ApprovalActions({
  kind,
  id,
  size = 'sm',
  onDone,
}: {
  kind: 'overtime' | 'invoice' | 'assignment' | 'leave';
  id: string;
  size?: 'sm' | 'md';
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  const copy = COPY[kind];
  const endpoint =
    kind === 'overtime'
      ? `/attendance/overtime/${id}/decision`
      : kind === 'invoice'
        ? `/invoices/${id}/decision`
        : kind === 'leave'
          ? `/leave/${id}/decision`
          : `/assignment-requests/${id}/decision`;

  const decide = useMutation({
    mutationFn: (payload: { status: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api.post(endpoint, payload),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['overtime'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['ot-pending-count'] });
      // Approving an assignment *creates* the placement, so everything a
      // placement touches has to be refreshed — not just this queue.
      invalidatePlacements(qc);
      setRejecting(false);
      setNote('');
      toast.success(`${copy.done} ${vars.status === 'APPROVED' ? 'approved' : 'rejected'}`);
      onDone?.();
    },
    onError: toastError,
  });

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size={size}
          variant="success"
          loading={decide.isPending && decide.variables?.status === 'APPROVED'}
          onClick={() => decide.mutate({ status: 'APPROVED' })}
        >
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button size={size} variant="ghost" onClick={() => setRejecting(true)}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
      </div>

      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject this ${copy.noun}?`}
        description="Your note is sent to them, so say what needs to change."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={decide.isPending}
              onClick={() => decide.mutate({ status: 'REJECTED', note: note || undefined })}
            >
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="Optional, but it saves a round trip.">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.placeholder}
            autoFocus
          />
        </Field>
      </Modal>
    </>
  );
}
