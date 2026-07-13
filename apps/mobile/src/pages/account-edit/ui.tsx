import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { ReactNode, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import {
  AccountOverviewSuspenseBoundary,
  accountOverviewQueryKey,
  useSuspenseAccountOverview
} from "@/entities/user";
import { apiRequest } from "@/shared/api/client";
import { goBackOrReplace } from "@/shared/lib/navigation";
import type { UserProfile } from "@/shared/api/generated/shoply";

interface SelectedProfileImage {
  file?: ImagePicker.ImagePickerAsset["file"] | null;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

interface ProfileImageUploadResult {
  publicUrl: string;
}

type ProfileImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/heic"
  | "image/heic-sequence"
  | "image/heif"
  | "image/heif-sequence";

const PROFILE_IMAGE_MIME_BY_EXTENSION: Record<string, ProfileImageMimeType> = {
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const PROFILE_IMAGE_MIME_TYPES = new Set<ProfileImageMimeType>([
  ...Object.values(PROFILE_IMAGE_MIME_BY_EXTENSION),
  "image/heic-sequence",
  "image/heif-sequence"
]);

export function AccountEditPage() {
  const { user } = useSession();

  return (
    <AccountEditFrame>
      {!user ? (
        <StatePanel
          title="로그인이 필요해요"
          body="로그인 후 계정정보를 수정할 수 있습니다."
          actionLabel="로그인"
          onAction={() => router.push("/login")}
        />
      ) : (
        <AccountOverviewSuspenseBoundary
          fallback={<LoadingPanel />}
          errorFallback={(retry) => (
            <StatePanel
              title="계정정보를 불러오지 못했어요"
              body="잠시 후 다시 시도해주세요."
              actionLabel="다시 시도"
              onAction={retry}
            />
          )}
        >
          <AccountEditForm />
        </AccountOverviewSuspenseBoundary>
      )}
    </AccountEditFrame>
  );
}

function AccountEditForm() {
  const theme = useShoplyTheme();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { data: account } = useSuspenseAccountOverview();
  const [nickname, setNickname] = useState(() => account.profile?.nickname ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState(
    () => account.profile?.profileImageUrl ?? ""
  );
  const [selectedImage, setSelectedImage] = useState<SelectedProfileImage | null>(null);
  const [saving, setSaving] = useState(false);

  const pickProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("사진 접근 권한 필요", "프로필 이미지를 선택하려면 사진 접근 권한이 필요합니다.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;

    setSelectedImage({
      file: asset.file ?? null,
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType
    });
    setProfileImageUrl(asset.uri);
    void Haptics.selectionAsync();
  };

  const uploadProfileImage = async (image: SelectedProfileImage) => {
    const formData = new FormData();
    const fileName = resolveProfileImageFileName(image);
    const mimeType = resolveProfileImageMimeType(image, fileName);
    appendProfileImageFile(formData, image, fileName, mimeType);
    formData.append("fileName", fileName);

    return apiRequest<ProfileImageUploadResult>("/uploads/profile-images", {
      method: "POST",
      body: formData as RequestInit["body"]
    });
  };

  const saveProfile = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (nickname.trim().length < 2) {
      Alert.alert("닉네임 확인", "닉네임은 2자 이상 입력해주세요.");
      return;
    }

    setSaving(true);
    try {
      const uploadedImage = selectedImage ? await uploadProfileImage(selectedImage) : null;
      if (selectedImage && !uploadedImage?.publicUrl) {
        throw new Error("프로필 이미지 업로드 주소를 받지 못했어요.");
      }
      const updatedProfile = await apiRequest<UserProfile>("/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          nickname: nickname.trim(),
          profileImageUrl: uploadedImage?.publicUrl ?? (profileImageUrl.trim() || null)
        })
      });
      queryClient.setQueryData(accountOverviewQueryKey, (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return { ...current, profile: updatedProfile };
      });
      await queryClient.invalidateQueries({ queryKey: accountOverviewQueryKey });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", "public", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["profile", "reviews", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["home", "reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["search", "reviews"] })
      ]);
      Alert.alert("저장 완료", "계정정보가 저장됐어요.");
      goBackOrReplace();
    } catch (error) {
      Alert.alert(
        "저장 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.avatarSection}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="프로필 이미지 선택"
          onPress={pickProfileImage}
          style={({ pressed }) => [
            styles.avatarButton,
            {
              backgroundColor: theme.semantic.color.surfaceMuted,
              borderColor: theme.semantic.color.border,
              opacity: pressed ? 0.86 : 1
            }
          ]}
        >
          {profileImageUrl ? (
            <ExpoImage
              source={{ uri: profileImageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
        </Pressable>
        <ShoplyText variant="caption" color="textMuted" align="center">
          프로필 이미지를 선택해주세요.
        </ShoplyText>
      </View>

      <View style={styles.fieldGroup}>
        <ShoplyText variant="labelMd">닉네임</ShoplyText>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="닉네임"
          placeholderTextColor={theme.component.input.placeholder}
          style={[
            styles.input,
            {
              backgroundColor: theme.component.input.background,
              borderColor: theme.component.input.border,
              color: theme.component.input.text
            }
          ]}
        />
      </View>

      <Button label="저장" size="lg" loading={saving} onPress={saveProfile} />
    </>
  );
}

function AccountEditFrame({ children }: { children: ReactNode }) {
  const theme = useShoplyTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <TextBackButton />
            <ShoplyText variant="titleLg">내 계정정보 설정</ShoplyText>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoadingPanel() {
  const theme = useShoplyTheme();
  return (
    <View style={styles.loadingPanel} accessibilityLabel="계정 정보 불러오는 중">
      <ActivityIndicator color={theme.semantic.color.primary} />
    </View>
  );
}

function StatePanel({
  title,
  body,
  actionLabel,
  onAction
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useShoplyTheme();
  return (
    <View style={[styles.statePanel, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
      <ShoplyText variant="titleMd" align="center">
        {title}
      </ShoplyText>
      <ShoplyText variant="bodyMd" color="textMuted" align="center">
        {body}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

function resolveProfileImageFileName(image: SelectedProfileImage) {
  const candidate = image.fileName?.trim() || image.file?.name || fileNameFromUri(image.uri);
  const mimeType = resolveProfileImageMimeType(image, candidate);
  const extension = extensionForProfileImageMimeType(mimeType);
  const baseName = sanitizeProfileImageBaseName(candidate);

  return `${baseName}.${extension}`;
}

function appendProfileImageFile(
  formData: FormData,
  image: SelectedProfileImage,
  fileName: string,
  mimeType: ProfileImageMimeType
) {
  if (Platform.OS === "web") {
    if (!image.file) {
      throw new Error("프로필 이미지를 다시 선택해주세요.");
    }
    formDataAppend(formData, "file", image.file, fileName);
    return;
  }

  formDataAppend(formData, "file", {
    uri: image.uri,
    name: fileName,
    type: mimeType
  });
}

function formDataAppend(formData: FormData, name: string, value: unknown, fileName?: string) {
  (
    formData as unknown as {
      append(fieldName: string, fieldValue: unknown, fileName?: string): void;
    }
  ).append(name, value, fileName);
}

function resolveProfileImageMimeType(
  image: SelectedProfileImage,
  fileName?: string | null
): ProfileImageMimeType {
  const normalized = image.mimeType?.trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized && isProfileImageMimeType(normalized)) return normalized;

  const extension = fileName
    ?.trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)(?:[?#].*)?$/)?.[1];
  if (extension && PROFILE_IMAGE_MIME_BY_EXTENSION[extension]) {
    return PROFILE_IMAGE_MIME_BY_EXTENSION[extension];
  }

  return "image/jpeg";
}

function isProfileImageMimeType(value: string): value is ProfileImageMimeType {
  return PROFILE_IMAGE_MIME_TYPES.has(value as ProfileImageMimeType);
}

function extensionForProfileImageMimeType(mimeType: ProfileImageMimeType) {
  return {
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heic-sequence": "heic",
    "image/heif": "heif",
    "image/heif-sequence": "heif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[mimeType];
}

function fileNameFromUri(uri: string) {
  const lastSegment = uri.split(/[?#]/)[0]?.split("/").pop() ?? "";
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

function sanitizeProfileImageBaseName(fileName?: string | null) {
  const baseName = fileName?.replace(/\.[^.]+$/, "") ?? "";
  const sanitized = baseName
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized || "profile-image";
}

function TextBackButton() {
  const theme = useShoplyTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
      hitSlop={10}
      onPress={() => goBackOrReplace()}
      style={({ pressed }) => [styles.iconBackButton, { opacity: pressed ? 0.68 : 1 }]}
    >
      <ArrowLeft size={22} color={theme.semantic.color.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 112,
    justifyContent: "center",
    overflow: "hidden",
    width: 112
  },
  avatarSection: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 14
  },
  loadingPanel: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220
  },
  content: {
    flexGrow: 1,
    gap: 20,
    padding: 16,
    paddingBottom: 40
  },
  fieldGroup: {
    gap: 8
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12
  },
  statePanel: {
    alignItems: "center",
    borderRadius: 8,
    gap: 10,
    padding: 18
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  iconBackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  }
});
