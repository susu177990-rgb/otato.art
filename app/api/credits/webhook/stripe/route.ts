import { constructStripeWebhookEvent, handleStripeWebhookEvent, markStripeWebhookFailed } from "@/lib/credits/stripe";

export async function POST(req: Request) {
  let event;
  try {
    const body = await req.text();
    event = constructStripeWebhookEvent(body, req.headers.get("stripe-signature"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook 验签失败";
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    const result = await handleStripeWebhookEvent(event);
    return Response.json(result);
  } catch (error) {
    await markStripeWebhookFailed(event, error);
    const message = error instanceof Error ? error.message : "Stripe webhook 处理失败";
    console.error("[credits/webhook/stripe]", { eventId: event.id, type: event.type, error: message });
    return Response.json({ error: message }, { status: 500 });
  }
}
