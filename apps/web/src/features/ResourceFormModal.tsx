import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { api, extractMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import type { ServiceProviderRef, ResourceFunction, ResourceRow, ResourceType, Role } from '@/lib/types';
import { FUNCTION_LABEL, FUNCTIONS } from '@/lib/format';
import { useAuth } from '@/lib/auth';

const EMPTY = {
  name: '', email: '', phone: '', designation: '', jobFunction: '' as ResourceFunction | '', location: '',
  type: 'SH' as ResourceType, joinedAt: '', notes: '', internalSeniority: '',
  password: '', status: 'ACTIVE', role: 'RESOURCE' as Role,
  // Service Provider is free-text-with-lookup, same pattern as the client field.
  serviceProviderId: '', serviceProviderName: '', serviceProviderMode: 'existing' as 'existing' | 'new',
};

export function ResourceFormModal({
  open,
  onClose,
  resource,
}: {
  open: boolean;
  onClose: () => void;
  resource?: ResourceRow | null;
}) {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  // Only an Admin hands out authority. A PM never sees this control, so a PM can
  // only ever add plain resources.
  const canSetRole = me?.role === 'ADMIN';
  // A PM sets the initial password when onboarding someone; changing it later is
  // an Admin action.
  const canResetPassword = me?.role === 'ADMIN';
  const editing = !!resource;

  const { data: serviceProviders = [] } = useQuery({
    queryKey: ['serviceProvider-options'],
    queryFn: async () => (await api.get<ServiceProviderRef[]>('/service-providers/options')).data,
    enabled: open,
  });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      resource
        ? {
            name: resource.name,
            email: resource.email,
            phone: resource.phone ?? '',
            designation: resource.designation ?? '',
            jobFunction: resource.jobFunction ?? ('' as const),
            location: resource.location ?? '',
            type: resource.type,
            serviceProviderId: resource.serviceProvider?.id ?? '',
            serviceProviderName: '',
            serviceProviderMode: 'existing' as const,
            internalSeniority: resource.internalSeniority ?? '',
            joinedAt: resource.joinedAt ? resource.joinedAt.slice(0, 10) : '',
            notes: resource.notes ?? '',
            password: '',
            status: resource.status,
            role: (resource.user?.role ?? 'RESOURCE') as Role,
          }
        : EMPTY,
    );
  }, [open, resource]);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone || undefined,
        designation: form.designation || undefined,
        jobFunction: form.jobFunction || (editing ? null : undefined),
        location: form.location || undefined,
        type: form.type,
        ...(form.type === 'EXTERNAL'
          ? {
              ...(form.serviceProviderMode === 'existing'
                ? { serviceProviderId: form.serviceProviderId }
                : { serviceProviderName: form.serviceProviderName.trim() }),
              internalSeniority: form.internalSeniority.trim() || undefined,
            }
          : {}),
        joinedAt: form.joinedAt ? new Date(form.joinedAt).toISOString() : undefined,
        notes: form.notes || undefined,
      };
      if (form.password && (!editing || canResetPassword)) payload.password = form.password;
      if (canSetRole) payload.role = form.role;
      if (editing) {
        payload.status = form.status;
        return api.patch(`/resources/${resource!.id}`, payload);
      }
      return api.post('/resources', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['resource'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['serviceProvider-options'] });
      qc.invalidateQueries({ queryKey: ['serviceProviders'] });
      toast.success(editing ? 'Resource updated' : 'Resource added');
      onClose();
    },
    onError: (e) => setError(extractMessage(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${resource!.name}` : canSetRole ? 'Add a person' : 'Add a resource'}
      description={
        editing
          ? 'Profile changes sync to their login account.'
          : 'A login account is created automatically so they can check in and track tasks.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate()}
            disabled={
              !form.name.trim() ||
              !form.email.trim() ||
              (form.type === 'EXTERNAL' &&
                (form.serviceProviderMode === 'existing' ? !form.serviceProviderId : form.serviceProviderName.trim().length < 2))
            }
          >
            {editing ? 'Save changes' : canSetRole ? 'Add person' : 'Add resource'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Farhan Zaki" autoFocus />
        </Field>

        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@company.com" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+65 8000 0000" />
        </Field>

        {canSetRole && (
          <Field
            label="Access level"
            required
            className="sm:col-span-2"
            hint="Authority in the system. PM and EM run the same projects — the EM is the one who signs off which resources go on them."
          >
            <Select value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
              <option value="RESOURCE">Resource — own attendance, tasks and invoices</option>
              <option value="PM">Project Manager — runs assigned projects, requests resources for them</option>
              <option value="EM">Engineering Manager — runs assigned projects, approves resources on them</option>
              <option value="ADMIN">Administrator — unrestricted, approves invoices</option>
            </Select>
          </Field>
        )}

        <Field label="Resource type" required>
          <Select value={form.type} onChange={(e) => set({ type: e.target.value as ResourceType })}>
            <option value="SH">Internal — Steel Horizon</option>
            <option value="EXTERNAL">External — supplied by a service provider</option>
          </Select>
        </Field>

        {/* The serviceProvider company only matters for External, so it appears on demand. */}
        <AnimatePresence initial={false} mode="popLayout">
          {form.type === 'EXTERNAL' ? (
            <motion.div
              key="company"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Field
                label="Service provider"
                required
                hint="The company supplying this resource. Pick one, or add a new service provider on the fly."
              >
                <div className="flex gap-2">
                  <div className="flex shrink-0 rounded-lg bg-[color:var(--surface-sunken)] p-0.5">
                    {(['existing', 'new'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set({ serviceProviderMode: m })}
                        className={
                          'relative rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ' +
                          (form.serviceProviderMode === m
                            ? 'text-[color:var(--text-primary)]'
                            : 'text-[color:var(--text-muted)]')
                        }
                      >
                        {form.serviceProviderMode === m && (
                          <motion.span
                            layoutId="serviceProvider-mode"
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute inset-0 rounded-[7px] bg-[color:var(--surface-card)] shadow-sm"
                          />
                        )}
                        <span className="relative">{m === 'existing' ? 'Existing' : 'New'}</span>
                      </button>
                    ))}
                  </div>

                  {form.serviceProviderMode === 'existing' ? (
                    <Select value={form.serviceProviderId} onChange={(e) => set({ serviceProviderId: e.target.value })}>
                      <option value="">Select a service provider…</option>
                      {serviceProviders.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                          {pt._count ? ` (${pt._count.resources})` : ''}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      value={form.serviceProviderName}
                      onChange={(e) => set({ serviceProviderName: e.target.value })}
                      placeholder="New service provider name"
                    />
                  )}
                </div>
              </Field>

              <Field
                label="Internal seniority"
                className="mt-4"
                hint="How we grade them, regardless of the title their service provider gives them."
              >
                <Input
                  value={form.internalSeniority}
                  onChange={(e) => set({ internalSeniority: e.target.value })}
                  placeholder="e.g. Senior, Mid-level, Junior"
                />
              </Field>
            </motion.div>
          ) : (
            <Field key="invoicing" label="Invoicing">
              <div className="flex h-9.5 items-center rounded-lg bg-[color:var(--surface-sunken)] px-3 text-[13px] text-[color:var(--text-secondary)]">
                Enabled — internal people can raise invoices
              </div>
            </Field>
          )}
        </AnimatePresence>

        <Field label="Designation" hint="Company-wide title. The role they play on a specific project is set when you place them on it.">
          <Input value={form.designation} onChange={(e) => set({ designation: e.target.value })} placeholder="e.g. Senior Backend Engineer" />
        </Field>
        {/* The roster the client reads groups people by function, so this is the
            column that has to be filled in — the designation above is free text
            and cannot be grouped on. */}
        <Field label="Function" hint="Roster grouping. Appears on the timesheet summary sheet.">
          <Select value={form.jobFunction} onChange={(e) => set({ jobFunction: e.target.value as ResourceFunction | '' })}>
            <option value="">Not set</option>
            {FUNCTIONS.map((f) => <option key={f} value={f}>{FUNCTION_LABEL[f]}</option>)}
          </Select>
        </Field>

        <Field label="Location">
          <Input value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Singapore" />
        </Field>

        <Field label="Joined on">
          <Input type="date" value={form.joinedAt} onChange={(e) => set({ joinedAt: e.target.value })} />
        </Field>

        {editing ? (
          <Field label="Account status">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive — sign-in disabled</option>
            </Select>
          </Field>
        ) : (
          <Field label="Initial password" hint="Leave blank to use ChangeMe123!">
            <Input type="text" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="Min. 8 characters" />
          </Field>
        )}

        {/* Admin-only: resetting an existing password is account recovery, not
            profile maintenance. Mirrors the guard in ResourcesService.update, so
            a PM is never offered a field the server would refuse. */}
        {editing && canResetPassword && (
          <Field label="Reset password" hint="Leave blank to keep the current one." className="sm:col-span-2">
            <Input type="text" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="New password (min. 8 characters)" />
          </Field>
        )}

        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the delivery team should know." />
        </Field>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg bg-red-500/8 px-3 py-2.5 text-[13px] text-red-600 sm:col-span-2 dark:text-red-400"
          >
            {error}
          </motion.p>
        )}
      </div>
    </Modal>
  );
}
