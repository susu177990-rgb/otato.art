import { afterEach, describe, expect, it, vi } from "vitest";
import { pollCrunVideoTask } from "@/lib/video-generation-service";
import { nextVideoJobPollDelayMs } from "./worker";

describe("durable video task polling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("treats CRUN running and unknown states as non-terminal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { status: "RUNNING" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { status: "SOMETHING_NEW" } }))));
    await expect(pollCrunVideoTask({ baseUrl: "https://api.crun.ai", apiKey: "key", providerTaskId: "one" }))
      .resolves.toMatchObject({ state: "pending", providerStatus: "RUNNING" });
    await expect(pollCrunVideoTask({ baseUrl: "https://api.crun.ai", apiKey: "key", providerTaskId: "two" }))
      .resolves.toMatchObject({ state: "pending", providerStatus: "SOMETHING_NEW" });
  });

  it("returns authoritative success and explicit failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { status: "SUCCESS", media_urls: ["https://cdn/video.mp4"] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { status: "FAILED", error_message: "rejected" } }))));
    await expect(pollCrunVideoTask({ baseUrl: "https://api.crun.ai", apiKey: "key", providerTaskId: "one" }))
      .resolves.toMatchObject({ state: "succeeded", remoteVideoUrl: "https://cdn/video.mp4" });
    await expect(pollCrunVideoTask({ baseUrl: "https://api.crun.ai", apiKey: "key", providerTaskId: "two" }))
      .resolves.toMatchObject({ state: "failed", message: "rejected" });
  });

  it("backs off transient failures and slows polling after twenty minutes", () => {
    expect(nextVideoJobPollDelayMs(0, 0)).toBe(20_000);
    expect(nextVideoJobPollDelayMs(21 * 60_000, 0)).toBe(120_000);
    expect(nextVideoJobPollDelayMs(0, 1)).toBe(30_000);
    expect(nextVideoJobPollDelayMs(0, 20)).toBe(15 * 60_000);
  });
});
