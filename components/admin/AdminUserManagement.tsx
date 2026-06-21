"use client";

import { useEffect, useMemo, useState } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import settingsStyles from "@/app/settings/settings-page.module.css";
import type {
  AdminAuditLog,
  AdminRole,
  AdminRoleRecord,
  AdminUserDeleteResult,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserOverview,
  AdminUsersResponse,
} from "@/lib/admin/types";
import styles from "./admin-management.module.css";

const cardClass = [shellStyles.card, settingsStyles.floatCard].join(" ");

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

type CurrentAdmin = {
  id: string;
  email: string | null;
  role: AdminRole;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "暂无";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(time));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function providerLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "email") return "邮箱密码";
  return provider || "邮箱密码";
}

function apiModeLabel(user: AdminUserListItem): string {
  const mode = user.apiUsageMode;
  const count = [mode.llm, mode.image, mode.video].filter((item) => item === "user").length;
  if (count === 0) return "全站公共";
  if (count === 3) return "全个人";
  return `${count}/3 个人`;
}

function roleSelectValue(role: AdminRoleRecord | null): AdminRole | "none" {
  return role?.role ?? "none";
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function UserDetailPanel({
  detail,
  loading,
  onClose,
  onRequestDelete,
}: {
  detail: AdminUserDetail | null;
  loading: boolean;
  onClose: () => void;
  onRequestDelete: (detail: AdminUserDetail) => void;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div className={styles.modalPanel} role="dialog" aria-modal="true" aria-label="用户详情" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={shellStyles.cardTitle}>{detail?.email ?? "用户详情"}</h2>
            <p className={shellStyles.cardSubtitle}>{detail?.id ?? "正在加载用户详情…"}</p>
          </div>
          <div className={styles.headerActions}>
            {detail ? (
              <button type="button" className={[shellStyles.buttonSubtle, styles.dangerButton].join(" ")} onClick={() => onRequestDelete(detail)}>
                删除账号
              </button>
            ) : null}
            <button type="button" className={shellStyles.buttonSubtle} onClick={onClose}>关闭</button>
          </div>
        </div>
        {loading ? <div className={shellStyles.empty}>正在加载用户详情…</div> : null}
        {!loading && !detail ? <div className={shellStyles.empty}>用户详情加载失败。</div> : null}
        {!loading && detail ? (
          <div className={styles.detailLayout}>
            <section className={styles.detailPanel}>
              <div className={styles.detailPanelHeader}>
                <div>
                  <h3 className={shellStyles.cardTitle}>账号信息</h3>
                  <p className={shellStyles.cardSubtitle}>
                    {detail.id} · {detail.authProviders.map(providerLabel).join(" / ") || "邮箱密码"}
                  </p>
                </div>
                <div className={styles.pillRow}>
                  <span className={styles.pill}>{detail.emailConfirmed ? "邮箱已验证" : "邮箱未验证"}</span>
                </div>
              </div>
              <div className={styles.accountMetaGrid}>
                <div className={styles.accountMetaItem}>
                  <span>注册时间</span>
                  <strong>{formatDate(detail.createdAt)}</strong>
                </div>
                <div className={styles.accountMetaItem}>
                  <span>最近登录</span>
                  <strong>{formatDate(detail.lastSignInAt)}</strong>
                </div>
                <div className={styles.accountMetaItem}>
                  <span>API 模式</span>
                  <strong>{apiModeLabel(detail)}</strong>
                </div>
              </div>
            </section>

            <section className={styles.detailPanel}>
              <div className={styles.detailPanelHeader}>
                <div>
                  <h3 className={shellStyles.cardTitle}>使用概览</h3>
                  <p className={shellStyles.cardSubtitle}>按资源类型聚合。</p>
                </div>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.metric}><span className={styles.metricValue}>{detail.stats.projects}</span><span className={styles.metricLabel}>项目</span></div>
                <div className={styles.metric}><span className={styles.metricValue}>{detail.stats.chatConversations}</span><span className={styles.metricLabel}>会话</span></div>
                <div className={styles.metric}><span className={styles.metricValue}>{detail.stats.imageRecords}</span><span className={styles.metricLabel}>图片</span></div>
                <div className={styles.metric}><span className={styles.metricValue}>{detail.stats.videoRecords}</span><span className={styles.metricLabel}>视频</span></div>
                <div className={styles.metric}><span className={styles.metricValue}>{detail.stats.canvasBoards}</span><span className={styles.metricLabel}>画布</span></div>
                <div className={styles.metric}><span className={styles.metricValue}>{detail.stats.projectAssets}</span><span className={styles.metricLabel}>项目资产</span></div>
              </div>
            </section>

            <section className={styles.detailPanel}>
              <div className={styles.detailPanelHeader}>
                <div>
                  <h3 className={shellStyles.cardTitle}>投稿历史</h3>
                  <p className={shellStyles.cardSubtitle}>
                    待审 {detail.stats.promptSubmissionsPending} · 通过 {detail.stats.promptSubmissionsApproved} · 拒绝 {detail.stats.promptSubmissionsRejected}
                  </p>
                </div>
              </div>
              {detail.promptSubmissions.length === 0 ? <div className={styles.compactEmpty}>暂无投稿。</div> : (
                <div className={styles.compactList}>
                  {detail.promptSubmissions.map((item) => (
                    <article key={item.id} className={styles.compactListItem}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.kind} · {formatDate(item.createdAt)}</span>
                      </div>
                      <span className={styles.pill}>{item.status}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <AuditLogList logs={detail.auditLogs} title="相关审计记录" className={styles.detailPanel} compactEmpty />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminUsersPanel() {
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [overview, setOverview] = useState<AdminUserOverview>(ZERO_OVERVIEW);
  const [roles, setRoles] = useState<AdminRoleRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditMessage, setAuditMessage] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserDetail | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("last_sign_in_desc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    perPage: 30,
    total: 0,
    pageCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });

  const rolesByUser = useMemo(() => {
    const map = new Map<string, AdminRoleRecord>();
    for (const role of roles) {
      if (role.userId) map.set(role.userId, role);
      map.set(role.email.toLowerCase(), role);
    }
    return map;
  }, [roles]);

  function roleForUser(user: AdminUserListItem): AdminRoleRecord | null {
    return rolesByUser.get(user.id) ?? rolesByUser.get(user.email.toLowerCase()) ?? null;
  }

  function isCurrentAdminRole(user: AdminUserListItem, role: AdminRoleRecord | null): boolean {
    if (!currentAdmin || role?.role !== "owner") return false;
    return user.id === currentAdmin.id || user.email.toLowerCase() === currentAdmin.email?.toLowerCase();
  }

  async function loadCurrentAdmin() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const data = await readJson<{ user: CurrentAdmin }>(res);
      setCurrentAdmin(data.user);
    } catch {
      setCurrentAdmin(null);
    }
  }

  async function loadRoles() {
    setRoleMessage("");
    try {
      const res = await fetch("/api/admin/roles", { cache: "no-store" });
      const data = await readJson<{ roles: AdminRoleRecord[] }>(res);
      setRoles(data.roles);
    } catch (error) {
      setRoleMessage(error instanceof Error ? error.message : "读取后台权限失败");
    }
  }

  async function loadUsers(nextPage = page) {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ search: query, sort, page: String(nextPage), perPage: "30" });
      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const data = await readJson<AdminUsersResponse>(res);
      setOverview(data.overview);
      if (data.page !== nextPage) setPage(data.page);
      setPagination({
        page: data.page,
        perPage: data.perPage,
        total: data.total,
        pageCount: data.pageCount,
        hasPreviousPage: data.hasPreviousPage,
        hasNextPage: data.hasNextPage,
      });
      setUsers(data.users);
      if (data.warning) setMessage(data.warning);
      if (selectedId && !data.users.some((user) => user.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取用户列表失败");
      setUsers([]);
      setOverview(ZERO_OVERVIEW);
      setPagination((current) => ({ ...current, total: 0, pageCount: 0, hasPreviousPage: false, hasNextPage: false }));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(userId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { cache: "no-store" });
      const data = await readJson<{ user: AdminUserDetail }>(res);
      setDetail(data.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取用户详情失败");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadAuditLogs() {
    setAuditLoading(true);
    setAuditMessage("");
    try {
      const res = await fetch("/api/admin/audit-logs?limit=80", { cache: "no-store" });
      const data = await readJson<{ logs: AdminAuditLog[]; warning?: string }>(res);
      setAuditLogs(data.logs);
      if (data.warning) setAuditMessage(data.warning);
    } catch (error) {
      setAuditMessage(error instanceof Error ? error.message : "读取审计日志失败");
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([loadCurrentAdmin(), loadUsers(), loadRoles()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, page]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  async function changeUserRole(user: AdminUserListItem, next: AdminRole | "none") {
    const current = roleForUser(user);
    setSavingRoleUserId(user.id);
    setRoleMessage("");
    try {
      if (next === "none") {
        if (current) {
          const res = await fetch(`/api/admin/roles/${encodeURIComponent(current.id)}`, { method: "DELETE" });
          await readJson<{ ok: true }>(res);
          setRoles((items) => items.filter((item) => item.id !== current.id));
        }
        return;
      }

      if (current) {
        const res = await fetch(`/api/admin/roles/${encodeURIComponent(current.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: next }),
        });
        const data = await readJson<{ role: AdminRoleRecord }>(res);
        setRoles((items) => items.map((item) => item.id === current.id ? data.role : item));
        return;
      }

      if (!user.email.includes("@")) throw new Error("该用户没有有效邮箱，无法设置后台权限");
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, role: next }),
      });
      const data = await readJson<{ role: AdminRoleRecord }>(res);
      setRoles((items) => [data.role, ...items.filter((item) => item.id !== data.role.id)]);
    } catch (error) {
      setRoleMessage(error instanceof Error ? error.message : "修改后台权限失败");
    } finally {
      setSavingRoleUserId(null);
    }
  }

  function openDetail(userId: string) {
    setSelectedId(userId);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
  }

  function openAuditLogs() {
    setAuditOpen(true);
    void loadAuditLogs();
  }

  function closeAuditLogs() {
    setAuditOpen(false);
  }

  function submitSearch() {
    if (page !== 1) setPage(1);
    else void loadUsers(1);
  }

  function changeSort(nextSort: string) {
    setSort(nextSort);
    setPage(1);
  }

  function goToPage(nextPage: number) {
    const safePage = Math.max(1, Math.min(nextPage, Math.max(1, pagination.pageCount)));
    if (safePage !== page) setPage(safePage);
  }

  function openDeleteDialog(target: AdminUserDetail) {
    setDeleteTarget(target);
    setDeleteConfirm("");
    setDeleteMessage("");
  }

  function closeDeleteDialog() {
    if (deleteLoading) return;
    setDeleteTarget(null);
    setDeleteConfirm("");
    setDeleteMessage("");
  }

  async function deleteUserData() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteMessage("");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(deleteTarget.id)}/data`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationEmail: deleteConfirm }),
      });
      const data = await readJson<AdminUserDeleteResult>(res);
      const tableRows = Object.values(data.deleted.database).reduce((sum, count) => sum + count, 0);
      const baseMessage = `已删除 ${data.targetEmail} 的账号。删除前数据库关联 ${tableRows} 条，已清理存储对象 ${data.deleted.storageObjects} 个。`;
      if (data.complete) {
        setMessage(baseMessage);
      } else {
        const failedTargets = data.errors.map((item) => `${item.target}: ${item.message ?? "失败"}`).join("；");
        setMessage(`${baseMessage} 但有清理步骤失败：${failedTargets}`);
      }
      setDeleteTarget(null);
      setDeleteConfirm("");
      setDetail(null);
      setSelectedId(null);
      await loadUsers(page);
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "删除账号和数据失败");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <section className={settingsStyles.panel}>
      <div className={cardClass}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>用户管理</h2>
            <p className={shellStyles.cardSubtitle}>查看账号、资源用量、投稿行为和后台权限。</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={shellStyles.buttonSubtle} onClick={openAuditLogs}>审计日志</button>
            <button type="button" className={shellStyles.buttonSubtle} onClick={() => void Promise.all([loadCurrentAdmin(), loadUsers(), loadRoles()])}>刷新</button>
          </div>
        </div>
        <div className={styles.overviewGrid} aria-label="总数据预览">
          <div className={styles.overviewMetric}>
            <span>总用户</span>
            <strong>{formatNumber(overview.totalUsers)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>已验证</span>
            <strong>{formatNumber(overview.verifiedUsers)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>后台成员</span>
            <strong>{formatNumber(overview.adminMembers)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>项目</span>
            <strong>{formatNumber(overview.projects)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>会话</span>
            <strong>{formatNumber(overview.chatConversations)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>图片</span>
            <strong>{formatNumber(overview.imageRecords)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>视频</span>
            <strong>{formatNumber(overview.videoRecords)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>画布</span>
            <strong>{formatNumber(overview.canvasBoards)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>项目资产</span>
            <strong>{formatNumber(overview.projectAssets)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>投稿</span>
            <strong>{formatNumber(overview.promptSubmissions)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>待审</span>
            <strong>{formatNumber(overview.promptSubmissionsPending)}</strong>
          </div>
          <div className={styles.overviewMetric}>
            <span>个人 API</span>
            <strong>{formatNumber(overview.personalApiUsers)}</strong>
          </div>
        </div>
        <div className={styles.toolbar}>
          <div className={[styles.filterGroup, styles.searchGroup].join(" ")}>
            <input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }} placeholder="搜索邮箱或用户 ID" />
            <button type="button" className={shellStyles.buttonSubtle} onClick={submitSearch}>搜索</button>
          </div>
          <div className={styles.filterGroup}>
            <select className={styles.select} value={sort} onChange={(event) => changeSort(event.target.value)}>
              <option value="last_sign_in_desc">最近登录</option>
              <option value="created_asc">注册最早</option>
            </select>
          </div>
        </div>
        {message || roleMessage ? <p className={shellStyles.cardSubtitle}>{message || roleMessage}</p> : null}
      </div>

      {loading ? <div className={shellStyles.empty}>正在加载用户列表…</div> : null}
      {!loading && users.length === 0 ? <div className={shellStyles.empty}>暂无用户。</div> : null}
      {users.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>邮箱</th>
                <th>后台权限</th>
                <th>注册 / 登录</th>
                <th>资源</th>
                <th>投稿</th>
                <th>API</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const role = roleForUser(user);
                const lockOwnOwner = isCurrentAdminRole(user, role);
                return (
                  <tr key={user.id} data-active={user.id === selectedId} onClick={() => openDetail(user.id)}>
                    <td className={styles.emailCell}>{user.email}<br /><span className={styles.muted}>{user.emailConfirmed ? "已验证" : "未验证"}</span></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <select
                        className={styles.select}
                        value={roleSelectValue(role)}
                        disabled={!currentAdmin || savingRoleUserId === user.id || lockOwnOwner}
                        onChange={(event) => void changeUserRole(user, event.target.value as AdminRole | "none")}
                        aria-label={`${user.email} 后台权限`}
                        title={lockOwnOwner ? "不能修改自己的 owner 权限" : undefined}
                      >
                        <option value="none">无权限</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="admin">Admin</option>
                        <option value="owner" disabled={currentAdmin?.role !== "owner"}>Owner</option>
                      </select>
                    </td>
                    <td>{formatDate(user.createdAt)}<br /><span className={styles.muted}>{formatDate(user.lastSignInAt)}</span></td>
                    <td>项目 {user.stats.projects}<br /><span className={styles.muted}>图/视 {user.stats.imageRecords}/{user.stats.videoRecords}</span></td>
                    <td>{user.stats.promptSubmissions}</td>
                    <td>{apiModeLabel(user)}</td>
                    <td><button type="button" className={shellStyles.buttonSubtle} onClick={(event) => { event.stopPropagation(); openDetail(user.id); }}>打开</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className={styles.paginationBar}>
            <span className={styles.muted}>
              共 {pagination.total} 个用户 · 第 {pagination.pageCount === 0 ? 0 : pagination.page} / {pagination.pageCount} 页
            </span>
            <div className={styles.paginationActions}>
              <button type="button" className={shellStyles.buttonSubtle} disabled={!pagination.hasPreviousPage || loading} onClick={() => goToPage(page - 1)}>
                上一页
              </button>
              <button type="button" className={shellStyles.buttonSubtle} disabled={!pagination.hasNextPage || loading} onClick={() => goToPage(page + 1)}>
                下一页
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {selectedId ? (
        <UserDetailPanel detail={detail?.id === selectedId ? detail : null} loading={detailLoading} onClose={closeDetail} onRequestDelete={openDeleteDialog} />
      ) : null}
      {deleteTarget ? (
        <DeleteUserDataModal
          target={deleteTarget}
          confirmation={deleteConfirm}
          loading={deleteLoading}
          message={deleteMessage}
          onChangeConfirmation={setDeleteConfirm}
          onClose={closeDeleteDialog}
          onConfirm={() => void deleteUserData()}
        />
      ) : null}
      {auditOpen ? (
        <AuditLogsModal
          logs={auditLogs}
          loading={auditLoading}
          message={auditMessage}
          onClose={closeAuditLogs}
          onRefresh={() => void loadAuditLogs()}
        />
      ) : null}
    </section>
  );
}

function DeleteUserDataModal({
  target,
  confirmation,
  loading,
  message,
  onChangeConfirmation,
  onClose,
  onConfirm,
}: {
  target: AdminUserDetail;
  confirmation: string;
  loading: boolean;
  message: string;
  onChangeConfirmation: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const expected = target.email.trim().toLowerCase();
  const canDelete = confirmation.trim().toLowerCase() === expected;

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div className={styles.confirmPanel} role="dialog" aria-modal="true" aria-label="删除账号和数据" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={shellStyles.cardTitle}>删除账号和数据</h2>
            <p className={shellStyles.cardSubtitle}>{target.email}</p>
          </div>
          <button type="button" className={shellStyles.buttonSubtle} onClick={onClose} disabled={loading}>关闭</button>
        </div>
        <div className={styles.dangerNotice}>
          这会删除该用户的登录账号、项目、会话、图片记录、视频记录、画布、项目资产、投稿、收藏、个人 API 设置和云存储文件。
        </div>
        <label className={styles.confirmField}>
          <span>输入该用户邮箱确认</span>
          <input
            className={styles.searchInput}
            value={confirmation}
            disabled={loading}
            onChange={(event) => onChangeConfirmation(event.target.value)}
            placeholder={target.email}
          />
        </label>
        {message ? <p className={shellStyles.cardSubtitle}>{message}</p> : null}
        <div className={styles.headerActions}>
          <button type="button" className={shellStyles.buttonSubtle} onClick={onClose} disabled={loading}>取消</button>
          <button type="button" className={[shellStyles.buttonSubtle, styles.dangerButton].join(" ")} onClick={onConfirm} disabled={!canDelete || loading}>
            {loading ? "正在删除…" : "确认删除账号和数据"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditLogsModal({
  logs,
  loading,
  message,
  onClose,
  onRefresh,
}: {
  logs: AdminAuditLog[];
  loading: boolean;
  message: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div className={styles.modalPanel} role="dialog" aria-modal="true" aria-label="审计日志" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={shellStyles.cardTitle}>审计日志</h2>
            <p className={shellStyles.cardSubtitle}>集中查看后台用户管理、权限变更、审核和系统设置记录。</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={shellStyles.buttonSubtle} onClick={onRefresh}>刷新</button>
            <button type="button" className={shellStyles.buttonSubtle} onClick={onClose}>关闭</button>
          </div>
        </div>
        {message ? <p className={shellStyles.cardSubtitle}>{message}</p> : null}
        {loading ? <div className={shellStyles.empty}>正在加载审计日志…</div> : <AuditLogList logs={logs} title="操作记录" className={styles.detailPanel} compactEmpty />}
      </div>
    </div>
  );
}

function AuditLogList({
  logs,
  title = "审计日志",
  className,
  compactEmpty = false,
}: {
  logs: AdminAuditLog[];
  title?: string;
  className?: string;
  compactEmpty?: boolean;
}) {
  return (
    <section className={className ?? cardClass}>
      <div className={className ? styles.detailPanelHeader : shellStyles.cardHead}>
        <div>
          <h3 className={shellStyles.cardTitle}>{title}</h3>
          <p className={shellStyles.cardSubtitle}>后台写操作会记录操作者、目标和关键元数据。</p>
        </div>
      </div>
      {logs.length === 0 ? <div className={compactEmpty ? styles.compactEmpty : shellStyles.empty}>暂无审计记录。</div> : (
        <div className={styles.logList}>
          {logs.map((log) => (
            <article key={log.id} className={styles.logItem}>
              <div className={styles.logTopline}>
                <span>{log.action}</span>
                <span className={styles.muted}>{formatDate(log.createdAt)}</span>
              </div>
              <p className={shellStyles.cardSubtitle}>
                {log.actorEmail || log.actorUserId || "未知操作者"} {"->"} {log.targetEmail || log.targetUserId || "全局"}
              </p>
              <pre className={styles.codeBlock}>{JSON.stringify(log.metadata, null, 2)}</pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
