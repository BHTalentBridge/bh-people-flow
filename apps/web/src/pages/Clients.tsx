import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { Building2, Plus, Pencil, Trash2, Mail, Phone, User as UserIcon } from 'lucide-react';
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
import type { Client } from '@/lib/types';

export default function Clients() {
  const qc = useQueryClient();
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  const params = clean({
    page: state.page, pageSize: 25, search,
    sortBy: state.sortBy, sortDir: state.sortDir,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['clients', params],
    queryFn: async () => (await api.get<Paginated<Client>>('/clients', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-options'] });
      setDeleting(null);
      toast.success('Client deleted');
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
        title="Clients"
        description="The organisations you deliver for. A client can carry several projects, and one is created automatically whenever someone types a new name on the project form."
        actions={
          <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Add client
          </Button>
        }
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search client or contact…"
        onClear={() => { reset(); setSearchInput(''); }}
      />

      {isLoading ? (
        <TableSkeleton cols={5} />
      ) : !data?.items.length ? (
        <TableShell>
          <EmptyState
            icon={Building2}
            title={search ? 'No clients match' : 'No clients yet'}
            description={
              search
                ? 'Try a different search.'
                : 'Add a client here, or just type a new client name when creating a project.'
            }
            action={
              <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> Add client
              </Button>
            }
          />
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th sortKey="name" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Client</Th>
                <Th>Contact</Th>
                <Th>Projects</Th>
                <Th sortKey="createdAt" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Added</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((c) => (
                  <Tr key={c.id} onClick={() => setViewing(c)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--surface-sunken)]">
                          <Building2 className="text-muted h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">{c.name}</p>
                          {c.notes && <p className="text-muted mt-0.5 truncate text-[12px]">{c.notes}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {!c.contactName && !c.contactEmail && !c.contactPhone ? (
                        <span className="text-muted text-[12.5px]">—</span>
                      ) : (
                        <div className="space-y-0.5">
                          {c.contactName && (
                            <p className="flex items-center gap-1.5 text-[12.5px]">
                              <UserIcon className="text-muted h-3 w-3 shrink-0" /> {c.contactName}
                            </p>
                          )}
                          {c.contactEmail && (
                            <p className="text-muted flex items-center gap-1.5 text-[12px]">
                              <Mail className="h-3 w-3 shrink-0" /> {c.contactEmail}
                            </p>
                          )}
                          {c.contactPhone && (
                            <p className="text-muted flex items-center gap-1.5 text-[12px]">
                              <Phone className="h-3 w-3 shrink-0" /> {c.contactPhone}
                            </p>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {!c._count?.projects ? (
                        <span className="text-muted text-[12.5px]">None yet</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          {c.projects?.slice(0, 3).map((p) => (
                            <span
                              key={p.id}
                              className="rounded bg-[color:var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px] font-medium"
                            >
                              {p.code}
                            </span>
                          ))}
                          {c._count.projects > 3 && (
                            <span className="text-muted text-[11.5px]">+{c._count.projects - 3}</span>
                          )}
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-muted text-[12.5px]">{fmtDate(c.createdAt)}</span></Td>
                    <Td align="right" onClick={(e: any) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => { setEditing(c); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          className="hover:text-red-600"
                          onClick={() => setDeleting(c)}
                        >
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

      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} client={editing} />
      <ClientDetailModal
        client={viewing}
        onClose={() => setViewing(null)}
        onEdit={(c) => { setViewing(null); setEditing(c); setFormOpen(true); }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Delete this client?"
        message={
          deleting?._count?.projects
            ? <><strong>{deleting.name}</strong> still has {deleting._count.projects} project(s). You'll need to reassign or delete those first.</>
            : <><strong>{deleting?.name}</strong> will be removed from the client register.</>
        }
        confirmLabel="Delete client"
      />
    </>
  );
}

function ClientFormModal({
  open, onClose, client,
}: {
  open: boolean; onClose: () => void; client?: Client | null;
}) {
  const qc = useQueryClient();
  const editing = !!client;
  const [form, setForm] = useState({ name: '', contactName: '', contactEmail: '', contactPhone: '', notes: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      name: client?.name ?? '',
      contactName: client?.contactName ?? '',
      contactEmail: client?.contactEmail ?? '',
      contactPhone: client?.contactPhone ?? '',
      notes: client?.notes ?? '',
    });
  }, [open, client]);

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
      return editing ? api.patch(`/clients/${client!.id}`, payload) : api.post('/clients', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-options'] });
      toast.success(editing ? 'Client updated' : 'Client added');
      onClose();
    },
    onError: (e) => setError(extractMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${client!.name}` : 'Add a client'}
      description="Client names are unique, so the same organisation can't end up recorded twice."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={form.name.trim().length < 2}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {editing ? 'Save changes' : 'Add client'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client name" required className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Civil Aviation Authority"
            autoFocus
          />
        </Field>
        <Field label="Contact name">
          <Input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="e.g. Lim Wei Sheng" />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="name@client.com" />
        </Field>
        <Field label="Contact phone" className="sm:col-span-2">
          <Input value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+65 6000 0000" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the delivery team should know." />
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

function ClientDetailModal({
  client, onClose, onEdit,
}: {
  client: Client | null; onClose: () => void; onEdit: (c: Client) => void;
}) {
  const { data: full } = useQuery({
    queryKey: ['client', client?.id],
    queryFn: async () => (await api.get<Client>(`/clients/${client!.id}`)).data,
    enabled: !!client,
  });
  const c = full ?? client;

  return (
    <Modal
      open={!!client}
      onClose={onClose}
      title={c?.name ?? 'Client'}
      description={
        c?._count?.projects
          ? `${c._count.projects} project${c._count.projects === 1 ? '' : 's'}`
          : 'No projects yet'
      }
      footer={
        c && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => onEdit(c)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </>
        )
      }
    >
      {!c ? null : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Detail label="Contact" value={c.contactName} />
            <Detail label="Email" value={c.contactEmail} />
            <Detail label="Phone" value={c.contactPhone} />
          </div>

          {c.notes && (
            <div>
              <p className="text-muted text-[11px] font-semibold tracking-wider uppercase">Notes</p>
              <p className="text-secondary mt-1 text-[13px] leading-relaxed">{c.notes}</p>
            </div>
          )}

          <div>
            <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">Projects</p>
            {!c.projects?.length ? (
              <p className="text-muted rounded-lg bg-[color:var(--surface-sunken)] px-3 py-5 text-center text-[13px]">
                No projects for this client yet.
              </p>
            ) : (
              <ul className="divide-y">
                {c.projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      onClick={onClose}
                      className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-[color:var(--surface-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{p.name}</p>
                        <p className="text-muted mt-0.5 truncate text-[12px]">
                          {p.code}
                          {p._count && ` · ${p._count.tasks} task${p._count.tasks === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      {!!p.managers?.length && (
                        <div className="flex items-center">
                          {p.managers.slice(0, 3).map((m) => (
                            <Avatar
                              key={m.user.id}
                              name={m.user.name}
                              color={m.user.avatarColor}
                              size="xs"
                              className="-ml-1.5 ring-2 ring-[color:var(--surface-card)] first:ml-0"
                            />
                          ))}
                        </div>
                      )}
                      <StatusPill status={p.status} dot={false} animateChange={false} />
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
