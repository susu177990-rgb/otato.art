import { randomUUID } from "crypto";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureCreditAccount } from "./accounts";
import { hasOpenRefundRisk } from "./risk";
import { mapCreditOrder, mapCreditPackage } from "./rows";
import type { CreditOrder } from "./types";

let stripeClient: Stripe | null = null;

function row(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function appOrigin(): string {
  const value = process.env.APP_ORIGIN?.trim();
  if (!value) throw new Error("缺少环境变量 APP_ORIGIN");
  return value.replace(/\/+$/, "");
}

function safeReturnTo(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw.slice(0, 500);
}

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("缺少环境变量 STRIPE_SECRET_KEY");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function isStripeCheckoutConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.APP_ORIGIN?.trim());
}

export function constructStripeWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("缺少环境变量 STRIPE_WEBHOOK_SECRET");
  if (!signature) throw new Error("缺少 Stripe-Signature");
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
}

export async function createCreditCheckoutSession(params: {
  userId: string;
  userEmail?: string | null;
  packageId: string;
  returnTo?: string | null;
}): Promise<{ order: CreditOrder; checkoutUrl: string }> {
  const admin = createSupabaseAdminClient();
  const account = await ensureCreditAccount(params.userId);
  const { data: packageRow, error: packageError } = await admin
    .from("credit_packages")
    .select("*")
    .eq("id", params.packageId)
    .eq("enabled", true)
    .maybeSingle();
  if (packageError) throw packageError;
  if (!packageRow) throw new Error("充值套餐不存在或已下架");
  const pkg = mapCreditPackage(row(packageRow));
  const suppressBonus = await hasOpenRefundRisk(params.userId);
  const bonusCredits = suppressBonus ? 0 : pkg.bonusCredits;
  const returnTo = safeReturnTo(params.returnTo);
  const orderIdempotency = `checkout-order:${params.userId}:${params.packageId}:${randomUUID()}`;
  const { data: orderRow, error: orderError } = await admin
    .from("credit_orders")
    .insert({
      account_id: account.accountId,
      user_id: params.userId,
      package_id: pkg.id,
      provider: "stripe",
      status: "pending",
      currency: pkg.currency,
      amount_cents: pkg.amountCents,
      credits: pkg.credits,
      bonus_credits: bonusCredits,
      idempotency_key: orderIdempotency,
      metadata: {
        packageSnapshot: pkg,
        bonusSuppressed: suppressBonus,
        returnTo,
      },
    })
    .select("*")
    .single();
  if (orderError) throw orderError;
  const order = mapCreditOrder(row(orderRow));
  const origin = appOrigin();
  const successUrl = new URL(`${origin}/credits`);
  successUrl.searchParams.set("order", order.id);
  successUrl.searchParams.set("status", "success");
  if (returnTo) successUrl.searchParams.set("returnTo", returnTo);
  const cancelUrl = new URL(`${origin}/credits`);
  cancelUrl.searchParams.set("order", order.id);
  cancelUrl.searchParams.set("status", "cancel");
  if (returnTo) cancelUrl.searchParams.set("returnTo", returnTo);
  const session = await getStripeClient().checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: order.id,
      customer_email: params.userEmail ?? undefined,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pkg.currency,
            unit_amount: pkg.amountCents,
            product_data: {
              name: pkg.label,
              metadata: {
                packageId: pkg.id,
              },
            },
          },
        },
      ],
      metadata: {
        orderId: order.id,
        userId: params.userId,
        accountId: account.accountId,
        packageId: pkg.id,
        bonusSuppressed: String(suppressBonus),
        returnTo: returnTo ?? "",
      },
      payment_intent_data: {
        metadata: {
          orderId: order.id,
          userId: params.userId,
          accountId: account.accountId,
          packageId: pkg.id,
          bonusSuppressed: String(suppressBonus),
          returnTo: returnTo ?? "",
        },
      },
    },
    { idempotencyKey: `stripe-checkout:${order.id}` },
  );
  if (!session.url) throw new Error("Stripe 未返回 Checkout URL");
  const { data: updated, error: updateError } = await admin
    .from("credit_orders")
    .update({
      provider_order_id: session.id,
      metadata: {
        ...(order.metadata ?? {}),
        stripeSessionId: session.id,
      },
    })
    .eq("id", order.id)
    .select("*")
    .single();
  if (updateError) throw updateError;
  return { order: mapCreditOrder(row(updated)), checkoutUrl: session.url };
}

async function recordWebhookEvent(
  event: Stripe.Event,
  status: "received" | "processed" | "failed",
  metadata: Record<string, unknown>,
  errorMessage?: string,
) {
  const admin = createSupabaseAdminClient();
  const payload = {
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    status,
    event_payload: event as unknown as Record<string, unknown>,
    error_message: errorMessage ?? null,
    metadata,
  };
  const { data: updated, error: updateError } = await admin
    .from("payment_webhook_events")
    .update({
      event_type: payload.event_type,
      status: payload.status,
      event_payload: payload.event_payload,
      error_message: payload.error_message,
      metadata: payload.metadata,
    })
    .eq("provider", "stripe")
    .eq("event_id", event.id)
    .select("id")
    .maybeSingle();
  if (updateError && !/payment_webhook_events|schema cache|does not exist|PGRST205/i.test(updateError.message)) {
    throw updateError;
  }
  if (updated) return;
  const { error } = await admin.from("payment_webhook_events").insert(payload);
  if (error && !/duplicate key|payment_webhook_events_unique|payment_webhook_events|schema cache|does not exist|PGRST205/i.test(error.message)) throw error;
}

async function markWebhookProcessed(event: Stripe.Event, metadata: Record<string, unknown>) {
  await recordWebhookEvent(event, "processed", metadata);
}

export async function markStripeWebhookFailed(event: Stripe.Event, error: unknown) {
  const message = error instanceof Error ? error.message : "Stripe webhook 处理失败";
  await recordWebhookEvent(event, "failed", {}, message).catch((recordError) => {
    console.error("[credits/webhook/stripe] failed to record webhook error", {
      eventId: event.id,
      recordError,
    });
  });
}

async function webhookAlreadyProcessed(eventId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("event_id", eventId)
    .eq("status", "processed")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<{ ok: true; skipped?: boolean }> {
  if (await webhookAlreadyProcessed(event.id)) return { ok: true, skipped: true };
  await recordWebhookEvent(event, "received", {});
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId || session.client_reference_id;
    if (!orderId) throw new Error("Stripe session 缺少 orderId");
    const admin = createSupabaseAdminClient();
    const { data: orderRow, error: orderError } = await admin
      .from("credit_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!orderRow) throw new Error("本地充值订单不存在");
    const order = mapCreditOrder(row(orderRow));
    if (order.providerOrderId && order.providerOrderId !== session.id) {
      throw new Error("Stripe session 与本地订单不匹配");
    }
    if (session.amount_total !== order.amountCents || String(session.currency ?? "").toLowerCase() !== order.currency) {
      throw new Error("Stripe 支付金额或币种与本地订单不匹配");
    }
    const { error: updateError } = await admin
      .from("credit_orders")
      .update({
        provider_order_id: session.id,
        metadata: {
          ...(order.metadata ?? {}),
          stripePaymentStatus: session.payment_status,
          stripeSessionId: session.id,
        },
      })
      .eq("id", order.id);
    if (updateError) throw updateError;
    const { error: grantError } = await admin.rpc("grant_order_credits", {
      p_order_id: order.id,
      p_idempotency_key: `stripe:event:${event.id}`,
      p_metadata: {
        stripeEventId: event.id,
        stripeSessionId: session.id,
        paymentStatus: session.payment_status,
      },
    });
    if (grantError) throw grantError;
    await markWebhookProcessed(event, { orderId: order.id, stripeSessionId: session.id });
    return { ok: true };
  }

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId || session.client_reference_id;
    if (orderId) {
      const admin = createSupabaseAdminClient();
      await admin
        .from("credit_orders")
        .update({
          status: event.type === "checkout.session.expired" ? "canceled" : "failed",
          metadata: {
            stripeEventId: event.id,
            stripeSessionId: session.id,
            stripeEventType: event.type,
          },
        })
        .eq("id", orderId)
        .eq("status", "pending");
    }
    await markWebhookProcessed(event, { orderId });
    return { ok: true };
  }

  if (event.type === "charge.refunded" || event.type === "refund.created") {
    const object = event.data.object as { metadata?: Record<string, string | undefined>; id?: string };
    const orderId = object.metadata?.orderId;
    if (orderId) {
      const admin = createSupabaseAdminClient();
      const { data: orderRow } = await admin
        .from("credit_orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      await admin
        .from("credit_orders")
        .update({
          status: "refund_review",
          metadata: {
            stripeEventId: event.id,
            stripeObjectId: object.id,
            stripeEventType: event.type,
            refundReview: true,
          },
        })
        .eq("id", orderId);
      await admin.from("credit_risk_events").insert({
        user_id: typeof orderRow?.user_id === "string" ? orderRow.user_id : null,
        account_id: typeof orderRow?.account_id === "string" ? orderRow.account_id : null,
        order_id: orderId,
        risk_type: "refund_review",
        status: "open",
        severity: "high",
        amount_cents: typeof orderRow?.amount_cents === "number" ? orderRow.amount_cents : null,
        currency: typeof orderRow?.currency === "string" ? orderRow.currency : "usd",
        credits: typeof orderRow?.credits === "number" && typeof orderRow?.bonus_credits === "number"
          ? orderRow.credits + orderRow.bonus_credits
          : null,
        metadata: {
          stripeEventId: event.id,
          stripeObjectId: object.id,
          stripeEventType: event.type,
        },
      }).then(({ error }) => {
        if (error && !/credit_risk_events|schema cache|does not exist|PGRST205/i.test(error.message)) throw error;
      });
    }
    await markWebhookProcessed(event, { refundReview: true, orderId });
    return { ok: true };
  }

  await markWebhookProcessed(event, { ignored: true });
  return { ok: true };
}

export async function syncStripeSessionForOrder(orderId: string): Promise<CreditOrder> {
  const admin = createSupabaseAdminClient();
  const { data: orderRow, error: orderError } = await admin
    .from("credit_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) throw new Error("本地充值订单不存在");
  const order = mapCreditOrder(row(orderRow));
  if (!order.providerOrderId) throw new Error("订单缺少 Stripe session");
  const session = await getStripeClient().checkout.sessions.retrieve(order.providerOrderId);
  if (session.amount_total !== order.amountCents || String(session.currency ?? "").toLowerCase() !== order.currency) {
    throw new Error("Stripe 支付金额或币种与本地订单不匹配");
  }
  if (session.status !== "complete" && session.payment_status !== "paid") {
    throw new Error("Stripe session 尚未支付完成");
  }
  const { data, error } = await admin.rpc("grant_order_credits", {
    p_order_id: order.id,
    p_idempotency_key: `stripe:manual-sync:${session.id}`,
    p_metadata: {
      stripeSessionId: session.id,
      paymentStatus: session.payment_status,
      manualSync: true,
    },
  });
  if (error) throw error;
  return mapCreditOrder(row(data));
}

export async function replayStoredStripeWebhookEvent(eventId: string): Promise<{ ok: true; skipped?: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("payment_webhook_events")
    .select("event_payload")
    .eq("provider", "stripe")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  const payload = row(data?.event_payload);
  if (!payload.id || !payload.type || !payload.data) throw new Error("Webhook 事件缺少可重放 payload");
  return handleStripeWebhookEvent(payload as unknown as Stripe.Event);
}
