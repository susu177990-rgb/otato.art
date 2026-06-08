import assert from "node:assert/strict";
import { decryptApiKey } from "@/lib/api-key-crypto";
import { API_KEY_CONFIGURED_PLACEHOLDER } from "@/lib/api-key-redaction";
import { DEFAULT_IMAGE_SETTINGS } from "@/lib/image-workspace";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { DEFAULT_VIDEO_SETTINGS } from "@/lib/video-workspace";
import { userApiSettingsStoreTestInternals } from "@/lib/db/user-api-settings-store";

process.env.API_SETTINGS_ENCRYPTION_KEY = "test-user-api-settings-encryption-key";

const savedLlm = userApiSettingsStoreTestInternals.mergeLlmForSave(
  {
    ...DEFAULT_SETTINGS,
    models: {
      [DEFAULT_SETTINGS.defaultModelId]: {
        ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
        apiKey: "sk-user-1",
      },
    },
  },
  null,
);
const encryptedLlmKey = savedLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey;
assert.notEqual(encryptedLlmKey, "sk-user-1");
assert.equal(decryptApiKey(encryptedLlmKey), "sk-user-1");

const keptLlm = userApiSettingsStoreTestInternals.mergeLlmForSave(
  {
    ...DEFAULT_SETTINGS,
    models: {
      [DEFAULT_SETTINGS.defaultModelId]: {
        ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
        apiKey: API_KEY_CONFIGURED_PLACEHOLDER,
      },
    },
  },
  savedLlm,
);
assert.equal(decryptApiKey(keptLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey), "sk-user-1");

const emptyNewLlm = userApiSettingsStoreTestInternals.mergeLlmForSave(
  {
    ...DEFAULT_SETTINGS,
    models: {
      [DEFAULT_SETTINGS.defaultModelId]: {
        ...DEFAULT_SETTINGS.models[DEFAULT_SETTINGS.defaultModelId],
        apiKey: API_KEY_CONFIGURED_PLACEHOLDER,
      },
    },
  },
  null,
);
assert.equal(emptyNewLlm.models[DEFAULT_SETTINGS.defaultModelId].apiKey, "");

const savedImage = userApiSettingsStoreTestInternals.sanitizeImageModelsForStorage(
  {
    "gpt-image-2": {
      ...DEFAULT_IMAGE_SETTINGS.models["gpt-image-2"],
      apiKey: "sk-image-user",
    },
  },
  null,
);
assert.equal(decryptApiKey(savedImage["gpt-image-2"].apiKey), "sk-image-user");

const keptImage = userApiSettingsStoreTestInternals.sanitizeImageModelsForStorage(
  {
    "gpt-image-2": {
      ...DEFAULT_IMAGE_SETTINGS.models["gpt-image-2"],
      apiKey: API_KEY_CONFIGURED_PLACEHOLDER,
    },
  },
  savedImage,
);
assert.equal(decryptApiKey(keptImage["gpt-image-2"].apiKey), "sk-image-user");

const emptyNewVideo = userApiSettingsStoreTestInternals.sanitizeVideoModelsForStorage(
  {
    "seedance-2.0": {
      ...DEFAULT_VIDEO_SETTINGS.models["seedance-2.0"],
      apiKey: API_KEY_CONFIGURED_PLACEHOLDER,
    },
  },
  null,
);
assert.equal(emptyNewVideo["seedance-2.0"].apiKey, "");

console.log("user-api-settings-store.smoke passed");
