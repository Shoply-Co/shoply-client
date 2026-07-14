import { FlashList } from "@shopify/flash-list";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { ArrowLeft, SlidersHorizontal, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import { useReviewCategoryTree } from "@/entities/catalog";
import {
  useMyMagazines,
  usePublicProfileMagazines,
  type MagazineSummary
} from "@/entities/magazine";
import {
  mapApiReviewSummary,
  mediaReviews,
  ReviewTile,
  useReviewTileVideoPreview
} from "@/entities/review";
import type { ReviewSummary } from "@/entities/review";
import { apiRequest } from "@/shared/api/client";
import { captureActionEventsQuietly } from "@/features/event-capture";
import { goBackOrReplace } from "@/shared/lib/navigation";
import { ShoplySMonogram } from "@/shared/ui/brand";
import { AdaptiveStickyHeader } from "@/shared/ui/adaptive-sticky-header";
import type { ReviewSummary as ApiReviewSummary, UserProfile } from "@/shared/api/generated/shoply";

interface PageResult<T> {
  data: T[];
  page?: {
    limit?: number;
    nextCursor?: string | null;
  };
}

const contentScopes = [
  { id: "all", label: "전체" },
  { id: "review", label: "리뷰" }
] as const;

const sortOptions = [
  { id: "recent", label: "최신순" },
  { id: "likes", label: "좋아요순" },
  { id: "linkClicks", label: "링크클릭순" }
] as const;

type ContentScope = (typeof contentScopes)[number]["id"];
type SortOption = (typeof sortOptions)[number]["id"];
type ProfileTab = "posts" | "magazines";
type MagazineCadence = "monthly" | "weekly" | "edition";

export function PublicProfilePage() {
  const theme = useShoplyTheme();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const targetUserId = userId ?? user?.id;
  const enabled = Boolean(targetUserId);
  const isMine = Boolean(user?.id && targetUserId === user.id);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [magazineCadence, setMagazineCadence] = useState<MagazineCadence>("monthly");
  const [contentScope, setContentScope] = useState<ContentScope>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftContentScope, setDraftContentScope] = useState<ContentScope>("all");
  const [draftSelectedCategoryId, setDraftSelectedCategoryId] = useState<string | null>(null);
  const [draftSortBy, setDraftSortBy] = useState<SortOption>("recent");
  const videoPreview = useReviewTileVideoPreview();
  const activeFilterCount =
    Number(contentScope !== "all") +
    Number(Boolean(selectedCategoryId)) +
    Number(sortBy !== "recent");
  const categoryQuery = useReviewCategoryTree();
  const categoryOptions = categoryQuery.data ?? [];
  const profileQuery = useQuery({
    queryKey: ["profile", "public", targetUserId],
    enabled,
    queryFn: () => apiRequest<UserProfile>(`/profiles/${targetUserId}`, { auth: false }),
    retry: 1
  });
  useEffect(() => {
    if (!targetUserId) return;
    captureActionEventsQuietly([
      {
        eventType: "profile_impression",
        targetType: "user_profile",
        targetId: targetUserId,
        sourceSurface: "public_profile"
      }
    ]);
  }, [targetUserId]);
  const reviewsQuery = useQuery({
    queryKey: ["profile", "reviews", targetUserId],
    enabled,
    queryFn: async () => {
      const response = await apiRequest<PageResult<ApiReviewSummary>>(
        `/reviews?authorUserId=${targetUserId}&limit=120`,
        {
          auth: false,
          unwrapEnvelope: false
        }
      );
      return mediaReviews(response.data.map((review, index) => mapApiReviewSummary(review, index)));
    },
    placeholderData: keepPreviousData,
    retry: 1
  });
  const myMagazinesQuery = useMyMagazines(enabled && isMine);
  const publicMagazinesQuery = usePublicProfileMagazines(targetUserId, enabled && !isMine);
  const magazineQuery = isMine ? myMagazinesQuery : publicMagazinesQuery;

  const profile = profileQuery.data;
  const showProfileSkeleton = enabled && profileQuery.isPending && !profile;
  const showReviewSkeleton = enabled && reviewsQuery.isPending;
  const showMagazineSkeleton = enabled && magazineQuery.isPending;
  const flatCategoryOptions = useMemo(
    () => categoryOptions.flatMap((category) => [category, ...(category.children ?? [])]),
    [categoryOptions]
  );
  const selectedCategoryIds = useMemo(() => {
    if (!selectedCategoryId) return null;
    const parent = categoryOptions.find((category) => category.id === selectedCategoryId);
    return new Set([
      selectedCategoryId,
      ...(parent?.children ?? []).map((category) => category.id)
    ]);
  }, [categoryOptions, selectedCategoryId]);
  const displayedReviews = useMemo(
    () =>
      sortReviews(
        (reviewsQuery.data ?? []).filter((review) => {
          if (contentScope !== "all" && contentScope !== "review") return false;
          if (!selectedCategoryIds) return true;
          return Boolean(review.categoryId && selectedCategoryIds.has(review.categoryId));
        }),
        sortBy
      ),
    [contentScope, reviewsQuery.data, selectedCategoryIds, sortBy]
  );
  const displayedMagazines = useMemo(
    () =>
      (magazineQuery.data ?? []).filter((issue) =>
        magazineCadence === "edition"
          ? issue.issueType === "custom"
          : issue.issueType === "automatic" && issue.cadence === magazineCadence
      ),
    [magazineCadence, magazineQuery.data]
  );

  const pick = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (!targetUserId || targetUserId === user.id) {
      Alert.alert("픽할 수 없어요", "내 프로필은 픽 대상에서 제외됩니다.");
      return;
    }
    try {
      await apiRequest<void>(`/users/me/picks/${targetUserId}`, { method: "PUT" });
      await queryClient.invalidateQueries({ queryKey: ["profile", "public", targetUserId] });
      Alert.alert("픽 완료", "이 작성자를 내 픽 목록에 저장했어요.");
    } catch (error) {
      Alert.alert("픽 실패", error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.");
    }
  };

  const openFilters = () => {
    setDraftContentScope(contentScope);
    setDraftSelectedCategoryId(selectedCategoryId);
    setDraftSortBy(sortBy);
    setFiltersOpen(true);
  };

  const closeFilters = () => {
    setFiltersOpen(false);
  };

  const resetDraftFilters = () => {
    setDraftContentScope("all");
    setDraftSelectedCategoryId(null);
    setDraftSortBy("recent");
  };

  const applyDraftFilters = () => {
    setContentScope(draftContentScope);
    setSelectedCategoryId(draftSelectedCategoryId);
    setSortBy(draftSortBy);
    setFiltersOpen(false);
  };

  const listHeader = (
    <View style={styles.headerWrap}>
      {showProfileSkeleton ? (
        <ProfileHeaderSkeleton />
      ) : profileQuery.isError && !profile ? null : (
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
            {profile?.profileImageUrl ? (
              <ExpoImage
                source={{ uri: profile.profileImageUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <ShoplySMonogram size={38} color={theme.semantic.color.primary} />
            )}
          </View>
          <View style={styles.profileCopy}>
            <ShoplyText variant="titleLg" numberOfLines={1}>
              {profile?.nickname ?? "Shoply 작성자"}
            </ShoplyText>
            <ShoplyText variant="caption" color="textMuted" numberOfLines={1}>
              @{targetUserId?.slice(0, 8) ?? "profile"}
            </ShoplyText>
            {profile?.bio ? (
              <ShoplyText variant="bodyMd" numberOfLines={2}>
                {profile.bio}
              </ShoplyText>
            ) : null}
          </View>
        </View>
      )}

      {!isMine && profile ? (
        <View style={styles.actions}>
          <Button label="작성자 픽" onPress={pick} style={{ flex: 1 }} />
          <Button
            label="리뷰 탐색"
            variant="secondary"
            onPress={() => router.push("/(tabs)/search")}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      <View
        accessibilityLabel="프로필 콘텐츠 탭"
        style={[styles.profileTabs, { borderColor: theme.semantic.color.border }]}
      >
        {(["posts", "magazines"] as ProfileTab[]).map((tab) => {
          const selected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                videoPreview.pausePreview();
                setActiveTab(tab);
              }}
              style={[
                styles.profileTab,
                selected ? { borderColor: theme.semantic.color.primary } : null
              ]}
            >
              <ShoplyText variant="labelLg" color={selected ? "primary" : "textMuted"}>
                {tab === "posts" ? "게시물" : "잡지"}
              </ShoplyText>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "posts" ? (
        <View style={styles.sectionHeader}>
          <ShoplyText variant="titleMd" style={{ flex: 1 }}>
            {isMine ? "내가 올린 게시물" : "게시글 목록"}
          </ShoplyText>
          <Button
            size="icon"
            variant={activeFilterCount ? "primary" : "secondary"}
            accessibilityLabel="게시글 필터 열기"
            icon={
              <SlidersHorizontal
                size={19}
                color={activeFilterCount ? "white" : theme.semantic.color.primary}
              />
            }
            onPress={openFilters}
          />
        </View>
      ) : (
        <View style={styles.magazineHeader}>
          <View>
            <ShoplyText variant="caption" color="primary">
              SHOPLY ISSUES
            </ShoplyText>
            <ShoplyText variant="titleMd">잡지</ShoplyText>
          </View>
          <View style={styles.magazineCadenceTabs}>
            <Chip
              label="월간"
              selected={magazineCadence === "monthly"}
              onPress={() => setMagazineCadence("monthly")}
            />
            <Chip
              label="주간"
              selected={magazineCadence === "weekly"}
              onPress={() => setMagazineCadence("weekly")}
            />
            <Chip
              label="에디션"
              selected={magazineCadence === "edition"}
              onPress={() => setMagazineCadence("edition")}
            />
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <AdaptiveStickyHeader scrollY={scrollY} style={styles.stickyHeader}>
        <View style={styles.topBar}>
          <IconButton
            accessibilityLabel="뒤로 가기"
            onPress={() => goBackOrReplace()}
            icon={<ArrowLeft size={22} color={theme.semantic.color.text} />}
          />
          <ShoplyText variant="titleLg" style={{ flex: 1 }}>
            프로필
          </ShoplyText>
        </View>
      </AdaptiveStickyHeader>
      {activeTab === "posts" ? (
        <FlashList
          data={enabled && !showReviewSkeleton ? displayedReviews : []}
          numColumns={3}
          extraData={videoPreview.activePreviewReviewId}
          keyExtractor={(item) => item.id}
          viewabilityConfig={videoPreview.viewabilityConfig}
          onViewableItemsChanged={videoPreview.onViewableItemsChanged}
          onScroll={onScroll}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <ReviewTile
              review={item}
              columns={3}
              videoPreviewActive={videoPreview.activePreviewReviewId === item.id}
              onPress={() =>
                router.push({ pathname: "/review/[reviewId]", params: { reviewId: item.id } })
              }
            />
          )}
          onScrollBeginDrag={videoPreview.pausePreview}
          onMomentumScrollBegin={videoPreview.pausePreview}
          onScrollEndDrag={videoPreview.resumePreview}
          onMomentumScrollEnd={videoPreview.resumePreview}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !enabled ? (
              <StatePanel
                title="로그인이 필요해요"
                body="로그인 후 프로필을 확인할 수 있어요."
                actionLabel="로그인"
                onAction={() => router.push("/login")}
              />
            ) : showReviewSkeleton ? (
              <ProfileGridSkeleton />
            ) : profileQuery.isError && !profile ? (
              <StatePanel
                title="프로필을 불러오지 못했어요"
                body="작성자 정보를 가져오지 못했습니다."
                actionLabel="다시 시도"
                onAction={() => void profileQuery.refetch()}
              />
            ) : reviewsQuery.isFetching ? null : reviewsQuery.isError ? (
              <StatePanel
                title="공개 리뷰를 불러오지 못했어요"
                body="잠시 후 다시 시도해주세요."
                actionLabel="다시 시도"
                onAction={() => void reviewsQuery.refetch()}
              />
            ) : (
              <StatePanel
                title="게시글이 아직 없어요"
                body="선택한 조건에 맞는 공개 게시글이 없습니다."
              />
            )
          }
        />
      ) : (
        <FlashList
          data={enabled && !showMagazineSkeleton ? displayedMagazines : []}
          numColumns={2}
          keyExtractor={(item) => item.id}
          onScroll={onScroll}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => <MagazineTile issue={item} />}
          contentContainerStyle={styles.magazineListContent}
          ListEmptyComponent={
            !enabled ? (
              <StatePanel
                title="로그인이 필요해요"
                body="로그인 후 잡지를 확인할 수 있어요."
                actionLabel="로그인"
                onAction={() => router.push("/login")}
              />
            ) : showMagazineSkeleton ? (
              <MagazineGridSkeleton />
            ) : magazineQuery.isError ? (
              <StatePanel
                title="잡지를 불러오지 못했어요"
                body="잠시 후 다시 시도해주세요."
                actionLabel="다시 시도"
                onAction={() => void magazineQuery.refetch()}
              />
            ) : (
              <StatePanel
                title={`${magazineCadence === "edition" ? "에디션" : magazineCadence === "monthly" ? "월간" : "주간"}이 아직 없어요`}
                body={
                  magazineCadence === "edition"
                    ? isMine
                      ? "쇼플리에서 직접 만든 에디션이 이곳에 표시됩니다."
                      : "작성자가 공개한 에디션이 준비되면 표시됩니다."
                    : isMine
                      ? "자동 발행이 완료되면 이곳에 표시됩니다."
                      : "공개된 잡지가 준비되면 이곳에 표시됩니다."
                }
              />
            )
          }
        />
      )}

      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={closeFilters}>
        <Pressable style={styles.modalBackdrop} onPress={closeFilters} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.semantic.color.surface },
            theme.semantic.shadow.overlay
          ]}
        >
          <View style={styles.sheetHeader}>
            <ShoplyText variant="titleMd">필터</ShoplyText>
            <Button
              size="icon"
              variant="tertiary"
              accessibilityLabel="게시글 필터 닫기"
              onPress={closeFilters}
              icon={<X size={18} color={theme.semantic.color.text} />}
            />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <FilterGroup title="콘텐츠">
              {contentScopes.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  selected={draftContentScope === item.id}
                  onPress={() => setDraftContentScope(item.id)}
                />
              ))}
            </FilterGroup>
            <FilterGroup title="카테고리">
              <Chip
                label="전체 카테고리"
                selected={!draftSelectedCategoryId}
                onPress={() => setDraftSelectedCategoryId(null)}
              />
              {flatCategoryOptions.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  selected={draftSelectedCategoryId === category.id}
                  onPress={() => setDraftSelectedCategoryId(category.id)}
                />
              ))}
            </FilterGroup>
            <FilterGroup title="정렬">
              {sortOptions.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  selected={draftSortBy === item.id}
                  onPress={() => setDraftSortBy(item.id)}
                />
              ))}
            </FilterGroup>
          </ScrollView>
          <View style={styles.sheetActions}>
            <Button
              label="초기화"
              variant="tertiary"
              onPress={resetDraftFilters}
              style={{ flex: 1 }}
            />
            <Button label="필터 적용" onPress={applyDraftFilters} style={{ flex: 1 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileHeaderSkeleton() {
  return (
    <View style={styles.profileHeader} accessibilityLabel="프로필 불러오는 중">
      <Skeleton width={86} height={86} radius={43} />
      <View style={styles.profileCopy}>
        <Skeleton width="56%" height={22} radius={7} />
        <Skeleton width="34%" height={12} radius={5} />
        <Skeleton width="82%" height={14} radius={6} />
      </View>
    </View>
  );
}

function ProfileGridSkeleton() {
  return (
    <View style={styles.skeletonGrid} accessibilityLabel="프로필 리뷰 불러오는 중">
      {Array.from({ length: 12 }, (_, index) => (
        <View key={index} style={styles.skeletonTile}>
          <Skeleton height="100%" radius={4} />
        </View>
      ))}
    </View>
  );
}

function MagazineGridSkeleton() {
  return (
    <View style={styles.magazineSkeletonGrid} accessibilityLabel="잡지 불러오는 중">
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={styles.magazineSkeletonTile}>
          <Skeleton height="100%" radius={2} />
        </View>
      ))}
    </View>
  );
}

function MagazineTile({ issue }: { issue: MagazineSummary }) {
  const theme = useShoplyTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${issue.issueLabel} 잡지 열기`}
      onPress={() => router.push(`/magazine/${issue.id}` as Href)}
      style={({ pressed }) => [styles.magazineTile, { opacity: pressed ? 0.86 : 1 }]}
    >
      <View style={[styles.magazineCover, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
        {issue.coverImageUrl ? (
          <ExpoImage
            source={{ uri: issue.coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <ShoplySMonogram size={64} color={theme.semantic.color.primary} />
        )}
        <View
          style={[styles.magazineIssueLabel, { backgroundColor: theme.semantic.color.primary }]}
        >
          <ShoplyText variant="caption" style={styles.magazineInverseText}>
            {issue.issueLabel}
          </ShoplyText>
        </View>
        <View style={styles.magazineCoverCopy}>
          <ShoplyText style={styles.magazineCoverTitle} numberOfLines={3}>
            {issue.coverTitle ?? "SHOPLY ISSUE"}
          </ShoplyText>
        </View>
      </View>
      <ShoplyText
        variant="caption"
        color="textMuted"
        numberOfLines={2}
        style={styles.magazineSubtitle}
      >
        {issue.coverSubtitle ?? `${issue.itemCount}개의 장면을 담은 이번 호`}
      </ShoplyText>
    </Pressable>
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress
}: {
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.68 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.filterGroup}>
      <ShoplyText variant="labelMd">{title}</ShoplyText>
      <View style={styles.sheetChips}>{children}</View>
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
  return (
    <View style={styles.emptyPanel}>
      <ShoplyText variant="labelLg" align="center">
        {title}
      </ShoplyText>
      <ShoplyText variant="caption" color="textMuted" align="center">
        {body}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </View>
  );
}

function sortReviews(reviews: ReviewSummary[], sortBy: SortOption) {
  const next = [...reviews];
  if (sortBy === "likes") return next.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  if (sortBy === "linkClicks")
    return next.sort((a, b) => (b.linkClicks ?? 0) - (a.linkClicks ?? 0));
  return next.sort(
    (a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10
  },
  avatar: {
    alignItems: "center",
    borderRadius: 999,
    height: 86,
    justifyContent: "center",
    overflow: "hidden",
    width: 86
  },
  emptyPanel: {
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    minHeight: 380,
    padding: 32
  },
  filterGroup: {
    gap: 9
  },
  headerWrap: {
    gap: 18,
    paddingBottom: 18,
    paddingHorizontal: 10,
    paddingTop: 8
  },
  iconButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  listContent: {
    paddingBottom: 120,
    paddingHorizontal: 2
  },
  magazineCadenceTabs: {
    flexDirection: "row",
    gap: 6
  },
  magazineCover: {
    alignItems: "center",
    aspectRatio: 0.76,
    justifyContent: "center",
    overflow: "hidden"
  },
  magazineCoverCopy: {
    backgroundColor: "rgba(5,5,7,0.62)",
    bottom: 0,
    left: 0,
    padding: 12,
    position: "absolute",
    right: 0
  },
  magazineCoverTitle: {
    color: "#FFFFFF",
    fontFamily: "Georgia",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 25
  },
  magazineHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4
  },
  magazineInverseText: { color: "#FFFFFF" },
  magazineIssueLabel: {
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
    top: 10
  },
  magazineListContent: {
    paddingBottom: 120,
    paddingHorizontal: 6
  },
  magazineSkeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 6
  },
  magazineSkeletonTile: {
    aspectRatio: 0.76,
    flexBasis: "47%",
    flexGrow: 1,
    margin: 5,
    overflow: "hidden"
  },
  magazineSubtitle: { marginTop: 8 },
  magazineTile: { flex: 1, margin: 5, paddingBottom: 16 },
  modalBackdrop: {
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  profileCopy: {
    flex: 1,
    gap: 5,
    justifyContent: "center"
  },
  profileHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 2,
    paddingVertical: 8
  },
  profileTab: {
    alignItems: "center",
    borderBottomWidth: 2,
    flex: 1,
    paddingBottom: 11,
    paddingTop: 8
  },
  profileTabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginHorizontal: -10
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    gap: 18,
    left: 0,
    maxHeight: "82%",
    padding: 18,
    paddingBottom: 34,
    position: "absolute",
    right: 0
  },
  sheetBody: {
    gap: 18
  },
  sheetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  skeletonTile: {
    aspectRatio: 3 / 4,
    flexBasis: "32%",
    flexGrow: 1,
    margin: 1.5,
    overflow: "hidden"
  },
  stickyHeader: {
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  }
});
