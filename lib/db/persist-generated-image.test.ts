import { describe, expect, it } from "vitest";
import { resolveImageBytes } from "@/lib/db/persist-generated-image";

describe("resolveImageBytes", () => {
  it("parses large base64 data URLs without regex stack overflow", async () => {
    const source = Buffer.alloc(2 * 1024 * 1024, 7);
    const dataUrl = `data:image/png;base64,${source.toString("base64")}`;

    const result = await resolveImageBytes(dataUrl);

    expect(result.contentType).toBe("image/png");
    expect(result.bytes.byteLength).toBe(source.byteLength);
    expect(result.bytes[0]).toBe(7);
  });
});
