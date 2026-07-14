import { describe, expect, it } from "vitest";
import { resolveProfileImageUploadMetadata } from "../lib/profile-image-metadata";

describe("resolveProfileImageUploadMetadata", () => {
  it("uses the edited cache file format instead of stale HEIC picker metadata", () => {
    expect(
      resolveProfileImageUploadMetadata({
        uri: "file:///var/mobile/Containers/Data/Application/cache/cropped-profile.jpg",
        fileName: "IMG_1024.HEIC",
        mimeType: "image/heic"
      })
    ).toEqual({
      fileName: "IMG_1024.jpg",
      mimeType: "image/jpeg"
    });
  });

  it("keeps supported PNG uploads consistent", () => {
    expect(
      resolveProfileImageUploadMetadata({
        uri: "file:///tmp/avatar.png",
        fileName: "my avatar.png",
        mimeType: "image/png"
      })
    ).toEqual({
      fileName: "my-avatar.png",
      mimeType: "image/png"
    });
  });

  it("falls back to a safe JPEG name when picker metadata is absent", () => {
    expect(resolveProfileImageUploadMetadata({ uri: "ph://profile-image" })).toEqual({
      fileName: "profile-image.jpg",
      mimeType: "image/jpeg"
    });
  });
});
