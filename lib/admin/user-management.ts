import type { SupabaseClient, User } from "@supabase/supabase-js";
import { maybeCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { GENERATED_IMAGES_BUCKET } from "@/lib/generated-image-storage";
import {
  canAdmin,
  normalizeAdminRole,
  normalizeApiUsageMode,
  type AdminActor,
  type AdminAuditLog,
  type AdminPermission,
  type AdminRole,
  type AdminRoleRecord,
  type AdminUserDeleteResult,
  type AdminUserDeleteStep,
  type AdminUserDetail,
  type AdminUserListItem,
  type AdminUserOverview,
  type AdminUserStats,
  type AdminUsersResponse,
} from "@/lib/admin/types";

const AUTH_SCAN_PAGE_SIZE = 1000;
const AUTH_SCAN_MAX_PAGES = 200;
const STORAGE_LIST_PAGE_SIZE = 1000;

const USER_DATA_TABLES: Array<{ table: string; column: string }> = [
  { table: "project_assets", column: "user_id" },
  { table: "image_gallery_records", column: "user_id" },
  { table: "video_gallery_records", column: "user_id" },
  { table: "canvas_boards", column: "user_id" },
  { table: "chat_conversations", column: "user_id" },
  { table: "chat_skill_packs", column: "user_id" },
  { table: "site_prompt_preset_favorites", column: "user_id" },
  { table: "site_prompt_preset_submissions", column: "submitter_user_id" },
  { table: "user_api_settings", column: "user_id" },
  { table: "workspace_settings", column: "user_id" },
  { table: "admin_roles", column: "user_id" },
  { table: "projects", column: "user_id" },
];

const ZERO_STATS: AdminUserStats = {
  projects: 0,
  chatConversations: 0,
  imageRecords: 0,
  videoRecords: 0,
  canvasBoards: 0,
  projectAssets: 0,
  promptSubmissions: 0,
  promptSubmissionsPending: 0,
  promptSubmissionsApproved: 0,
  promptSubmissionsRejected: 0,
};

const ZERO_OVERVIEW: AdminUserOverview = {
  totalUsers: 0,
  verifiedUsers: 0,
  adminMembers: 0,
  projects: 0,
  chatConversations: 0,
  imageRecords: 0,
  videoRecords: 0,
  canvasBoards: 0,
  projectAssets: 0,
  promptSubmissions: 0,
  promptSubmissionsPending: 0,
  promptSubmissionsApproved: 0,
  promptSubmissionsRejected: 0,
  personalApiUsers: 0,
};

type AdminRoleRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  created_by: string | null;
};

type AuditLogRow = {
  id: number;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  metadata: unknown;
  created_at: string;
};

type PromptSubmissionRow = {
  id: string;
  preset_type: string | null;
  title: string | null;
  status: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function cleanEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function userProviders(user: User): string[] {
  const providers = new Set<string>();
  const primary = user.app_metadata?.provider;
  if (typeof primary === "string" && primary.trim()) providers.add(primary.trim());
  for (const identity of user.identities ?? []) {
    const provider = identity.provider?.trim();
    if (provider) providers.add(provider);
  }
  return [...providers];
}

function roleRowToRecord(row: AdminRoleRow): AdminRoleRecord {
  return {
    id: row.id,
    userId: row.user_id,
    email: cleanEmail(row.email),
    role: normalizeAdminRole(row.role),
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function roleBelongsToActor(record: AdminRoleRecord, actor: AdminActor): boolean {
  return record.userId === actor.id || (!!record.email && cleanEmail(record.email) === cleanEmail(actor.email));
}

function assertCanWriteRole(actor: AdminActor, role: AdminRole): void {
  if (role === "owner" && actor.role !== "owner") {
    throw new Error("只有 owner 可以授予 owner 权限");
  }
}

function auditRowToLog(row: AuditLogRow): AdminAuditLog {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: row.created_at,
  };
}

async function countRows(supabase: SupabaseClient, table: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? "");
  return /Could not find the table|schema cache|does not exist|PGRST205/i.test(message);
}

async function countAllRows(supabase: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

async function countRowsByColumn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

async function deleteRowsByColumn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const count = await countRowsByColumn(supabase, table, column, value);
  if (count === 0) return 0;
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) {
    if (isMissingTableError(error)) return 0;
    throw error;
  }
  return count;
}

async function listStoragePrefixFiles(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const filePaths: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; offset < AUTH_SCAN_MAX_PAGES * STORAGE_LIST_PAGE_SIZE; offset += STORAGE_LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const items = data ?? [];
    for (const item of items) {
      const path = `${prefix}/${item.name}`;
      const isFolder = (item as { id?: string | null }).id === null;
      if (isFolder) folders.push(path);
      else filePaths.push(path);
    }
    if (items.length < STORAGE_LIST_PAGE_SIZE) break;
  }
  for (const folder of folders) {
    filePaths.push(...await listStoragePrefixFiles(supabase, bucket, folder));
  }
  return filePaths;
}

async function deleteStoragePrefix(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  const filePaths = await listStoragePrefixFiles(supabase, bucket, prefix);
  let removed = 0;
  for (let index = 0; index < filePaths.length; index += 100) {
    const chunk = filePaths.slice(index, index + 100);
    const { error: removeError } = await supabase.storage.from(bucket).remove(chunk);
    if (removeError) throw removeError;
    removed += chunk.length;
  }
  return removed;
}

async function promptSubmissionStats(supabase: SupabaseClient, userId: string): Promise<Pick<
  AdminUserStats,
  "promptSubmissions" | "promptSubmissionsPending" | "promptSubmissionsApproved" | "promptSubmissionsRejected"
>> {
  const { data, error } = await supabase
    .from("site_prompt_preset_submissions")
    .select("status")
    .eq("submitter_user_id", userId);
  if (error) {
    if (/site_prompt_preset_submissions|Could not find the table|schema cache/i.test(error.message)) {
      return {
        promptSubmissions: 0,
        promptSubmissionsPending: 0,
        promptSubmissionsApproved: 0,
        promptSubmissionsRejected: 0,
      };
    }
    throw error;
  }

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const row of data ?? []) {
    const status = String((row as { status?: unknown }).status ?? "");
    if (status === "pending") pending += 1;
    else if (status === "approved") approved += 1;
    else if (status === "rejected") rejected += 1;
  }
  return {
    promptSubmissions: pending + approved + rejected,
    promptSubmissionsPending: pending,
    promptSubmissionsApproved: approved,
    promptSubmissionsRejected: rejected,
  };
}

async function userStats(supabase: SupabaseClient, userId: string): Promise<AdminUserStats> {
  const [
    projects,
    chatConversations,
    imageRecords,
    videoRecords,
    canvasBoards,
    projectAssets,
    submissions,
  ] = await Promise.all([
    countRows(supabase, "projects", userId),
    countRows(supabase, "chat_conversations", userId),
    countRows(supabase, "image_gallery_records", userId),
    countRows(supabase, "video_gallery_records", userId),
    countRows(supabase, "canvas_boards", userId),
    countRows(supabase, "project_assets", userId).catch((error) => {
      if (error instanceof Error && /project_assets|Could not find the table|schema cache/i.test(error.message)) return 0;
      throw error;
    }),
    promptSubmissionStats(supabase, userId),
  ]);

  return {
    projects,
    chatConversations,
    imageRecords,
    videoRecords,
    canvasBoards,
    projectAssets,
    ...submissions,
  };
}

async function userApiMode(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_api_settings")
    .select("api_usage_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (/user_api_settings|Could not find the table|schema cache/i.test(error.message)) return normalizeApiUsageMode(null);
    throw error;
  }
  return normalizeApiUsageMode((data as { api_usage_mode?: unknown } | null)?.api_usage_mode);
}

function userToListItem(user: User, stats: AdminUserStats, apiUsageMode: ReturnType<typeof normalizeApiUsageMode>): AdminUserListItem {
  const providers = userProviders(user);
  return {
    id: user.id,
    email: user.email?.trim() || "暂无邮箱",
    emailConfirmed: Boolean(user.email_confirmed_at),
    primaryProvider: providers[0] ?? "email",
    authProviders: providers,
    createdAt: user.created_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    stats,
    apiUsageMode,
  };
}

function dateValue(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortUsersForAdmin(users: User[], sort: string): User[] {
  return [...users].sort((left, right) => {
    if (sort === "created_asc") return dateValue(left.created_at) - dateValue(right.created_at);
    return dateValue(right.last_sign_in_at ?? right.created_at) - dateValue(left.last_sign_in_at ?? left.created_at);
  });
}

async function scanAuthUsers(admin: SupabaseClient): Promise<{ users: User[]; capped: boolean }> {
  const users: User[] = [];
  for (let page = 1; page <= AUTH_SCAN_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_SCAN_PAGE_SIZE });
    if (error) throw error;
    const batch = data.users ?? [];
    users.push(...batch);
    if (batch.length < AUTH_SCAN_PAGE_SIZE) return { users, capped: false };
  }
  return { users, capped: true };
}

function paginateUsers(users: User[], page: number, perPage: number): User[] {
  const start = (page - 1) * perPage;
  return users.slice(start, start + perPage);
}

async function userDatabaseCounts(supabase: SupabaseClient, userId: string, email: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const item of USER_DATA_TABLES) {
    if (item.table === "admin_roles" && email) continue;
    counts[item.table] = (counts[item.table] ?? 0) + await countRowsByColumn(supabase, item.table, item.column, userId);
  }
  if (email) {
    counts.admin_roles = (counts.admin_roles ?? 0) + await countRowsByColumn(supabase, "admin_roles", "email", email);
  }
  return counts;
}

async function adminUserOverview(supabase: SupabaseClient, users: User[]): Promise<AdminUserOverview> {
  const [
    adminMembers,
    projects,
    chatConversations,
    imageRecords,
    videoRecords,
    canvasBoards,
    projectAssets,
    promptSubmissionsPending,
    promptSubmissionsApproved,
    promptSubmissionsRejected,
    personalApiUsers,
  ] = await Promise.all([
    countAllRows(supabase, "admin_roles"),
    countAllRows(supabase, "projects"),
    countAllRows(supabase, "chat_conversations"),
    countAllRows(supabase, "image_gallery_records"),
    countAllRows(supabase, "video_gallery_records"),
    countAllRows(supabase, "canvas_boards"),
    countAllRows(supabase, "project_assets"),
    countRowsByColumn(supabase, "site_prompt_preset_submissions", "status", "pending"),
    countRowsByColumn(supabase, "site_prompt_preset_submissions", "status", "approved"),
    countRowsByColumn(supabase, "site_prompt_preset_submissions", "status", "rejected"),
    countAllRows(supabase, "user_api_settings"),
  ]);
  return {
    totalUsers: users.length,
    verifiedUsers: users.filter((user) => Boolean(user.email_confirmed_at)).length,
    adminMembers,
    projects,
    chatConversations,
    imageRecords,
    videoRecords,
    canvasBoards,
    projectAssets,
    promptSubmissions: promptSubmissionsPending + promptSubmissionsApproved + promptSubmissionsRejected,
    promptSubmissionsPending,
    promptSubmissionsApproved,
    promptSubmissionsRejected,
    personalApiUsers,
  };
}

export async function getAdminActor(supabase: SupabaseClient, user: User): Promise<AdminActor | null> {
  const email = cleanEmail(user.email);
  const byUserId = await supabase
    .from("admin_roles")
    .select("id, user_id, email, role, created_at, created_by")
    .eq("user_id", user.id)
    .maybeSingle();
  if (byUserId.error) {
    if (/admin_roles|Could not find the table|schema cache/i.test(byUserId.error.message)) {
      return email === "1779916397@qq.com" ? { id: user.id, email, role: "owner" } : null;
    }
    throw byUserId.error;
  }
  let row = byUserId.data as AdminRoleRow | null;
  if (!row && email) {
    const byEmail = await supabase
      .from("admin_roles")
      .select("id, user_id, email, role, created_at, created_by")
      .eq("email", email)
      .maybeSingle();
    if (byEmail.error) throw byEmail.error;
    row = byEmail.data as AdminRoleRow | null;
  }
  if (!row) return null;
  return { id: user.id, email: user.email ?? null, role: normalizeAdminRole(row.role) };
}

export function requirePermission(actor: AdminActor, permission: AdminPermission): void {
  if (!canAdmin(actor.role, permission)) {
    throw new Error("当前后台角色无权执行该操作");
  }
}

export async function listAdminUsers(params: {
  actor: AdminActor;
  page: number;
  perPage: number;
  search: string;
  sort: string;
}): Promise<AdminUsersResponse> {
  requirePermission(params.actor, "manageUsers");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) {
    return {
      users: [],
      overview: ZERO_OVERVIEW,
      page: params.page,
      perPage: params.perPage,
      total: 0,
      pageCount: 0,
      hasPreviousPage: false,
      hasNextPage: false,
      serviceRoleAvailable: false,
      warning: "缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取 Supabase Auth 用户列表。",
    };
  }

  const page = Math.max(1, params.page);
  const perPage = Math.min(50, Math.max(5, params.perPage));
  const search = params.search.trim().toLowerCase();
  const scan = await scanAuthUsers(admin);
  const overview = await adminUserOverview(admin, scan.users);
  const matchedUsers = search
    ? scan.users.filter((user) => cleanEmail(user.email).includes(search) || user.id.toLowerCase().includes(search))
    : scan.users;
  const sortedUsers = sortUsersForAdmin(matchedUsers, params.sort);
  const total = sortedUsers.length;
  const pageCount = total > 0 ? Math.ceil(total / perPage) : 0;
  const safePage = pageCount > 0 ? Math.min(page, pageCount) : 1;
  const pageUsers = paginateUsers(sortedUsers, safePage, perPage);
  const items = await Promise.all(pageUsers.map(async (user) => {
    return userToListItem(user, await userStats(admin, user.id), await userApiMode(admin, user.id));
  }));

  return {
    users: items,
    overview,
    page: safePage,
    perPage,
    total,
    pageCount,
    hasPreviousPage: safePage > 1,
    hasNextPage: pageCount > 0 && safePage < pageCount,
    serviceRoleAvailable: true,
    warning: scan.capped ? `用户列表已扫描前 ${AUTH_SCAN_MAX_PAGES * AUTH_SCAN_PAGE_SIZE} 个账号，结果可能不完整。` : undefined,
  };
}

export async function getAdminUserDetail(actor: AdminActor, userId: string): Promise<AdminUserDetail> {
  requirePermission(actor, "manageUsers");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取用户详情");
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  if (!data.user) throw new Error("用户不存在");

  const [stats, apiUsageMode, submissions, auditLogs] = await Promise.all([
    userStats(admin, userId),
    userApiMode(admin, userId),
    listUserPromptSubmissions(admin, userId),
    listAuditLogs(admin, { targetUserId: userId, limit: 20 }),
  ]);

  return {
    ...userToListItem(data.user, stats, apiUsageMode),
    promptSubmissions: submissions,
    auditLogs,
  };
}

export async function deleteAdminUserData(params: {
  actor: AdminActor;
  userId: string;
  confirmationEmail: unknown;
}): Promise<AdminUserDeleteResult> {
  requirePermission(params.actor, "manageUsers");
  if (params.actor.id === params.userId) throw new Error("不能删除当前登录管理员自己的数据");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法删除账号和数据");

  const { data, error } = await admin.auth.admin.getUserById(params.userId);
  if (error) throw error;
  const target = data.user;
  if (!target) throw new Error("用户不存在");

  const targetEmail = cleanEmail(target.email);
  if (!targetEmail) throw new Error("该用户没有邮箱，无法执行邮箱确认删除");
  const confirmation = cleanEmail(params.confirmationEmail);
  if (confirmation !== targetEmail) throw new Error("确认邮箱不匹配");

  const database = await userDatabaseCounts(admin, params.userId, targetEmail);
  const steps: AdminUserDeleteStep[] = [];
  const errors: AdminUserDeleteStep[] = [];

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(params.userId);
  if (deleteAuthError) throw new Error(`Auth 账号删除失败：${deleteAuthError.message}`);
  steps.push({ phase: "auth", target: params.userId, ok: true, count: 1 });

  for (const item of USER_DATA_TABLES) {
    try {
      const count = await deleteRowsByColumn(admin, item.table, item.column, params.userId);
      steps.push({ phase: "database", target: `${item.table}.${item.column}`, ok: true, count });
    } catch (error) {
      const step = {
        phase: "database" as const,
        target: `${item.table}.${item.column}`,
        ok: false,
        message: error instanceof Error ? error.message : "数据库清理失败",
      };
      steps.push(step);
      errors.push(step);
    }
  }
  if (targetEmail) {
    try {
      const count = await deleteRowsByColumn(admin, "admin_roles", "email", targetEmail);
      steps.push({ phase: "database", target: "admin_roles.email", ok: true, count });
    } catch (error) {
      const step = {
        phase: "database" as const,
        target: "admin_roles.email",
        ok: false,
        message: error instanceof Error ? error.message : "后台权限邮箱清理失败",
      };
      steps.push(step);
      errors.push(step);
    }
  }

  let storageObjects = 0;
  try {
    storageObjects = await deleteStoragePrefix(admin, GENERATED_IMAGES_BUCKET, params.userId);
    steps.push({ phase: "storage", target: GENERATED_IMAGES_BUCKET, ok: true, count: storageObjects });
  } catch (error) {
    const step = {
      phase: "storage" as const,
      target: GENERATED_IMAGES_BUCKET,
      ok: false,
      message: error instanceof Error ? error.message : "云存储文件清理失败",
    };
    steps.push(step);
    errors.push(step);
  }

  try {
    await writeAuditLog(admin, {
      actor: params.actor,
      action: "user.data.delete",
      targetUserId: null,
      targetEmail,
      metadata: {
        targetUserId: params.userId,
        database,
        storageObjects,
        authUserDeleted: true,
        complete: errors.length === 0,
        errors: errors.map((step) => ({ phase: step.phase, target: step.target, message: step.message })),
      },
    });
    steps.push({ phase: "audit", target: "admin_audit_logs", ok: true, count: 1 });
  } catch (error) {
    const step = {
      phase: "audit" as const,
      target: "admin_audit_logs",
      ok: false,
      message: error instanceof Error ? error.message : "审计日志写入失败",
    };
    steps.push(step);
    errors.push(step);
  }

  return {
    targetEmail,
    complete: errors.length === 0,
    deleted: { database, storageObjects, authUser: true },
    steps,
    errors,
  };
}

export async function listAdminRoles(actor: AdminActor): Promise<AdminRoleRecord[]> {
  requirePermission(actor, "manageRoles");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法读取后台成员");
  const { data, error } = await admin
    .from("admin_roles")
    .select("id, user_id, email, role, created_at, created_by")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => roleRowToRecord(row as AdminRoleRow));
}

export async function createAdminRole(actor: AdminActor, input: { email?: unknown; role?: unknown }): Promise<AdminRoleRecord> {
  requirePermission(actor, "manageRoles");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法添加后台成员");
  const email = cleanEmail(input.email);
  if (!email || !email.includes("@")) throw new Error("请填写有效邮箱");
  const role = normalizeAdminRole(input.role);
  assertCanWriteRole(actor, role);
  const user = await findAuthUserByEmail(admin, email);
  const { data, error } = await admin
    .from("admin_roles")
    .upsert({
      user_id: user?.id ?? null,
      email,
      role,
      created_by: actor.id,
    }, { onConflict: "email" })
    .select("id, user_id, email, role, created_at, created_by")
    .single();
  if (error) throw error;
  const record = roleRowToRecord(data as AdminRoleRow);
  await writeAuditLog(admin, {
    actor,
    action: "admin.role.create",
    targetUserId: record.userId,
    targetEmail: record.email,
    metadata: { role: record.role },
  });
  return record;
}

export async function updateAdminRole(actor: AdminActor, roleId: string, input: { role?: unknown }): Promise<AdminRoleRecord> {
  requirePermission(actor, "manageRoles");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法修改后台成员");
  const role = normalizeAdminRole(input.role);
  assertCanWriteRole(actor, role);
  const { data: existing, error: readError } = await admin
    .from("admin_roles")
    .select("id, user_id, email, role, created_at, created_by")
    .eq("id", roleId)
    .single();
  if (readError) throw readError;
  const existingRecord = roleRowToRecord(existing as AdminRoleRow);
  if (existingRecord.role === "owner" && role !== "owner" && roleBelongsToActor(existingRecord, actor)) {
    throw new Error("不能修改自己的 owner 权限");
  }
  const { data, error } = await admin
    .from("admin_roles")
    .update({ role })
    .eq("id", roleId)
    .select("id, user_id, email, role, created_at, created_by")
    .single();
  if (error) throw error;
  const record = roleRowToRecord(data as AdminRoleRow);
  await writeAuditLog(admin, {
    actor,
    action: "admin.role.update",
    targetUserId: record.userId,
    targetEmail: record.email,
    metadata: { role: record.role },
  });
  return record;
}

export async function deleteAdminRole(actor: AdminActor, roleId: string): Promise<void> {
  requirePermission(actor, "manageRoles");
  const admin = maybeCreateSupabaseAdminClient();
  if (!admin) throw new Error("缺少 SUPABASE_SERVICE_ROLE_KEY，无法移除后台成员");
  const { data: existing, error: readError } = await admin
    .from("admin_roles")
    .select("id, user_id, email, role, created_at, created_by")
    .eq("id", roleId)
    .single();
  if (readError) throw readError;
  const record = roleRowToRecord(existing as AdminRoleRow);
  if (record.role === "owner" && roleBelongsToActor(record, actor)) throw new Error("不能移除自己的 owner 权限");
  const { error } = await admin.from("admin_roles").delete().eq("id", roleId);
  if (error) throw error;
  await writeAuditLog(admin, {
    actor,
    action: "admin.role.delete",
    targetUserId: record.userId,
    targetEmail: record.email,
    metadata: { role: record.role },
  });
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const scan = await scanAuthUsers(admin);
  return scan.users.find((user) => cleanEmail(user.email) === email) ?? null;
}

export async function listUserPromptSubmissions(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("site_prompt_preset_submissions")
    .select("id, preset_type, title, status, created_at, reviewed_at")
    .eq("submitter_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (/site_prompt_preset_submissions|Could not find the table|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((row) => {
    const item = row as PromptSubmissionRow;
    return {
      id: item.id,
      kind: item.preset_type ?? "",
      title: item.title ?? item.id,
      status: item.status ?? "",
      createdAt: item.created_at,
      reviewedAt: item.reviewed_at,
    };
  });
}

export async function listAuditLogs(
  admin: SupabaseClient,
  options: { targetUserId?: string; limit?: number },
): Promise<AdminAuditLog[]> {
  let query = admin
    .from("admin_audit_logs")
    .select("id, actor_user_id, actor_email, action, target_user_id, target_email, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, options.limit ?? 50)));
  if (options.targetUserId) query = query.eq("target_user_id", options.targetUserId);
  const { data, error } = await query;
  if (error) {
    if (/admin_audit_logs|Could not find the table|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []).map((row) => auditRowToLog(row as AuditLogRow));
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  input: {
    actor: AdminActor;
    action: string;
    targetUserId?: string | null;
    targetEmail?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("admin_audit_logs").insert({
    actor_user_id: input.actor.id,
    actor_email: input.actor.email,
    action: input.action,
    target_user_id: input.targetUserId ?? null,
    target_email: input.targetEmail ?? null,
    metadata: input.metadata ?? {},
  });
  if (error && !/admin_audit_logs|Could not find the table|schema cache/i.test(error.message)) throw error;
}

export function normalizePage(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
}

export function normalizePerPage(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(50, Math.max(5, Math.floor(n))) : 20;
}

export { ZERO_STATS };
