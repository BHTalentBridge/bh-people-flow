export type Role = 'ADMIN' | 'PM' | 'EM' | 'RESOURCE';
export type ResourceType = 'SH' | 'EXTERNAL';
export type ResourceStatus = 'ACTIVE' | 'INACTIVE';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
/** How bad the problem is — a separate axis from priority, which is the response. */
export type TaskSeverity = 'S1' | 'S2' | 'S3' | 'S4';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type LeaveType = 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID' | 'OTHER';
/** Roster bucket a person belongs to. `designation` stays the specific title. */
export type ResourceFunction =
  | 'DEVELOPER' | 'SQA' | 'TEAM_LEAD' | 'DESIGNER' | 'DEVOPS' | 'BUSINESS_ANALYST' | 'OTHER';
export type InvoiceStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type Currency = 'MYR' | 'PKR';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  avatarColor?: string | null;
  resourceId: string | null;
  resourceType: ResourceType | null;
  company: string | null;
  canInvoice: boolean;
  /** Only Admins decide invoices; everyone else submits their own. */
  canApproveInvoices: boolean;
  /** Engineering Managers (and Admins) decide resource assignments. */
  canApproveAssignments: boolean;
  /** Admins raise invoices for other people, never for themselves. */
  canRaiseForOthers: boolean;
  /** Admins oversee attendance rather than record it. */
  canCheckIn: boolean;
}

export interface Payee {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeCode?: string | null;
  designation?: string | null;
}

export interface UserRef {
  id: string;
  name: string;
  email?: string;
  role?: Role;
  avatarColor?: string | null;
  /** Partial by design — different endpoints project different fields of it. */
  resource?: { id?: string; type?: ResourceType; serviceProvider?: { id?: string; name: string } | null; designation?: string | null; employeeCode?: string } | null;
}

export interface ClientRef { id: string; name: string; _count?: { projects: number } }
export interface ServiceProviderRef { id: string; name: string; _count?: { resources: number } }

export interface ServiceProvider {
  id: string;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  _count?: { resources: number };
  activeResources?: number;
  projectCodes?: string[];
  resources?: ResourceRow[];
}

export interface Client {
  id: string;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: { projects: number };
  projects?: {
    id: string; name: string; code: string; status: ProjectStatus;
    startDate?: string | null;
    managers?: { user: UserRef }[];
    _count?: { tasks: number };
  }[];
}

export interface SubModule { id: string; name: string; description?: string | null; _count?: { assignments: number; tasks: number } }
export interface Module {
  id: string; name: string; description?: string | null;
  subModules: SubModule[];
  _count?: { assignments: number; tasks: number };
}

export interface ResourceRow {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone?: string | null;
  designation?: string | null;
  /** Roster bucket, set on the resource form. Optional — older records have none. */
  jobFunction?: ResourceFunction | null;
  location?: string | null;
  type: ResourceType;
  serviceProviderId?: string | null;
  serviceProvider?: { id: string; name: string; contactName?: string | null; contactEmail?: string | null } | null;
  /** Seniority SH assigns to an external resource. Null for internal people. */
  internalSeniority?: string | null;
  status: ResourceStatus;
  joinedAt?: string | null;
  notes?: string | null;
  userId?: string | null;
  createdById?: string | null;
  createdBy?: UserRef | null;
  user?: {
    id: string; email?: string; isActive: boolean; role?: Role;
    managedProjects?: { project: { id: string; code: string } }[];
  } | null;
  assignments?: Assignment[];
  _count?: { assignments: number; invoices: number };
}

export interface Assignment {
  id: string;
  projectId: string;
  moduleId?: string | null;
  subModuleId?: string | null;
  /** Title held on this project, as opposed to the company-wide designation. */
  roleOnProject?: string | null;
  allocationPct: number;
  project: { id: string; name: string; code: string; status?: ProjectStatus; client?: { name: string } };
  module?: { id: string; name: string } | null;
  subModule?: { id: string; name: string } | null;
  resource?: ResourceRow;
}


export interface Project {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  client: ClientRef;
  managers: { assignedAt?: string; user: UserRef }[];
  /** Engineering Managers — who signs off this project's resource assignments. */
  engineers?: { assignedAt?: string; user: UserRef }[];
  /** Placements still waiting on an EM. Not on the roster until approved. */
  requests?: AssignmentRequest[];
  /** Server's answer for the current caller — never re-derived in the UI. */
  needsAssignmentApproval?: boolean;
  approverNames?: string[];
  modules?: Module[];
  assignments?: Assignment[];
  headcount?: number;
  resourceMix?: { internal: number; external: number };
  _count?: { modules: number; assignments: number; tasks: number };
}


/** Compact resource shape returned by the assign picker. */
export interface PickableResource {
  id: string;
  name: string;
  email?: string;
  employeeCode?: string;
  designation?: string | null;
  internalSeniority?: string | null;
  type: ResourceType;
  serviceProvider?: { id: string; name: string } | null;
  /** What they already hold on the project being assigned to, if anything. */
  existingPlacements?: { id: string; label: string; allocationPct: number; roleOnProject?: string | null }[];
  totalAllocation?: number;
}

/** One person on a project, carrying every placement they hold there. */
export interface ProjectResource {
  resource: {
    id: string; name: string; email?: string; employeeCode?: string;
    designation?: string | null; type: ResourceType; status: ResourceStatus;
    userId?: string | null;
    serviceProvider?: { id: string; name: string } | null;
  };
  assignments: {
    id: string; allocationPct: number; roleOnProject?: string | null;
    startDate?: string | null; endDate?: string | null;
    module?: { id: string; name: string } | null;
    subModule?: { id: string; name: string } | null;
  }[];
  totalAllocation: number;
  tasks: { total: number; open: number; overdue: number };
}

/**
 * A resource's own read-only view of a project they're placed on: their
 * placements, and the colleagues sharing each module. Intentionally thinner
 * than `Project` — no managers, no pending requests, no headcount.
 */
export interface MyProject {
  project: {
    id: string; code: string; name: string; description?: string | null;
    status: ProjectStatus; startDate?: string | null; endDate?: string | null;
    client: { id: string; name: string };
  };
  myPlacements: {
    id: string; roleOnProject?: string | null; allocationPct: number;
    startDate?: string | null; endDate?: string | null;
    module?: { id: string; name: string; description?: string | null } | null;
    subModule?: { id: string; name: string } | null;
  }[];
  totalAllocation: number;
  scopes: {
    kind: 'MODULE' | 'PROJECT';
    module?: { id: string; name: string; description?: string | null } | null;
    subModules: { id: string; name: string }[];
    members: MyProjectMember[];
  }[];
  /** Placed across the whole project rather than a module — context, not peers. */
  alsoOnProject: MyProjectMember[];
}

export interface MyProjectMember {
  resourceId: string;
  name: string;
  designation?: string | null;
  roleOnProject?: string | null;
  type: ResourceType;
  serviceProvider?: { id: string; name: string } | null;
  avatarColor?: string | null;
  scopeLabel: string;
  isMe: boolean;
}

export interface ModuleDetail {
  id: string;
  name: string;
  description?: string | null;
  project?: { id: string; name: string; code: string };
  module?: { id: string; name: string; project?: { id: string; name: string; code: string } };
  subModules?: { id: string; name: string; _count?: { assignments: number; tasks: number } }[];
  assignments: {
    id: string; allocationPct: number; roleOnProject?: string | null;
    resource: PickableResource & { status: ResourceStatus };
    subModule?: { id: string; name: string } | null;
  }[];
  /**
   * On the project (or parent module) but *not* narrowed to this one. Kept
   * separate from `assignments` because they genuinely aren't scoped here — the
   * module page just shouldn't pretend the project is empty.
   */
  broaderAssignments?: {
    id: string; allocationPct: number; roleOnProject?: string | null;
    scope: 'PROJECT' | 'MODULE';
    resource: PickableResource & { status: ResourceStatus };
    module?: { id: string; name: string } | null;
    subModule?: { id: string; name: string } | null;
  }[];
  tasks: {
    id: string; title: string; status: TaskStatus; priority: TaskPriority;
    dueDate?: string | null; ticketId?: string | null; assignee: UserRef;
  }[];
  taskBreakdown: Record<TaskStatus, number>;
}

/**
 * A PM's ask to place someone on a project, waiting on an Engineering Manager.
 * Until it is APPROVED there is no assignment — this is not a pending edit to
 * something that already exists, it's a placement that does not exist yet.
 */
export interface AssignmentRequest {
  id: string;
  status: ApprovalStatus;
  roleOnProject?: string | null;
  allocationPct: number;
  startDate?: string | null;
  endDate?: string | null;
  reason?: string | null;
  resource: PickableResource & { id: string };
  project: { id: string; name: string; code: string; client?: { name: string } };
  module?: { id: string; name: string } | null;
  subModule?: { id: string; name: string } | null;
  requestedBy: UserRef;
  decidedBy?: UserRef | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
  /** Server's answer to "can I act on this?", so the UI never offers a dead button. */
  canDecide?: boolean;
  canCancel?: boolean;
}

/**
 * Time off booked by a resource. Only resources raise these; only an Engineering
 * Manager on one of their projects, or an Admin, decides them.
 */
export interface LeaveRequest {
  id: string;
  type: LeaveType;
  /** Inclusive, date-only. */
  startDate: string;
  endDate: string;
  /** Working days, Mon–Fri. Counted and stored server-side. */
  days: number;
  reason?: string | null;
  status: ApprovalStatus;
  resource: {
    id: string; name: string; employeeCode?: string; designation?: string | null;
    type?: ResourceType;
    serviceProvider?: { id: string; name: string } | null;
    user?: { id: string; avatarColor?: string | null } | null;
  };
  decidedBy?: UserRef | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
  /** Server's answer to "can I act on this?", so no dead buttons get rendered. */
  canDecide?: boolean;
  canWithdraw?: boolean;
}

export interface LeaveSummary {
  year: number;
  byStatus: Record<ApprovalStatus, { count: number; days: number }>;
  daysTakenThisYear: number;
  byType: Partial<Record<LeaveType, number>>;
  topTakers: { resourceId: string; name: string; days: number }[];
  upcoming: LeaveRequest[];
}

export interface OvertimeRequest {
  id: string;
  minutes: number;
  status: ApprovalStatus;
  reason?: string | null;
  decidedBy?: UserRef | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
  attendance?: Attendance;
}

export interface Attendance {
  id: string;
  userId: string;
  date: string;
  checkInAt: string;
  checkOutAt?: string | null;
  breakMinutes: number;
  workMinutes: number;
  otMinutes: number;
  note?: string | null;
  user?: UserRef;
  overtimeRequest?: OvertimeRequest | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  severity?: TaskSeverity | null;
  dueDate?: string | null;
  completedAt?: string | null;
  projectId: string;
  project: { id: string; name: string; code: string; client?: { name: string } };
  module?: { id: string; name: string } | null;
  subModule?: { id: string; name: string } | null;
  assignee: UserRef;
  createdBy: UserRef;
  ticketId?: string | null;
  ticketUrl?: string | null;
  mrUrl?: string | null;
  mrTitle?: string | null;
  createdAt: string;
  updatedAt: string;
  history?: AuditEntry[];
}

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number | string;
  rate: number | string;
  amount: number | string;
  position?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: Currency;
  /** The person who raised it — a resource, PM or Admin. */
  userId: string;
  user: UserRef;
  invoiceDate: string;
  address: string;
  bankName: string;
  accountNumber: string;
  periodFrom: string;
  periodTo: string;
  notes?: string | null;
  total: number | string;
  items: InvoiceItem[];
  submittedAt?: string | null;
  decidedBy?: UserRef | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
  history?: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  actorId?: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
  actor?: UserRef | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface DashboardData {
  role: Role;
  stats: {
    projects: number; activeProjects: number;
    resources: number; tasks: number; overdueTasks: number; invoices: number;
  };
  taskBreakdown: Record<TaskStatus, number>;
  invoiceSummary: {
    byStatus: Record<InvoiceStatus, { count: number; totals: Record<Currency, number> }>;
    total: number;
    /** Never a single figure — MYR and PKR are reported separately. */
    totalsByCurrency: Record<Currency, number>;
  };
  structureOverview: {
    id: string; name: string; code: string; status: ProjectStatus; client: string;
    moduleCount: number; taskCount: number;
    headcount: number; internal: number; external: number;
  }[];
  // Manager panels
  needsAction?: {
    pendingOvertime: OvertimeRequest[];
    pendingInvoices: Invoice[];
    /** For an EM/Admin these need deciding; for a PM they're their own, waiting. */
    pendingAssignments: AssignmentRequest[];
    /** Only an EM/Admin can decide leave, so a PM never gets rows here. */
    pendingLeave: LeaveRequest[];
    totalPending: number;
  };
  attendanceToday?: {
    date: string; checkedIn: number; completed: number; onOvertime: number;
    people: Attendance[];
  };
  resourceMix?: { internal: number; external: number; serviceProviders: { id?: string; company: string; count: number }[] };
  /** Who's away next — shown to anyone who plans work, PM included. */
  upcomingLeave?: LeaveRequest[];
  overdueTasks?: Task[];
  recentActivity?: AuditEntry[];
  // Resource panels
  profile?: ResourceRow | null;
  canInvoice?: boolean;
  todayAttendance?: Attendance | null;
  monthToDate?: { days: number; workMinutes: number; otMinutes: number; approvedOtMinutes: number };
  myTasks?: Task[];
  /** A resource's own pending and upcoming approved leave. */
  myLeave?: LeaveRequest[];
  recentAttendance?: Attendance[];
  myInvoices?: Invoice[];
}
