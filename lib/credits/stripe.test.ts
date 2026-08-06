import { describe, expect, it } from "vitest";
import { stripeCheckoutCanGrantCredits } from "@/lib/credits/stripe";

describe("stripeCheckoutCanGrantCredits", () => {
  it("grants only after Stripe reports paid", () => {
    expect(stripeCheckoutCanGrantCredits({ payment_status: "paid" })).toBe(true);
    expect(stripeCheckoutCanGrantCredits({ payment_status: "unpaid" })).toBe(false);
    expect(stripeCheckoutCanGrantCredits({ payment_status: "no_payment_required" })).toBe(false);
  });
});
