import { describe, expect, it } from "vitest";
import {
  isVideoDurationSupported,
  normalizeVideoDuration,
  resolveVideoDurationCapability,
  type VideoDurationCapability,
} from "@/lib/video-core";

describe("video duration capability", () => {
  it("converts legacy durations into preset capability", () => {
    const capability = resolveVideoDurationCapability({ durations: [10, 5, 5, 4] });

    expect(capability).toEqual({
      type: "presets",
      values: [4, 5, 10],
      defaultValue: 5,
    });
  });

  it("validates preset and recommended values", () => {
    const presets: VideoDurationCapability = { type: "presets", values: [4, 5, 10], defaultValue: 5 };
    const recommended: VideoDurationCapability = { type: "recommended", values: [6, 8], defaultValue: 6 };

    expect(isVideoDurationSupported(10, presets)).toBe(true);
    expect(isVideoDurationSupported(7, presets)).toBe(false);
    expect(isVideoDurationSupported(8, recommended)).toBe(true);
    expect(isVideoDurationSupported(5, recommended)).toBe(false);
  });

  it("validates range bounds and step", () => {
    const capability: VideoDurationCapability = {
      type: "range",
      min: 3,
      max: 15,
      step: 2,
      defaultValue: 5,
      presets: [5, 9, 15],
    };

    expect(isVideoDurationSupported(3, capability)).toBe(true);
    expect(isVideoDurationSupported(15, capability)).toBe(true);
    expect(isVideoDurationSupported(4, capability)).toBe(false);
    expect(isVideoDurationSupported(17, capability)).toBe(false);
  });

  it("normalizes unsupported durations to the capability default", () => {
    const capability: VideoDurationCapability = { type: "presets", values: [4, 5, 10], defaultValue: 5 };

    expect(normalizeVideoDuration(10, capability)).toBe(10);
    expect(normalizeVideoDuration(12, capability)).toBe(5);
  });
});
