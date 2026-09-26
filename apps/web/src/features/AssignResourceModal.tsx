import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api, toastError } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { invalidatePlacements } from '@/lib/invalidate';
import type { Module, PickableResource } from '@/lib/types';

const INTERNAL = 'SH';

/**
 * Assign someone to a project from the project page itself — the prerequisite
 * Only lists people not already on the project.
 *
 * For a PM this doesn't assign anyone: it raises a request for the project's
 * Engineering Manager. The modal says so up front rather than letting someone
 * hit "Assign" and discover afterwards that nothing happened yet — `needsApproval`
 * mirrors the server rule (Admin, or an EM on this project, assigns directly).
 */
export function AssignResourceModal({
  open,
  onClose,
  projectId,
  projectCode,
  modules = [],
  presetModuleId,
  presetSubModuleId,
  needsApproval = false,
  approverNames = [],
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectCode: string;
  modules?: Module[];
  presetModuleId?: string;
  presetSubModuleId?: string;
  /** True when this person's assignment has to be signed off before it counts. */
  needsApproval?: boolean;
  /** Who will decide it — named so the requester knows who they're waiting on. */
  approverNames?: string[];
}) {
  const qc = useQueryClient();
  const [source, setSource] = useState(INTERNAL);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [subModuleId, setSubModuleId] = useState('');
  const [allocationPct, setAllocationPct] = useState('100');
  const [roleOnProject, setRoleOnProject] = useState('');
  const [reason, setReason] = useState('');

  // Keyed on the placement, not just the project: someone already on the
  // project at large is a valid candidate for a specific module.
  const { data: available = [] } = useQuery({
    queryKey: ['project-available', projectId, moduleId || null, subModuleId || null],
    queryFn: async () =>
      (
        await api.get<PickableResource[]>(`/projects/${projectId}/available-resources`, {
          params: { moduleId: moduleId || undefined, subModuleId: subModuleId || undefined },
        })
      ).data,
    enabled: open,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!open) return;
    setPicked([]); setSearch(''); setSource(INTERNAL); setReason(''); setRoleOnProject('');
    setModuleId(presetModuleId ?? '');
    setSubModuleId(presetSubModuleId ?? '');
    setAllocationPct('100');
  }, [open, presetModuleId, presetSubModuleId]);

  const serviceProviders = useMemo(
    () => [...new Map(available.filter((r) => r.serviceProvider).map((r) => [r.serviceProvider!.id, r.serviceProvider!])).values()],
    [available],
  );

  const shown = available.filter((r) => {
    const bySource = source === INTERNAL ? r.type === 'SH' : r.serviceProvider?.id === source;
    const q = search.trim().toLowerCase();
    const byText =
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.designation ?? '').toLowerCase().includes(q) ||
      (r.employeeCode ?? '').toLowerCase().includes(q);
    return bySource && byText;
  });

  const module = modules.find((m) => m.id === moduleId);

  const assign = useMutation({
    mutationFn: async () => {
      // One call per person keeps the server-side validation per placement. The
      // server tells us which way each one went rather than us assuming.
      let queued = 0;
      for (const resourceId of picked) {
        const { data } = await api.post<{ pending: boolean }>(
          `/resources/${resourceId}/assignments`,
          {
            projectId,
            moduleId: moduleId || undefined,
            subModuleId: subModuleId || undefined,
            allocationPct: Number(allocationPct) || 100,
            roleOnProject: roleOnProject.trim() || undefined,
            reason: reason.trim() || undefined,
          },
        );
        if (data?.pending) queued++;
      }
      return { queued, total: picked.length };
    },
    onSuccess: ({ queued, total }) => {
      invalidatePlacements(qc);
      const noun = `resource${total === 1 ? '' : 's'}`;
      toast.success(
        queued
          ? `${queued} ${noun} sent for approval — ${total === 1 ? 'it joins' : 'they join'} ${projectCode} once signed off`
          : `${total} ${noun} assigned to ${projectCode}`,
      );
      onClose();
    },
    onError: toastError,
  });

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={needsApproval ? `Request resources for ${projectCode}` : `Assign resources to ${projectCode}`}
      description={
        needsApproval
          ? 'Pick anyone not already on the project. The Engineering Manager signs off before they join — until then they are not on the project.'
          : 'Pick anyone not already on the project. This records who is working on it, on what, and for how much of their time.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!picked.length}
            loading={assign.isPending}
            onClick={() => assign.mutate()}
          >
            {needsApproval ? <ShieldCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {needsApproval ? 'Request' : 'Assign'} {picked.length ? `${picked.length} ` : ''}
            resource{picked.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {needsApproval && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/[0.07] px-3.5 py-3 ring-1 ring-inset ring-amber-500/20">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[13px] leading-relaxed">
              <span className="font-medium">Needs approval.</span>{' '}
              {approverNames.length
                ? `${approverNames.join(' or ')} decides this one.`
                : 'An Admin decides this one — the project has no Engineering Manager yet.'}{' '}
              <span className="text-secondary">
                You can track it under {'"'}My Requests{'"'}.
              </span>
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Source">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value={INTERNAL}>Internal</option>
              {serviceProviders.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </Select>
          </Field>
          <Field
            label="Module"
            hint="Whole project = works across it. A module scopes them to that part."
          >
            <Select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSubModuleId(''); }}>
              <option value="">Whole project</option>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Sub-module">
            <Select
              value={subModuleId}
              onChange={(e) => setSubModuleId(e.target.value)}
              disabled={!module?.subModules.length}
            >
              <option value="">{module?.subModules.length ? 'Whole module' : '—'}</option>
              {module?.subModules.map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
            </Select>
          </Field>
        </div>

        <div className="relative">
          <Search className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code or designation…"
            className="pl-9"
          />
        </div>

        {!shown.length ? (
          <EmptyState
            icon={UserPlus}
            title={available.length ? 'Nobody matches' : 'Nobody left to place here'}
            description={
              available.length
                ? 'Try a different source or search.'
                : `Everyone in your scope already holds this exact placement on ${projectCode}. Pick a different module to place them there as well.`
            }
          />
        ) : (
          <ul className="max-h-[300px] space-y-1.5 overflow-y-auto">
            {shown.map((r) => {
              const on = picked.includes(r.id);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => toggle(r.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
                      'transition-colors duration-150 hover:bg-[color:var(--surface-hover)]',
                      on && 'border-brand-500/45 bg-brand-500/[0.055]',
                    )}
                  >
                    <Avatar name={r.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{r.name}</p>
                      <p className="text-muted mt-0.5 truncate text-[12px]">
                        {r.employeeCode}
                        {r.designation ? ` · ${r.designation}` : ''}
                      </p>
                      {/* Already here on a different scope — context, not a blocker. */}
                      {!!r.existingPlacements?.length && (
                        <p className="mt-0.5 truncate text-[11.5px] text-amber-700 dark:text-amber-400">
                          Already on {r.existingPlacements.map((pl) => pl.label).join(', ')}
                          {r.totalAllocation ? ` · ${r.totalAllocation}% allocated` : ''}
                        </p>
                      )}
                    </div>
                    <StatusPill
                      status={r.type}
                      label={r.type === 'SH' ? 'Internal' : r.serviceProvider?.name ?? 'External'}
                      dot={false}
                      animateChange={false}
                    />
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150',
                        on ? 'bg-brand-600 border-brand-600 text-white' : 'border-[color:var(--border-strong)]',
                      )}
                    >
                      {on && '✓'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Role on this project"
            hint="Optional. What they do here — separate from their company-wide designation."
          >
            <Input
              value={roleOnProject}
              onChange={(e) => setRoleOnProject(e.target.value)}
              placeholder="e.g. Tech Lead"
              maxLength={120}
            />
          </Field>
          <Field label="Allocation" hint="Applied to everyone selected.">
            <Input type="number" min={1} max={100} value={allocationPct} onChange={(e) => setAllocationPct(e.target.value)} />
          </Field>
        </div>

        {needsApproval && (
          <Field
            label="Why do you need them?"
            hint="Optional, but it's what the Engineering Manager reads before deciding."
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Alerting has no QA coverage and goes to UAT in three weeks."
              rows={2}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
