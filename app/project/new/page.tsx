import { redirect } from "next/navigation";

/**
 * /project/new 是为兼容旧链接保留的 redirect stub。
 * 新建项目流程已经合并到 /projects 顶栏的「新建项目」按钮：
 * 直接 POST /api/projects 后路由到 /project/[id]/onboarding。
 */
export default function NewProjectRedirect(): never {
  redirect("/projects");
}
