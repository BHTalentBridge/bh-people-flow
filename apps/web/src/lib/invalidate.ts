import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything that changes when a **placement** changes — created, approved or
 * removed.
 *
 * Placements feed far more screens than the one you're looking at: the project
 * roster and headcount, the picker's candidate list, module drill-downs, the
 * resource's own profile, the service provider's project codes, task assignee
 * options, and the leave/assignment scoping that derives from "who is on which
 * project". Every call site used to hand-maintain its own list of keys, and they
 * had drifted — `project-resources`, the query behind the Assigned resources
 * tab, was invalidated in exactly one of the five places that change a
 * placement, so the tab stayed stale until a page refresh.
 *
 * One list, called from every site, so the next new screen can't be forgotten.
 */
const PLACEMENT_KEYS = [
  // Project surfaces
  'project',
  'project-resources',
  'project-available',
  'projects',
  'module-detail',
  // Resource surfaces
  'resource',
  'resources',
  'assignee-options',
  // Approval queue
  'assignment-requests',
  'assignment-pending-count',
  // Service providers list a resource's project codes
  'serviceProviders',
  'serviceProvider-options',
  // Leave visibility is scoped by which projects someone is placed on
  'leave',
  'leave-summary',
  'leave-pending-count',
  // Cross-cutting
  'dashboard',
  'audit',
  'notifications',
] as const;

export function invalidatePlacements(qc: QueryClient) {
  for (const key of PLACEMENT_KEYS) qc.invalidateQueries({ queryKey: [key] });
}
