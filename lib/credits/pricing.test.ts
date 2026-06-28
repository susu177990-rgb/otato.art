import { describe, expect, it } from "vitest";
import { quoteImageCredits, quoteVideoCredits } from "./pricing";

type Row = Record<string, unknown>;

function mockSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async maybeSingle() {
          return {
            data: (tables[table] ?? []).find((row) => filters.every((filter) => filter(row))) ?? null,
            error: null,
          };
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          return Promise.resolve({
            data: (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))),
            error: null,
          }).then(resolve);
        },
      };
      return builder;
    },
  } as never;
}

describe("credit pricing", () => {
  it("quotes non-GPT image models by size only", async () => {
    const supabase = mockSupabase({
      image_credit_prices: [
        { model_id: "nano-banana-2", size_tier: "2K", gpt_quality: null, credits: 12, enabled: true },
      ],
    });
    await expect(quoteImageCredits(supabase, {
      feature: "image",
      modelId: "nano-banana-2",
      imageSize: "2K",
      gptImageQuality: "high",
    })).resolves.toMatchObject({
      credits: 12,
      gptImageQuality: undefined,
    });
  });

  it("includes CNY provider cost metadata in image quotes", async () => {
    const quote = await quoteImageCredits(mockSupabase({
      image_credit_prices: [
        { model_id: "nano-banana-2", size_tier: "1K", gpt_quality: null, credits: 34, enabled: true },
      ],
      provider_cost_prices: [
        {
          id: "cost_1",
          feature: "image",
          model_id: "nano-banana-2",
          size_tier: "1K",
          gpt_quality: null,
          unit: "image",
          enabled: true,
          provider: "crun",
          cost_currency: "cny",
          cost_per_unit_minor: 17,
          source: "estimated",
          effective_from: null,
          effective_to: null,
          metadata: { source: "crun_pricing", crunPlan: "$5" },
        },
      ],
    }), {
      feature: "image",
      modelId: "nano-banana-2",
      imageSize: "1K",
    });
    expect(quote.costSnapshot.currency).toBe("cny");
    expect(quote.costSnapshot.metadata).toMatchObject({ source: "crun_pricing", crunPlan: "$5" });
    expect(quote.estimatedMarginPercent).toBe(50);
  });


  it("quotes gpt-image-2 by size and normalized quality", async () => {
    const supabase = mockSupabase({
      image_credit_prices: [
        { model_id: "gpt-image-2", size_tier: "4K", gpt_quality: "low", credits: 99, enabled: true },
        { model_id: "gpt-image-2", size_tier: "4K", gpt_quality: "medium", credits: 199, enabled: true },
      ],
    });
    const quote = await quoteImageCredits(supabase, {
      feature: "image",
      modelId: "gpt-image-2",
      imageSize: "4K",
    });
    expect(quote.credits).toBe(99);
    expect(quote.gptImageQuality).toBe("low");
    expect(quote.priceSnapshot.gptImageQuality).toBe("low");
    expect(quote.priceSnapshot.normalizedQuality).toBe("low");

    const mediumQuote = await quoteImageCredits(supabase, {
      feature: "image",
      modelId: "gpt-image-2",
      imageSize: "4K",
      gptImageQuality: "medium",
    });
    expect(mediumQuote.credits).toBe(199);
    expect(mediumQuote.gptImageQuality).toBe("medium");
    expect(mediumQuote.priceSnapshot.gptImageQuality).toBe("medium");
    expect(mediumQuote.priceSnapshot.normalizedQuality).toBe("medium");
  });

  it("returns a clear image pricing error when no enabled price exists", async () => {
    await expect(quoteImageCredits(mockSupabase({ image_credit_prices: [] }), {
      feature: "image",
      modelId: "z-image",
      imageSize: "1K",
    })).rejects.toMatchObject({
      code: "image_price_not_configured",
      status: 400,
    });
  });

  it("quotes video by ceil(seconds) times credits_per_second", async () => {
    const quote = await quoteVideoCredits(mockSupabase({
      video_credit_prices: [
        {
          model_id: "seedance-2.0",
          mode_id: "text_to_video",
          resolution: "720p",
          credits_per_second: 7,
          minimum_credits: 999,
          enabled: true,
        },
      ],
    }), {
      feature: "video",
      modelId: "seedance-2.0",
      modeId: "text_to_video",
      resolution: "720p",
      durationSeconds: 4.2,
    });
    expect(quote.billableSeconds).toBe(5);
    expect(quote.credits).toBe(35);
    expect(quote.minimumCredits).toBe(0);
    expect(quote.priceSnapshot.minimumCredits).toBeUndefined();
  });

  it("rejects unsupported video mode/resolution shapes before reading prices", async () => {
    await expect(quoteVideoCredits(mockSupabase({ video_credit_prices: [] }), {
      feature: "video",
      modelId: "seedance-2.0-fast",
      modeId: "text_to_video",
      resolution: "1080p",
      durationSeconds: 5,
    })).rejects.toMatchObject({
      code: "video_resolution_not_supported",
      status: 422,
    });
  });

  it("rejects video edit billing without a readable source duration", async () => {
    await expect(quoteVideoCredits(mockSupabase({ video_credit_prices: [] }), {
      feature: "video",
      modelId: "happyhorse-1.0",
      modeId: "video_edit",
      resolution: "720p",
      durationSeconds: 0,
    })).rejects.toMatchObject({
      code: "video_duration_missing",
      status: 422,
    });
  });
});
