import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { Handshake, Plus, Pencil, Trash2, Mail, Phone, User as UserIcon, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, extractMessage, toastError, type Paginated } from '@/lib/api';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, TableSkeleton } from '@/components/ui/States';
import { fmtDate } from '@/lib/format';
import type { ServiceProvider } from '@/lib/types';

export default function ServiceProviders() {
  const qc = useQueryClient();
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceProvider | null>(null);
  const [viewing, setViewing] = useState<ServiceProvider | null>(null);
  const [deleting, setDeleting] = useState<ServiceProvider | null>(null);

  const params = clean({
    page: state.page, pageSize: 25, search,
    sortBy: state.sortBy, sortDir: state.sortDir,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['serviceProviders', params],
    queryFn: async () => (await api.get<Paginated<ServiceProvider>>('/service-providers', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/service-providers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serviceProviders'] });
      qc.invalidateQueries({ queryKey: ['serviceProvider-options'] });
      setDeleting(null);
      toast.success('Service provider deleted');
    },
    onError: (e) => { toastError(e); setDeleting(null); },
  });

  const sort = (key: string) => {
    const dir = state.sortBy === key && state.sortDir === 'asc' ? 'desc' : 'asc';
    set({ sortBy: key, sortDir: dir });
  };

  return (
    <>
      <PageHeader
        title="Service Providers"
        description="Companies that supply us external resources. A client gives us projects; a service provider gives us people."
        actions={
          <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add service provider
          </Button>
        }
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search service providers or contact…"
        onClear={() => { reset(); setSearchInput(''); }}
      />

      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : !data?.items.length ? (
        <TableShell>
          <EmptyState
            icon={Handshake}
            title={search ? 'No service providers match' : 'No service providers yet'}
            description={
              search
                ? 'Try a different search.'
                : 'Add a service provider here, or type a new name when onboarding an external resource.'
            }
            action={
              <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> Add service provider
              </Button>
            }
          />
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th sortKey="name" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Service provider</Th>
                <Th>Contact</Th>
                <Th>Resources provided</Th>
                <Th>Working on</Th>
                <Th sortKey="createdAt" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Added</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((pt) => (
                  <Tr key={pt.id} onClick={() => setViewing(pt)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                          <Handshake className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">{pt.name}</p>
                          {pt.notes && <p className="text-muted mt-0.5 truncate text-[12px]">{pt.notes}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {!pt.contactName && !pt.contactEmail && !pt.contactPhone ? (
                        <span className="text-muted text-[12.5px]">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {pt.contactName && (
                            <p className="flex items-center gap-1.5 text-[12.5px]">
                              <UserIcon className="text-muted h-3 w-3 shrink-0" /> {pt.contactName}
                            </p>
                          )}
                          {pt.contactEmail && (
                            <p className="text-muted flex items-center gap-1.5 text-[12px]">
                              <Mail className="h-3 w-3 shrink-0" /> {pt.contactEmail}
                            </p>
                          )}
                          {pt.contactPhone && (
                            <p className="text-muted flex items-center gap-1.5 text-[12px]">
                              <Phone className="h-3 w-3 shrink-0" /> {pt.contactPhone}
                            </p>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {!pt._count?.resources ? (
                        <span className="text-muted text-[12.5px]">None yet</span>
                      ) : (
                        <div>
                          <p className="tnum text-[13.5px] font-semibold">{pt._count.resources}</p>
                          <p className="text-muted mt-0.5 text-[11.5px]">
                            {pt.activeResources ?? pt._count.resources} active
                          </p>
                        </div>
                      )}
                    </Td>
                    <Td>
                      {!pt.projectCodes?.length ? (
                        <span className="text-muted text-[12.5px]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {pt.projectCodes.slice(0, 3).map((code) => (
                            <span key={code} className="rounded bg-[color:var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px] font-medium">
                              {code}
                            </span>
                          ))}
                          {pt.projectCodes.length > 3 && (
                            <span className="text-muted text-[11.5px]">+{pt.projectCodes.length - 3}</span>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-muted text-[12.5px]">{fmtDate(pt.createdAt)}</span></Td>
                    <Td align="right" onClick={(e: any) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditing(pt); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Delete" className="hover:text-red-600" onClick={() => setDeleting(pt)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </AnimatePresence>
            </tbody>
          </Table>
          <Pagination
            page={data.page}
            pageCount={data.pageCount}
            total={data.total}
            pageSize={data.pageSize}
            onPage={(p) => set({ page: p })}
          />
        </TableShell>
      )}

      <ServiceProviderFormModal open={formOpen} onClose={() => setFormOpen(false)} serviceProvider={editing} />
      <ServiceProviderDetailModal
        serviceProvider={viewing}
        onClose={() => setViewing(null)}
        onEdit={(pt) => { setViewing(null); setEditing(pt); setFormOpen(true); }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Delete this service provider?"
        message={
          deleting?._count?.resources
            ? <><strong>{deleting.name}</strong> still supplies {deleting._count.resources} resource(s). You'll need to remove or reassign those people first.</>
            : <><strong>{deleting?.name}</strong> will be removed from the service provider register.</>
        }
        confirmLabel="Delete service provider"
      />
    </>
  );
}

function ServiceProviderFormModal({
  open, onClose, serviceProvider,
}: {
  open: boolean; onClose: () => void; serviceProvider?: ServiceProvider | null;
}) {
  const qc = useQueryClient();
  const editing = !!serviceProvider;
  const [form, setForm] = useState({ name: '', contactName: '', contactEmail: '', contactPhone: '', notes: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      name: serviceProvider?.name ?? '',
      contactName: serviceProvider?.contactName ?? '',
      contactEmail: serviceProvider?.contactEmail ?? '',
      contactPhone: serviceProvider?.contactPhone ?? '',
      notes: serviceProvider?.notes ?? '',
    });
  }, [open, serviceProvider]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: (): Promise<unknown> => {
      const payload = {
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      return editing ? api.patch(`/service-providers/${serviceProvider!.id}`, payload) : api.post('/service-providers', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serviceProviders'] });
      qc.invalidateQueries({ queryKey: ['serviceProvider-options'] });
      qc.invalidateQueries({ queryKey: ['resources'] });
      toast.success(editing ? 'Service provider updated' : 'Service provider added');
      onClose();
    },
    onError: (e) => setError(extractMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${serviceProvider!.name}` : 'Add a service provider'}
      description="Service provider names are unique, so the same supplier can't end up recorded twice."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={form.name.trim().length < 2}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {editing ? 'Save changes' : 'Add service provider'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service provider name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Preesoft" autoFocus />
        </Field>
        <Field label="Contact name">
          <Input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="Account manager" />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="accounts@preesoft.com" />
        </Field>
        <Field label="Contact phone" className="sm:col-span-2">
          <Input value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+92 51 000 0000" />
        </Field>
        <Field label="Notes" className="sm:col-span-2" hint="Contract terms, billing arrangement, anything worth remembering.">
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 sm:col-span-2 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function ServiceProviderDetailModal({
  serviceProvider, onClose, onEdit,
}: {
  serviceProvider: ServiceProvider | null; onClose: () => void; onEdit: (p: ServiceProvider) => void;
}) {
  const { data: full } = useQuery({
    queryKey: ['serviceProvider', serviceProvider?.id],
    queryFn: async () => (await api.get<ServiceProvider>(`/service-providers/${serviceProvider!.id}`)).data,
    enabled: !!serviceProvider,
  });
  const pt = full ?? serviceProvider;

  return (
    <Modal
      open={!!serviceProvider}
      onClose={onClose}
      title={pt?.name ?? 'Service provider'}
      description={
        pt?._count?.resources
          ? `${pt._count.resources} resource${pt._count.resources === 1 ? '' : 's'} provided`
          : 'No resources provided yet'
      }
      size="lg"
      footer={
        pt && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => onEdit(pt)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        )
      }
    >
      {!pt ? null : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Detail label="Contact" value={pt.contactName} />
            <Detail label="Email" value={pt.contactEmail} />
            <Detail label="Phone" value={pt.contactPhone} />
          </div>

          {pt.notes && (
            <div>
              <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">Notes</p>
              <p className="text-secondary mt-1 text-[13px] leading-relaxed">{pt.notes}</p>
            </div>
          )}

          <div>
            <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">
              Resources provided
            </p>
            {!pt.resources?.length ? (
              <p className="text-muted rounded-lg bg-[color:var(--surface-sunken)] px-3 py-5 text-center text-[13px]">
                No resources from this service provider yet.
              </p>
            ) : (
              <ul className="divide-y">
                {pt.resources.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/resources/${r.id}`}
                      onClick={onClose}
                      className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-[color:var(--surface-hover)]"
                    >
                      <Avatar name={r.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{r.name}</p>
                        <p className="text-muted mt-0.5 truncate text-[12px]">
                          {r.employeeCode} · {r.designation ?? 'No title'}
                          {r.internalSeniority ? ` · SH grade: ${r.internalSeniority}` : ''}
                        </p>
                      </div>
                      {!!r.assignments?.length && (
                        <div className="flex flex-wrap gap-1">
                          {r.assignments.slice(0, 2).map((a) => (
                            <span key={a.id} className="rounded bg-[color:var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px] font-medium">
                              {a.module?.name ?? a.project.code}
                            </span>
                          ))}
                        </div>
                      )}
                      <StatusPill status={r.status} dot={false} animateChange={false} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">{label}</p>
      <p className="mt-1 text-[13px]">{value || '—'}</p>
    </div>
  );
}
