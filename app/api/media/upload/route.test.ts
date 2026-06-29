import { describe, expect, it } from "vitest";
import { validUserMediaKey } from "./validation";

describe("validUserMediaKey", () => {
  it("accepts video upload keys with dotted model ids", () => {
    expect(
      validUserMediaKey(
        "ephemeral/user-1/video-inputs/seedance-2.0/image/8f8f1e3e-b34a-4266-b97e-f5705e50683b.png",
        "user-1",
      ),
    ).toBe(true);
  });

  it("rejects keys outside the authenticated user's ephemeral prefix", () => {
    expect(validUserMediaKey("ephemeral/user-2/video-inputs/model/image/ref.png", "user-1")).toBe(false);
    expect(validUserMediaKey("user-1/projects/project-1/assets/asset-1/ref.png", "user-1")).toBe(false);
  });

  it("rejects traversal and malformed paths", () => {
    expect(validUserMediaKey("ephemeral/user-1/video-inputs/../ref.png", "user-1")).toBe(false);
    expect(validUserMediaKey("ephemeral/user-1/video-inputs//ref.png", "user-1")).toBe(false);
    expect(validUserMediaKey("/ephemeral/user-1/video-inputs/ref.png", "user-1")).toBe(false);
  });
});
