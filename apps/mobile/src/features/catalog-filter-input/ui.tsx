import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Button, Chip, ShoplyText, useShoplyTheme } from "@shoply/design-system";
import type {
  CatalogFilterDefinition,
  CatalogFilterOption,
  CatalogFilterScope
} from "@/entities/catalog";

export type CatalogFilterValueMap = Record<string, string[]>;

export interface CatalogFilterPayload {
  key: string;
  values: string[];
}

interface CatalogFilterInputProps {
  filters: CatalogFilterDefinition[];
  values: CatalogFilterValueMap;
  onChange: (values: CatalogFilterValueMap) => void;
  compact?: boolean;
}

const scopeLabels: Record<CatalogFilterScope, string> = {
  broad_common: "공용 필터",
  subcategory_custom: "상세 필터"
};

const compactGroupLimits: Record<CatalogFilterScope, number> = {
  broad_common: 3,
  subcategory_custom: 3
};

export function CatalogFilterInput({
  filters,
  values,
  onChange,
  compact = false
}: CatalogFilterInputProps) {
  const [expandedScopes, setExpandedScopes] = useState<
    Partial<Record<CatalogFilterScope, boolean>>
  >({});
  const filterSignature = useMemo(
    () => filters.map((filter) => `${filter.scope}:${filter.key}`).join("|"),
    [filters]
  );
  const groupedFilters = useMemo(
    () =>
      [
        {
          scope: "broad_common" as const,
          filters: filters.filter((item) => item.scope === "broad_common")
        },
        {
          scope: "subcategory_custom" as const,
          filters: filters.filter((item) => item.scope === "subcategory_custom")
        }
      ].filter((group) => group.filters.length > 0),
    [filters]
  );

  useEffect(() => {
    setExpandedScopes({});
  }, [filterSignature]);

  if (!groupedFilters.length) return null;

  return (
    <View style={[styles.root, compact ? styles.compactRoot : null]}>
      {groupedFilters.map((group) => {
        const expanded = Boolean(expandedScopes[group.scope]);
        const limit = compactGroupLimits[group.scope];
        const visibleFilters =
          compact && !expanded
            ? compactVisibleFilters(group.filters, values, limit)
            : group.filters;
        const hiddenCount = group.filters.length - visibleFilters.length;
        const selectedCount = group.filters.filter(
          (filter) => (values[filter.key] ?? []).length > 0
        ).length;

        return (
          <View key={group.scope} style={styles.group}>
            <View style={styles.groupHeader}>
              <ShoplyText variant="labelLg">{scopeLabels[group.scope]}</ShoplyText>
              {selectedCount ? (
                <ShoplyText variant="caption" color="textMuted">
                  {selectedCount}개 선택
                </ShoplyText>
              ) : null}
            </View>
            {visibleFilters.map((filter) => (
              <FilterControl
                key={filter.key}
                filter={filter}
                selectedValues={values[filter.key] ?? []}
                onChange={(nextValues) => {
                  onChange(updateValueMap(values, filter.key, nextValues));
                }}
                compact={compact}
              />
            ))}
            {compact && hiddenCount > 0 ? (
              <Button
                label={`${hiddenCount}개 더 보기`}
                variant="secondary"
                size="sm"
                accessibilityLabel={`${scopeLabels[group.scope]} 더 보기`}
                onPress={() => {
                  setExpandedScopes((current) => ({ ...current, [group.scope]: true }));
                  void Haptics.selectionAsync();
                }}
                style={styles.groupToggle}
              />
            ) : null}
            {compact && expanded && group.filters.length > limit ? (
              <Button
                label="접기"
                variant="tertiary"
                size="sm"
                accessibilityLabel={`${scopeLabels[group.scope]} 접기`}
                onPress={() => {
                  setExpandedScopes((current) => ({ ...current, [group.scope]: false }));
                  void Haptics.selectionAsync();
                }}
                style={styles.groupToggle}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function catalogFilterValuesToPayload(
  values: CatalogFilterValueMap,
  filters?: CatalogFilterDefinition[]
): CatalogFilterPayload[] {
  const allowedKeys = filters ? new Set(filters.map((filter) => filter.key)) : null;
  return Object.entries(values)
    .filter(([key, selected]) => (!allowedKeys || allowedKeys.has(key)) && selected.length > 0)
    .map(([key, selected]) => ({ key, values: selected }));
}

export function catalogFilterRowsToValueMap(rows: unknown[] | null | undefined) {
  const next: CatalogFilterValueMap = {};
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const key = typeof record.filterKey === "string" ? record.filterKey : null;
    if (!key) continue;
    const payloadValues = valuesFromPayload(record.valuePayload);
    const normalizedValues = Array.isArray(record.normalizedValues)
      ? record.normalizedValues.filter(
          (value): value is string => typeof value === "string" && !value.includes(":")
        )
      : [];
    const values = payloadValues.length ? payloadValues : normalizedValues;
    if (values.length > 0) next[key] = values;
  }
  return next;
}

function valuesFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("values" in payload)) return [];
  const values = (payload as { values?: unknown }).values;
  if (!Array.isArray(values)) return [];
  return values.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}

function FilterControl({
  filter,
  selectedValues,
  onChange,
  compact
}: {
  filter: CatalogFilterDefinition;
  selectedValues: string[];
  onChange: (values: string[]) => void;
  compact: boolean;
}) {
  const theme = useShoplyTheme();
  const options = filter.options ?? [];
  const [query, setQuery] = useState("");
  const [numberText, setNumberText] = useState("");
  const numericUnit = useMemo(() => numericBandUnit(filter), [filter.key]);
  const selectedBand = selectedValues[0];
  const visibleOptions = useMemo(
    () =>
      visibleFilterOptions(
        options,
        selectedValues,
        query,
        filter.inputType === "searchable_select",
        compact
      ),
    [compact, filter.inputType, options, query, selectedValues]
  );

  useEffect(() => {
    if (!numericUnit) return;
    if (!selectedBand) {
      setNumberText("");
      return;
    }
    setNumberText((current) => {
      if (current && bandValueFromNumber(filter, current) === selectedBand) return current;
      return numberTextFromBand(selectedBand);
    });
  }, [filter, numericUnit, selectedBand]);

  const maxSelections = filter.maxSelections ?? (filter.valueType === "string" ? 1 : 6);
  const multiple = filter.valueType === "string_array";

  const selectOption = (option: CatalogFilterOption) => {
    const nextValues = multiple
      ? toggleMultiValue(selectedValues, option.value, maxSelections)
      : selectedValues[0] === option.value
        ? []
        : [option.value];
    onChange(nextValues);
    void Haptics.selectionAsync();
  };

  return (
    <View style={[styles.control, compact ? styles.compactControl : null]}>
      <View style={styles.controlHeader}>
        <ShoplyText variant="labelMd">{filter.label}</ShoplyText>
        {multiple && maxSelections > 1 ? (
          <ShoplyText variant="caption" color="textMuted">
            {selectedValues.length}/{maxSelections}
          </ShoplyText>
        ) : null}
      </View>

      {numericUnit ? (
        <View style={styles.numberRow}>
          <TextInput
            value={numberText}
            onChangeText={(text) => {
              const sanitized = text.replace(/[^\d]/g, "").slice(0, numericUnit.maxLength);
              setNumberText(sanitized);
              const band = bandValueFromNumber(filter, sanitized);
              onChange(band ? [band] : []);
            }}
            placeholder={numericUnit.placeholder}
            placeholderTextColor={theme.semantic.color.textMuted}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="done"
            maxLength={numericUnit.maxLength}
            autoCorrect={false}
            accessibilityLabel={`${filter.label} 숫자 입력`}
            style={[
              styles.numberInput,
              {
                backgroundColor: theme.component.input.background,
                borderColor: theme.component.input.border,
                color: theme.semantic.color.text
              }
            ]}
          />
          <View
            style={[
              styles.unitPill,
              {
                backgroundColor: theme.semantic.color.surfaceMuted,
                borderColor: theme.semantic.color.border
              }
            ]}
          >
            <ShoplyText variant="labelMd">{numericUnit.unit}</ShoplyText>
          </View>
        </View>
      ) : null}

      {filter.inputType === "searchable_select" ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={filter.placeholder ?? "검색"}
          placeholderTextColor={theme.semantic.color.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          style={[
            styles.searchInput,
            {
              backgroundColor: theme.component.input.background,
              borderColor: theme.component.input.border,
              color: theme.semantic.color.text
            }
          ]}
        />
      ) : null}

      {numericUnit ? (
        selectedValues.length ? (
          <View style={styles.chipWrap}>
            <Chip
              label={optionLabel(options, selectedValues[0])}
              selected
              onPress={() => {
                setNumberText("");
                onChange([]);
              }}
            />
          </View>
        ) : null
      ) : (
        <View style={styles.chipWrap}>
          {visibleOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={selectedValues.includes(option.value)}
              disabled={
                multiple &&
                !selectedValues.includes(option.value) &&
                selectedValues.length >= maxSelections
              }
              onPress={() => selectOption(option)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function updateValueMap(values: CatalogFilterValueMap, key: string, selected: string[]) {
  const next = { ...values };
  if (selected.length > 0) {
    next[key] = selected;
  } else {
    delete next[key];
  }
  return next;
}

function compactVisibleFilters(
  filters: CatalogFilterDefinition[],
  values: CatalogFilterValueMap,
  limit: number
) {
  const visibleKeys = new Set(
    filters
      .filter((filter, index) => index < limit || (values[filter.key] ?? []).length > 0)
      .map((filter) => filter.key)
  );
  return filters.filter((filter) => visibleKeys.has(filter.key));
}

function toggleMultiValue(values: string[], value: string, maxSelections: number) {
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (values.length >= maxSelections) return values;
  return [...values, value];
}

function visibleFilterOptions(
  options: CatalogFilterOption[],
  selectedValues: string[],
  query: string,
  searchable: boolean,
  compact: boolean
) {
  const normalizedQuery = normalize(query);
  const optionLimit = compact ? 8 : 12;
  const matched =
    searchable && normalizedQuery
      ? options.filter((option) =>
          [option.label, option.value, ...(option.aliases ?? [])].some((value) =>
            normalize(value).includes(normalizedQuery)
          )
        )
      : options.slice(0, searchable ? optionLimit : options.length);
  const visibleValues = new Set([...matched.map((option) => option.value), ...selectedValues]);
  return options.filter((option) => visibleValues.has(option.value));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function numericBandUnit(filter: CatalogFilterDefinition) {
  if (filter.key === "height_band") return { unit: "cm", placeholder: "예: 165", maxLength: 3 };
  if (filter.key === "weight_band") return { unit: "kg", placeholder: "예: 55", maxLength: 3 };
  return null;
}

function bandValueFromNumber(filter: CatalogFilterDefinition, text: string) {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  const band = `${Math.floor(value / 10) * 10}s`;
  return filter.options?.some((option) => option.value === band) ? band : null;
}

function optionLabel(options: CatalogFilterOption[], value?: string) {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label ?? value;
}

function numberTextFromBand(value: string) {
  return value.match(/^\d+/)?.[0] ?? "";
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
    width: "100%"
  },
  compactRoot: {
    gap: 14
  },
  group: {
    gap: 12
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  groupToggle: {
    alignSelf: "flex-start"
  },
  control: {
    gap: 10
  },
  compactControl: {
    gap: 8
  },
  controlHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  numberRow: {
    flexDirection: "row",
    gap: 8
  },
  numberInput: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  unitPill: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 54,
    paddingHorizontal: 12
  },
  searchInput: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 12
  }
});
