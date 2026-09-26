import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { pageVariants } from '@/lib/motion';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { canManage, user } = useAuth();

  // Drives the amber count beside "Attendance" in the sidebar.
  const { data: pendingOt } = useQuery({
    queryKey: ['ot-pending-count'],
    queryFn: async () => (await api.get<{ count: number }>('/attendance/overtime/pending-count')).data.count,
    enabled: canManage,
    refetchInterval: 60_000,
  });

  // Assignment requests: for an EM/Admin this counts what they must decide, for
  // a PM what they're still waiting on. Both want to see it, so both poll.
  const { data: pendingAssignments } = useQuery({
    queryKey: ['assignment-pending-count'],
    queryFn: async () =>
      (await api.get<{ count: number }>('/assignment-requests/pending-count')).data.count,
    enabled: canManage,
    refetchInterval: 60_000,
  });

  // Leave: an EM/Admin counts what they must decide, a resource what they're
  // waiting on. A PM can't decide any, so their nav entry carries no badge.
  const { data: pendingLeave } = useQuery({
    queryKey: ['leave-pending-count'],
    queryFn: async () => (await api.get<{ count: number }>('/leave/pending-count')).data.count,
    enabled: !!user && user.role !== 'PM',
    refetchInterval: 60_000,
  });

  // Invoice approvals are Admin-only, so only Admins poll for the queue size.
  const { data: pendingInvoices } = useQuery({
    queryKey: ['invoice-pending-count'],
    queryFn: async () => (await api.get<{ count: number }>('/invoices/pending-count')).data.count,
    enabled: user?.canApproveInvoices === true,
    refetchInterval: 60_000,
  });

  return (
    <div className="min-h-dvh">
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        badges={{
          approvals: pendingOt ?? 0,
          invoices: pendingInvoices ?? 0,
          assignments: pendingAssignments ?? 0,
          leave: pendingLeave ?? 0,
        }}
      />

      <div className="lg:pl-[248px]">
        <Topbar onMenu={() => setNavOpen(true)} />

        <main className="mx-auto w-full max-w-[1400px] px-4 py-5 lg:px-6 lg:py-7">
          {/*
            Deliberately NOT wrapped in AnimatePresence.

            With `mode="wait"` the incoming page can't mount until the outgoing
            one finishes exiting — so clicking a second nav item mid-transition
            left the new page mounted at its `initial` variant (opacity 0) with
            `animate` never firing. The content was in the DOM but invisible, and
            every later route inherited the stuck state. It also meant every
            navigation paid for a fade-out before rendering anything.

            Keying a plain motion.div on the pathname remounts and fades in
            immediately, so the interrupt has nothing to race against.
          */}
          <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate">
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
