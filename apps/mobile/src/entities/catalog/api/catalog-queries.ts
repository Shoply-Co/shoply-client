import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/client";
import type {
  Brand,
  BrandIdentityCandidate,
  Category,
  MerchantIdentityCandidate,
  MerchantSite
} from "@/shared/api/generated/shoply";

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  depth?: number;
  children?: CategoryOption[];
}

export type CatalogFilterSurface = "review_create" | "search" | "both";
export type CatalogFilterScope = "broad_common" | "subcategory_custom";
export type CatalogFilterInputType = "single_select" | "multi_select" | "range_band" | "searchable_select" | "boolean";
export type CatalogFilterValueType = "string" | "string_array" | "boolean";

export interface CatalogFilterOption {
  value: string;
  label: string;
  aliases?: string[];
  facetTags?: string[];
}

export interface CatalogFilterDefinition {
  key: string;
  label: string;
  description?: string;
  inputType: CatalogFilterInputType;
  valueType: CatalogFilterValueType;
  options?: CatalogFilterOption[];
  maxSelections?: number;
  placeholder?: string;
  searchable: boolean;
  embeddingWeight: number;
  privacyLevel: "public_context" | "sensitive_context";
  scope: CatalogFilterScope;
  surface: CatalogFilterSurface;
  sortOrder: number;
  required: boolean;
}

export interface CategoryFilterSchema {
  category: CategoryOption | null;
  parentCategory: CategoryOption | null;
  filters: CatalogFilterDefinition[];
}

function toCategoryOption(category: Category): CategoryOption {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    depth: category.depth
  };
}

export function useReviewCategories() {
  return useQuery({
    queryKey: ["catalog", "categories", "depth-1"],
    queryFn: async () => {
      const response = await apiRequest<Category[] | { data?: Category[] }>("/categories?depth=1", { auth: false });
      const categories = Array.isArray(response) ? response : response.data ?? [];
      return categories.map(toCategoryOption);
    },
    retry: 1,
    throwOnError: true
  });
}

export function useReviewCategoryTree() {
  return useQuery({
    queryKey: ["catalog", "categories", "tree"],
    queryFn: async () => {
      const response = await apiRequest<Category[] | { data?: Category[] }>("/categories", { auth: false });
      const categories = (Array.isArray(response) ? response : response.data ?? [])
        .filter((category) => category.status === "active")
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
      const childrenByParent = new Map<string, CategoryOption[]>();

      for (const category of categories.filter((item) => item.depth === 2 && item.parentId)) {
        const children = childrenByParent.get(category.parentId ?? "") ?? [];
        children.push(toCategoryOption(category));
        childrenByParent.set(category.parentId ?? "", children);
      }

      return categories
        .filter((category) => category.depth === 1)
        .map((category) => ({
          ...toCategoryOption(category),
          children: childrenByParent.get(category.id) ?? []
        }));
    },
    retry: 1
  });
}

export function useCatalogBrands() {
  return useQuery({
    queryKey: ["catalog", "brands", "review-create"],
    queryFn: async () => {
      const response = await apiRequest<Brand[] | { data?: Brand[] }>("/brands?limit=50", {
        auth: false
      });
      return Array.isArray(response) ? response : response.data ?? [];
    },
    retry: 1
  });
}

export function useCatalogMerchantSites() {
  return useQuery({
    queryKey: ["catalog", "merchant-sites", "review-create"],
    queryFn: async () => {
      const response = await apiRequest<MerchantSite[] | { data?: MerchantSite[] }>(
        "/merchant-sites?limit=50",
        { auth: false }
      );
      return Array.isArray(response) ? response : response.data ?? [];
    },
    retry: 1
  });
}

export function findBrandCandidates(name: string) {
  return apiRequest<BrandIdentityCandidate[]>("/brands/candidates", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function findMerchantCandidates(name: string) {
  return apiRequest<MerchantIdentityCandidate[]>("/merchant-sites/candidates", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}


export function useCategoryFilters(categoryId?: string | null, surface: CatalogFilterSurface = "both") {
  return useQuery({
    queryKey: ["catalog", "category-filters", categoryId ?? "none", surface],
    enabled: Boolean(categoryId),
    placeholderData: categoryId ? keepPreviousData : undefined,
    queryFn: async () => {
      if (!categoryId) {
        return { category: null, parentCategory: null, filters: [] } satisfies CategoryFilterSchema;
      }
      const params = new URLSearchParams({ categoryId, surface });
      const response = await apiRequest<CategoryFilterSchema | { data?: CategoryFilterSchema }>(
        `/categories/filters?${params.toString()}`,
        { auth: false }
      );
      const payload = "filters" in response ? response : response.data;
      return {
        category: payload?.category ?? null,
        parentCategory: payload?.parentCategory ?? null,
        filters: (payload?.filters ?? []).sort((left, right) => left.sortOrder - right.sortOrder)
      } satisfies CategoryFilterSchema;
    },
    retry: 1
  });
}
