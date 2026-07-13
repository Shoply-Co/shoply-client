import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft, SlidersHorizontal } from "lucide-react-native";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, ShoplyText, Skeleton, useShoplyTheme } from "@shoply/design-system";
import { useSession } from "@/app/providers/session-provider";
import { useCategoryFilters, useReviewCategoryTree, type CategoryOption } from "@/entities/catalog";
import {
  categoryFilterPreferencesQueryKey,
  saveCategoryFilterPreferences,
  useCategoryFilterPreferences
} from "@/entities/user";
import {
  CatalogFilterInput,
  catalogFilterRowsToValueMap,
  catalogFilterValuesToPayload,
  type CatalogFilterValueMap
} from "@/features/catalog-filter-input";
import { goBackOrReplace } from "@/shared/lib/navigation";

export function AccountFiltersPage() {
  const { user } = useSession();

  return (
    <AccountFiltersFrame>
      {!user ? (
        <StatePanel
          title="로그인이 필요해요"
          body="로그인 후 맞춤 필터를 설정할 수 있습니다."
          actionLabel="로그인"
          onAction={() => router.push("/login")}
        />
      ) : (
        <AccountFiltersForm />
      )}
    </AccountFiltersFrame>
  );
}

function AccountFiltersForm() {
  const theme = useShoplyTheme();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const categoryTreeQuery = useReviewCategoryTree();
  const categories = categoryTreeQuery.data ?? [];
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<CatalogFilterValueMap>({});
  const [saving, setSaving] = useState(false);
  const selectedParent =
    categories.find((category) => category.id === selectedParentId) ?? categories[0] ?? null;
  const subcategoryOptions = useMemo(() => childCategoryOptions(selectedParent), [selectedParent]);
  const selectedCategory =
    subcategoryOptions.find((category) => category.id === selectedSubcategoryId) ??
    subcategoryOptions[0] ??
    null;
  const selectedCategoryId = selectedCategory?.id ?? null;
  const categoryFilterQuery = useCategoryFilters(selectedCategoryId, "both");
  const categoryFilters = categoryFilterQuery.data?.filters ?? [];
  const categoryFiltersUpdating = categoryFilterQuery.isPlaceholderData;
  const preferenceQuery = useCategoryFilterPreferences(
    selectedCategoryId,
    Boolean(user && selectedCategoryId)
  );
  const preferencesUpdating = preferenceQuery.isFetching;
  const formUpdating = categoryFiltersUpdating || preferencesUpdating;

  useEffect(() => {
    if (!selectedParentId && categories[0]) {
      setSelectedParentId(categories[0].id);
    }
  }, [categories, selectedParentId]);

  useEffect(() => {
    if (!selectedParent) return;
    const nextOptions = childCategoryOptions(selectedParent);
    if (!nextOptions.some((category) => category.id === selectedSubcategoryId)) {
      setSelectedSubcategoryId(nextOptions[0]?.id ?? null);
    }
  }, [selectedParent, selectedSubcategoryId]);

  useEffect(() => {
    if (preferenceQuery.data?.categoryId !== selectedCategoryId) return;
    setFilterValues(catalogFilterRowsToValueMap(preferenceQuery.data.filterValues));
  }, [preferenceQuery.data?.categoryId, preferenceQuery.data?.filterValues, selectedCategoryId]);

  const selectParent = (category: CategoryOption) => {
    setSelectedParentId(category.id);
    setSelectedSubcategoryId(childCategoryOptions(category)[0]?.id ?? category.id);
    void Haptics.selectionAsync();
  };

  const selectSubcategory = (category: CategoryOption) => {
    setSelectedSubcategoryId(category.id);
    void Haptics.selectionAsync();
  };

  const savePreferences = async (enabled = true) => {
    if (!selectedCategoryId) return;
    setSaving(true);
    try {
      await saveCategoryFilterPreferences({
        categoryId: selectedCategoryId,
        filterValues: enabled ? catalogFilterValuesToPayload(filterValues, categoryFilters) : [],
        enabled
      });
      await queryClient.invalidateQueries({
        queryKey: categoryFilterPreferencesQueryKey(selectedCategoryId)
      });
      if (!enabled) setFilterValues({});
      Alert.alert(
        enabled ? "필터 저장 완료" : "필터 해제 완료",
        enabled ? "맞춤 필터가 저장됐어요." : "맞춤 필터가 해제됐어요."
      );
    } catch (error) {
      Alert.alert(
        "필터 저장 실패",
        error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."
      );
    } finally {
      setSaving(false);
    }
  };

  if (categoryTreeQuery.isLoading && !categories.length) {
    return <LoadingPanel />;
  }

  if (categoryTreeQuery.isError && !categories.length) {
    return (
      <StatePanel
        title="카테고리를 불러오지 못했어요"
        body="잠시 후 다시 시도해주세요."
        actionLabel="다시 시도"
        onAction={() => void categoryTreeQuery.refetch()}
      />
    );
  }

  return (
    <View style={styles.form}>
      <View style={[styles.notice, { backgroundColor: theme.semantic.color.surfaceMuted }]}>
        <SlidersHorizontal size={18} color={theme.semantic.color.primary} />
        <ShoplyText variant="caption" color="textMuted" style={{ flex: 1 }}>
          공통 필터는 모든 중분류에서 함께 쓰고, 상세 필터만 선택한 중분류에 맞게 바뀝니다.
        </ShoplyText>
      </View>

      <View style={styles.section}>
        <ShoplyText variant="labelMd">대분류</ShoplyText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={selectedParent?.id === category.id}
              onPress={() => selectParent(category)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <ShoplyText variant="labelMd">중분류</ShoplyText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {subcategoryOptions.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={selectedCategory?.id === category.id}
              onPress={() => selectSubcategory(category)}
            />
          ))}
        </ScrollView>
      </View>

      {selectedCategory ? (
        <View style={styles.section}>
          <View style={styles.filterHeader}>
            <View style={{ flex: 1 }}>
              <ShoplyText variant="titleMd">{selectedCategory.name}</ShoplyText>
              <ShoplyText variant="caption" color="textMuted">
                공통 필터와 이 중분류의 상세 필터를 저장합니다.
              </ShoplyText>
            </View>
          </View>
          {categoryFilterQuery.isFetching && !categoryFilters.length ? (
            <FilterFormSkeleton />
          ) : (
            <>
              <CatalogFilterInput
                filters={categoryFilters}
                values={filterValues}
                onChange={setFilterValues}
                compact
              />
            </>
          )}
          <View style={styles.loadingStatus}>
            {preferencesUpdating ? (
              <ShoplyText variant="caption" color="textMuted">
                저장된 필터를 확인하는 중
              </ShoplyText>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Button
              label="필터 해제"
              variant="tertiary"
              disabled={saving || formUpdating}
              onPress={() => savePreferences(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="필터 저장"
              loading={saving}
              disabled={formUpdating}
              onPress={() => savePreferences(true)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function childCategoryOptions(category: CategoryOption | null): CategoryOption[] {
  if (!category) return [];
  return category.children?.length ? category.children : [category];
}

function AccountFiltersFrame({ children }: { children: ReactNode }) {
  const theme = useShoplyTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TextBackButton />
          <View style={{ flex: 1 }}>
            <ShoplyText variant="titleLg">맞춤 필터 설정</ShoplyText>
          </View>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
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

function LoadingPanel() {
  return <AccountFiltersSkeleton />;
}

function AccountFiltersSkeleton() {
  return (
    <View style={styles.form} accessibilityLabel="맞춤 필터 불러오는 중">
      <Skeleton height={58} radius={8} />
      {[0, 1].map((item) => (
        <View key={item} style={styles.section}>
          <Skeleton width={58} height={15} radius={6} />
          <View style={styles.skeletonChipRow}>
            {[0, 1, 2, 3].map((chip) => (
              <Skeleton key={chip} width={chip % 2 ? 72 : 60} height={36} radius={18} />
            ))}
          </View>
        </View>
      ))}
      <FilterFormSkeleton />
    </View>
  );
}

function FilterFormSkeleton() {
  return (
    <View style={styles.filterFormSkeleton}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.section}>
          <Skeleton width={item % 2 ? "36%" : "48%"} height={16} radius={6} />
          <Skeleton height={46} radius={10} />
        </View>
      ))}
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

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10
  },
  content: {
    flexGrow: 1,
    gap: 20,
    padding: 16,
    paddingBottom: 40
  },
  filterHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  filterFormSkeleton: {
    gap: 18
  },
  form: {
    gap: 22
  },
  loadingStatus: {
    minHeight: 18
  },
  iconBackButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44
  },
  notice: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 10,
    padding: 12
  },
  section: {
    gap: 10
  },
  skeletonChipRow: {
    flexDirection: "row",
    gap: 8
  },
  statePanel: {
    alignItems: "center",
    borderRadius: 8,
    gap: 10,
    padding: 18
  },
  tabRow: {
    gap: 8,
    paddingRight: 16
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  }
});
