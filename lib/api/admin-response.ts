import { NextResponse } from "next/server";
import { formatDbError } from "@/lib/db/format-db-error";

export function adminErrorResponse(error: unknown, fallback = "operation_failed", status = 500): NextResponse {
  const message = error instanceof Error ? error.message : formatDbError(error) || fallback;
  const forbidden = /无权|forbidden|permission/i.test(message);
  const missingConfig = /SUPABASE_SERVICE_ROLE_KEY|service role/i.test(message);
  return NextResponse.json(
    { error: message || fallback },
    { status: forbidden ? 403 : missingConfig ? 503 : status },
  );
}
