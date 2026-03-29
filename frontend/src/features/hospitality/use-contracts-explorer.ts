import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type { ContractDocument, PricingRule } from "@/api/types";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyError } from "@/lib/notify";

export type RulesPresenceFilter = "all" | "with_rules" | "without_rules";
export type ContractSortOrder = "asc" | "desc";
export type ContractSortBy =
  | "file_name"
  | "hotel_code"
  | "operator_code"
  | "season_label"
  | "source"
  | "file_size"
  | "created_at"
  | "updated_at"
  | "room_count"
  | "board_count"
  | "discount_count"
  | "rule_count";

type ContractExplorerFilters = {
  searchText: string;
  hotelCode: string;
  operatorCode: string;
  seasonLabel: string;
  source: "all" | ContractDocument["source"];
  hasRules: RulesPresenceFilter;
};

type ContractFilterOptions = {
  hotels: string[];
  operators: string[];
  seasons: string[];
};

export type ContractExplorerRow = {
  contract: ContractDocument;
  roomCount: number;
  boardCount: number;
  discountCount: number;
  ruleCount: number;
};

const DEFAULT_FILTERS: ContractExplorerFilters = {
  searchText: "",
  hotelCode: "all",
  operatorCode: "all",
  seasonLabel: "all",
  source: "all",
  hasRules: "all",
};

const BACKEND_SORT_FIELDS: ReadonlySet<string> = new Set([
  "file_name",
  "hotel_code",
  "operator_code",
  "season_label",
  "source",
  "file_size",
  "created_at",
  "updated_at",
]);

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

export function useContractsExplorer() {
  const { selectedHotelId } = useHotelScope();
  const [filters, setFilters] = useState<ContractExplorerFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<ContractSortBy>("updated_at");
  const [sortOrder, setSortOrder] = useState<ContractSortOrder>("desc");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

  const [contracts, setContracts] = useState<ContractDocument[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [filterOptions, setFilterOptions] = useState<ContractFilterOptions>({
    hotels: [],
    operators: [],
    seasons: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasLoadedRef = useRef(false);
  const contractsAbortRef = useRef<AbortController | null>(null);
  const filterOptionsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchText(filters.searchText.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters.searchText]);

  const loadFilterOptions = useCallback(async () => {
    const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
    const controller = new AbortController();
    filterOptionsAbortRef.current?.abort();
    filterOptionsAbortRef.current = controller;
    try {
      const response = await api.get<ContractDocument[]>("/hospitality/contracts", {
        params: { hotel_id: scopedHotelId, limit: 1000, sort_by: "updated_at", sort_order: "desc" },
        signal: controller.signal,
      });
      const hotels = new Set<string>();
      const operators = new Set<string>();
      const seasons = new Set<string>();

      for (const item of response.data) {
        if (item.hotel_code) {
          hotels.add(item.hotel_code);
        }
        if (item.operator_code) {
          operators.add(item.operator_code);
        }
        if (item.season_label) {
          seasons.add(item.season_label);
        }
      }

      setFilterOptions({
        hotels: Array.from(hotels).sort(compareStrings),
        operators: Array.from(operators).sort(compareStrings),
        seasons: Array.from(seasons).sort(compareStrings),
      });
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load contract filter options.");
    } finally {
      if (filterOptionsAbortRef.current === controller) {
        filterOptionsAbortRef.current = null;
      }
    }
  }, [selectedHotelId]);

  const loadContracts = useCallback(async () => {
    const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
    const isFirstLoad = !hasLoadedRef.current;
    const controller = new AbortController();
    contractsAbortRef.current?.abort();
    contractsAbortRef.current = controller;
    if (isFirstLoad) {
      setLoading(true);
    } else {
      setBusy(true);
    }

    try {
      const serverSortBy = BACKEND_SORT_FIELDS.has(sortBy) ? sortBy : "updated_at";
      const [contractsResponse, rulesResponse] = await Promise.all([
        api.get<ContractDocument[]>("/hospitality/contracts", {
          params: {
            q: debouncedSearchText || undefined,
            hotel_id: scopedHotelId,
            hotel_code: filters.hotelCode !== "all" ? filters.hotelCode : undefined,
            operator_code: filters.operatorCode !== "all" ? filters.operatorCode : undefined,
            season_label: filters.seasonLabel !== "all" ? filters.seasonLabel : undefined,
            source: filters.source !== "all" ? filters.source : undefined,
            sort_by: serverSortBy,
            sort_order: sortOrder,
            limit: 1000,
          },
          signal: controller.signal,
        }),
        api.get<PricingRule[]>("/hospitality/rules", { signal: controller.signal }),
      ]);
      setContracts(contractsResponse.data);
      setRules(rulesResponse.data);
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load contracts.");
    } finally {
      if (contractsAbortRef.current === controller) {
        contractsAbortRef.current = null;
        setLoading(false);
        setBusy(false);
        hasLoadedRef.current = true;
      }
    }
  }, [
    debouncedSearchText,
    filters.hotelCode,
    filters.operatorCode,
    filters.seasonLabel,
    filters.source,
    selectedHotelId,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    loadContracts().catch(() => null);
  }, [loadContracts]);

  useEffect(() => {
    loadFilterOptions().catch(() => null);
  }, [loadFilterOptions]);

  useEffect(() => {
    return () => {
      contractsAbortRef.current?.abort();
      filterOptionsAbortRef.current?.abort();
    };
  }, []);

  const rulesByContract = useMemo(() => {
    const grouped = new Map<string, PricingRule[]>();
    for (const rule of rules) {
      const items = grouped.get(rule.contract_id) ?? [];
      items.push(rule);
      grouped.set(rule.contract_id, items);
    }
    return grouped;
  }, [rules]);

  const rows = useMemo(() => {
    const baseRows: ContractExplorerRow[] = contracts.map((contract) => ({
      contract,
      roomCount: contract.extraction.room_types.length,
      boardCount: contract.extraction.board_types.length,
      discountCount: contract.extraction.discounts.length,
      ruleCount: (rulesByContract.get(contract.id) ?? []).length,
    }));

    const ruleFiltered = baseRows.filter((row) => {
      if (filters.hasRules === "with_rules") {
        return row.ruleCount > 0;
      }
      if (filters.hasRules === "without_rules") {
        return row.ruleCount === 0;
      }
      return true;
    });

    const direction = sortOrder === "asc" ? 1 : -1;
    const sorted = [...ruleFiltered].sort((left, right) => {
      let comparison = 0;
      switch (sortBy) {
        case "file_name":
          comparison = compareStrings(left.contract.file_name, right.contract.file_name);
          break;
        case "hotel_code":
          comparison = compareStrings(left.contract.hotel_code, right.contract.hotel_code);
          break;
        case "operator_code":
          comparison = compareStrings(left.contract.operator_code, right.contract.operator_code);
          break;
        case "season_label":
          comparison = compareStrings(left.contract.season_label ?? "", right.contract.season_label ?? "");
          break;
        case "source":
          comparison = compareStrings(left.contract.source, right.contract.source);
          break;
        case "file_size":
          comparison = left.contract.file_size - right.contract.file_size;
          break;
        case "created_at":
          comparison = new Date(left.contract.created_at).getTime() - new Date(right.contract.created_at).getTime();
          break;
        case "updated_at":
          comparison = new Date(left.contract.updated_at).getTime() - new Date(right.contract.updated_at).getTime();
          break;
        case "room_count":
          comparison = left.roomCount - right.roomCount;
          break;
        case "board_count":
          comparison = left.boardCount - right.boardCount;
          break;
        case "discount_count":
          comparison = left.discountCount - right.discountCount;
          break;
        case "rule_count":
          comparison = left.ruleCount - right.ruleCount;
          break;
      }
      if (comparison === 0) {
        return compareStrings(left.contract.file_name, right.contract.file_name) * direction;
      }
      return comparison * direction;
    });

    return sorted;
  }, [contracts, filters.hasRules, rulesByContract, sortBy, sortOrder]);

  const updateFilter = useCallback(<Key extends keyof ContractExplorerFilters>(key: Key, value: ContractExplorerFilters[Key]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSortBy("updated_at");
    setSortOrder("desc");
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await Promise.all([loadContracts(), loadFilterOptions()]);
    } finally {
      setBusy(false);
    }
  }, [loadContracts, loadFilterOptions]);

  return {
    filters,
    sortBy,
    sortOrder,
    rows,
    loading,
    busy,
    filterOptions,
    updateFilter,
    setSortBy,
    setSortOrder,
    resetFilters,
    refresh,
  };
}
