import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { captureCreditReservation, releaseCreditReservation } from "./accounts";
import { getStripeClient } from "./stripe";
import { runMediaCleanup } from "@/lib/media-cleanup";
import { runVideoJobWorker } from "@/lib/video-jobs/worker";

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function runCreditMaintenance() {
  const admin = createSupabaseAdminClient();
  const result = {
    releasedReservations: 0,
    capturedPendingReservations: 0,
    paidOrdersGranted: 0,
    mediaCleanup: { completed: 0, failed: 0 },
    videoJobs: { claimed: 0 },
    failedWebhookEvents: 0,
    errors: [] as string[],
  };

  try {
    const videoJobs = await runVideoJobWorker(admin, { limit: 10, workerId: "credit-maintenance" });
    result.videoJobs = { claimed: videoJobs.claimed };
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "视频任务维护失败");
  }

  try {
    const cleanup = await runMediaCleanup(admin, 100);
    result.mediaCleanup = { completed: cleanup.completed, failed: cleanup.failed };
    result.errors.push(...cleanup.errors);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "媒体清理任务失败");
  }

  const capturePending = await admin
    .from("credit_reservations")
    .select("id,result_ref")
    .eq("status", "capture_pending")
    .not("result_ref", "is", null)
    .order("updated_at", { ascending: true })
    .limit(200);
  if (capturePending.error) throw capturePending.error;
  for (const item of capturePending.data ?? []) {
    try {
      await captureCreditReservation({
        reservationId: String(item.id),
        resultRef: String(item.result_ref),
        metadata: { maintenance: true, reconciledCapture: true },
      });
      result.capturedPendingReservations += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "补结算生成冻结失败");
    }
  }

  const expired = await admin
    .from("credit_reservations")
    .select("id")
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(200);
  if (expired.error) throw expired.error;
  for (const item of expired.data ?? []) {
    try {
      await releaseCreditReservation({
        reservationId: String(item.id),
        reason: "expired_released",
        metadata: { maintenance: true },
      });
      result.releasedReservations += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "释放过期冻结失败");
    }
  }

  const failedWebhooks = await admin
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("status", "failed")
    .limit(100);
  if (!failedWebhooks.error) {
    result.failedWebhookEvents = failedWebhooks.data?.length ?? 0;
  } else if (!/payment_webhook_events|schema cache|does not exist|PGRST205/i.test(failedWebhooks.error.message)) {
    result.errors.push(failedWebhooks.error.message);
  }

  const pendingOrders = await admin
    .from("credit_orders")
    .select("*")
    .eq("provider", "stripe")
    .eq("status", "pending")
    .not("provider_order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(50);
  if (pendingOrders.error) throw pendingOrders.error;
  const canUseStripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  if (canUseStripe) {
    for (const item of pendingOrders.data ?? []) {
      const order = row(item);
      const sessionId = String(order.provider_order_id ?? "");
      if (!sessionId) continue;
      try {
        const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
        const currencyMatches = String(session.currency ?? "").toLowerCase() === String(order.currency ?? "").toLowerCase();
        const amountMatches = num(session.amount_total) === num(order.amount_cents);
        if (session.payment_status === "paid" && currencyMatches && amountMatches) {
          const { error } = await admin.rpc("grant_order_credits", {
            p_order_id: String(order.id),
            p_idempotency_key: `stripe:maintenance:${session.id}`,
            p_metadata: {
              stripeSessionId: session.id,
              paymentStatus: session.payment_status,
              maintenance: true,
            },
          });
          if (error) throw error;
          result.paidOrdersGranted += 1;
        }
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : `同步 Stripe session 失败：${sessionId}`);
      }
    }
  }

  await admin.from("credit_maintenance_runs").insert({
    status: result.errors.length > 0 ? "completed_with_errors" : "completed",
    metadata: result,
  }).then(({ error }) => {
    if (error && !/credit_maintenance_runs|schema cache|does not exist|PGRST205/i.test(error.message)) {
      result.errors.push(error.message);
    }
  });

  return result;
}
