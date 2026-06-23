import assert from "node:assert/strict";
import {
  buildVideoCreatePayloadForTest,
  validateUnifiedVideoRequest,
} from "@/lib/video-generation-service";
import { getVideoModelDefinition, type UnifiedVideoGenerateRequest, type VideoModelId } from "@/lib/video-workspace";

function ctxFor(modelId: VideoModelId, request: UnifiedVideoGenerateRequest) {
  return {
    modelId,
    modelDefinition: getVideoModelDefinition(modelId),
    modelSettings: {
      id: modelId,
      label: modelId,
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      apiModelName: getVideoModelDefinition(modelId).defaultApiModelName,
      enabled: true,
      providerOptions: {},
    },
    request,
  };
}

const seedance = validateUnifiedVideoRequest({
  modelId: "seedance-2.0",
  modeId: "start_frame",
  prompt: "test",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [{ role: "start_frame", url: "https://example.com/a.png" }],
  soundEnabled: false,
});
const seedancePayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedance));
assert.deepEqual(seedancePayload, {
  prompt: "test",
  aspect_ratio: "16:9",
  duration: 5,
  quality: "1080p",
  model: "seedance-2.0-image-to-video",
  image_urls: ["https://example.com/a.png"],
  generate_audio: false,
});

const seedanceStartEnd = validateUnifiedVideoRequest({
  modelId: "seedance-2.0",
  modeId: "start_end_frame",
  prompt: "start end",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "start_frame", url: "https://example.com/start.png" },
    { role: "end_frame", url: "https://example.com/end.png" },
  ],
});
const seedanceStartEndPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", seedanceStartEnd));
assert.equal(seedanceStartEndPayload.model, "seedance-2.0-image-to-video");
assert.deepEqual(seedanceStartEndPayload.image_urls, ["https://example.com/start.png", "https://example.com/end.png"]);

const seedance15Text = validateUnifiedVideoRequest({
  modelId: "seedance-1.5-pro",
  modeId: "text_to_video",
  prompt: "test15 text",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [],
  soundEnabled: false,
});
const seedance15TextPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5-pro", seedance15Text));
assert.equal(seedance15TextPayload.model, "seedance-1.5-pro");
assert.equal(seedance15TextPayload.duration, 8);
assert.equal(seedance15TextPayload.generate_audio, false);

const seedance15Start = validateUnifiedVideoRequest({
  modelId: "seedance-1.5-pro",
  modeId: "start_frame",
  prompt: "test15 start",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const seedance15StartPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5-pro", seedance15Start));
assert.deepEqual(seedance15StartPayload.image_urls, ["https://example.com/start.png"]);

const seedance15StartEnd = validateUnifiedVideoRequest({
  modelId: "seedance-1.5-pro",
  modeId: "start_end_frame",
  prompt: "test15 start end",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [
    { role: "start_frame", url: "https://example.com/start.png" },
    { role: "end_frame", url: "https://example.com/end.png" },
  ],
});
const seedance15StartEndPayload = buildVideoCreatePayloadForTest(ctxFor("seedance-1.5-pro", seedance15StartEnd));
assert.equal(seedance15StartEndPayload.model, "seedance-1.5-pro");
assert.deepEqual(seedance15StartEndPayload.image_urls, ["https://example.com/start.png", "https://example.com/end.png"]);

const seedance10Text = validateUnifiedVideoRequest({
  modelId: "doubao-seedance-1.0-pro-fast",
  modeId: "text_to_video",
  prompt: "test10 text",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [],
  soundEnabled: true,
});
const seedance10TextPayload = buildVideoCreatePayloadForTest(ctxFor("doubao-seedance-1.0-pro-fast", seedance10Text));
assert.equal(seedance10TextPayload.model, "doubao-seedance-1.0-pro-fast");
assert.equal("generate_audio" in seedance10TextPayload, false);

const seedance10Start = validateUnifiedVideoRequest({
  modelId: "doubao-seedance-1.0-pro-fast",
  modeId: "start_frame",
  prompt: "test10 start",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const seedance10StartPayload = buildVideoCreatePayloadForTest(ctxFor("doubao-seedance-1.0-pro-fast", seedance10Start));
assert.deepEqual(seedance10StartPayload.image_urls, ["https://example.com/start.png"]);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "doubao-seedance-1.0-pro-fast",
      modeId: "start_end_frame",
      prompt: "bad10",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "1080p",
      references: [
        { role: "start_frame", url: "https://example.com/start.png" },
        { role: "end_frame", url: "https://example.com/end.png" },
      ],
    }),
  /不支持/,
);

const klingText = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "text_to_video",
  prompt: "kling text",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [],
  soundEnabled: true,
});
const klingTextPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingText));
assert.equal(klingTextPayload.model, "kling-o3-text-to-video");
assert.equal(klingTextPayload.sound, "on");

const klingStart = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "start_frame",
  prompt: "kling start",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [{ role: "start_frame", url: "https://example.com/start.png" }],
});
const klingStartPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingStart));
assert.equal(klingStartPayload.model, "kling-o3-image-to-video");
assert.equal(klingStartPayload.image_start, "https://example.com/start.png");

const kling = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "start_end_frame",
  prompt: "kling",
  durationSeconds: 10,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "start_frame", url: "https://example.com/start.png" },
    { role: "end_frame", url: "https://example.com/end.png" },
  ],
});
const klingPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", kling));
assert.equal(klingPayload.model, "kling-o3-image-to-video");
assert.equal(klingPayload.image_start, "https://example.com/start.png");
assert.equal(klingPayload.image_end, "https://example.com/end.png");

const klingReference = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "multi_image_reference",
  prompt: "kling reference",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "720p",
  references: [
    { role: "video_reference", url: "https://example.com/ref.mp4" },
    { role: "image_reference", url: "https://example.com/ref.png" },
  ],
  soundEnabled: false,
});
const klingReferencePayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingReference));
assert.equal(klingReferencePayload.model, "kling-o3-reference-to-video");
assert.equal(klingReferencePayload.video_url, "https://example.com/ref.mp4");
assert.deepEqual(klingReferencePayload.image_urls, ["https://example.com/ref.png"]);
assert.equal(klingReferencePayload.keep_original_sound, false);

const klingEdit = validateUnifiedVideoRequest({
  modelId: "kling-3.0",
  modeId: "video_edit",
  prompt: "kling edit",
  durationSeconds: 0,
  resolution: "1080p",
  references: [
    { role: "video_reference", url: "https://example.com/original.mp4" },
    { role: "image_reference", url: "https://example.com/style.png" },
  ],
  soundEnabled: false,
});
const klingEditPayload = buildVideoCreatePayloadForTest(ctxFor("kling-3.0", klingEdit));
assert.equal(klingEditPayload.model, "kling-o3-video-edit");
assert.equal(klingEditPayload.video_url, "https://example.com/original.mp4");
assert.equal("duration" in klingEditPayload, false);
assert.equal("aspect_ratio" in klingEditPayload, false);
assert.equal(klingEditPayload.keep_original_sound, false);

const happyHorse11Text = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.1",
  modeId: "text_to_video",
  prompt: "happyhorse 1.1 text",
  durationSeconds: 6,
  aspectRatio: "4:5",
  resolution: "1080p",
  references: [],
});
const happyHorse11TextPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Text));
assert.equal(happyHorse11TextPayload.model, "happyhorse-1.1-text-to-video");
assert.equal(happyHorse11TextPayload.aspect_ratio, "4:5");
assert.equal(happyHorse11TextPayload.quality, "1080p");

const happyHorse11Start = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.1",
  modeId: "start_frame",
  prompt: "happyhorse 1.1 start",
  durationSeconds: 6,
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/hh11.png" }],
});
const happyHorse11StartPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Start));
assert.equal(happyHorse11StartPayload.model, "happyhorse-1.1-image-to-video");
assert.deepEqual(happyHorse11StartPayload.image_urls, ["https://example.com/hh11.png"]);
assert.equal("aspect_ratio" in happyHorse11StartPayload, false);

const happyHorse11Reference = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.1",
  modeId: "multi_image_reference",
  prompt: "character1 and character2 walk through a city",
  durationSeconds: 6,
  aspectRatio: "9:16",
  resolution: "720p",
  references: [
    { role: "image_reference", url: "https://example.com/hh11-a.png" },
    { role: "image_reference", url: "https://example.com/hh11-b.png" },
  ],
});
const happyHorse11ReferencePayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.1", happyHorse11Reference));
assert.equal(happyHorse11ReferencePayload.model, "happyhorse-1.1-reference-to-video");
assert.deepEqual(happyHorse11ReferencePayload.image_urls, ["https://example.com/hh11-a.png", "https://example.com/hh11-b.png"]);
assert.equal(happyHorse11ReferencePayload.aspect_ratio, "9:16");
assert.equal(happyHorse11ReferencePayload.duration, 6);

const happyHorse10Text = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "text_to_video",
  prompt: "happyhorse 1.0 text",
  durationSeconds: 6,
  aspectRatio: "5:4",
  resolution: "720p",
  references: [],
});
const happyHorse10TextPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Text));
assert.equal(happyHorse10TextPayload.model, "happyhorse-1.0-text-to-video");
assert.equal(happyHorse10TextPayload.aspect_ratio, "5:4");

const happyHorse10Start = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "start_frame",
  prompt: "happyhorse 1.0 start",
  durationSeconds: 6,
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/hh10.png" }],
});
const happyHorse10StartPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Start));
assert.equal(happyHorse10StartPayload.model, "happyhorse-1.0-image-to-video");
assert.deepEqual(happyHorse10StartPayload.image_urls, ["https://example.com/hh10.png"]);

const happyHorse10Reference = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "multi_image_reference",
  prompt: "character1 wears character2",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/hh10-a.png" },
    { role: "image_reference", url: "https://example.com/hh10-b.png" },
  ],
});
const happyHorse10ReferencePayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Reference));
assert.equal(happyHorse10ReferencePayload.model, "happyhorse-1.0-reference-to-video");
assert.deepEqual(happyHorse10ReferencePayload.image_urls, ["https://example.com/hh10-a.png", "https://example.com/hh10-b.png"]);

const happyHorse10Edit = validateUnifiedVideoRequest({
  modelId: "happyhorse-1.0",
  modeId: "video_edit",
  prompt: "replace the outfit with the reference image",
  durationSeconds: 0,
  resolution: "720p",
  references: [
    { role: "video_reference", url: "https://example.com/source.mp4" },
    { role: "image_reference", url: "https://example.com/style.png" },
  ],
  soundEnabled: true,
});
const happyHorse10EditPayload = buildVideoCreatePayloadForTest(ctxFor("happyhorse-1.0", happyHorse10Edit));
assert.equal(happyHorse10EditPayload.model, "happyhorse-1.0-video-edit");
assert.deepEqual(happyHorse10EditPayload.video_urls, ["https://example.com/source.mp4"]);
assert.deepEqual(happyHorse10EditPayload.image_urls, ["https://example.com/style.png"]);
assert.equal("duration" in happyHorse10EditPayload, false);
assert.equal("aspect_ratio" in happyHorse10EditPayload, false);
assert.equal(happyHorse10EditPayload.keep_original_sound, true);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "happyhorse-1.1",
      modeId: "start_end_frame",
      prompt: "bad happyhorse",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [
        { role: "start_frame", url: "https://example.com/start.png" },
        { role: "end_frame", url: "https://example.com/end.png" },
      ],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "happyhorse-1.1",
      modeId: "video_edit",
      prompt: "bad happyhorse edit",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/source.mp4" }],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "happyhorse-1.0",
      modeId: "multi_image_reference",
      prompt: "bad happyhorse reference",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/ref.mp4" }],
    }),
  /图片参考/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "kling-3.0",
      modeId: "video_edit",
      prompt: "bad edit",
      durationSeconds: 0,
      resolution: "1080p",
      references: [],
    }),
  /视频编辑模式需要/,
);

const klingMotion = validateUnifiedVideoRequest({
  modelId: "kling-2.6-motion",
  modeId: "motion_control",
  prompt: "motion",
  durationSeconds: 0,
  resolution: "720p",
  soundEnabled: false,
  references: [
    { role: "start_frame", url: "https://example.com/character.png" },
    { role: "motion_source_video", url: "https://example.com/motion.mp4" },
  ],
});
const klingMotionPayload = buildVideoCreatePayloadForTest(ctxFor("kling-2.6-motion", klingMotion));
assert.equal(klingMotionPayload.model, "kling-v3-motion-control");
assert.deepEqual(klingMotionPayload.image_urls, ["https://example.com/character.png"]);
assert.deepEqual(klingMotionPayload.video_urls, ["https://example.com/motion.mp4"]);
assert.deepEqual(klingMotionPayload.model_params, { character_orientation: "image", keep_sound: false });
assert.equal("duration" in klingMotionPayload, false);
assert.equal("aspect_ratio" in klingMotionPayload, false);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "kling-2.6-motion",
      modeId: "motion_control",
      prompt: "bad motion",
      durationSeconds: 0,
      resolution: "720p",
      references: [{ role: "motion_source_video", url: "https://example.com/motion.mp4" }],
    }),
  /主体参考图/,
);

const allPurpose = validateUnifiedVideoRequest({
  modelId: "seedance-2.0",
  modeId: "multi_image_reference",
  prompt: "all purpose",
  durationSeconds: 5,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/1.png" },
    { role: "video_reference", url: "https://example.com/ref.mp4" },
    { role: "audio_reference", url: "https://example.com/ref.mp3" },
  ],
});
const allPurposePayload = buildVideoCreatePayloadForTest(ctxFor("seedance-2.0", allPurpose));
assert.deepEqual(allPurposePayload.model, "seedance-2.0-reference-to-video");
assert.deepEqual(allPurposePayload.image_urls, ["https://example.com/1.png"]);
assert.deepEqual(allPurposePayload.video_urls, ["https://example.com/ref.mp4"]);
assert.deepEqual(allPurposePayload.audio_urls, ["https://example.com/ref.mp3"]);

const grokText = validateUnifiedVideoRequest({
  modelId: "grok-imagine",
  modeId: "text_to_video",
  prompt: "a robot paints a sunset",
  durationSeconds: 6,
  aspectRatio: "3:2",
  resolution: "480p",
  references: [],
  grokImagineMode: "fun",
});
const grokTextPayload = buildVideoCreatePayloadForTest(ctxFor("grok-imagine", grokText));
assert.equal(grokTextPayload.model, "grok-imagine-text-to-video-beta");
assert.equal(grokTextPayload.duration, 6);
assert.equal(grokTextPayload.aspect_ratio, "3:2");
assert.equal(grokTextPayload.quality, "480p");
assert.equal(grokTextPayload.mode, "fun");
assert.equal("generate_audio" in grokTextPayload, false);
assert.equal("sound" in grokTextPayload, false);

const grokStart = validateUnifiedVideoRequest({
  modelId: "grok-imagine",
  modeId: "start_frame",
  prompt: "the person starts dancing",
  durationSeconds: 8,
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/grok.png" }],
  grokImagineMode: "normal",
});
const grokStartPayload = buildVideoCreatePayloadForTest(ctxFor("grok-imagine", grokStart));
assert.equal(grokStartPayload.model, "grok-imagine-image-to-video-beta");
assert.deepEqual(grokStartPayload.image_urls, ["https://example.com/grok.png"]);
assert.equal("aspect_ratio" in grokStartPayload, false);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "grok-imagine",
      modeId: "multi_image_reference",
      prompt: "bad grok multi image reference",
      durationSeconds: 12,
      aspectRatio: "2:3",
      resolution: "720p",
      references: [
        { role: "image_reference", url: "https://example.com/grok-a.png" },
        { role: "image_reference", url: "https://example.com/grok-b.png" },
      ],
      grokImagineMode: "spicy",
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "grok-imagine",
      modeId: "start_end_frame",
      prompt: "bad grok start end",
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "480p",
      references: [
        { role: "start_frame", url: "https://example.com/start.png" },
        { role: "end_frame", url: "https://example.com/end.png" },
      ],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "grok-imagine",
      modeId: "video_edit",
      prompt: "bad grok edit",
      durationSeconds: 0,
      resolution: "480p",
      references: [{ role: "video_reference", url: "https://example.com/source.mp4" }],
    }),
  /不支持/,
);

const veoText = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "text_to_video",
  prompt: "veo text",
  durationSeconds: 4,
  aspectRatio: "auto",
  resolution: "720p",
  references: [],
  soundEnabled: false,
});
const veoTextPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoText));
assert.equal(veoTextPayload.model, "veo-3.1-generate-preview");
assert.equal(veoTextPayload.generation_type, "TEXT");
assert.equal(veoTextPayload.generate_audio, false);
assert.equal(veoTextPayload.aspect_ratio, "auto");

const veoFastText = validateUnifiedVideoRequest({
  modelId: "veo-3.1-fast",
  modeId: "text_to_video",
  prompt: "veo fast text",
  durationSeconds: 6,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [],
});
const veoFastTextPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1-fast", veoFastText));
assert.equal(veoFastTextPayload.model, "veo-3.1-fast-generate-preview");
assert.equal(veoFastTextPayload.generation_type, "TEXT");

const veoStart = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "start_frame",
  prompt: "veo start",
  durationSeconds: 4,
  aspectRatio: "auto",
  resolution: "720p",
  references: [{ role: "start_frame", url: "https://example.com/veo-start.png" }],
});
const veoStartPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoStart));
assert.equal(veoStartPayload.generation_type, "FIRST&LAST");
assert.deepEqual(veoStartPayload.image_urls, ["https://example.com/veo-start.png"]);

const veoStartEnd = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "start_end_frame",
  prompt: "veo start end",
  durationSeconds: 8,
  aspectRatio: "9:16",
  resolution: "4k",
  references: [
    { role: "start_frame", url: "https://example.com/veo-start.png" },
    { role: "end_frame", url: "https://example.com/veo-end.png" },
  ],
});
const veoStartEndPayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoStartEnd));
assert.equal(veoStartEndPayload.generation_type, "FIRST&LAST");
assert.deepEqual(veoStartEndPayload.image_urls, ["https://example.com/veo-start.png", "https://example.com/veo-end.png"]);

const veoReference = validateUnifiedVideoRequest({
  modelId: "veo-3.1",
  modeId: "multi_image_reference",
  prompt: "veo reference",
  durationSeconds: 8,
  aspectRatio: "16:9",
  resolution: "1080p",
  references: [
    { role: "image_reference", url: "https://example.com/veo-1.png" },
    { role: "image_reference", url: "https://example.com/veo-2.png" },
  ],
  soundEnabled: true,
});
const veoReferencePayload = buildVideoCreatePayloadForTest(ctxFor("veo-3.1", veoReference));
assert.equal(veoReferencePayload.generation_type, "REFERENCE");
assert.deepEqual(veoReferencePayload.image_urls, ["https://example.com/veo-1.png", "https://example.com/veo-2.png"]);
assert.equal(veoReferencePayload.duration, 8);
assert.equal(veoReferencePayload.aspect_ratio, "16:9");
assert.equal(veoReferencePayload.generate_audio, true);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "veo-3.1",
      modeId: "multi_image_reference",
      prompt: "bad veo video ref",
      durationSeconds: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/ref.mp4" }],
    }),
  /Veo 3.1/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "veo-3.1",
      modeId: "video_edit",
      prompt: "bad veo edit",
      durationSeconds: 0,
      resolution: "720p",
      references: [{ role: "video_reference", url: "https://example.com/source.mp4" }],
    }),
  /不支持/,
);

assert.throws(
  () =>
    validateUnifiedVideoRequest({
      modelId: "seedance-2.0",
      modeId: "start_end_frame",
      prompt: "bad",
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "1080p",
      references: [],
    }),
  /需要 1 张首帧图和 1 张尾帧图/,
);

const omniPayload = buildVideoCreatePayloadForTest(
  ctxFor("gemini-omni", {
    modelId: "gemini-omni",
    modeId: "text_to_video",
    prompt: "omni",
    durationSeconds: 4,
    aspectRatio: "16:9",
    resolution: "720p",
    references: [],
  }),
);
assert.equal(omniPayload.contractState, "pending");

console.log("video generation service smoke: ok");
