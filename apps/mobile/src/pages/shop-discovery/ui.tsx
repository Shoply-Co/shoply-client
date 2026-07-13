import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Layers3, Search, ShoppingBag, Sparkles, Tags } from "lucide-react-native";
import { ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Chip, SearchField, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import { useReviewCategories } from "@/entities/catalog";
import { apiRequest } from "@/shared/api/client";
import type {
  BlendedSearchEnvelope,
  Brand,
  Category,
  ReviewSummary,
  SearchResultItem
} from "@/shared/api/generated/shoply";
import { formatWon } from "@/shared/lib/money";
import { ShoplyBagMark } from "@/shared/ui/brand";

type Mode = "shopi" | "shoply";

export function ShopDiscoveryPage({ mode }: { mode: Mode }) {
  const theme = useShoplyTheme();
  const [query, setQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [draftSelectedCategoryId, setDraftSelectedCategoryId] = useState<string | null>(null);
  const categoryQuery = useReviewCategories();
  const searchQuery = useQuery({
    queryKey: ["shop-discovery", mode, query, selectedCategoryId],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query, limit: "40" });
      const result = await apiRequest<BlendedSearchEnvelope>(
        `/search/blended?${params.toString()}`,
        { auth: false }
      );
      return result.data ?? [];
    },
    retry: 1
  });

  const items = useMemo(() => {
    const source = searchQuery.data ?? [];
    return source.filter((item) => {
      const itemData = item.data as unknown as Record<string, unknown>;
      if (
        selectedCategoryId &&
        String(itemData.categoryId ?? "") !== selectedCategoryId &&
        item.itemId !== selectedCategoryId
      ) {
        return false;
      }
      if (mode === "shopi") return ["product", "brand", "category"].includes(item.itemType);
      return item.itemType === "review";
    });
  }, [mode, searchQuery.data, selectedCategoryId]);
  const categoryFilterDirty = draftSelectedCategoryId !== selectedCategoryId;

  const title = mode === "shopi" ? "쇼피" : "쇼플리";
  const subtitle =
    mode === "shopi"
      ? "상품, 브랜드, 카테고리를 탐색합니다."
      : "리뷰 콘텐츠와 구매 링크를 탐색합니다.";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.semantic.color.background }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View
            style={[
              styles.mark,
              { backgroundColor: mode === "shoply" ? "transparent" : theme.semantic.color.primary }
            ]}
          >
            {mode === "shopi" ? (
              <ShoppingBag size={28} color="white" />
            ) : (
              <ShoplyBagMark size={58} container />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <ShoplyText variant="titleLg">{title}</ShoplyText>
            <ShoplyText variant="bodyMd" color="textMuted" numberOfLines={2}>
              {subtitle}
            </ShoplyText>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              onClear={() => setQuery("")}
              placeholder={mode === "shopi" ? "상품, 브랜드 검색" : "리뷰 콘텐츠 검색"}
              returnKeyType="search"
            />
          </View>
          <Button
            size="icon"
            variant="secondary"
            accessibilityLabel="검색 실행"
            icon={<Search size={18} color={theme.semantic.color.primary} />}
            onPress={() => searchQuery.refetch()}
          />
        </View>

        <View style={styles.categoryFilterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip
              label="전체"
              selected={!draftSelectedCategoryId}
              onPress={() => setDraftSelectedCategoryId(null)}
            />
            {(categoryQuery.data ?? []).map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={draftSelectedCategoryId === category.id}
                onPress={() => setDraftSelectedCategoryId(category.id)}
              />
            ))}
          </ScrollView>
          <Button
            label="적용"
            size="sm"
            variant={categoryFilterDirty ? "primary" : "tertiary"}
            disabled={!categoryFilterDirty}
            onPress={() => setSelectedCategoryId(draftSelectedCategoryId)}
          />
        </View>

        <View style={styles.sectionHeader}>
          <ShoplyText variant="titleMd">탐색 결과</ShoplyText>
          <ShoplyText variant="caption" color="textMuted">
            {searchQuery.isError ? "불러오지 못했어요" : `${items.length}개`}
          </ShoplyText>
        </View>

        <View style={styles.grid}>
          {items.map((item) => (
            <DiscoveryCard key={`${item.itemType}-${item.itemId}`} item={item} />
          ))}
        </View>

        {!items.length && !searchQuery.isFetching ? (
          searchQuery.isError ? (
            <StatePanel
              title="탐색 결과를 불러오지 못했어요"
              body="잠시 후 다시 시도해주세요."
              actionLabel="다시 시도"
              onAction={() => {
                void searchQuery.refetch();
              }}
            />
          ) : (
            <StatePanel
              title="결과가 없어요"
              body="검색어를 바꾸거나 카테고리를 다시 선택해주세요."
            />
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
    <View style={[styles.emptyPanel, { borderColor: theme.semantic.color.border }]}>
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

function DiscoveryCard({ item }: { item: SearchResultItem }) {
  const theme = useShoplyTheme();
  const meta = itemMeta(item);
  const canOpenReview = item.itemType === "review";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={meta.title}
      onPress={() => {
        if (canOpenReview) {
          router.push({ pathname: "/review/[reviewId]", params: { reviewId: item.itemId } });
        } else {
          router.push({ pathname: "/(tabs)/search", params: { q: meta.title } });
        }
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed
            ? theme.semantic.color.surfaceMuted
            : theme.semantic.color.surface,
          borderColor: theme.semantic.color.border
        }
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: theme.semantic.color.primarySoft }]}>
        {meta.icon}
      </View>
      <View style={{ flex: 1 }}>
        <ShoplyText variant="labelLg" numberOfLines={2}>
          {meta.title}
        </ShoplyText>
        <ShoplyText variant="caption" color="textMuted" numberOfLines={2}>
          {meta.description}
        </ShoplyText>
      </View>
    </Pressable>
  );
}

function itemMeta(item: SearchResultItem): { title: string; description: string; icon: ReactNode } {
  if (item.itemType === "review") {
    const review = item.data as unknown as ReviewSummary;
    return {
      title: review.title ?? review.product?.name ?? "리뷰",
      description: `${review.author?.nickname ?? "작성자"} · ${formatWon(Number(review.purchasePrice ?? 0))}`,
      icon: <Sparkles size={18} color="#4f46e5" />
    };
  }
  if (item.itemType === "brand") {
    const brand = item.data as unknown as Brand;
    return {
      title: brand.name,
      description: `브랜드 · ${brand.status}`,
      icon: <ShoppingBag size={18} color="#4f46e5" />
    };
  }
  if (item.itemType === "category") {
    const category = item.data as unknown as Category;
    return {
      title: category.name,
      description: `카테고리 · ${category.slug}`,
      icon: <Tags size={18} color="#4f46e5" />
    };
  }
  const data = item.data as unknown as Record<string, unknown>;
  return {
    title: String(data.name ?? data.title ?? "상품"),
    description: `상품 · ${String(data.status ?? "searchable")}`,
    icon: <Layers3 size={18} color="#4f46e5" />
  };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 88,
    padding: 12,
    width: "100%"
  },
  cardIcon: {
    alignItems: "center",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  chips: {
    gap: 8,
    paddingRight: 16
  },
  categoryFilterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 122
  },
  emptyPanel: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18
  },
  grid: {
    gap: 10
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 13
  },
  mark: {
    alignItems: "center",
    borderRadius: 8,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  searchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  }
});
