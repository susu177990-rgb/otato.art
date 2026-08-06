import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyBillableVideoReference, VideoReferenceSecurityError } from "@/lib/video-reference-security";
import { getMediaObject, mediaObjectKeyFromPublicUrl } from "@/lib/media-storage";
import { parseBuffer } from "music-metadata";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/media-storage", () => ({
  getMediaObject: vi.fn(),
  mediaObjectKeyFromPublicUrl: vi.fn(),
}));
vi.mock("music-metadata", () => ({ parseBuffer: vi.fn() }));

describe("verifyBillableVideoReference", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores the browser duration and uses the server parsed duration", async () => {
    vi.mocked(mediaObjectKeyFromPublicUrl).mockReturnValue("ephemeral/user-1/video-inputs/source.mp4");
    vi.mocked(getMediaObject).mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: "video/mp4" });
    vi.mocked(parseBuffer).mockResolvedValue({ format: { duration: 29.1 } } as never);

    const result = await verifyBillableVideoReference({
      userId: "user-1",
      modeId: "video_edit",
      references: [{ role: "video_reference", url: "https://media.example/source.mp4", durationSeconds: 1 }],
    });

    expect(result.durationSeconds).toBe(30);
    expect(result.references[0]?.durationSeconds).toBe(30);
  });

  it("rejects media owned by another account", async () => {
    vi.mocked(mediaObjectKeyFromPublicUrl).mockReturnValue("ephemeral/user-2/video-inputs/source.mp4");
    await expect(verifyBillableVideoReference({
      userId: "user-1",
      modeId: "motion_control",
      references: [{ role: "motion_source_video", url: "https://media.example/source.mp4", durationSeconds: 1 }],
    })).rejects.toMatchObject({ code: "REFERENCE_NOT_OWNED" } satisfies Partial<VideoReferenceSecurityError>);
    expect(getMediaObject).not.toHaveBeenCalled();
  });

  it("does not fetch media for modes not billed from a reference video", async () => {
    const references = [{ role: "start_frame" as const, url: "https://example.com/frame.png" }];
    await expect(verifyBillableVideoReference({ userId: "user-1", modeId: "start_frame", references }))
      .resolves.toEqual({ references, durationSeconds: null });
    expect(getMediaObject).not.toHaveBeenCalled();
  });

  it("replaces browser durations for Seedance video and audio references", async () => {
    vi.mocked(mediaObjectKeyFromPublicUrl)
      .mockReturnValueOnce("ephemeral/user-1/video-inputs/source.mp4")
      .mockReturnValueOnce("ephemeral/user-1/audio-inputs/source.mp3");
    vi.mocked(getMediaObject)
      .mockResolvedValueOnce({ bytes: new Uint8Array([1]), contentType: "video/mp4" })
      .mockResolvedValueOnce({ bytes: new Uint8Array([2]), contentType: "audio/mpeg" });
    vi.mocked(parseBuffer)
      .mockResolvedValueOnce({ format: { duration: 7.2 } } as never)
      .mockResolvedValueOnce({ format: { duration: 4.1 } } as never);

    const result = await verifyBillableVideoReference({
      userId: "user-1",
      modeId: "multi_image_reference",
      references: [
        { role: "video_reference", url: "https://media.example/source.mp4", durationSeconds: 1 },
        { role: "audio_reference", url: "https://media.example/source.mp3", durationSeconds: 1 },
      ],
    });

    expect(result.references.map((reference) => reference.durationSeconds)).toEqual([8, 5]);
  });
});
