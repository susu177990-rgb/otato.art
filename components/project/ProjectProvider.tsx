"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import styles from "./project-provider.module.css";

type DeleteTarget = {
  id: string;
  name: string;
  onDeleted?: () => void | Promise<void>;
};

type ProjectDialog =
  | { type: "create" }
  | { type: "rename" }
  | { type: "delete"; target: DeleteTarget }
  | null;

type ProjectWorkspaceContextValue = {
  project: Project | null;
  projectId: string | null;
  loading: boolean;
  error: string;
  refreshProject: () => Promise<void>;
  openCreateDialog: () => void;
  openRenameDialog: () => void;
  openDeleteDialog: (target: DeleteTarget) => void;
};

const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | null>(null);

function projectIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const projectId = useMemo(() => projectIdFromPathname(pathname), [pathname]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<ProjectDialog>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const refreshProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response, "项目无法加载"));
      setProject((await response.json()) as Project);
    } catch (loadError) {
      setProject(null);
      setError(loadError instanceof DOMException && loadError.name === "AbortError"
        ? "项目加载超时，请刷新后重试"
        : loadError instanceof Error ? loadError.message : "项目无法加载");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  const closeDialog = useCallback(() => {
    if (submitting) return;
    setDialog(null);
    setDialogError("");
    setName("");
  }, [submitting]);

  const openCreateDialog = useCallback(() => {
    setName("");
    setDialogError("");
    setDialog({ type: "create" });
  }, []);

  const openRenameDialog = useCallback(() => {
    if (!project) return;
    setName(project.name);
    setDialogError("");
    setDialog({ type: "rename" });
  }, [project]);

  const openDeleteDialog = useCallback((target: DeleteTarget) => {
    setDialogError("");
    setDialog({ type: "delete", target });
  }, []);

  const submitName = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!dialog || dialog.type === "delete" || !trimmedName || submitting) return;

    setSubmitting(true);
    setDialogError("");
    try {
      if (dialog.type === "create") {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        });
        if (!response.ok) throw new Error(await responseError(response, "创建项目失败"));
        const created = (await response.json()) as Project;
        setDialog(null);
        setName("");
        router.push(`/projects/${encodeURIComponent(created.id)}`);
        return;
      }

      if (!projectId) throw new Error("缺少项目身份");
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) throw new Error(await responseError(response, "项目名称保存失败"));
      setProject((await response.json()) as Project);
      setDialog(null);
      setName("");
    } catch (submitError) {
      setDialogError(submitError instanceof Error ? submitError.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }, [dialog, name, projectId, router, submitting]);

  const confirmDelete = useCallback(async () => {
    if (!dialog || dialog.type !== "delete" || submitting) return;
    setSubmitting(true);
    setDialogError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(dialog.target.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await responseError(response, "删除项目失败"));
      await dialog.target.onDeleted?.();
      const deletingCurrentProject = dialog.target.id === projectId;
      setDialog(null);
      if (deletingCurrentProject) router.replace("/projects");
    } catch (deleteError) {
      setDialogError(deleteError instanceof Error ? deleteError.message : "删除项目失败");
    } finally {
      setSubmitting(false);
    }
  }, [dialog, projectId, router, submitting]);

  const value = useMemo<ProjectWorkspaceContextValue>(() => ({
    project,
    projectId,
    loading,
    error,
    refreshProject,
    openCreateDialog,
    openRenameDialog,
    openDeleteDialog,
  }), [
    error,
    loading,
    openCreateDialog,
    openDeleteDialog,
    openRenameDialog,
    project,
    projectId,
    refreshProject,
  ]);

  const dialogTitle = dialog?.type === "create"
    ? "新建项目"
    : dialog?.type === "rename"
      ? "修改项目名称"
      : "删除项目";

  return (
    <ProjectWorkspaceContext.Provider value={value}>
      {children}
      {dialog ? (
        <div className={styles.scrim} role="presentation" onMouseDown={closeDialog}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogHead}>
              <h2 id="project-dialog-title">{dialogTitle}</h2>
              <button type="button" className={styles.closeButton} onClick={closeDialog} aria-label="关闭">
                ×
              </button>
            </div>

            {dialog.type === "delete" ? (
              <>
                <p className={styles.dialogCopy}>
                  确定删除“{dialog.target.name}”？此操作不可恢复。
                </p>
                {dialogError ? <p className={styles.error}>{dialogError}</p> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryButton} onClick={closeDialog} disabled={submitting}>
                    取消
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={() => void confirmDelete()} disabled={submitting}>
                    {submitting ? "删除中..." : "删除项目"}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void submitName(event)}>
                <label className={styles.field}>
                  <span>项目名称</span>
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="输入项目名称"
                    maxLength={80}
                    disabled={submitting}
                  />
                </label>
                {dialogError ? <p className={styles.error}>{dialogError}</p> : null}
                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryButton} onClick={closeDialog} disabled={submitting}>
                    取消
                  </button>
                  <button type="submit" className={styles.primaryButton} disabled={submitting || !name.trim()}>
                    {submitting ? "保存中..." : dialog.type === "create" ? "创建并进入" : "保存"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </ProjectWorkspaceContext.Provider>
  );
}

export function useProjectWorkspace(): ProjectWorkspaceContextValue {
  const context = useContext(ProjectWorkspaceContext);
  if (!context) throw new Error("useProjectWorkspace must be used within ProjectProvider");
  return context;
}
