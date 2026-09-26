import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { FolderKanban, Plus, Users2, Layers, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { api, extractMessage, toastError, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useQueryState, clean } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Toolbar } from '@/components/ui/Toolbar';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/StatusPill';
import { AvatarStack } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Table';
import { fmtDate } from '@/lib/format';
import { itemVariants, listVariants } from '@/lib/motion';
import type { ClientRef, Project } from '@/lib/types';

export default function Projects() {
  const { state, set, reset } = useQueryState({ page: '1' });
  const [searchInput, setSearchInput] = useState(state.search ?? '');
  const search = useDebounced(searchInput, 300);
  const [createOpen, setCreateOpen] = useState(false);

  const params = clean({ page: state.page, pageSize: 24, search, status: state.status, clientId: state.clientId });

  const { data, isLoading } = useQuery({
    queryKey: ['projects', params],
    queryFn: async () => (await api.get<Paginated<Project>>('/projects', { params })).data,
    // Switching tab/filter/page changes the queryKey. Without this the table is
    // swapped for a skeleton every time; keeping the previous rows on screen
    // makes the change feel instant and stops the layout jumping.
    placeholderData: keepPreviousData,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['client-options'],
    queryFn: async () => (await api.get<ClientRef[]>('/clients/options')).data,
  });

  const activeCount = ['status', 'clientId'].filter((k) => state[k]).length;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project carries its own modules, teams and resources — independent of who manages it."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        }
      />

      <Toolbar
        search={searchInput}
        onSearch={(v) => { setSearchInput(v); set({ search: v || undefined }); }}
        searchPlaceholder="Search projects or clients…"
        activeCount={activeCount}
        onClear={() => { reset(); setSearchInput(''); }}
        filters={
          <>
            <Select value={state.status ?? ''} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>
              {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </Select>
            <Select value={state.clientId ?? ''} onChange={(e) => set({ clientId: e.target.value })}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create a project, then add modules, teams and resources to it."
            action={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New project</Button>}
          />
        </Card>
      ) : (
        <>
          <motion.div variants={listVariants} initial="initial" animate="animate" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {data.items.map((p) => <ProjectCard key={p.id} project={p} />)}
            </AnimatePresence>
          </motion.div>
          <div className="surface mt-4 rounded-[var(--radius-card)]">
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={(pg) => set({ page: pg })} />
          </div>
        </>
      )}

      <ProjectFormModal open={createOpen} onClose={() => setCreateOpen(false)} clients={clients} />
    </>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  return (
    <motion.div variants={itemVariants} layout>
      <Link to={`/projects/${p.id}`} className="block h-full">
        <motion.div
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="surface flex h-full flex-col rounded-[var(--radius-card)] p-4.5 transition-colors duration-150 hover:border-[color:var(--border-strong)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted font-mono text-[11.5px] font-medium">{p.code}</p>
              <h3 className="mt-1 truncate text-[15px] leading-tight font-semibold">{p.name}</h3>
              <p className="text-secondary mt-1 truncate text-[12.5px]">{p.client.name}</p>
            </div>
            <StatusPill status={p.status} dot={false} />
          </div>

          {p.description && (
            <p className="text-muted mt-3 line-clamp-2 text-[12.5px] leading-relaxed">{p.description}</p>
          )}

          <div className="text-secondary mt-4 grid grid-cols-3 gap-2 border-t pt-3.5 text-[12px]">
            <Metric icon={Layers} value={p._count?.modules ?? 0} label="module" />
            <Metric icon={Users2} value={p._count?.assignments ?? 0} label="person" />
            <Metric icon={ListChecks} value={p._count?.tasks ?? 0} label="task" />
          </div>

          <div className="mt-3.5 flex items-center justify-between gap-3">
            <AvatarStack people={p.managers.map((m) => ({ name: m.user.name, avatarColor: m.user.avatarColor }))} size="xs" />
            <span className="text-muted tnum text-[12px]">
              {p.headcount ?? 0} {p.headcount === 1 ? 'person' : 'people'}
            </span>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: any; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="text-muted h-3.5 w-3.5" />
      <span className="tnum font-medium">{value}</span>
      <span className="text-muted">{value === 1 ? label : `${label}s`}</span>
    </span>
  );
}

export function ProjectFormModal({
  open,
  onClose,
  clients,
  project,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientRef[];
  project?: Project | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const editing = !!project;

  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [status, setStatus] = useState(project?.status ?? 'PLANNING');
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? '');
  // Client is free-text-with-lookup: pick an id, or type a new name.
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState(project?.client.id ?? '');
  const [clientName, setClientName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (): Promise<any> => {
      const payload = {
        name: name.trim(),
        description: description || undefined,
        status,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        ...(clientMode === 'existing' ? { clientId } : { clientName: clientName.trim() }),
      };
      return editing ? api.patch(`/projects/${project!.id}`, payload) : api.post('/projects', payload);
    },
    onSuccess: ({ data }: any) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['project-options'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(editing ? 'Project updated' : 'Project created');
      onClose();
      if (!editing) navigate(`/projects/${data.id}`);
    },
    onError: (e) => setError(extractMessage(e)),
  });

  const valid = name.trim().length > 1 && (clientMode === 'existing' ? !!clientId : clientName.trim().length > 1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit project' : 'New project'}
      description={
        editing
          ? 'Teams and resources stay attached to the project itself.'
          : user?.role === 'PM' || user?.role === 'EM'
            ? "You'll be assigned as its manager automatically."
            : 'Assign managers and engineers from the project page once created.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {editing ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aviation Operations Platform" autoFocus />
        </Field>

        <Field label="Client" required className="sm:col-span-2" hint="Pick an existing client, or add a new one on the fly.">
          <div className="flex gap-2">
            <div className="flex shrink-0 rounded-lg bg-[color:var(--surface-sunken)] p-0.5">
              {(['existing', 'new'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setClientMode(m)}
                  className={
                    'relative rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ' +
                    (clientMode === m ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]')
                  }
                >
                  {clientMode === m && (
                    <motion.span
                      layoutId="client-mode"
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-0 rounded-[7px] bg-[color:var(--surface-card)] shadow-sm"
                    />
                  )}
                  <span className="relative">{m === 'existing' ? 'Existing' : 'New'}</span>
                </button>
              ))}
            </div>

            {clientMode === 'existing' ? (
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="New client name" />
            )}
          </div>
        </Field>

        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>

        <Field label="Description" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this project delivers." />
        </Field>

        {error && (
          <p className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 sm:col-span-2 dark:text-red-400">{error}</p>
        )}
      </div>
    </Modal>
  );
}
