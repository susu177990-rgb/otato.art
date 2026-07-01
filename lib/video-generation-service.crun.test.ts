import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUnifiedVideo, VideoGenerationError } from "@/lib/video-generation-service";
import { defaultVideoApiModelNameByMode, type VideoWorkspaceSettings } from "@/lib/video-workspace";
import { persistGeneratedVideoToStorage } from "@/lib/db/persist-generated-video";

vi.mock("@/lib/db/persist-generated-video", () => ({
  persistGeneratedVideoToStorage: vi.fn(),
}));

const crunSeedanceModel = {
  id: "seedance-2.0",
  label: "Seedance 2.0",
  baseUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
  apiKey: "crun-key",
  apiModelName: "",
  apiModelNameByMode: defaultVideoApiModelNameByMode("seedance-2.0"),
  enabled: true,
  providerOptions: {},
} satisfies VideoWorkspaceSettings["models"]["seedance-2.0"];

function crunModel<T extends keyof VideoWorkspaceSettings["models"]>(id: T): VideoWorkspaceSettings["models"][T] {
  return {
    id,
    label: id,
    baseUrl: "https://api.crun.ai/api/v1/client/job/CreateTask",
    apiKey: "crun-key",
    apiModelName: "",
    apiModelNameByMode: defaultVideoApiModelNameByMode(id),
    enabled: true,
    providerOptions: {},
  } as VideoWorkspaceSettings["models"][T];
}

function workspaceSnapshot(models: Partial<VideoWorkspaceSettings["models"]>) {
  return {
    llm: {},
    imageWorkspace: {},
    videoWorkspace: {
      models,
      uiDefaults: {
        defaultModelId: "seedance-2.0",
        defaultModeByModel: {},
        defaultAspectRatio: "16:9",
        defaultDurationSeconds: 5,
        defaultResolution: "720p",
      },
    },
  } as never;
}

describe("generateUnifiedVideo CRUN Seedance adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits Kling 3.0 text-to-video with official CRUN fields", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/kling.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "kling-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/kling.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "kling-3.0": crunModel("kling-3.0") }),
      request: {
        modelId: "kling-3.0",
        modeId: "text_to_video",
        prompt: "kling text",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "1080p",
        soundEnabled: true,
        references: [],
      },
    });

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-KEY": "crun-key",
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "kling/v3",
      input: {
        mode: "pro",
        multi_shots: false,
        prompt: "kling text",
        duration: 5,
        aspect_ratio: "16:9",
        audio: true,
      },
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.crun.ai/api/v1/client/job/TaskInfo?task_id=kling-task");
  });

  it("submits Kling 3.0 first-last-frame with img_urls", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/kling-i2v.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "kling-i2v-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/kling-i2v.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "kling-3.0": crunModel("kling-3.0") }),
      request: {
        modelId: "kling-3.0",
        modeId: "start_end_frame",
        prompt: "kling frames",
        durationSeconds: 8,
        aspectRatio: "9:16",
        resolution: "720p",
        references: [
          { role: "start_frame", url: "https://example.com/start.png" },
          { role: "end_frame", url: "https://example.com/end.png" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "kling/v3",
      input: {
        mode: "std",
        multi_shots: false,
        prompt: "kling frames",
        duration: 8,
        img_urls: ["https://example.com/start.png", "https://example.com/end.png"],
        audio: false,
      },
    });
  });

  it("submits Kling 3.0 image references as element_list", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/kling-ref.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "kling-ref-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/kling-ref.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "kling-3.0": crunModel("kling-3.0") }),
      request: {
        modelId: "kling-3.0",
        modeId: "multi_image_reference",
        prompt: "kling references @element_1",
        durationSeconds: 6,
        aspectRatio: "1:1",
        resolution: "4k",
        references: [
          { role: "image_reference", url: "https://example.com/hero.png", label: "hero" },
          { role: "image_reference", url: "https://example.com/prop.png" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "kling/v3",
      input: {
        mode: "4K",
        multi_shots: false,
        prompt: "kling references @element_1",
        duration: 6,
        aspect_ratio: "1:1",
        audio: false,
        element_list: [
          { name: "element_1", description: "hero", element_image_urls: ["https://example.com/hero.png"] },
          { name: "element_2", description: "reference image 2", element_image_urls: ["https://example.com/prop.png"] },
        ],
      },
    });
  });

  it("rejects Kling 3.0 reference-to-video with video references", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "kling-3.0": crunModel("kling-3.0") }),
      request: {
        modelId: "kling-3.0",
        modeId: "multi_image_reference",
        prompt: "bad kling reference",
        durationSeconds: 6,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [{ role: "video_reference", url: "https://example.com/ref.mp4" }],
      },
    })).rejects.toMatchObject({
      code: "invalid_mode",
      message: "Kling 3.0 全能参考只支持 1~3 张图片参考，不支持视频或音频参考。",
    } satisfies Partial<VideoGenerationError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits Kling 3.0 motion control with CRUN motion fields", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/kling-motion.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "kling-motion-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/kling-motion.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "kling-3.0": crunModel("kling-3.0") }),
      request: {
        modelId: "kling-3.0",
        modeId: "motion_control",
        prompt: "keep costume",
        durationSeconds: 0,
        resolution: "1080p",
        soundEnabled: false,
        references: [
          { role: "start_frame", url: "https://example.com/character.png" },
          { role: "motion_source_video", url: "https://example.com/motion.mp4" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "kling/v3-motion-control",
      input: {
        img_urls: ["https://example.com/character.png"],
        video_urls: ["https://example.com/motion.mp4"],
        character_orientation: "image",
        prompt: "keep costume",
        mode: "pro",
        keep_original_sound: false,
      },
    });
  });

  it("submits Kling 2.6 motion control with the v2.6 model id", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/kling-26-motion.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "kling-26-motion-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/kling-26-motion.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "kling-2.6-motion": crunModel("kling-2.6-motion") }),
      request: {
        modelId: "kling-2.6-motion",
        modeId: "motion_control",
        prompt: "motion 2.6",
        durationSeconds: 0,
        resolution: "720p",
        references: [
          { role: "start_frame", url: "https://example.com/character-26.png" },
          { role: "motion_source_video", url: "https://example.com/motion-26.mp4" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      model: "kling/v2-6-motion-control",
      input: {
        img_urls: ["https://example.com/character-26.png"],
        video_urls: ["https://example.com/motion-26.mp4"],
        mode: "std",
        keep_original_sound: true,
      },
    });
  });

  it("submits HappyHorse 1.1 text-to-video with official CRUN fields", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/hh11.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "hh11-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/hh11.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "happyhorse-1.1": crunModel("happyhorse-1.1") }),
      request: {
        modelId: "happyhorse-1.1",
        modeId: "text_to_video",
        prompt: "happyhorse text",
        durationSeconds: 6,
        aspectRatio: "4:5",
        resolution: "1080p",
        references: [],
      },
    });

    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-KEY": "crun-key",
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "happyhorse-1-1-t2v",
      input: {
        prompt: "happyhorse text",
        resolution: "1080P",
        duration: 6,
        aspect_ratio: "4:5",
      },
    });
  });

  it("submits HappyHorse 1.1 image-to-video with img_urls", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/hh11-i2v.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "hh11-i2v-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/hh11-i2v.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "happyhorse-1.1": crunModel("happyhorse-1.1") }),
      request: {
        modelId: "happyhorse-1.1",
        modeId: "start_frame",
        prompt: "animate frame",
        durationSeconds: 5,
        resolution: "720p",
        references: [{ role: "start_frame", url: "https://example.com/frame.png" }],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "happyhorse-1-1-i2v",
      input: {
        prompt: "animate frame",
        resolution: "720P",
        duration: 5,
        img_urls: ["https://example.com/frame.png"],
      },
    });
  });

  it("submits HappyHorse 1.1 reference-to-video with img_urls", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/hh11-r2v.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "hh11-r2v-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/hh11-r2v.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "happyhorse-1.1": crunModel("happyhorse-1.1") }),
      request: {
        modelId: "happyhorse-1.1",
        modeId: "multi_image_reference",
        prompt: "combine references",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [
          { role: "image_reference", url: "https://example.com/a.png" },
          { role: "image_reference", url: "https://example.com/b.png" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "happyhorse-1-1-r2v",
      input: {
        prompt: "combine references",
        resolution: "720P",
        img_urls: ["https://example.com/a.png", "https://example.com/b.png"],
        duration: 5,
        aspect_ratio: "16:9",
      },
    });
  });

  it("submits HappyHorse 1.0 video-edit with video_url and audio_setting", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/hh10-edit.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "hh10-edit-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/hh10-edit.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "happyhorse-1.0": crunModel("happyhorse-1.0") }),
      request: {
        modelId: "happyhorse-1.0",
        modeId: "video_edit",
        prompt: "change style",
        durationSeconds: 0,
        resolution: "1080p",
        soundEnabled: true,
        references: [
          { role: "video_reference", url: "https://example.com/source.mp4" },
          { role: "image_reference", url: "https://example.com/style.png" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "happyhorse-1-0-video-edit",
      input: {
        prompt: "change style",
        resolution: "1080P",
        video_url: "https://example.com/source.mp4",
        img_urls: ["https://example.com/style.png"],
        audio_setting: "origin",
      },
    });
  });

  it("submits Grok Imagine text-to-video with official CRUN fields", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/grok.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "grok-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/grok.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "grok-imagine": crunModel("grok-imagine") }),
      request: {
        modelId: "grok-imagine",
        modeId: "text_to_video",
        prompt: "grok text",
        durationSeconds: 12,
        aspectRatio: "16:9",
        resolution: "720p",
        grokImagineMode: "spicy",
        references: [],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "grok-imagine/t2v",
      input: {
        prompt: "grok text",
        duration: 12,
        resolution: "720p",
        aspect_ratio: "16:9",
        mode: "spicy",
      },
    });
  });

  it("submits Grok Imagine image-to-video preview with img_urls", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/grok-i2v.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "grok-i2v-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/grok-i2v.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "grok-imagine": crunModel("grok-imagine") }),
      request: {
        modelId: "grok-imagine",
        modeId: "start_frame",
        prompt: "animate this",
        durationSeconds: 8,
        aspectRatio: "auto",
        resolution: "720p",
        grokImagineMode: "fun",
        references: [{ role: "start_frame", url: "https://example.com/grok.png" }],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "grok-imagine-video-1.5-preview",
      input: {
        prompt: "animate this",
        duration: 8,
        resolution: "720p",
        aspect_ratio: "auto",
        img_urls: ["https://example.com/grok.png"],
      },
    });
  });

  it("submits Veo 3.1 text-to-video with official CRUN fields", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/veo.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "veo-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/veo.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "veo-3.1": crunModel("veo-3.1") }),
      request: {
        modelId: "veo-3.1",
        modeId: "text_to_video",
        prompt: "cinematic cat",
        durationSeconds: 4,
        aspectRatio: "auto",
        resolution: "720p",
        references: [],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "google/veo3-1-t2v",
      input: {
        prompt: "cinematic cat",
        duration: 4,
        aspect_ratio: "16:9",
        resolution: "720p",
        translate_prompt: true,
      },
    });
  });

  it("submits Veo 3.1 image-to-video with img_urls", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/veo-i2v.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "veo-i2v-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/veo-i2v.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "veo-3.1": crunModel("veo-3.1") }),
      request: {
        modelId: "veo-3.1",
        modeId: "start_end_frame",
        prompt: "move between frames",
        durationSeconds: 8,
        aspectRatio: "9:16",
        resolution: "1080p",
        references: [
          { role: "start_frame", url: "https://example.com/start.png" },
          { role: "end_frame", url: "https://example.com/end.png" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "google/veo3-1-i2v",
      input: {
        prompt: "move between frames",
        duration: 8,
        aspect_ratio: "9:16",
        resolution: "1080p",
        translate_prompt: true,
        img_urls: ["https://example.com/start.png", "https://example.com/end.png"],
      },
    });
  });

  it("submits Veo 3.1 Fast reference-to-video with fixed duration and aspect ratio", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/veo-r2v.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "veo-r2v-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/veo-r2v.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "veo-3.1-fast": crunModel("veo-3.1-fast") }),
      request: {
        modelId: "veo-3.1-fast",
        modeId: "multi_image_reference",
        prompt: "reference motion",
        durationSeconds: 8,
        aspectRatio: "16:9",
        resolution: "4k",
        references: [
          { role: "image_reference", url: "https://example.com/ref-1.png" },
          { role: "image_reference", url: "https://example.com/ref-2.png" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "google/veo3-1-fast-r2v",
      input: {
        prompt: "reference motion",
        duration: 8,
        aspect_ratio: "16:9",
        resolution: "4k",
        translate_prompt: true,
        img_urls: ["https://example.com/ref-1.png", "https://example.com/ref-2.png"],
      },
    });
  });

  it("submits Veo 3.1 Lite reference-to-video with Lite model id", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/veo-lite.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "veo-lite-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/veo-lite.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "veo-3.1-lite": crunModel("veo-3.1-lite") }),
      request: {
        modelId: "veo-3.1-lite",
        modeId: "multi_image_reference",
        prompt: "lite reference motion",
        durationSeconds: 8,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [{ role: "image_reference", url: "https://example.com/ref.png" }],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      model: "google/veo3-1-lite-r2v",
      input: {
        img_urls: ["https://example.com/ref.png"],
      },
    });
  });

  it("submits Gemini Omni with image and video references", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/omni.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "omni-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/omni.mp4"] } }),
          { status: 200 },
        ),
      );

    await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "gemini-omni": crunModel("gemini-omni") }),
      request: {
        modelId: "gemini-omni",
        modeId: "multi_image_reference",
        prompt: "omni reference edit",
        durationSeconds: 6,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [
          { role: "image_reference", url: "https://example.com/omni.png" },
          { role: "video_reference", url: "https://example.com/source.mp4" },
        ],
      },
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "google/gemini-omni",
      input: {
        prompt: "omni reference edit",
        duration: 6,
        aspect_ratio: "16:9",
        resolution: "720p",
        img_urls: ["https://example.com/omni.png"],
        video_list: [{ url: "https://example.com/source.mp4", start: 0, ends: 6 }],
      },
    });
  });

  it("rejects Gemini Omni image overflow when a video reference is present", async () => {
    await expect(generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "gemini-omni": crunModel("gemini-omni") }),
      request: {
        modelId: "gemini-omni",
        modeId: "multi_image_reference",
        prompt: "too many references",
        durationSeconds: 6,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [
          { role: "video_reference", url: "https://example.com/source.mp4" },
          ...Array.from({ length: 6 }, (_, index) => ({ role: "image_reference" as const, url: `https://example.com/${index}.png` })),
        ],
      },
    })).rejects.toMatchObject({
      code: "unsupported_capability",
      message: "Gemini Omni 带视频参考时最多支持 5 张参考图。",
    } satisfies Partial<VideoGenerationError>);
  });

  it("submits Seedance tasks with CRUN { model, input } format and polls TaskInfo", async () => {
    vi.mocked(persistGeneratedVideoToStorage).mockResolvedValue("https://storage.example.com/video.mp4");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "task-1" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "SUCCESS", media_urls: ["https://cdn.example.com/video.mp4"] } }),
          { status: 200 },
        ),
      );

    const result = await generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "seedance-2.0": crunSeedanceModel }),
      request: {
        modelId: "seedance-2.0",
        modeId: "start_end_frame",
        prompt: "start to end",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        soundEnabled: false,
        references: [
          { role: "start_frame", url: "https://example.com/start.png" },
          { role: "end_frame", url: "https://example.com/end.png" },
        ],
      },
    });

    expect(result).toEqual({
      providerTaskId: "task-1",
      videoUrl: "https://storage.example.com/video.mp4",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.crun.ai/api/v1/client/job/CreateTask");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-KEY": "crun-key",
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      model: "bytedance/seedance2-0-i2v",
      input: {
        prompt: "start to end",
        resolution: "720p",
        aspect_ratio: "16:9",
        duration: 5,
        audio: false,
        img_urls: ["https://example.com/start.png", "https://example.com/end.png"],
      },
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.crun.ai/api/v1/client/job/TaskInfo?task_id=task-1");
  });

  it("surfaces CRUN validation errors from errors[]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 422, message: "Missing Params or Type Error", errors: ["prompt: String should have at most 5000 characters"] }),
        { status: 422 },
      ),
    );

    await expect(generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "seedance-2.0": crunSeedanceModel }),
      request: {
        modelId: "seedance-2.0",
        modeId: "text_to_video",
        prompt: "too long",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [],
      },
    })).rejects.toMatchObject({
      code: "provider_submit_failed",
      message: "prompt: String should have at most 5000 characters",
      upstreamStatus: 422,
      upstreamBody: {
        code: 422,
        message: "Missing Params or Type Error",
        errors: ["prompt: String should have at most 5000 characters"],
      },
    } satisfies Partial<VideoGenerationError>);
  });

  it("treats CRUN business-code quota failures as upstream billing errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 402, message: "Insufficient Credits", data: { balance: 137.96 } }),
        { status: 200 },
      ),
    );

    await expect(generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "seedance-2.0": crunSeedanceModel }),
      request: {
        modelId: "seedance-2.0",
        modeId: "text_to_video",
        prompt: "quota",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "1080p",
        references: [],
      },
    })).rejects.toMatchObject({
      code: "provider_submit_failed",
      message: "Insufficient Credits",
      upstreamStatus: 402,
      upstreamBody: {
        code: 402,
        message: "Insufficient Credits",
        data: { balance: 137.96 },
      },
    } satisfies Partial<VideoGenerationError>);
  });

  it("preserves CRUN poll moderation body for user-facing classification", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "moderated-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "failed", reason: "input_moderation" } }),
          { status: 200 },
        ),
      );

    await expect(generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "seedance-2.0": crunSeedanceModel }),
      request: {
        modelId: "seedance-2.0",
        modeId: "text_to_video",
        prompt: "moderated",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [],
      },
    })).rejects.toMatchObject({
      code: "provider_poll_failed",
      message: "input_moderation",
      upstreamStatus: 200,
      upstreamBody: { code: 200, message: "success", data: { status: "failed", reason: "input_moderation" } },
    } satisfies Partial<VideoGenerationError>);
  });

  it("preserves CRUN failed tasks without reasons as unknown provider failures", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { task_id: "failed-task" } }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, message: "success", data: { status: "failed" } }),
          { status: 200 },
        ),
      );

    await expect(generateUnifiedVideo({
      supabase: {} as never,
      userId: "user-1",
      workspaceSnapshot: workspaceSnapshot({ "seedance-2.0": crunSeedanceModel }),
      request: {
        modelId: "seedance-2.0",
        modeId: "text_to_video",
        prompt: "failed",
        durationSeconds: 5,
        aspectRatio: "16:9",
        resolution: "720p",
        references: [],
      },
    })).rejects.toMatchObject({
      code: "provider_poll_failed",
      message: "CRUN 任务失败，未返回具体原因。",
      upstreamStatus: 200,
      upstreamBody: { code: 200, message: "success", data: { status: "failed" } },
    } satisfies Partial<VideoGenerationError>);
  });
});
