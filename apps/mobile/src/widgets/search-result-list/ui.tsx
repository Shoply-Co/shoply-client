import { FlashList, type FlashListRef } from "@shopify/flash-list";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { SlidersHorizontal, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  Button,
  Chip,
  KeyboardAwareBottomSheet,
  SearchField,
  ShoplyText,
  Skeleton,
  useShoplyTheme
} from "@shoply/design-system";
import { useCategoryFilters, useReviewCategoryTree } from "@/entities/catalog";
import { useCategoryFilterPreferences } from "@/entities/user";
import {
  CatalogFilterInput,
  catalogFilterRowsToValueMap,
  catalogFilterValuesToPayload,
  type CatalogFilterValueMap
} from "@/features/catalog-filter-input";
import {
  createReviewDetailFeedKey,
  ReviewTile,
  setReviewDetailFeedContext,
  type ReviewSummary,
  useReviewActivityState,
  useReviewTileVideoPreview,
  useSearchReviews
} from "@/entities/review";
import { useSession } from "@/app/providers/session-provider";

const priceRanges = [
  { id: "all", label: "전체 구매 가격", min: null, max: null },
  { id: "under-30000", label: "3만원 이하", min: 0, max: 30000 },
  { id: "30000-70000", label: "3만-7만원", min: 30000, max: 70000 },
  { id: "70000-150000", label: "7만-15만원", min: 70000, max: 150000 },
  { id: "over-150000", label: "15만원 이상", min: 150000, max: null }
] as const;

type PriceRangeId = (typeof priceRanges)[number]["id"];

const SEARCH_QUERY_DEBOUNCE_MS = 180;

export function SearchResultList() {
  const theme = useShoplyTheme();
  const { user } = useSession();
  const listRef = useRef<FlashListRef<ReviewSummary>>(null);
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const initialQuery = routeQuery(params.q);
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);
  const [priceRangeId, setPriceRangeId] = useState<PriceRangeId>("all");
  const [priceMinText, setPriceMinText] = useState("");
  const [priceMaxText, setPriceMaxText] = useState("");
  const [filterValues, setFilterValues] = useState<CatalogFilterValueMap>({});
  const [preferenceFiltersEnabled, setPreferenceFiltersEnabled] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftCategoryId, setDraftCategoryId] = useState<string | null>(null);
  const [draftParentCategoryId, setDraftParentCategoryId] = useState<string | null>(null);
  const [draftPriceRangeId, setDraftPriceRangeId] = useState<PriceRangeId>("all");
  const [draftPriceMinText, setDraftPriceMinText] = useState("");
  const [draftPriceMaxText, setDraftPriceMaxText] = useState("");
  const [draftFilterValues, setDraftFilterValues] = useState<CatalogFilterValueMap>({});
  const [draftPreferenceFiltersEnabled, setDraftPreferenceFiltersEnabled] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [refreshSeed, setRefreshSeed] = useState(createFeedRefreshSeed);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [searchInputLoading, setSearchInputLoading] = useState(Boolean(initialQuery.trim()));
  const pullRefreshSawFetchRef = useRef(false);
  const videoPreview = useReviewTileVideoPreview();
  const categoryQuery = useReviewCategoryTree();
  const categoryOptions = categoryQuery.data ?? [];
  const activityQuery = useReviewActivityState(Boolean(user));
  const selectedPriceRange = priceRanges.find((item) => item.id === priceRangeId) ?? priceRanges[0];
  const manualPriceMin = parsePrice(priceMinText);
  const manualPriceMax = parsePrice(priceMaxText);
  const effectivePriceMin = manualPriceMin ?? selectedPriceRange.min;
  const effectivePriceMax = manualPriceMax ?? selectedPriceRange.max;
  const requestCategoryId = categoryId ?? parentCategoryId;
  const draftRequestCategoryId = draftCategoryId ?? draftParentCategoryId;
  const appliedCategoryFilterQuery = useCategoryFilters(requestCategoryId, "search");
  const appliedCategoryFilters = appliedCategoryFilterQuery.data?.filters ?? [];
  const appliedCategoryFilterKeySignature = appliedCategoryFilters
    .map((filter) => filter.key)
    .join("|");
  const draftCategoryFilterQuery = useCategoryFilters(
    filtersOpen ? draftRequestCategoryId : null,
    "search"
  );
  const draftCategoryFilters = draftCategoryFilterQuery.data?.filters ?? [];
  const draftCategoryFiltersUpdating = draftCategoryFilterQuery.isPlaceholderData;
  const draftCategoryFilterKeySignature = draftCategoryFilters
    .map((filter) => filter.key)
    .join("|");
  const draftPreferenceQuery = useCategoryFilterPreferences(
    draftRequestCategoryId,
    Boolean(filtersOpen && user && draftRequestCategoryId)
  );
  const draftPreferenceValues = useMemo(
    () => catalogFilterRowsToValueMap(draftPreferenceQuery.data?.filterValues),
    [draftPreferenceQuery.data?.filterValues]
  );
  const draftPreferenceValueSignature = JSON.stringify(draftPreferenceValues);
  const draftHasPreferenceValues = Object.keys(draftPreferenceValues).length > 0;
  const facetFilters = useMemo(
    () =>
      catalogFilterValuesToPayload(filterValues, appliedCategoryFilters).flatMap((filter) =>
        filter.values.map((value) => ({ key: filter.key, value }))
      ),
    [appliedCategoryFilters, filterValues]
  );
  const reviewFilters = useMemo(
    () => ({
      query: debouncedQuery,
      categoryId: requestCategoryId,
      priceMin: effectivePriceMin,
      priceMax: effectivePriceMax,
      userId: debouncedQuery.trim() ? null : (user?.id ?? null),
      facetFilters
    }),
    [
      debouncedQuery,
      effectivePriceMax,
      effectivePriceMin,
      facetFilters,
      requestCategoryId,
      user?.id
    ]
  );
  const scrollResetKey = JSON.stringify({
    query: debouncedQuery.trim(),
    categoryId: requestCategoryId ?? null,
    priceMin: effectivePriceMin,
    priceMax: effectivePriceMax,
    facetFilters
  });
  const searchQuery = useSearchReviews(reviewFilters, refreshSeed);
  const { data: serverReviews = [], isError, isFetching, refetch } = searchQuery;
  const showGridSkeleton =
    searchQuery.isPending ||
    (searchQuery.isPlaceholderData && !pullRefreshing && !searchQuery.isFetchingNextPage);
  const searchInFlight =
    !pullRefreshing &&
    !searchQuery.isFetchingNextPage &&
    (query.trim() !== debouncedQuery.trim() || (searchInputLoading && isFetching));

  useEffect(() => {
    if (!pullRefreshing) {
      pullRefreshSawFetchRef.current = false;
      return;
    }
    if (searchQuery.isFetching && !searchQuery.isFetchingNextPage) {
      pullRefreshSawFetchRef.current = true;
      return;
    }
    if (pullRefreshSawFetchRef.current) {
      setPullRefreshing(false);
      pullRefreshSawFetchRef.current = false;
    }
  }, [pullRefreshing, searchQuery.isFetching, searchQuery.isFetchingNextPage]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query);
      setSearchInputLoading(Boolean(query.trim()));
    }, SEARCH_QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const nextQuery = routeQuery(params.q);
    if (!nextQuery) return;
    setQuery(nextQuery);
    setDebouncedQuery(nextQuery);
    setSearchInputLoading(Boolean(nextQuery.trim()));
  }, [params.q]);

  useEffect(() => {
    if (!searchQuery.isFetching || searchQuery.isFetchingNextPage) {
      setSearchInputLoading(false);
    }
  }, [searchQuery.isFetching, searchQuery.isFetchingNextPage]);

  useLayoutEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [scrollResetKey]);

  useEffect(() => {
    if (
      requestCategoryId &&
      appliedCategoryFilterQuery.isFetching &&
      !appliedCategoryFilters.length
    ) {
      return;
    }
    const allowedKeys = new Set(
      appliedCategoryFilterKeySignature ? appliedCategoryFilterKeySignature.split("|") : []
    );
    setFilterValues((current) => {
      const nextEntries = Object.entries(current).filter(([key]) => allowedKeys.has(key));
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });
  }, [
    appliedCategoryFilterKeySignature,
    appliedCategoryFilterQuery.isFetching,
    appliedCategoryFilters.length,
    requestCategoryId
  ]);

  useEffect(() => {
    if (
      draftRequestCategoryId &&
      draftCategoryFilterQuery.isFetching &&
      !draftCategoryFilters.length
    ) {
      return;
    }
    const allowedKeys = new Set(
      draftCategoryFilterKeySignature ? draftCategoryFilterKeySignature.split("|") : []
    );
    setDraftFilterValues((current) => {
      const nextEntries = Object.entries(current).filter(([key]) => allowedKeys.has(key));
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });
  }, [
    draftCategoryFilterKeySignature,
    draftCategoryFilterQuery.isFetching,
    draftCategoryFilters.length,
    draftRequestCategoryId
  ]);

  useEffect(() => {
    if (draftPreferenceFiltersEnabled) {
      setDraftFilterValues(cloneFilterValues(draftPreferenceValues));
    }
  }, [draftPreferenceFiltersEnabled, draftPreferenceValueSignature]);

  const draftSelectedParentCategory = categoryOptions.find(
    (item) => item.id === draftParentCategoryId
  );
  const draftChildCategoryOptions = draftSelectedParentCategory?.children ?? [];
  const activeFilterCount =
    Number(Boolean(categoryId || parentCategoryId)) +
    Number(priceRangeId !== "all" || Boolean(priceMinText || priceMaxText)) +
    Number(facetFilters.length > 0);
  const hasActiveSearch = Boolean(query.trim() || activeFilterCount);

  const resetFilters = () => {
    setCategoryId(null);
    setParentCategoryId(null);
    setPriceRangeId("all");
    setPriceMinText("");
    setPriceMaxText("");
    setFilterValues({});
    setPreferenceFiltersEnabled(false);
    setSearchInputLoading(false);
    void Haptics.selectionAsync();
  };
  const openFilters = () => {
    setDraftCategoryId(categoryId);
    setDraftParentCategoryId(parentCategoryId);
    setDraftPriceRangeId(priceRangeId);
    setDraftPriceMinText(priceMinText);
    setDraftPriceMaxText(priceMaxText);
    setDraftFilterValues(cloneFilterValues(filterValues));
    setDraftPreferenceFiltersEnabled(preferenceFiltersEnabled);
    setFiltersOpen(true);
    void Haptics.selectionAsync();
  };
  const closeFilters = () => {
    setFiltersOpen(false);
  };
  const resetDraftFilters = () => {
    setDraftCategoryId(null);
    setDraftParentCategoryId(null);
    setDraftPriceRangeId("all");
    setDraftPriceMinText("");
    setDraftPriceMaxText("");
    setDraftFilterValues({});
    setDraftPreferenceFiltersEnabled(false);
    void Haptics.selectionAsync();
  };
  const applyDraftFilters = () => {
    setCategoryId(draftCategoryId);
    setParentCategoryId(draftParentCategoryId);
    setPriceRangeId(draftPriceRangeId);
    setPriceMinText(draftPriceMinText);
    setPriceMaxText(draftPriceMaxText);
    setFilterValues(cloneFilterValues(draftFilterValues));
    setPreferenceFiltersEnabled(draftPreferenceFiltersEnabled);
    setFiltersOpen(false);
    setSearchInputLoading(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const resetDraftDetailFilters = () => {
    setDraftFilterValues({});
    setDraftPreferenceFiltersEnabled(false);
  };
  const selectDraftParentCategory = (id: string | null, hasChildren = false) => {
    setDraftParentCategoryId(id);
    setDraftCategoryId(id && !hasChildren ? id : null);
    resetDraftDetailFilters();
  };
  const selectDraftCategory = (id: string, parentId?: string | null) => {
    setDraftParentCategoryId(parentId ?? null);
    setDraftCategoryId(id);
    resetDraftDetailFilters();
  };
  const updateDraftPriceMinText = (value: string) => {
    setDraftPriceRangeId("all");
    setDraftPriceMinText(value);
  };
  const updateDraftPriceMaxText = (value: string) => {
    setDraftPriceRangeId("all");
    setDraftPriceMaxText(value);
  };
  const resultData = serverReviews;
  const displayedData = useMemo(
    () =>
      resultData.map((review) => ({
        ...review,
        viewerActivity: activityQuery.data?.[review.id]
      })),
    [activityQuery.data, resultData]
  );

  const openReviewDetail = (reviewId: string, index: number) => {
    const feedKey = createReviewDetailFeedKey("search");
    setReviewDetailFeedContext({
      key: feedKey,
      source: "search",
      selectedReviewId: reviewId,
      initialIndex: index,
      reviews: displayedData,
      search: {
        filters: reviewFilters,
        refreshSeed
      }
    });
    router.push({ pathname: "/review/[reviewId]", params: { reviewId, feedKey } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.semantic.color.background }}>
      <FlashList
        ref={listRef}
        data={showGridSkeleton ? [] : displayedData}
        numColumns={3}
        extraData={videoPreview.activePreviewReviewId}
        keyExtractor={(item) => item.id}
        drawDistance={1800}
        getItemType={() => "search-review-tile"}
        maxItemsInRecyclePool={30}
        viewabilityConfig={videoPreview.viewabilityConfig}
        onViewableItemsChanged={videoPreview.onViewableItemsChanged}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <SearchField
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                  }}
                  onClear={() => setQuery("")}
                  placeholder="검색"
                  returnKeyType="search"
                  loading={searchInFlight}
                />
              </View>
              <Button
                size="icon"
                variant={activeFilterCount ? "primary" : "secondary"}
                accessibilityLabel="검색 필터 열기"
                icon={
                  <SlidersHorizontal
                    size={19}
                    color={activeFilterCount ? "white" : theme.semantic.color.primary}
                  />
                }
                onPress={() => {
                  openFilters();
                }}
              />
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <ReviewTile
            review={item}
            columns={3}
            videoPreviewActive={videoPreview.activePreviewReviewId === item.id}
            onPress={() => openReviewDetail(item.id, index)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshing={pullRefreshing}
        onRefresh={() => {
          pullRefreshSawFetchRef.current = false;
          setPullRefreshing(true);
          setSearchInputLoading(false);
          videoPreview.pausePreview();
          setRefreshSeed(createFeedRefreshSeed());
          void Haptics.selectionAsync();
        }}
        onScrollBeginDrag={videoPreview.pausePreview}
        onMomentumScrollBegin={videoPreview.pausePreview}
        onScrollEndDrag={videoPreview.resumePreview}
        onMomentumScrollEnd={videoPreview.resumePreview}
        onEndReached={() => {
          if (searchQuery.hasNextPage && !searchQuery.isFetchingNextPage) {
            void searchQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={1.25}
        scrollIndicatorInsets={{ bottom: 108 }}
        ListEmptyComponent={
          showGridSkeleton || (isFetching && !displayedData.length) ? (
            <SearchGridSkeleton count={12} />
          ) : isError ? (
            <SearchStatePanel
              title="검색 결과를 불러오지 못했어요"
              body="잠시 후 다시 시도해주세요."
              actionLabel="다시 시도"
              onAction={() => {
                void refetch();
              }}
            />
          ) : hasActiveSearch ? (
            <SearchStatePanel
              title="검색 결과가 없어요"
              body={
                query.trim()
                  ? `"${query.trim()}"에 맞는 리뷰가 아직 없어요.`
                  : "선택한 조건에 맞는 리뷰가 아직 없어요."
              }
              actionLabel={activeFilterCount ? "필터 초기화" : undefined}
              onAction={activeFilterCount ? resetFilters : undefined}
            />
          ) : (
            <SearchStatePanel
              title="추천 리뷰를 준비 중이에요"
              body="잠시 후 다시 탐색해보세요."
              actionLabel="필터 초기화"
              onAction={resetFilters}
            />
          )
        }
        ListFooterComponent={
          displayedData.length ? (
            <View style={styles.footerSpacer}>
              {searchQuery.isFetchingNextPage ? (
                <ActivityIndicator color={theme.semantic.color.primary} />
              ) : null}
            </View>
          ) : null
        }
      />

      <KeyboardAwareBottomSheet
        visible={filtersOpen}
        animationType="fade"
        accessibilityLabel="검색 필터 닫기"
        onClose={closeFilters}
        contentStyle={[
          styles.sheet,
          { backgroundColor: theme.semantic.color.surface },
          theme.semantic.shadow.overlay
        ]}
      >
        <View style={styles.sheetHeader}>
          <View>
            <ShoplyText variant="titleMd">검색 필터</ShoplyText>
            <ShoplyText variant="caption" color="textMuted">
              필터를 선택하세요.
            </ShoplyText>
          </View>
          <Button
            size="icon"
            variant="tertiary"
            accessibilityLabel="검색 필터 닫기"
            icon={<X size={18} color={theme.semantic.color.text} />}
            onPress={closeFilters}
          />
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetBody}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
        >
          <FilterSection title="카테고리">
            <Chip
              label="전체"
              selected={!draftParentCategoryId && !draftCategoryId}
              onPress={() => {
                selectDraftParentCategory(null);
              }}
            />
            {categoryOptions.map((item) => (
              <Chip
                key={item.id}
                label={item.name}
                selected={draftParentCategoryId === item.id || draftCategoryId === item.id}
                onPress={() => {
                  selectDraftParentCategory(item.id, Boolean(item.children?.length));
                }}
              />
            ))}
          </FilterSection>

          {draftChildCategoryOptions.length ? (
            <FilterSection title="중분류">
              {draftChildCategoryOptions.map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  selected={draftCategoryId === item.id}
                  onPress={() => {
                    selectDraftCategory(item.id, item.parentId);
                  }}
                />
              ))}
            </FilterSection>
          ) : null}

          {draftRequestCategoryId ? (
            <FilterSection title="상세 조건" layout="stack">
              {draftCategoryFilterQuery.isFetching && !draftCategoryFilters.length ? (
                <ShoplyText variant="caption" color="textMuted">
                  필터 불러오는 중
                </ShoplyText>
              ) : (
                <>
                  <Chip
                    label="맞춤 설정 적용"
                    selected={draftPreferenceFiltersEnabled}
                    disabled={
                      !draftHasPreferenceValues ||
                      draftPreferenceQuery.isFetching ||
                      draftCategoryFiltersUpdating
                    }
                    style={styles.preferenceChip}
                    onPress={() => {
                      if (draftPreferenceFiltersEnabled) {
                        setDraftPreferenceFiltersEnabled(false);
                        setDraftFilterValues({});
                      } else {
                        setDraftPreferenceFiltersEnabled(true);
                        setDraftFilterValues(cloneFilterValues(draftPreferenceValues));
                      }
                    }}
                  />
                  <CatalogFilterInput
                    filters={draftCategoryFilters}
                    values={draftFilterValues}
                    onChange={(nextValues) => {
                      setDraftPreferenceFiltersEnabled(false);
                      setDraftFilterValues(nextValues);
                    }}
                    compact
                  />
                </>
              )}
            </FilterSection>
          ) : null}

          <FilterSection title="구매 가격">
            {priceRanges.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={draftPriceRangeId === item.id}
                onPress={() => {
                  setDraftPriceRangeId(item.id);
                  setDraftPriceMinText("");
                  setDraftPriceMaxText("");
                }}
              />
            ))}
            <View style={styles.priceInputRow}>
              <PriceInput
                value={draftPriceMinText}
                onChangeText={updateDraftPriceMinText}
                placeholder="최소"
              />
              <PriceInput
                value={draftPriceMaxText}
                onChangeText={updateDraftPriceMaxText}
                placeholder="최대"
              />
            </View>
          </FilterSection>
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
      </KeyboardAwareBottomSheet>
    </View>
  );
}

function createFeedRefreshSeed() {
  return `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneFilterValues(values: CatalogFilterValueMap): CatalogFilterValueMap {
  return Object.fromEntries(Object.entries(values).map(([key, selected]) => [key, [...selected]]));
}

function SearchStatePanel({
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
    <Animated.View entering={FadeIn.duration(180)} style={styles.empty}>
      <ShoplyText variant="labelLg" align="center">
        {title}
      </ShoplyText>
      <ShoplyText variant="caption" color="textMuted" align="center">
        {body}
      </ShoplyText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
    </Animated.View>
  );
}

function SearchGridSkeleton({ count }: { count: number }) {
  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.skeletonTile}>
          <View style={styles.skeletonMedia}>
            <Skeleton height="100%" radius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

function FilterSection({
  title,
  children,
  layout = "wrap"
}: {
  title: string;
  children: ReactNode;
  layout?: "wrap" | "stack";
}) {
  return (
    <View style={styles.filterSection}>
      <View style={styles.filterTitle}>
        <ShoplyText variant="labelLg">{title}</ShoplyText>
      </View>
      <View style={layout === "stack" ? styles.sectionStack : styles.categoryGrid}>{children}</View>
    </View>
  );
}

function PriceInput({
  value,
  onChangeText,
  placeholder
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const theme = useShoplyTheme();
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/[^\d]/g, "").slice(0, 9))}
      placeholder={placeholder}
      keyboardType="number-pad"
      inputMode="numeric"
      returnKeyType="done"
      maxLength={9}
      autoCorrect={false}
      placeholderTextColor={theme.component.input.placeholder}
      style={[
        styles.priceInput,
        {
          backgroundColor: theme.component.input.background,
          borderColor: theme.component.input.border,
          color: theme.component.input.text
        }
      ]}
    />
  );
}

function parsePrice(value: string) {
  const parsed = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function routeQuery(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 8
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  sectionStack: {
    gap: 12,
    width: "100%"
  },
  listContent: {
    paddingBottom: 112,
    paddingHorizontal: 2
  },
  empty: {
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    minHeight: 420,
    padding: 32
  },
  footerSpacer: {
    minHeight: 40,
    paddingVertical: 12
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 18,
    maxHeight: "84%",
    padding: 18,
    paddingBottom: 32,
    width: "100%"
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  filterSection: {
    gap: 10
  },
  sheetScroll: {
    marginHorizontal: -2
  },
  sheetBody: {
    gap: 18,
    paddingHorizontal: 2,
    paddingBottom: 4
  },
  filterTitle: {
    alignItems: "center",
    flexDirection: "row"
  },
  serverLine: {
    width: "100%"
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10
  },
  preferenceChip: {
    alignSelf: "flex-start"
  },
  priceInputRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%"
  },
  priceInput: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 2,
    paddingTop: 2
  },
  skeletonTile: {
    flexBasis: "31%",
    flexGrow: 1,
    margin: 1.5
  },
  skeletonMedia: {
    aspectRatio: 3 / 4,
    overflow: "hidden"
  }
});
