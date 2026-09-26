import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ScrollText, ChevronDown } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Field, Input, Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill, type Tone } from '@/components/ui/StatusPill';
import { Pagination, Table, TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { EmptyState, TableSkeleton } from '@/components/ui/States';
import { fmtDateTime, fmtRelative, humanise } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AuditEntry } from '@/lib/types';

/** Colour follows the same meaning rule as everywhere else. */
function toneFor(action: string): Tone {
  if (action.includes('APPROVED')) return 'green';
  if (action.includes('REJECTED') || action.includes('DELETED')) return 'red';
  if (action.includes('SUBMITTED') || action.includes('PENDING')) return 'amber';
  if (action.includes('CREATED')) return 'blue';
  if (action.includes('STATUS_CHANGED')) return 'violet';
  return 'neutral';
}

export default function Audit() {
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = clean({
    page: state.page, pageSize: 30, search,
    action: state.action, entityType: state.entityType,
    from: state.from, to: state.to,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit', params],
    queryFn: async () => (await api.get<Paginated<AuditEntry>>('/audit', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: async () => (await api.get<string[]>('/audit/actions')).data,
  });

  const activeCount = ['action', 'entityType', 'from', 'to'].filter((k) => state[k]).length;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every task status change and every overtime or invoice decision, with who did it and what changed."
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search summary, actor or action…"
        activeCount={activeCount}
        onClear={() => { reset(); setSearchInput(''); }}
        filters={
          <>
            <Field label="Action">
              <Select value={state.action ?? ''} onChange={(e) => set({ action: e.target.value })}>
                <option value="">All actions</option>
                {actions.map((a) => <option key={a} value={a}>{humanise(a)}</option>)}
              </Select>
            </Field>
            <Field label="Entity">
              <Select value={state.entityType ?? ''} onChange={(e) => set({ entityType: e.target.value })}>
                <option value="">All entities</option>
                {['Task', 'OvertimeRequest', 'LeaveRequest', 'AssignmentRequest', 'Invoice', 'Resource', 'Project', 'Module', 'User'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="From"><Input type="date" value={state.from ?? ''} onChange={(e) => set({ from: e.target.value })} /></Field>
            <Field label="To"><Input type="date" value={state.to ?? ''} onChange={(e) => set({ to: e.target.value })} /></Field>
          </>
        }
      />

      {isLoading ? (
        <TableSkeleton cols={4} rows={10} />
      ) : !data?.items.length ? (
        <TableShell>
          <EmptyState icon={ScrollText} title="No audit entries" description="Actions taken in the system will appear here." />
        </TableShell>
      ) : (
        <TableShell>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Summary</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((e) => {
                  const open = expanded === e.id;
                  const hasDetail = !!e.before || !!e.after;
                  return (
                    <Fragment key={e.id}>
                      <Tr onClick={hasDetail ? () => setExpanded(open ? null : e.id) : undefined}>
                        <Td>
                          <p className="text-[13px]">{fmtRelative(e.createdAt)}</p>
                          <p className="text-muted mt-0.5 text-[11.5px]">{fmtDateTime(e.createdAt)}</p>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={e.actorName} color={e.actor?.avatarColor} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium">{e.actorName}</p>
                              {e.actor?.role && <p className="text-muted text-[11.5px]">{e.actor.role}</p>}
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <StatusPill tone={toneFor(e.action)} label={humanise(e.action)} dot={false} animateChange={false} />
                          <p className="text-muted mt-1 text-[11px]">{e.entityType}</p>
                        </Td>
                        <Td>
                          <p className="max-w-[380px] text-[13px] leading-snug">{e.summary}</p>
                        </Td>
                        <Td align="right">
                          {hasDetail && (
                            <ChevronDown className={cn('text-muted ml-auto h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
                          )}
                        </Td>
                      </Tr>

                      {open && hasDetail && (
                        <tr>
                          <td colSpan={5} className="border-b bg-[color:var(--surface-sunken)] p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
                                <DiffBlock title="Before" data={e.before} tone="red" />
                                <DiffBlock title="After" data={e.after} tone="green" />
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </Table>
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={(p) => set({ page: p })} />
        </TableShell>
      )}
    </>
  );
}

function DiffBlock({ title, data, tone }: { title: string; data?: Record<string, unknown> | null; tone: 'red' | 'green' }) {
  return (
    <div>
      <p className="text-muted mb-2 text-[11px] font-semibold tracking-wider uppercase">{title}</p>
      {!data || Object.keys(data).length === 0 ? (
        <p className="text-muted text-[12.5px]">—</p>
      ) : (
        <dl
          className={cn(
            'space-y-1.5 rounded-lg border-l-2 py-1 pl-3',
            tone === 'red' ? 'border-red-400/50' : 'border-emerald-400/50',
          )}
        >
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[12.5px]">
              <dt className="text-muted shrink-0">{humanise(k)}:</dt>
              <dd className="min-w-0 font-medium break-words">
                {Array.isArray(v) ? v.join(', ') : v === null ? '—' : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
