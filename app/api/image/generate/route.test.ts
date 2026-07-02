import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/image/generate/route";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import {
  persistGeneratedImageToStorage,
  persistGeneratedImageWithThumbnailToStorage,
} from "@/lib/db/persist-generated-image";
import { captureCreditReservation, ensureCreditAccount, releaseCreditReservation, reserveCreditsForQuote } from "@/lib/credits/accounts";
import { quoteImageCredits } from "@/lib/credits/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prependGalleryRecord } from "@/lib/db/gallery-store";
import type { ImageModelSettings } from "@/lib/image-workspace";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/db/workspace-settings-store", () => ({
  getWorkspaceSnapshot: vi.fn(),
}));

vi.mock("@/lib/db/persist-generated-image", () => ({
  persistGeneratedImageToStorage: vi.fn(),
  persistGeneratedImageWithThumbnailToStorage: vi.fn(),
}));

vi.mock("@/lib/db/gallery-store", () => ({
  prependGalleryRecord: vi.fn(),
}));

vi.mock("@/lib/credits/pricing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits/pricing")>();
  return {
    ...actual,
    quoteImageCredits: vi.fn(),
  };
});

vi.mock("@/lib/credits/accounts", () => ({
  reserveCreditsForQuote: vi.fn(),
  captureCreditReservation: vi.fn(),
  releaseCreditReservation: vi.fn(),
  ensureCreditAccount: vi.fn(),
}));

vi.mock("@/lib/credits/risk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits/risk")>();
  return {
    ...actual,
    assertCreditGenerationAllowed: vi.fn().mockResolvedValue(undefined),
  };
});

const crunModel: ImageModelSettings = {
  id: "nano-banana-2",
  label: "Nano Banana 2",
  modelName: "google/nano-banana-2",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "nano-banana",
};

const grokCrunModel: ImageModelSettings = {
  id: "grok-imagine-i2i",
  label: "Grok Imagine",
  modelName: "grok-imagine/i2i",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "grok-imagine",
};

function supabaseMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "project-1" }, error: null }),
    })),
  };
}

function imageGenerateRequest(refFile?: Blob): Request {
  const fd = new FormData();
  fd.set("meta", JSON.stringify({
    prompt: "use the reference subject",
    model: crunModel,
    aspectRatio: "16:9",
    imageSize: "2K",
    refImages: [],
    projectId: "project-1",
  }));
  if (refFile) fd.append("ref", refFile, "reference.png");
  return new Request("http://localhost/api/image/generate", {
    method: "POST",
    body: fd,
  });
}

function imageGenerateRequestWithRefs(files: Blob[], meta: Record<string, unknown> = {}): Request {
  const fd = new FormData();
  fd.set("meta", JSON.stringify({
    prompt: "use the reference subject",
    model: crunModel,
    aspectRatio: "16:9",
    imageSize: "2K",
    refImages: [],
    projectId: "project-1",
    ...meta,
  }));
  files.forEach((file, index) => fd.append("ref", file, `reference-${index + 1}.png`));
  return new Request("http://localhost/api/image/generate", {
    method: "POST",
    body: fd,
  });
}

function grokImageGenerateRequest(refFile?: Blob): Request {
  const fd = new FormData();
  fd.set("meta", JSON.stringify({
    prompt: "use the reference subject",
    modelId: "grok-imagine-i2i",
    aspectRatio: "9:16",
    imageSize: "2K",
    refImages: [],
    projectId: "project-1",
  }));
  if (refFile) fd.append("ref", refFile, "reference.png");
  return new Request("http://localhost/api/image/generate", {
    method: "POST",
    body: fd,
  });
}

function jsonImageGenerateRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "use the reference subject",
      modelId: "gpt-image-2",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: [],
      projectId: "project-1",
      ...body,
    }),
  });
}

describe("POST /api/image/generate CRUN references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabaseMock() as never);
    vi.mocked(getWorkspaceSnapshot).mockResolvedValue({
      imageWorkspace: {
        models: {
          "gpt-image-2": { ...crunModel, id: "gpt-image-2", modelName: "openai/gpt-image-2-premium", provider: "gpt-image" },
          "nano-banana-2": crunModel,
          "nano-banana-pro": { ...crunModel, id: "nano-banana-pro", modelName: "google/nano-banana-pro" },
          "grok-imagine-i2i": grokCrunModel,
          "z-image": { ...crunModel, id: "z-image", modelName: "z-image", provider: "z-image" },
        },
      },
    } as never);
    vi.mocked(persistGeneratedImageToStorage).mockResolvedValue("https://storage.example.com/ref.png");
    vi.mocked(persistGeneratedImageWithThumbnailToStorage).mockResolvedValue({
      imageUrl: "https://storage.example.com/generated.png",
      thumbnailUrl: "https://storage.example.com/thumb.png",
    });
    vi.mocked(quoteImageCredits).mockResolvedValue({
      feature: "image",
      modelId: "nano-banana-2",
      imageSize: "2K",
      credits: 12,
      priceSnapshot: { kind: "image" },
      costSnapshot: { costMissing: true },
      estimatedMarginCredits: null,
      estimatedMarginPercent: null,
      marginStatus: "cost_missing",
    });
    vi.mocked(reserveCreditsForQuote).mockResolvedValue({
      id: "reservation-1",
      accountId: "account-1",
      userId: "user-1",
      status: "pending",
      reservedCredits: 12,
      capturedCredits: null,
      feature: "image",
      modelId: "nano-banana-2",
      projectId: "project-1",
      requestId: "request-1",
      priceSnapshot: {},
      costSnapshot: {},
      estimatedMarginCredits: null,
      estimatedMarginPercent: null,
      metadata: {},
      resultRef: null,
      failureReason: null,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(captureCreditReservation).mockResolvedValue({
      id: "reservation-1",
      accountId: "account-1",
      userId: "user-1",
      status: "captured",
      reservedCredits: 12,
      capturedCredits: 12,
      feature: "image",
      modelId: "nano-banana-2",
      projectId: "project-1",
      requestId: "request-1",
      priceSnapshot: {},
      costSnapshot: {},
      estimatedMarginCredits: null,
      estimatedMarginPercent: null,
      metadata: {},
      resultRef: "https://storage.example.com/generated.png",
      failureReason: null,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(ensureCreditAccount).mockResolvedValue({
      accountId: "account-1",
      userId: "user-1",
      availableCredits: 88,
      reservedCredits: 0,
      lifetimePurchasedCredits: 100,
      lifetimeBonusCredits: 0,
      lifetimeSpentCredits: 12,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(releaseCreditReservation).mockResolvedValue({
      id: "reservation-1",
      accountId: "account-1",
      userId: "user-1",
      status: "released",
      reservedCredits: 12,
      capturedCredits: null,
      feature: "image",
      modelId: "nano-banana-2",
      projectId: "project-1",
      requestId: "request-1",
      priceSnapshot: {},
      costSnapshot: {},
      estimatedMarginCredits: null,
      estimatedMarginPercent: null,
      metadata: {},
      resultRef: null,
      failureReason: "failed",
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.mocked(prependGalleryRecord).mockImplementation(async (_supabase, record) => [record] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads multipart reference files before sending CRUN img_urls", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const response = await POST(imageGenerateRequest(new Blob(["abc"], { type: "image/png" })) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.imageUrl).toBe("https://storage.example.com/generated.png");
    expect(data.galleryRecord.referenceImages).toEqual([
      {
        slotIndex: 0,
        dataUrl: "https://storage.example.com/ref.png",
        name: "reference.png",
        type: "image/png",
      },
    ]);
    expect(persistGeneratedImageToStorage).toHaveBeenCalledTimes(1);
    expect(persistGeneratedImageToStorage).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.stringMatching(/^data:image\/png;base64,/),
      expect.stringContaining("-reference-1"),
    );
    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as { input: Record<string, unknown> };
    expect(submitBody.input.img_urls).toEqual(["https://storage.example.com/ref.png"]);
    expect(JSON.stringify(submitBody)).not.toContain("data:image");
  });

  it("uploads each slot reference once and sends only selected slots to the model", async () => {
    vi.mocked(persistGeneratedImageToStorage)
      .mockResolvedValueOnce("https://storage.example.com/ref-1.png")
      .mockResolvedValueOnce("https://storage.example.com/ref-2.png");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const response = await POST(imageGenerateRequestWithRefs(
      [
        new Blob(["one"], { type: "image/png" }),
        new Blob(["two"], { type: "image/png" }),
      ],
      {
        refSlotIndexes: [0, 1],
        modelRefSlotIndexes: [1],
      },
    ) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(persistGeneratedImageToStorage).toHaveBeenCalledTimes(2);
    expect(data.galleryRecord.referenceImages.map((image: { slotIndex: number; dataUrl: string }) => ({
      slotIndex: image.slotIndex,
      dataUrl: image.dataUrl,
    }))).toEqual([
      { slotIndex: 0, dataUrl: "https://storage.example.com/ref-1.png" },
      { slotIndex: 1, dataUrl: "https://storage.example.com/ref-2.png" },
    ]);
    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as { input: Record<string, unknown> };
    expect(submitBody.input.img_urls).toEqual(["https://storage.example.com/ref-2.png"]);
  });

  it("omits unsupported Grok I2I aspect ratio for multipart reference generations", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const response = await POST(grokImageGenerateRequest(new Blob(["abc"], { type: "image/png" })) as never);

    expect(response.status).toBe(200);
    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as { model: string; input: Record<string, unknown> };
    expect(submitBody.model).toBe("grok-imagine/i2i");
    expect(submitBody.input.img_urls).toEqual(["https://storage.example.com/ref.png"]);
    expect(submitBody.input.aspect_ratio).toBeUndefined();
    const data = await response.json();
    expect(data.galleryRecord).toMatchObject({
      sourceProvider: "crun",
      sourceTaskId: "task-1",
      sourceTaskModel: "grok-imagine/i2i",
      sourceTaskOutputIndex: 0,
    });
  });

  it("allows long Grok prompts when uploaded references make the request I2I", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const response = await POST(imageGenerateRequestWithRefs(
      [new Blob(["abc"], { type: "image/png" })],
      {
        prompt: "x".repeat(6000),
        modelId: "grok-imagine-i2i",
        model: grokCrunModel,
        refSlotIndexes: [0],
        modelRefSlotIndexes: [0],
      },
    ) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.imageUrl).toBe("https://storage.example.com/generated.png");
    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as { model: string; input: Record<string, unknown> };
    expect(submitBody.model).toBe("grok-imagine/i2i");
    expect(String(submitBody.input.prompt)).toHaveLength(6000);
    expect(submitBody.input.img_urls).toEqual(["https://storage.example.com/ref.png"]);
  });

  it("sends the selected aspect ratio for Grok T2I JSON generations", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const response = await POST(jsonImageGenerateRequest({
      modelId: "grok-imagine-i2i",
      aspectRatio: "9:16",
      refImages: [],
    }) as never);

    expect(response.status).toBe(200);
    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as { model: string; input: Record<string, unknown> };
    expect(submitBody.model).toBe("grok-imagine/t2i");
    expect(submitBody.input.aspect_ratio).toBe("9:16");
    expect(submitBody.input.img_urls).toBeUndefined();
    const data = await response.json();
    expect(data.galleryRecord).toMatchObject({
      sourceProvider: "crun",
      sourceTaskId: "task-1",
      sourceTaskModel: "grok-imagine/t2i",
      sourceTaskOutputIndex: 0,
    });
  });

  it("returns a user-friendly content rejection for CRUN moderation failures", async () => {
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "failed", reason: "input_moderation" } }),
          { status: 200 },
        ),
      );

    const response = await POST(imageGenerateRequest() as never);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.code).toBe("IMAGE_UPSTREAM_POLL");
    expect(data.reasonCode).toBe("CONTENT_REJECTED");
    expect(data.userMessage).toContain("安全审核");
    expect(data.error).toBe("input_moderation");
    expect(persistGeneratedImageWithThumbnailToStorage).not.toHaveBeenCalled();
  });

  it("allows legal GPT Image 2 Premium requests with eight thousand prompt characters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const response = await POST(jsonImageGenerateRequest({
      prompt: "a".repeat(8000),
      aspectRatio: "9:21",
      imageSize: "4K",
      gptImageQuality: "high",
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.imageUrl).toBe("https://storage.example.com/generated.png");
    expect(reserveCreditsForQuote).toHaveBeenCalledTimes(1);
    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as { input: Record<string, unknown> };
    expect(submitBody.input.prompt).toHaveLength(8000);
    expect(submitBody.input.aspect_ratio).toBe("9:21");
    expect(submitBody.input.resolution).toBe("4K");
    expect(submitBody.input.quality).toBe("high");
  });

  it("rejects GPT Image 2 Premium requests with more than fourteen references before reserving credits", async () => {
    const response = await POST(jsonImageGenerateRequest({
      refImages: Array.from({ length: 15 }, (_, index) => `https://cdn.example.com/ref-${index}.png`),
    }) as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.reasonCode).toBe("INVALID_PROMPT");
    expect(data.userMessage).toContain("最多支持 14 张参考图");
    expect(quoteImageCredits).not.toHaveBeenCalled();
    expect(reserveCreditsForQuote).not.toHaveBeenCalled();
  });

  it("returns CRUN 422 validation details instead of a generic invalid prompt message", async () => {
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 422,
            message: "Missing Params or Type Error",
            errors: ["input.aspect_ratio must be one of the allowed values"],
          }),
          { status: 422 },
        ),
      );

    const response = await POST(jsonImageGenerateRequest() as never);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.reasonCode).toBe("INVALID_PROMPT");
    expect(data.userMessage).toContain("aspect_ratio");
    expect(releaseCreditReservation).toHaveBeenCalledTimes(1);
  });
});
