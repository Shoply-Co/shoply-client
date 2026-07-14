import type * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { apiRequest } from "@/shared/api/client";
import { resolveProfileImageUploadMetadata } from "../lib/profile-image-metadata";

export interface ProfileImageUploadInput {
  file?: ImagePicker.ImagePickerAsset["file"] | null;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

interface ProfileImageUploadResult {
  publicUrl: string;
}

export async function uploadProfileImage(image: ProfileImageUploadInput) {
  const formData = new FormData();
  const { fileName, mimeType } = resolveProfileImageUploadMetadata({
    ...image,
    fallbackFileName: image.file?.name
  });

  if (Platform.OS === "web") {
    if (!image.file) throw new Error("프로필 이미지를 다시 선택해주세요.");
    appendFormData(formData, "file", image.file, fileName);
  } else {
    appendFormData(formData, "file", {
      uri: image.uri,
      name: fileName,
      type: mimeType
    });
  }
  formData.append("fileName", fileName);

  const result = await apiRequest<ProfileImageUploadResult>("/uploads/profile-images", {
    method: "POST",
    body: formData as RequestInit["body"]
  });
  if (!result.publicUrl) throw new Error("프로필 이미지 업로드 주소를 받지 못했어요.");
  return result;
}

function appendFormData(formData: FormData, name: string, value: unknown, fileName?: string) {
  (
    formData as unknown as {
      append(fieldName: string, fieldValue: unknown, appendedFileName?: string): void;
    }
  ).append(name, value, fileName);
}
