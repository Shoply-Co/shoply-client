import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Camera, UserRound } from "lucide-react-native";
import {
  Alert,
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
import { useAccountOverview } from "@/entities/user";
import { saveOnboarding } from "@/features/onboarding-update";
import { uploadProfileImage, type ProfileImageUploadInput } from "@/features/profile-image-upload";
import { queryClient } from "@/shared/api/query-client";

export function OnboardingPage() {
  const theme = useShoplyTheme();
  const { user, refreshSessionState } = useSession();
  const { data: account } = useAccountOverview(Boolean(user));
  const [nickname, setNickname] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [selectedImage, setSelectedImage] = useState<ProfileImageUploadInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nicknameReady = nickname.trim().length >= 2;

  useEffect(() => {
    if (!nickname && account?.profile?.nickname) {
      setNickname(account.profile.nickname);
    }
  }, [account?.profile?.nickname, nickname]);

  useEffect(() => {
    if (!profileImageUrl && account?.profile?.profileImageUrl) {
      setProfileImageUrl(account.profile.profileImageUrl);
    }
  }, [account?.profile?.profileImageUrl, profileImageUrl]);

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

  const complete = async () => {
    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 2) {
      Alert.alert("닉네임 확인", "2자 이상 닉네임을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const uploadedImage = selectedImage ? await uploadProfileImage(selectedImage) : null;
      await saveOnboarding({
        nickname: trimmedNickname,
        profileImageUrl: uploadedImage?.publicUrl ?? (profileImageUrl || null)
      });
      await queryClient.invalidateQueries({ queryKey: ["account", "overview"] });
      await refreshSessionState();
      router.replace("/");
    } catch (error) {
      Alert.alert(
        "저장 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
        edges={["top"]}
      >
        <View style={styles.centerPanel}>
          <UserRound size={34} color={theme.semantic.color.primary} />
          <ShoplyText variant="titleLg" align="center">
            로그인이 필요해요
          </ShoplyText>
          <ShoplyText variant="bodyMd" color="textMuted" align="center">
            로그인 후 시작할 수 있어요.
          </ShoplyText>
          <Button label="로그인으로 이동" size="lg" onPress={() => router.replace("/login")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={[styles.iconMark, { backgroundColor: theme.semantic.color.primarySoft }]}>
              <UserRound size={28} color={theme.semantic.color.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <ShoplyText variant="titleLg">닉네임 설정</ShoplyText>
              <ShoplyText variant="bodyMd" color="textMuted">
                Shoply에서 사용할 이름을 입력해주세요.
              </ShoplyText>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.profileImageSection}>
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
                  <Camera size={28} color={theme.semantic.color.primary} />
                )}
                <View
                  style={[
                    styles.avatarEditBadge,
                    { backgroundColor: theme.semantic.color.primary }
                  ]}
                >
                  <Camera size={13} color={theme.semantic.color.textInverse} />
                </View>
              </Pressable>
              <Button
                label={profileImageUrl ? "프로필 이미지 변경" : "프로필 이미지 등록"}
                size="sm"
                variant="secondary"
                onPress={pickProfileImage}
              />
              <ShoplyText variant="caption" color="textMuted" align="center">
                선택 사항이며 언제든 계정정보에서 바꿀 수 있어요.
              </ShoplyText>
            </View>

            <View style={styles.sectionTitle}>
              <UserRound size={18} color={theme.semantic.color.primary} />
              <ShoplyText variant="titleMd">닉네임</ShoplyText>
            </View>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              placeholder="Shoply에서 사용할 이름"
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

          <View style={styles.actions}>
            <Button
              label="완료"
              size="lg"
              loading={submitting}
              disabled={!nicknameReady || submitting}
              onPress={() => complete()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    paddingTop: 4
  },
  avatarButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 104,
    justifyContent: "center",
    overflow: "hidden",
    width: 104
  },
  avatarEditBadge: {
    alignItems: "center",
    borderRadius: 999,
    bottom: 7,
    height: 28,
    justifyContent: "center",
    position: "absolute",
    right: 7,
    width: 28
  },
  centerPanel: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  content: {
    gap: 18,
    padding: 16,
    paddingBottom: 36
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13,
    paddingTop: 10
  },
  iconMark: {
    alignItems: "center",
    borderRadius: 8,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12
  },
  profileImageSection: {
    alignItems: "center",
    gap: 9,
    paddingBottom: 10,
    paddingTop: 4
  },
  section: {
    gap: 10
  },
  sectionTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  }
});
