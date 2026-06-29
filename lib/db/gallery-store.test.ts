import { describe, expect, it } from "vitest";
import type { ImageGalleryRecord } from "@/lib/image-workspace";
import { sanitizeGalleryRecordForStorage } from "@/lib/gallery-record-storage";
import { mergePrependedGalleryRecords, prependGalleryRecord, replaceGalleryRecords } from "@/lib/db/gallery-store";

const storedUrl = "https://example.supabase.co/storage/v1/object/public/generated-images/user-1/image.png";

function galleryRecord(id: string): ImageGalleryRecord {
  return {
    id,
    createdAt: "2026-06-13T00:00:00.000Z",
    modeId: "free",
    modeName: "自由模式",
    modelId: "gpt-image-2",
    modelName: "gpt-image-2",
    finalPrompt: "prompt",
    userInput: "prompt",
    aspectRatio: "1:1",
    imageSize: "1K",
    imageUrl: storedUrl,
    refImageCount: 0,
    status: "success",
  };
}

describe("image gallery storage", () => {
  it("keeps the prepended response at the configured limit", () => {
    const saved = galleryRecord("new");
    const existing = Array.from({ length: 24 }, (_, index) =>
      galleryRecord(index === 0 ? "new" : `old-${index}`),
    );

    const merged = mergePrependedGalleryRecords(saved, existing, 24);

    expect(merged).toHaveLength(24);
    expect(merged[0].id).toBe("new");
    expect(merged.filter((record) => record.id === "new")).toHaveLength(1);
  });

  it("does not delete existing rows before media persistence succeeds", async () => {
    let deleteCalled = false;
    const supabase = {
      auth: {
        async getUser() {
          return { data: { user: { id: "user-1" } } };
        },
      },
      from() {
        return {
          delete() {
            deleteCalled = true;
            return {
              async eq() {
                return { error: null };
              },
            };
          },
        };
      },
    };

    await expect(
      replaceGalleryRecords(supabase as never, [
        {
          ...galleryRecord("bad"),
          imageUrl: "not-a-supported-url",
        },
      ]),
    ).rejects.toThrow("不支持的图片地址格式");
    expect(deleteCalled).toBe(false);
  });

  it("keeps stored reference image URLs and strips inline reference images", () => {
    const sanitized = sanitizeGalleryRecordForStorage({
      ...galleryRecord("with-refs"),
      referenceImages: [
        {
          slotIndex: 0,
          dataUrl: "data:image/png;base64,abc",
          name: "inline.png",
          type: "image/png",
        },
        {
          slotIndex: 1,
          dataUrl: `${storedUrl}?ref=1`,
          name: "stored.png",
          type: "image/png",
        },
      ],
    });

    expect(sanitized.referenceImages).toEqual([
      {
        slotIndex: 1,
        dataUrl: `${storedUrl}?ref=1`,
        name: "stored.png",
        type: "image/png",
      },
    ]);
  });

  it("does not insert failed records into the gallery", async () => {
    let insertCalled = false;
    const supabase = {
      auth: {
        async getUser() {
          return { data: { user: { id: "user-1" } } };
        },
      },
      rpc() {
        return { data: 0, error: null };
      },
      from(table: string) {
        if (table !== "image_gallery_records") throw new Error(`unexpected table ${table}`);
        return {
          insert() {
            insertCalled = true;
            return { error: null };
          },
          select() {
            return {
              eq() {
                return {
                  lt() {
                    return { data: [], error: null };
                  },
                };
              },
              order() {
                return {
                  limit() {
                    return { data: [], error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    const records = await prependGalleryRecord(supabase as never, {
      ...galleryRecord("failed"),
      imageUrl: undefined,
      status: "error",
      error: "upstream failed",
    });

    expect(records).toEqual([]);
    expect(insertCalled).toBe(false);
  });
});
