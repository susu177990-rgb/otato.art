import { afterEach, describe, expect, it, vi } from "vitest";
import { generateImage } from "@/lib/image-generate";
import type { ImageModelSettings } from "@/lib/image-workspace";

const crunModel: ImageModelSettings = {
  id: "nano-banana-2",
  label: "Nano Banana 2",
  modelName: "google/nano-banana-2",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "nano-banana",
};

const crunGptImageModel: ImageModelSettings = {
  id: "gpt-image-2",
  label: "GPT Image 2",
  modelName: "openai/gpt-image-2",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "gpt-image",
};

const crunGptImageStableModel: ImageModelSettings = {
  id: "gpt-image-2",
  label: "GPT Image 2 Stable",
  modelName: "openai/gpt-image-2-stable",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "gpt-image",
};

const crunGptImagePremiumModel: ImageModelSettings = {
  id: "gpt-image-2",
  label: "GPT Image 2 Premium",
  modelName: "openai/gpt-image-2-premium",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "gpt-image",
};

const grokI2iModel: ImageModelSettings = {
  id: "grok-imagine-i2i",
  label: "Grok Imagine",
  modelName: "grok-imagine/i2i",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "grok-imagine",
};

const zImageModel: ImageModelSettings = {
  id: "z-image",
  label: "Z Image Turbo",
  modelName: "z-image",
  endpointUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  provider: "z-image",
};

describe("generateImage CRUN task adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses CRUN X-API-KEY task format instead of chat completions fallback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    const result = await generateImage({
      model: crunModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: ["https://cdn.example.com/ref.png"],
    });

    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/generated.png",
      payloadKind: "crun-task",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [submitUrl, submitInit] = fetchMock.mock.calls[0];
    expect(submitUrl).toBe("https://api.crun.ai/api/v1/client/job/CreateTask");
    expect((submitInit as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-KEY": "crun-key",
    });
    expect(JSON.parse(String((submitInit as RequestInit).body))).toEqual({
      model: "google/nano-banana-2",
      input: {
        prompt: "a cinematic potato",
        aspect_ratio: "16:9",
        resolution: "2K",
        img_urls: ["https://cdn.example.com/ref.png"],
      },
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.crun.ai/api/v1/client/job/TaskInfo?task_id=task-1");
  });

  it("omits img_urls for CRUN text-only image generations", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: crunModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: [],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(submitInit.body)) as { input: Record<string, unknown> };
    expect(body.input.img_urls).toBeUndefined();
  });

  it("sends base GPT Image 2 CRUN input without stable or premium-only fields", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: crunGptImageModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      gptImageQuality: "high",
      gptImageBackground: "transparent",
      refImages: ["https://cdn.example.com/ref.png"],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toEqual({
      model: "openai/gpt-image-2",
      input: {
        prompt: "a cinematic potato",
        aspect_ratio: "16:9",
        img_urls: ["https://cdn.example.com/ref.png"],
      },
    });
  });

  it("sends GPT Image 2 stable options in CRUN input", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: crunGptImageStableModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      gptImageQuality: "high",
      gptImageBackground: "transparent",
      refImages: ["https://cdn.example.com/ref.png"],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toEqual({
      model: "openai/gpt-image-2-stable",
      input: {
        prompt: "a cinematic potato",
        aspect_ratio: "16:9",
        quality: "high",
        background: "transparent",
        output_format: "png",
        moderation: "low",
        img_urls: ["https://cdn.example.com/ref.png"],
      },
    });
  });

  it("defaults GPT Image 2 CRUN quality to low when not provided", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: crunGptImageStableModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: [],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(submitInit.body)) as { input: Record<string, unknown> };
    expect(body.input.quality).toBe("low");
    expect(body.input.background).toBe("auto");
    expect(body.input.output_format).toBe("png");
    expect(body.input.moderation).toBe("low");
  });

  it("sends GPT Image 2 premium resolution and quality without stable-only fields", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: crunGptImagePremiumModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "4K",
      gptImageQuality: "medium",
      gptImageBackground: "transparent",
      refImages: [],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toEqual({
      model: "openai/gpt-image-2-premium",
      input: {
        prompt: "a cinematic potato",
        aspect_ratio: "16:9",
        resolution: "4K",
        quality: "medium",
      },
    });
    expect(String(submitInit.body)).not.toContain("background");
    expect(String(submitInit.body)).not.toContain("output_format");
    expect(String(submitInit.body)).not.toContain("moderation");
  });

  it("allows GPT Image 2 Premium-only aspect ratios", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: crunGptImagePremiumModel,
      prompt: "a cinematic potato",
      aspectRatio: "9:21",
      imageSize: "1K",
      gptImageQuality: "high",
      refImages: [],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toMatchObject({
      model: "openai/gpt-image-2-premium",
      input: {
        aspect_ratio: "9:21",
        resolution: "1K",
        quality: "high",
      },
    });
  });

  it("rejects GPT Image 2 Premium requests with more than fourteen references before submitting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({
      model: crunGptImagePremiumModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: Array.from({ length: 15 }, (_, index) => `https://cdn.example.com/ref-${index}.png`),
    })).rejects.toThrow("GPT Image 2 Premium 最多支持 14 张参考图");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects data URL references before submitting CRUN tasks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({
      model: crunModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: ["data:image/png;base64,abc"],
    })).rejects.toThrow("CRUN 参考图必须是可直连的 http(s) URL");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Grok Imagine I2I img_urls payload without unsupported ratio or resolution fields", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: grokI2iModel,
      prompt: "turn @image(1) into a cinematic portrait",
      aspectRatio: "9:16",
      imageSize: "2K",
      refImages: ["https://cdn.example.com/ref.png"],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toEqual({
      model: "grok-imagine/i2i",
      input: {
        prompt: "turn @image(1) into a cinematic portrait",
        img_urls: ["https://cdn.example.com/ref.png"],
      },
    });
  });

  it("uses Grok Imagine T2I payload when no references are provided", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: grokI2iModel,
      prompt: "turn this into a cinematic portrait",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: [],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toEqual({
      model: "grok-imagine/t2i",
      input: {
        prompt: "turn this into a cinematic portrait",
        aspect_ratio: "16:9",
      },
    });
  });

  it("rejects Grok Imagine I2I with more than five references before submitting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({
      model: grokI2iModel,
      prompt: "turn these into a cinematic portrait",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: Array.from({ length: 6 }, (_, index) => `https://cdn.example.com/ref-${index}.png`),
    })).rejects.toThrow("Grok Imagine 图生图最多支持 5 张参考图");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported Grok Imagine T2I aspect ratios before submitting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (const aspectRatio of ["4:3", "auto", "21:9"] as const) {
      await expect(generateImage({
        model: grokI2iModel,
        prompt: "a cinematic portrait",
        aspectRatio,
        imageSize: "2K",
        refImages: [],
      })).rejects.toThrow("Grok Imagine 文生图只支持 1:1");
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Z Image prompt and aspect_ratio payload without img_urls or resolution", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/generated.png"] } }),
          { status: 200 },
        ),
      );

    await generateImage({
      model: zImageModel,
      prompt: "a precise product render",
      aspectRatio: "16:9",
      imageSize: "4K",
      refImages: [],
    });

    const submitInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(submitInit.body))).toEqual({
      model: "z-image",
      input: {
        prompt: "a precise product render",
        aspect_ratio: "16:9",
      },
    });
  });

  it("rejects Z Image references before submitting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({
      model: zImageModel,
      prompt: "a precise product render",
      aspectRatio: "16:9",
      imageSize: "4K",
      refImages: ["https://cdn.example.com/ref.png"],
    })).rejects.toThrow("Z Image Turbo 只支持文生图");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects overlong Z Image prompts before submitting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({
      model: zImageModel,
      prompt: "a".repeat(801),
      aspectRatio: "16:9",
      imageSize: "4K",
      refImages: [],
    })).rejects.toThrow("Z Image Turbo 提示词最多支持 800 个字符");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported Z Image aspect ratios before submitting", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateImage({
      model: zImageModel,
      prompt: "a precise product render",
      aspectRatio: "21:9",
      imageSize: "4K",
      refImages: [],
    })).rejects.toThrow("Z Image Turbo 只支持 16:9");

    await expect(generateImage({
      model: zImageModel,
      prompt: "a precise product render",
      aspectRatio: "auto",
      imageSize: "4K",
      refImages: [],
    })).rejects.toThrow("Z Image Turbo 只支持 16:9");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not report top-level success as a CRUN failed task reason", async () => {
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            message: "success",
            data: {
              task_id: "task-1",
              status: "failed",
            },
          }),
          { status: 200 },
        ),
      );

    await expect(generateImage({
      model: crunModel,
      prompt: "a cinematic potato",
      aspectRatio: "16:9",
      imageSize: "2K",
      refImages: [],
    })).rejects.toThrow("CRUN 任务失败，未返回具体原因");
  });
});
