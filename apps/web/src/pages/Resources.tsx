import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { Plus, UserRound, Trash2, Pencil, Building2, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, TableSkeleton } from '@/components/ui/States';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ResourceFormModal } from '@/features/ResourceFormModal';
import { fmtDate, ROLE_LABEL } from '@/lib/format';
import type { ServiceProviderRef, ResourceRow } from '@/lib/types';

export default function Resources() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [deleting, setDeleting] = useState<ResourceRow | null>(null);

  const params = clean({
    page: state.page,
    pageSize: 25,
    search,
    type: state.type,
    status: state.status,
    serviceProviderId: state.serviceProviderId,
    role: state.role,
    projectId: state.projectId,
    unassigned: state.unassigned,
    sortBy: state.sortBy,
    sortDir: state.sortDir,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['resources', params],
    queryFn: async () => (await api.get<Paginated<ResourceRow>>('/resources', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['project-options'],
    queryFn: async () => (await api.get('/projects/options')).data as { id: string; name: string; code: string }[],
  });

  const { data: serviceProviders = [] } = useQuery({
    queryKey: ['serviceProvider-options'],
    queryFn: async () => (await api.get<ServiceProviderRef[]>('/service-providers/options')).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/resources/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleting(null);
      toast.success('Resource removed');
    },
    onError: (e) => {
      toastError(e);
      setDeleting(null);
    },
  });

  const activeCount = ['type', 'status', 'serviceProviderId', 'projectId', 'unassigned', 'role'].filter((k) => state[k]).length;

  const sort = (key: string) => {
    const dir = state.sortBy === key && state.sortDir === 'asc' ? 'desc' : 'asc';
    set({ sortBy: key, sortDir: dir });
  };

  return (
    <>
      <PageHeader
        title="Resources"
        description={
          user?.role === 'ADMIN'
            ? 'Everyone in the system. Access level is authority layered on the person — a Project Manager is a resource who also runs projects.'
            : 'Resources you onboarded, plus anyone working on your projects.'
        }
        actions={
          <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> {user?.role === 'ADMIN' ? 'Add person' : 'Add resource'}
          </Button>
        }
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search name, email, code or company…"
        activeCount={activeCount}
        onClear={() => { reset(); setSearchInput(''); }}
        filters={
          <>
            <Select value={state.type ?? ''} onChange={(e) => set({ type: e.target.value })}>
              <option value="">All types</option>
              <option value="SH">Internal (SH)</option>
              <option value="EXTERNAL">External</option>
            </Select>
            <Select value={state.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
            <Select value={state.serviceProviderId ?? ''} onChange={(e) => set({ serviceProviderId: e.target.value })}>
              <option value="">All service providers</option>
              {serviceProviders.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </Select>
            <Select value={state.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value })}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
            <Select value={state.unassigned ?? ''} onChange={(e) => set({ unassigned: e.target.value })}>
              <option value="">Assigned or not</option>
              <option value="true">Unassigned only</option>
            </Select>
            <Select value={state.role ?? ''} onChange={(e) => set({ role: e.target.value })}>
              <option value="">Any access level</option>
              <option value="RESOURCE">Resource</option>
              <option value="PM">Project Manager</option>
              <option value="EM">Engineering Manager</option>
              <option value="ADMIN">Administrator</option>
            </Select>
          </>
        }
      />

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !data?.items.length ? (
        <TableShell>
          <EmptyState
            icon={UserRound}
            title="No resources match"
            description={activeCount || search ? 'Try loosening the filters.' : 'Add your first resource to get started.'}
            action={
              <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" /> Add resource
              </Button>
            }
          />
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th sortKey="name" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Resource</Th>
                <Th>Access</Th>
                <Th sortKey="type" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Type</Th>
                <Th>Assignments</Th>
                <Th>Role on project</Th>
                <Th sortKey="status" sortBy={state.sortBy} sortDir={state.sortDir as any} onSort={sort}>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((r) => (
                  <Tr key={r.id} onClick={() => navigate(`/resources/${r.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} color={null} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">{r.name}</p>
                          <p className="text-muted mt-0.5 truncate text-[12px]">
                            {r.employeeCode} · {r.designation ?? 'No title'}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {r.user?.role && r.user.role !== 'RESOURCE' ? (
                        <StatusPill
                          tone={r.user.role === 'ADMIN' ? 'violet' : 'blue'}
                          label={ROLE_LABEL[r.user.role]}
                          dot={false}
                          animateChange={false}
                        />
                      ) : (
                        <span className="text-muted text-[12.5px]">Resource</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill
                          status={r.type}
                          label={r.type === 'SH' ? 'Internal' : 'External'}
                          dot={false}
                          animateChange={false}
                        />
                        {r.serviceProvider && (
                          <span className="text-muted inline-flex items-center gap-1 text-[11.5px]">
                            <Building2 className="h-3 w-3" /> {r.serviceProvider.name}
                          </span>
                        )}
                        {/* Our own grading of a borrowed resource. */}
                        {r.internalSeniority && (
                          <span className="text-muted text-[11.5px]">
                            SH grade: {r.internalSeniority}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {(() => {
                        const managed = r.user?.managedProjects ?? [];
                        const worked = r.assignments ?? [];
                        if (!managed.length && !worked.length) {
                          return <span className="text-muted text-[12.5px]">Unassigned</span>;
                        }
                        return (
                          <div className="flex flex-wrap items-center gap-1">
                            {/* Managing a project is a different link than working on one. */}
                            {managed.slice(0, 2).map((m) => (
                              <span
                                key={m.project.id}
                                title={`Manages ${m.project.code}`}
                                className="inline-flex items-center gap-1 rounded bg-brand-500/10 px-1.5 py-0.5 text-[11.5px] font-medium text-brand-700 dark:text-brand-300"
                              >
                                <Crown className="h-2.5 w-2.5" />
                                {m.project.code}
                              </span>
                            ))}
                            {worked.slice(0, 2).map((a) => (
                              <span key={a.id} className="rounded bg-[color:var(--surface-sunken)] px-1.5 py-0.5 text-[11.5px] font-medium">
                                {a.project.code}
                              </span>
                            ))}
                            {managed.length + worked.length > 4 && (
                              <span className="text-muted text-[11.5px]">
                                +{managed.length + worked.length - 4}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </Td>
                    <Td>
                      {/* Set per placement, so it can differ between projects. */}
                      {(() => {
                        const roles = (r.assignments ?? []).filter((a) => a.roleOnProject);
                        if (!roles.length) return <span className="text-muted text-[12.5px]">—</span>;
                        return (
                          <div className="flex flex-col gap-0.5">
                            {roles.slice(0, 2).map((a) => (
                              <span key={a.id} className="text-[12px]">
                                <span className="font-medium">{a.roleOnProject}</span>
                                <span className="text-muted"> · {a.project.code}</span>
                              </span>
                            ))}
                            {roles.length > 2 && (
                              <span className="text-muted text-[11.5px]">+{roles.length - 2} more</span>
                            )}
                          </div>
                        );
                      })()}
                    </Td>
                    <Td>
                      <StatusPill status={r.status} dot={false} />
                    </Td>
                    <Td align="right" onClick={(e: any) => e.stopPropagation()}>
                      {/* Only an Admin manages someone who holds elevated access. */}
                      {user?.role === 'ADMIN' || !r.user?.role || r.user.role === 'RESOURCE' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit"
                            onClick={() => { setEditing(r); setFormOpen(true); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete"
                            className="hover:text-red-600"
                            onClick={() => setDeleting(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted text-[12px]">Admin-managed</span>
                      )}
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

      <ResourceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        resource={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Remove this resource?"
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed along with their login account,
            team memberships and assignments. Attendance and invoice history goes with them.
            This can't be undone.
          </>
        }
        confirmLabel="Remove resource"
      />
    </>
  );
}
