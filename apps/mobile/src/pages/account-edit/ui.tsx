import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft, Camera } from "lucide-react-native";
import { ReactNode, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import Animated, { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import {
  AccountOverviewSuspenseBoundary,
  accountOverviewQueryKey,
  useSuspenseAccountOverview
} from "@/entities/user";
import { uploadProfileImage, type ProfileImageUploadInput } from "@/features/profile-image-upload";
import { apiRequest } from "@/shared/api/client";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { AdaptiveStickyHeader } from "@/shared/ui/adaptive-sticky-header";
import type { UserProfile } from "@/shared/api/generated/shoply";

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
  const [selectedImage, setSelectedImage] = useState<ProfileImageUploadInput | null>(null);
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
          ) : (
            <Camera size={30} color={theme.semantic.color.primary} />
          )}
          <View style={[styles.avatarEditBadge, { backgroundColor: theme.semantic.color.primary }]}>
            <Camera size={14} color={theme.semantic.color.textInverse} />
          </View>
        </Pressable>
        <Button
          label={profileImageUrl ? "프로필 이미지 변경" : "프로필 이미지 등록"}
          size="sm"
          variant="secondary"
          onPress={pickProfileImage}
        />
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
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          <AdaptiveStickyHeader scrollY={scrollY} style={styles.stickyHeader}>
            <View style={styles.topBar}>
              <TextBackButton />
              <ShoplyText variant="titleLg">내 계정정보 설정</ShoplyText>
            </View>
          </AdaptiveStickyHeader>
          {children}
        </Animated.ScrollView>
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
  avatarEditBadge: {
    alignItems: "center",
    borderRadius: 999,
    bottom: 8,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    width: 30
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
  stickyHeader: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 4
  },
  iconBackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  }
});
