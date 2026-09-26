import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { ClipboardCheck, Trash2, UserRoundPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { fmtDate, fmtRelative } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Tabs } from '@/components/ui/Tabs';
import { Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { Modal } from '@/components/ui/Modal';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { ApprovalActions } from '@/features/ApprovalActions';
import type { AssignmentRequest, Project } from '@/lib/types';

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const TABS: { value: Tab; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

/** "SKYIQ › Alerting", or "Whole project" when the placement isn't narrowed. */
function placement(r: AssignmentRequest) {
  const parts = [r.module?.name, r.subModule?.name].filter(Boolean);
  return parts.length ? parts.join(' › ') : 'Whole project';
}

/**
 * The gate between a PM wanting someone on a project and that person actually
 * being on it.
 *
 * The same screen serves both sides, because they are reading the same rows for
 * opposite reasons: an **EM** (or Admin) sees a queue to decide, a **PM** sees
 * what they asked for and where it got to. The server decides which rows anyone
 * can act on — `canDecide` / `canCancel` come back per row — so this page never
 * offers a button the API would refuse.
 */
export default function AssignmentRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { state, set } = useQueryState({ status: 'PENDING' });
  const [search, setSearch] = useState(state.search ?? '');
  const debounced = useDebounced(search);
  const [withdrawing, setWithdrawing] = useState<AssignmentRequest | null>(null);

  const isApprover = user?.canApproveAssignments === true;
  const tab = (state.status || 'PENDING') as Tab;
  const page = Number(state.page ?? 1);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: async () => (await api.get<Pick<Project, 'id' | 'name' | 'code'>[]>('/projects/options')).data,
  });

  const query = clean({
    status: tab === 'ALL' ? undefined : tab,
    projectId: state.projectId,
    search: debounced || undefined,
    page,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['assignment-requests', query],
    queryFn: async () =>
      (await api.get<Paginated<AssignmentRequest>>('/assignment-requests', { params: query })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => api.delete(`/assignment-requests/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-requests'] });
      qc.invalidateQueries({ queryKey: ['assignment-pending-count'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setWithdrawing(null);
      toast.success('Request withdrawn');
    },
    onError: toastError,
  });

  const rows = data?.items ?? [];
  const activeFilters = state.projectId ? 1 : 0;

  return (
    <>
      <PageHeader
        title={isApprover ? 'Assignment approvals' : 'My assignment requests'}
        description={
          isApprover
            ? 'Placing a resource on one of your projects needs your sign-off. Nobody joins a project until you approve — a pending request grants no access.'
            : 'Resources you have asked to place on a project, and what the Engineering Manager decided. Approved requests become placements straight away.'
        }
      />

      <Tabs
        tabs={TABS}
        value={tab}
        onChange={(v) => set({ status: v === 'ALL' ? 'ALL' : v })}
        className="mb-4"
        idPrefix="assignment-requests"
      />

      <Toolbar
        search={search}
        onSearch={(v) => {
          setSearch(v);
          set({ search: v || undefined });
        }}
        searchPlaceholder="Search by person, project or requester…"
        activeCount={activeFilters}
        onClear={() => set({ projectId: undefined })}
        filters={
          <Field label="Project">
            <Select
              value={state.projectId ?? ''}
              onChange={(e) => set({ projectId: e.target.value || undefined })}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </Select>
          </Field>
        }
      />

      {isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableShell>
          <TableSkeleton rows={6} cols={6} />
        </TableShell>
      ) : !rows.length ? (
        <TableShell>
          <EmptyState
            icon={ClipboardCheck}
            title={
              tab === 'PENDING'
                ? isApprover
                  ? 'Nothing waiting on you'
                  : 'No requests in flight'
                : `No ${tab.toLowerCase()} requests`
            }
            description={
              tab === 'PENDING'
                ? isApprover
                  ? 'When a PM asks to place someone on one of your projects, it lands here.'
                  : 'Assign someone from a project page — if the project has an Engineering Manager, the request shows up here while it waits.'
                : 'Nothing has reached this state yet.'
            }
          />
        </TableShell>
      ) : (
        <TableShell>
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Resource</Th>
                <Th>Placement</Th>
                <Th align="right">Allocation</Th>
                <Th>Requested by</Th>
                <Th>Status</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.resource.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">{r.resource.name}</p>
                          <p className="text-muted mt-0.5 truncate text-[12px]">
                            {r.resource.employeeCode}
                            {r.resource.designation ? ` · ${r.resource.designation}` : ''}
                          </p>
                        </div>
                        <StatusPill
                          status={r.resource.type}
                          label={r.resource.type === 'SH' ? 'Internal' : r.resource.serviceProvider?.name ?? 'External'}
                          dot={false}
                          animateChange={false}
                        />
                      </div>
                    </Td>
                    <Td>
                      <Link
                        to={`/projects/${r.project.id}`}
                        className="text-[13.5px] font-medium hover:underline"
                      >
                        {r.project.code}
                      </Link>
                      <p className="text-muted mt-0.5 text-[12px]">
                        {placement(r)}
                        {r.roleOnProject ? ` · ${r.roleOnProject}` : ''}
                      </p>
                    </Td>
                    <Td align="right" className="tnum text-[13.5px]">
                      {r.allocationPct}%
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={r.requestedBy.name} color={r.requestedBy.avatarColor} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px]">{r.requestedBy.name}</p>
                          <p className="text-muted mt-0.5 text-[12px]">{fmtRelative(r.createdAt)}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <StatusPill status={r.status} />
                      {r.decidedBy && (
                        <p className="text-muted mt-1 text-[12px]">
                          by {r.decidedBy.name} · {fmtDate(r.decidedAt)}
                        </p>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.canDecide && <ApprovalActions kind="assignment" id={r.id} />}
                        {r.canCancel && !r.canDecide && (
                          <Button size="sm" variant="ghost" onClick={() => setWithdrawing(r)}>
                            <Trash2 className="h-3.5 w-3.5" /> Withdraw
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </AnimatePresence>
            </tbody>
          </Table>

          {/* The reason and the decision note are the actual content of a
              request, so they get their own block rather than a tooltip. */}
          {rows.some((r) => r.reason || r.decisionNote) && (
            <div className="space-y-2.5 border-t px-4 py-3.5">
              {rows
                .filter((r) => r.reason || r.decisionNote)
                .map((r) => (
                  <div key={r.id} className="text-[13px] leading-relaxed">
                    <span className="font-medium">
                      {r.resource.name} → {r.project.code}
                    </span>
                    {r.reason && <span className="text-secondary"> — “{r.reason}”</span>}
                    {r.decisionNote && (
                      <span className="text-muted">
                        {' '}
                        · {r.status === 'REJECTED' ? 'Rejected' : 'Approved'}: “{r.decisionNote}”
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}

          <Pagination
            page={data!.page}
            pageCount={data!.pageCount}
            total={data!.total}
            pageSize={data!.pageSize}
            onPage={(p) => set({ page: p })}
          />
        </TableShell>
      )}

      <Modal
        open={!!withdrawing}
        onClose={() => setWithdrawing(null)}
        title="Withdraw this request?"
        description={
          withdrawing
            ? `${withdrawing.resource.name} won't be placed on ${withdrawing.project.code}, and it disappears from the Engineering Manager's queue. You can raise it again later.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWithdrawing(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={withdraw.isPending}
              onClick={() => withdrawing && withdraw.mutate(withdrawing.id)}
            >
              <Trash2 className="h-4 w-4" /> Withdraw
            </Button>
          </>
        }
      >
        <p className="text-secondary flex items-center gap-2 text-[13.5px]">
          <UserRoundPlus className="h-4 w-4 shrink-0" />
          {withdrawing ? `${placement(withdrawing)} · ${withdrawing.allocationPct}%` : ''}
        </p>
      </Modal>
    </>
  );
}