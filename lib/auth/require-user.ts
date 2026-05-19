import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function requireUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUserOr401(): Promise<{ user: User } | { error: Response }> {
  const user = await requireUser();
  if (!user) {
    return { error: Response.json({ error: "请先登录" }, { status: 401 }) };
  }
  return { user };
}
