export type AdminRole = "owner" | "admin" | "reviewer";

export type AdminPermission = "review" | "manageUsers" | "manageSystem" | "manageRoles";

export type AdminActor = {
  id: string;
  email: string | null;
  role: AdminRole;
};

export type AdminRoleRecord = {
  id: string;
  userId: string | null;
  email: string;
  role: AdminRole;
  createdAt: string;
  createdBy: string | null;
};

export type UserApiUsageSummary = {
  llm: "site" | "user";
  image: "site" | "user";
  video: "site" | "user";
};

export type AdminUserStats = {
  projects: number;
  chatConversations: number;
  imageRecords: number;
  videoRecords: number;
  canvasBoards: number;
  projectAssets: number;
  promptSubmissions: number;
  promptSubmissionsPending: number;
  promptSubmissionsApproved: number;
  promptSubmissionsRejected: number;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  emailConfirmed: boolean;
  primaryProvider: string;
  authProviders: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
  stats: AdminUserStats;
  apiUsageMode: UserApiUsageSummary;
};

export type AdminUserDetail = AdminUserListItem & {
  promptSubmissions: Array<{
    id: string;
    kind: string;
    title: string;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
  }>;
  auditLogs: AdminAuditLog[];
};

export type AdminAuditLog = {
  id: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminUserOverview = {
  totalUsers: number;
  verifiedUsers: number;
  adminMembers: number;
  projects: number;
  chatConversations: number;
  imageRecords: number;
  videoRecords: number;
  canvasBoards: number;
  projectAssets: number;
  promptSubmissions: number;
  promptSubmissionsPending: number;
  promptSubmissionsApproved: number;
  promptSubmissionsRejected: number;
  personalApiUsers: number;
};

export type AdminUsersResponse = {
  users: AdminUserListItem[];
  overview: AdminUserOverview;
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  serviceRoleAvailable: boolean;
  warning?: string;
};

export type AdminUserDeleteStep = {
  phase: "auth" | "database" | "storage" | "audit";
  target: string;
  ok: boolean;
  count?: number;
  message?: string;
};

export type AdminUserDeleteResult = {
  targetEmail: string;
  complete: boolean;
  deleted: {
    database: Record<string, number>;
    storageObjects: number;
    authUser: boolean;
  };
  steps: AdminUserDeleteStep[];
  errors: AdminUserDeleteStep[];
};

const ROLE_RANK: Record<AdminRole, number> = {
  reviewer: 1,
  admin: 2,
  owner: 3,
};

const PERMISSION_MIN_ROLE: Record<AdminPermission, AdminRole> = {
  review: "reviewer",
  manageUsers: "admin",
  manageSystem: "admin",
  manageRoles: "admin",
};

export function normalizeAdminRole(value: unknown): AdminRole {
  return value === "owner" || value === "admin" || value === "reviewer" ? value : "reviewer";
}

export function canAdmin(role: AdminRole, permission: AdminPermission): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[PERMISSION_MIN_ROLE[permission]];
}

export function normalizeApiUsageMode(value: unknown): UserApiUsageSummary {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    llm: row.llm === "user" ? "user" : "site",
    image: row.image === "user" ? "user" : "site",
    video: row.video === "user" ? "user" : "site",
  };
}
