import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ReceiptText, Plus, Trash2, Send, Pencil, X, Lock, History } from 'lucide-react';
import { toast } from 'sonner';
import { api, extractMessage, toastError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, TableSkeleton } from '@/components/ui/States';
import { ApprovalActions } from '@/features/ApprovalActions';
import { fmtDate, fmtDateTime, fmtMoney, fmtMoneyMulti, ROLE_LABEL, ROLE_SHORT, toDateInput } from '@/lib/format';
import { listVariants } from '@/lib/motion';
import { cn } from '@/lib/cn';
import type { Currency, Invoice, InvoiceStatus, Payee } from '@/lib/types';

export default function Invoices() {
  const { user, canManage } = useAuth();
  const qc = useQueryClient();
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);

  // Only an Admin sees other people's invoices or decides them. A PM raises and
  // submits their own, exactly like a resource.
  const canApprove = user?.canApproveInvoices === true;
  const canRaiseForOthers = user?.canRaiseForOthers === true;
  const isSelfView = !canApprove;
  // Locked only for someone who can neither bill, approve, nor bill for others —
  // i.e. an external resource. An Admin can't self-bill but still belongs here.
  const locked = !user?.canInvoice && !canApprove && !canRaiseForOthers;

  const params = clean({
    page: state.page, pageSize: 25, search,
    status: state.status, currency: state.currency, from: state.from, to: state.to,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', params],
    queryFn: async () => (await api.get<Paginated<Invoice>>('/invoices', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
    enabled: !locked,
  });

  const { data: summary } = useQuery({
    queryKey: ['invoice-summary'],
    queryFn: async () => (await api.get('/invoices/summary')).data as {
      byStatus: Record<InvoiceStatus, { count: number; totals: Record<Currency, number> }>;
      total: number; totalsByCurrency: Record<Currency, number>;
    },
    enabled: !locked,
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/submit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Invoice submitted', { description: 'Your manager has been notified.' });
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-summary'] });
      setDeleting(null);
      toast.success('Invoice deleted');
    },
    onError: (e) => { toastError(e); setDeleting(null); },
  });

  if (locked) {
    return (
      <>
        <PageHeader title={isSelfView ? 'My invoices' : 'Invoices'} />
        <Card>
          <EmptyState
            icon={Lock}
            title="Invoicing isn't part of your account"
            description={`Invoicing in PeopleFlow is for internal Steel Horizon staff. As a resource from ${user?.company ?? 'a service provider'}, your billing runs through your own company.`}
          />
        </Card>
      </>
    );
  }

  const activeCount = ['status', 'currency', 'from', 'to'].filter((k) => state[k]).length;

  return (
    <>
      <PageHeader
        title={isSelfView ? 'My invoices' : 'Invoices'}
        description={
          isSelfView
            ? 'Save a draft, then submit it to an Admin for approval.'
            : 'Every submitted invoice awaiting your decision. Administrators don\'t bill for themselves, but can raise an invoice on someone else\'s behalf.'
        }
        actions={
          user?.canInvoice || canRaiseForOthers ? (
            <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4" />
              {user?.canInvoice ? 'New invoice' : 'Raise invoice for someone'}
            </Button>
          ) : undefined
        }
      />

      <motion.div variants={listVariants} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const).map((s) => (
          <StatCard
            key={s}
            label={s.charAt(0) + s.slice(1).toLowerCase()}
            value={summary?.byStatus[s].count ?? 0}
            sub={fmtMoneyMulti(summary?.byStatus[s].totals)}
            tone={s === 'SUBMITTED' ? 'amber' : s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : 'neutral'}
            onClick={() => set({ status: state.status === s ? undefined : s })}
          />
        ))}
      </motion.div>

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search invoice number or name…"
        activeCount={activeCount}
        onClear={() => { reset(); setSearchInput(''); }}
        filters={
          <>
            <Field label="Status">
              <Select value={state.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
                <option value="">Any status</option>
                {['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].map((s) => (
                  <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={state.currency ?? ''} onChange={(e) => set({ currency: e.target.value })}>
                <option value="">Any currency</option>
                <option value="PKR">PKR — Pakistani rupee</option>
                <option value="MYR">MYR — Malaysian ringgit</option>
              </Select>
            </Field>
            <Field label="From"><Input type="date" value={state.from ?? ''} onChange={(e) => set({ from: e.target.value })} /></Field>
            <Field label="To"><Input type="date" value={state.to ?? ''} onChange={(e) => set({ to: e.target.value })} /></Field>
          </>
        }
      />

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !data?.items.length ? (
        <TableShell>
          <EmptyState
            icon={ReceiptText}
            title="No invoices yet"
            description={isSelfView ? 'Raise your first invoice for this service period.' : 'Nothing has been submitted in this range.'}
            action={
              user?.canInvoice || canRaiseForOthers ? (
                <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus className="h-4 w-4" /> New invoice
                </Button>
              ) : undefined
            }
          />
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                {canApprove && <Th>Raised by</Th>}
                <Th>Service period</Th>
                <Th align="right">Total</Th>
                <Th>Currency</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((inv) => (
                  <Tr key={inv.id} onClick={() => setViewing(inv)} className={cn(inv.status === 'SUBMITTED' && 'bg-amber-500/[0.035]')}>
                    <Td>
                      <p className="font-mono text-[12.5px] font-medium">{inv.invoiceNumber}</p>
                      <p className="text-muted mt-0.5 text-[11.5px]">Dated {fmtDate(inv.invoiceDate, 'd MMM yyyy')}</p>
                    </Td>
                    {canApprove && (
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={inv.user.name} color={inv.user.avatarColor} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{inv.user.name}</p>
                            <p className="text-muted truncate text-[11.5px]">
                              {inv.user.role && inv.user.role !== 'RESOURCE'
                                ? ROLE_LABEL[inv.user.role]
                                : inv.user.resource?.employeeCode ?? inv.user.role}
                            </p>
                          </div>
                        </div>
                      </Td>
                    )}
                    <Td>
                      <span className="text-[12.5px]">
                        {fmtDate(inv.periodFrom, 'd MMM')} – {fmtDate(inv.periodTo, 'd MMM yyyy')}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tnum text-[13.5px] font-semibold">
                        {fmtMoney(inv.total, inv.currency)}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill
                        tone={inv.currency === 'MYR' ? 'blue' : 'violet'}
                        label={inv.currency}
                        dot={false}
                        animateChange={false}
                      />
                    </Td>
                    <Td>
                      <StatusPill status={inv.status} />
                      {inv.decisionNote && (
                        <p className="text-muted mt-1 max-w-[180px] truncate text-[11px]">{inv.decisionNote}</p>
                      )}
                    </Td>
                    <Td align="right" onClick={(e: any) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        {canApprove && inv.status === 'SUBMITTED' && inv.userId !== user?.id && (
                          <ApprovalActions kind="invoice" id={inv.id} />
                        )}
                        {(inv.status === 'DRAFT' || inv.status === 'REJECTED') && inv.userId === user?.id && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(inv); setFormOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button size="sm" variant="primary" loading={submit.isPending} onClick={() => submit.mutate(inv.id)}>
                              <Send className="h-3.5 w-3.5" /> Submit
                            </Button>
                          </>
                        )}
                        {inv.status !== 'APPROVED' && (
                          <Button size="icon" variant="ghost" aria-label="Delete" className="hover:text-red-600" onClick={() => setDeleting(inv)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </AnimatePresence>
            </tbody>
          </Table>
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={(p) => set({ page: p })} />
        </TableShell>
      )}

      <InvoiceFormModal open={formOpen} onClose={() => setFormOpen(false)} invoice={editing} />
      <InvoiceViewModal invoice={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Delete this invoice?"
        message={<>Invoice <strong>{deleting?.invoiceNumber}</strong> and its line items will be removed.</>}
      />
    </>
  );
}

interface ItemDraft { description: string; quantity: string; rate: string }

function InvoiceFormModal({ open, onClose, invoice }: { open: boolean; onClose: () => void; invoice?: Invoice | null }) {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const editing = !!invoice;
  // An Admin never bills themselves, so they must name a payee first.
  const mustPickPayee = !editing && me?.canInvoice === false && me?.canRaiseForOthers === true;
  const [payeeId, setPayeeId] = useState('');

  const { data: payees = [] } = useQuery({
    queryKey: ['invoice-payees'],
    queryFn: async () => (await api.get<Payee[]>('/invoices/payees')).data,
    enabled: open && mustPickPayee,
  });
  const [form, setForm] = useState({
    invoiceDate: '', address: '', bankName: '', accountNumber: '',
    periodFrom: '', periodTo: '', notes: '', currency: 'PKR' as Currency,
  });
  const [items, setItems] = useState<ItemDraft[]>([{ description: '', quantity: '1', rate: '' }]);
  const [error, setError] = useState<string | null>(null);

  const { data: prefill } = useQuery({
    queryKey: ['invoice-prefill', payeeId],
    queryFn: async () =>
      (await api.get('/invoices/prefill', { params: payeeId ? { userId: payeeId } : {} })).data as {
        userId: string; name: string; email: string; onBehalfOf?: boolean;
        address: string; bankName: string; accountNumber: string;
      },
    // Wait for a payee when one is required, so we prefill the right person.
    enabled: open && !editing && (!mustPickPayee || !!payeeId),
  });

  useEffect(() => {
    if (!open) return;
    setPayeeId('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (invoice) {
      setForm({
        invoiceDate: invoice.invoiceDate.slice(0, 10),
        address: invoice.address,
        bankName: invoice.bankName,
        accountNumber: invoice.accountNumber,
        periodFrom: invoice.periodFrom.slice(0, 10),
        periodTo: invoice.periodTo.slice(0, 10),
        notes: invoice.notes ?? '',
        currency: invoice.currency,
      });
      setItems(invoice.items.map((i) => ({
        description: i.description,
        quantity: String(i.quantity),
        rate: String(i.rate),
      })));
    } else {
      // Default to the current month's service period.
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setForm({
        invoiceDate: toDateInput(last),
        address: prefill?.address ?? '',
        bankName: prefill?.bankName ?? '',
        accountNumber: prefill?.accountNumber ?? '',
        periodFrom: toDateInput(first),
        periodTo: toDateInput(last),
        notes: '',
        currency: 'PKR',
      });
      setItems([{ description: '', quantity: '1', rate: '' }]);
    }
  }, [open, invoice, prefill]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((its) => its.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const total = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0),
    [items],
  );

  const payload = () => ({
    currency: form.currency,
    invoiceDate: new Date(form.invoiceDate).toISOString(),
    address: form.address.trim(),
    bankName: form.bankName.trim(),
    accountNumber: form.accountNumber.trim(),
    periodFrom: new Date(form.periodFrom).toISOString(),
    periodTo: new Date(form.periodTo).toISOString(),
    notes: form.notes || undefined,
    items: items
      .filter((i) => i.description.trim())
      .map((i) => ({
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        rate: Number(i.rate) || 0,
      })),
    ...(payeeId ? { userId: payeeId } : {}),
  });

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['invoice-summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    toast.success(msg);
    onClose();
  };

  const saveDraft = useMutation({
    mutationFn: (): Promise<unknown> =>
      editing ? api.patch(`/invoices/${invoice!.id}`, payload()) : api.post('/invoices', payload()),
    onSuccess: () => done('Draft saved'),
    onError: (e) => setError(extractMessage(e)),
  });

  const submitNow = useMutation({
    mutationFn: async (): Promise<unknown> => {
      if (editing) {
        await api.patch(`/invoices/${invoice!.id}`, payload());
        return api.post(`/invoices/${invoice!.id}/submit`);
      }
      return api.post('/invoices/submit', payload());
    },
    onSuccess: () => done('Invoice submitted for approval'),
    onError: (e) => setError(extractMessage(e)),
  });

  const valid =
    (!mustPickPayee || !!payeeId) &&
    form.invoiceDate && form.address.trim() && form.bankName.trim() &&
    form.accountNumber.trim() && form.periodFrom && form.periodTo &&
    items.some((i) => i.description.trim());

  const busy = saveDraft.isPending || submitNow.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${invoice!.invoiceNumber}` : mustPickPayee ? 'Raise an invoice for someone' : 'New invoice'}
      description={
        editing && invoice?.status === 'REJECTED'
          ? 'This invoice was rejected — saving returns it to draft so you can resubmit.'
          : 'Save it as a draft, or send it straight to an Admin.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" disabled={!valid || busy} loading={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
            Save draft
          </Button>
          <Button variant="primary" disabled={!valid || busy} loading={submitNow.isPending} onClick={() => submitNow.mutate()}>
            <Send className="h-4 w-4" /> Submit for approval
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {mustPickPayee && (
          <Field
            label="Raise this invoice for"
            required
            hint="Administrators don't bill for themselves. Pick the PM or resource this invoice belongs to."
          >
            <Select value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
              <option value="">Select a person…</option>
              {payees.map((pe) => (
                <option key={pe.id} value={pe.id}>
                  {pe.name}
                  {pe.designation ? ` · ${pe.designation}` : ''}
                  {pe.role !== 'RESOURCE' ? ` (${ROLE_SHORT[pe.role]})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {prefill && !editing && (
          <div className="rounded-xl bg-[color:var(--surface-sunken)] px-3.5 py-3">
            <p className="text-[12.5px] font-semibold">{prefill.name}</p>
            <p className="text-muted mt-0.5 text-[12px]">{prefill.email}</p>
            {prefill.onBehalfOf && (
              <p className="text-muted mt-1.5 text-[11.5px]">
                Raised by you on their behalf — it lands in the approval queue as theirs.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice date" required>
            <Input type="date" value={form.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
          </Field>
          <Field label="Currency" required hint="Line rates and the total are all in this currency.">
            <Select value={form.currency} onChange={(e) => set({ currency: e.target.value as Currency })}>
              <option value="PKR">PKR — Pakistani rupee</option>
              <option value="MYR">MYR — Malaysian ringgit</option>
            </Select>
          </Field>
          <Field label="Address" required>
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Billing address" />
          </Field>
          <Field label="Bank" required>
            <Input value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="e.g. DBS Bank Ltd" />
          </Field>
          <Field label="Account number" required>
            <Input value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} placeholder="e.g. 0012-4471-882" />
          </Field>
          <Field label="Service period from" required>
            <Input type="date" value={form.periodFrom} onChange={(e) => set({ periodFrom: e.target.value })} />
          </Field>
          <Field label="Service period to" required>
            <Input type="date" value={form.periodTo} onChange={(e) => set({ periodTo: e.target.value })} />
          </Field>
        </div>

        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold">Line items</p>
            <Button size="sm" onClick={() => setItems((i) => [...i, { description: '', quantity: '1', rate: '' }])}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="text-muted grid grid-cols-[1fr_84px_110px_110px_36px] gap-2 border-b bg-[color:var(--surface-sunken)] px-3 py-2 text-[11px] font-semibold tracking-wider uppercase">
              <span>Description</span><span className="text-right">Qty</span>
              <span className="text-right">Rate</span><span className="text-right">Amount</span><span />
            </div>

            <AnimatePresence initial={false}>
              {items.map((it, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="grid grid-cols-[1fr_84px_110px_110px_36px] items-center gap-2 overflow-hidden border-b px-3 py-2 last:border-b-0"
                >
                  <Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="e.g. Software engineering services" className="h-8.5 text-[13px]" />
                  <Input type="number" step="0.01" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} className="tnum h-8.5 text-right text-[13px]" />
                  <Input type="number" step="0.01" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} placeholder="0.00" className="tnum h-8.5 text-right text-[13px]" />
                  <span className="tnum pr-1 text-right text-[13px] font-medium">
                    {fmtMoney((Number(it.quantity) || 0) * (Number(it.rate) || 0), form.currency)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove line"
                    className="h-8 w-8 hover:text-red-600"
                    disabled={items.length === 1}
                    onClick={() => setItems((its) => its.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="flex items-center justify-between bg-[color:var(--surface-sunken)] px-3 py-2.5">
              <span className="text-[12.5px] font-semibold">Total ({form.currency})</span>
              <motion.span
                key={total}
                initial={{ opacity: 0.5, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="tnum text-[15px] font-semibold"
              >
                {fmtMoney(total, form.currency)}
              </motion.span>
            </div>
          </div>
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the approver should know." />
        </Field>

        {error && <p className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}

function InvoiceViewModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { data: full } = useQuery({
    queryKey: ['invoice', invoice?.id],
    queryFn: async () => (await api.get<Invoice>(`/invoices/${invoice!.id}`)).data,
    enabled: !!invoice,
  });
  const inv = full ?? invoice;

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={inv?.invoiceNumber ?? 'Invoice'}
      description={inv ? `${inv.user.name} · ${fmtDate(inv.periodFrom, 'd MMM')} – ${fmtDate(inv.periodTo, 'd MMM yyyy')}` : undefined}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {!inv ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusPill status={inv.status} />
            <span className="tnum text-[20px] font-semibold">{fmtMoney(inv.total, inv.currency)}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Invoice date">{fmtDate(inv.invoiceDate)}</Detail>
            <Detail label="Currency">{inv.currency}</Detail>
            <Detail label="Bank">{inv.bankName}</Detail>
            <Detail label="Account">{inv.accountNumber}</Detail>
            <Detail label="Address">{inv.address}</Detail>
          </div>

          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted border-b bg-[color:var(--surface-sunken)] text-[11px] tracking-wider uppercase">
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5">{it.description}</td>
                    <td className="tnum px-3 py-2.5 text-right">{Number(it.quantity)}</td>
                    <td className="tnum px-3 py-2.5 text-right">{fmtMoney(it.rate, inv.currency)}</td>
                    <td className="tnum px-3 py-2.5 text-right font-medium">{fmtMoney(it.amount, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inv.notes && (
            <div>
              <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">Notes</p>
              <p className="text-secondary mt-1 text-[13px] leading-relaxed">{inv.notes}</p>
            </div>
          )}

          {inv.decidedBy && (
            <div className={cn('rounded-xl px-3.5 py-3', inv.status === 'APPROVED' ? 'bg-emerald-500/8' : 'bg-red-500/8')}>
              <p className="text-[12.5px] font-semibold">
                {inv.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {inv.decidedBy.name}
              </p>
              <p className="text-muted mt-0.5 text-[11.5px]">{fmtDateTime(inv.decidedAt)}</p>
              {inv.decisionNote && <p className="text-secondary mt-2 text-[12.5px]">{inv.decisionNote}</p>}
            </div>
          )}

          {!!inv.history?.length && (
            <div>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
                <History className="h-3.5 w-3.5" /> History
              </p>
              <ul className="space-y-2.5 border-l pl-4">
                {inv.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="bg-brand-500 absolute top-1.5 -left-[21px] h-2 w-2 rounded-full ring-4 ring-[color:var(--surface-card)]" />
                    <p className="text-[12.5px]">{h.summary}</p>
                    <p className="text-muted mt-0.5 text-[11.5px]">{h.actorName} · {fmtDateTime(h.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">{label}</p>
      <p className="mt-1 text-[13px]">{children}</p>
    </div>
  );
}
