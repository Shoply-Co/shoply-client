import { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { useMagazineIssue } from "@/entities/magazine";
import { userFacingErrorMessage } from "@/shared/api/errors";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { ReviewDetailViewer } from "@/widgets/review-detail-viewer";

export function MagazineReviewDetailPage() {
  const { issueId, reviewId } = useLocalSearchParams<{
    issueId?: string;
    reviewId?: string;
  }>();
  const theme = useShoplyTheme();
  const issueQuery = useMagazineIssue(issueId);
  const reviewIds = useMemo(() => {
    const ids =
      issueQuery.data?.sections.flatMap((section) =>
        section.items.flatMap((item) => (item.reviewId ? [item.reviewId] : []))
      ) ?? [];
    return [...new Set(ids)];
  }, [issueQuery.data]);
  const activeReviewId = reviewId && reviewIds.includes(reviewId) ? reviewId : reviewIds[0];

  if (issueQuery.isPending) {
    return (
      <SafeAreaView
        style={{
          alignItems: "center",
          backgroundColor: theme.semantic.color.background,
          flex: 1,
          gap: 12,
          justifyContent: "center"
        }}
      >
        <ActivityIndicator color={theme.semantic.color.primary} />
        <ShoplyText color="textMuted">잡지의 리뷰 목록을 불러오고 있어요.</ShoplyText>
      </SafeAreaView>
    );
  }

  if (!issueQuery.data || issueQuery.isError || !reviewIds.length) {
    return (
      <SafeAreaView
        style={{
          backgroundColor: theme.semantic.color.background,
          flex: 1,
          justifyContent: "center",
          padding: 24
        }}
      >
        <View style={{ alignItems: "center", gap: 14 }}>
          <ShoplyText variant="titleMd">잡지 리뷰를 열지 못했어요</ShoplyText>
          <ShoplyText color="textMuted" align="center">
            {userFacingErrorMessage(issueQuery.error, "잡지에 표시할 리뷰가 없습니다.")}
          </ShoplyText>
          <Button
            label="잡지로 돌아가기"
            onPress={() =>
              goBackOrReplace({
                pathname: "/magazine/[issueId]",
                params: { issueId: issueId ?? "" }
              })
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ReviewDetailViewer
      reviewId={activeReviewId}
      reviewIds={reviewIds}
      sourceSurfaceOverride="magazine_detail"
    />
  );
}
