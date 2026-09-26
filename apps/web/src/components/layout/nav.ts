import {
  LayoutDashboard, FolderKanban, Building2, Handshake, UserRound, CalendarClock,
  ListChecks, ReceiptText, ScrollText, ClipboardCheck, CalendarOff,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Key into the badge map for pending-count dots. */
  badge?: 'approvals' | 'invoices' | 'assignments' | 'leave';
}

/**
 * Each role gets a nav tailored to what it actually does — Admin/PM/EM manage the
 * org, a Resource sees only their own records.
 *
 * PM and EM carry the same project-facing nav: they run the same projects, they
 * just sit on opposite sides of the assignment approval.
 */
export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'PM', 'EM', 'RESOURCE'] },
  { to: '/projects', label: 'Projects', icon: FolderKanban, roles: ['ADMIN', 'PM', 'EM'] },
  { to: '/clients', label: 'Clients', icon: Building2, roles: ['ADMIN'] },
  { to: '/resources', label: 'Resources', icon: UserRound, roles: ['ADMIN', 'PM', 'EM'] },
  // An EM/Admin decides these; a PM watches their own, so the label differs.
  { to: '/assignment-requests', label: 'Assignments', icon: ClipboardCheck, roles: ['ADMIN', 'EM'], badge: 'assignments' },
  { to: '/assignment-requests', label: 'My Requests', icon: ClipboardCheck, roles: ['PM'], badge: 'assignments' },
  { to: '/service-providers', label: 'Service Providers', icon: Handshake, roles: ['ADMIN'] },
  { to: '/attendance', label: 'Attendance', icon: CalendarClock, roles: ['ADMIN', 'PM', 'EM'], badge: 'approvals' },
  // An EM/Admin decides leave. A PM sees the same screen read-only, because who
  // is away is planning information even when it isn't their decision.
  { to: '/leave', label: 'Leave', icon: CalendarOff, roles: ['ADMIN', 'EM'], badge: 'leave' },
  { to: '/leave', label: 'Leave', icon: CalendarOff, roles: ['PM'] },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, roles: ['ADMIN', 'PM', 'EM'] },
  // Admin sees the whole queue; a PM sees only their own, so the label differs.
  { to: '/invoices', label: 'Invoices', icon: ReceiptText, roles: ['ADMIN'], badge: 'invoices' },
  { to: '/invoices', label: 'My Invoices', icon: ReceiptText, roles: ['PM', 'EM'] },
  { to: '/audit', label: 'Audit log', icon: ScrollText, roles: ['ADMIN', 'PM', 'EM'] },

  // Resource-facing equivalents.
  { to: '/my-projects', label: 'My Projects', icon: FolderKanban, roles: ['RESOURCE'] },
  { to: '/my-attendance', label: 'My Attendance', icon: CalendarClock, roles: ['RESOURCE'] },
  { to: '/my-tasks', label: 'My Tasks', icon: ListChecks, roles: ['RESOURCE'] },
  { to: '/my-leave', label: 'My Leave', icon: CalendarOff, roles: ['RESOURCE'], badge: 'leave' },
  { to: '/my-invoices', label: 'My Invoices', icon: ReceiptText, roles: ['RESOURCE'] },
];

export function navFor(
  role: Role,
  opts: { canInvoice: boolean; canApproveInvoices: boolean },
) {
  return NAV.filter((item) => {
    if (!item.roles.includes(role)) return false;
    // Any invoicing entry is hidden from someone who can neither raise nor decide
    // one — an external resource, and equally an external PM.
    const isInvoiceItem = item.to === '/invoices' || item.to === '/my-invoices';
    if (isInvoiceItem && !opts.canInvoice && !opts.canApproveInvoices) return false;
    return true;
  });
}
