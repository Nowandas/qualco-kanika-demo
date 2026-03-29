import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type {
  ContractDocument,
  PriceListEntry,
  PriceListMatrix,
  PromotionAIIngestResponse,
  PromotionOffer,
} from "@/api/types";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

type PriceListFilters = {
  roomType: string;
  boardType: string;
  ageBucket: string;
  currency: string;
  periodLabel: string;
};

type CellValue = {
  price: number;
  periodLabel?: string | null;
  basePrice?: number | null;
  deltaAmount?: number | null;
  deltaPercent?: number | null;
  promotionApplied?: boolean;
  appliedPromotions: string[];
};

export type PriceListViewMode = "month" | "week" | "quarter" | "year" | "custom";

export type PriceMatrixRow = {
  key: string;
  roomType: string;
  boardType: string;
  ageBucket: string;
  ageLabel: string;
  currency: string;
  values: Record<string, CellValue>;
};

const DEFAULT_FILTERS: PriceListFilters = {
  roomType: "all",
  boardType: "all",
  ageBucket: "all",
  currency: "all",
  periodLabel: "all",
};

function toMonthValue(input: Date): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toDateValue(input: Date): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  const day = String(input.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function dateKey(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function monthRange(monthValue: string): { start: Date; end: Date } {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const today = new Date();
    return monthRange(toMonthValue(today));
  }
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0),
  };
}

function weekRange(referenceDateValue: string): { start: Date; end: Date } {
  const reference = parseDate(referenceDateValue) ?? new Date();
  const start = new Date(reference);
  const weekdayMondayFirst = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekdayMondayFirst);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function quarterRange(referenceDateValue: string): { start: Date; end: Date } {
  const reference = parseDate(referenceDateValue) ?? new Date();
  const quarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
  return {
    start: new Date(reference.getFullYear(), quarterStartMonth, 1),
    end: new Date(reference.getFullYear(), quarterStartMonth + 3, 0),
  };
}

function yearRange(referenceDateValue: string): { start: Date; end: Date } {
  const reference = parseDate(referenceDateValue) ?? new Date();
  return {
    start: new Date(reference.getFullYear(), 0, 1),
    end: new Date(reference.getFullYear(), 11, 31),
  };
}

function customRange(startValue: string, endValue: string): { start: Date; end: Date } | null {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) {
    return null;
  }
  if (end < start) {
    return { start: end, end: start };
  }
  return { start, end };
}

function isEntryInRange(entry: PriceListEntry, start: Date, end: Date): boolean {
  const entryStart = parseDate(entry.start_date);
  const entryEnd = parseDate(entry.end_date);
  if (!entryStart && !entryEnd) return true;
  if (entryStart && entryEnd) return !(entryEnd < start || entryStart > end);
  if (entryStart) return entryStart <= end;
  return Boolean(entryEnd && entryEnd >= start);
}

function entryAppliesOnDay(entry: PriceListEntry, day: Date): boolean {
  const entryStart = parseDate(entry.start_date);
  const entryEnd = parseDate(entry.end_date);
  if (!entryStart && !entryEnd) return true;
  if (entryStart && day < entryStart) return false;
  if (entryEnd && day > entryEnd) return false;
  return true;
}

function resolveMonthFromMatrix(matrix: PriceListMatrix | null): string {
  if (!matrix) {
    return toMonthValue(new Date());
  }
  const firstPeriodWithStart = matrix.period_ranges.find((period) => period.start_date);
  if (firstPeriodWithStart?.start_date) {
    const parsed = parseDate(firstPeriodWithStart.start_date);
    if (parsed) return toMonthValue(parsed);
  }
  const firstEntryWithStart = matrix.entries.find((entry) => entry.start_date);
  if (firstEntryWithStart?.start_date) {
    const parsed = parseDate(firstEntryWithStart.start_date);
    if (parsed) return toMonthValue(parsed);
  }
  return toMonthValue(new Date());
}

function resolveDateFromMatrix(matrix: PriceListMatrix | null): string {
  if (!matrix) {
    return toDateValue(new Date());
  }
  const firstPeriodWithStart = matrix.period_ranges.find((period) => period.start_date);
  if (firstPeriodWithStart?.start_date) {
    const parsed = parseDate(firstPeriodWithStart.start_date);
    if (parsed) return toDateValue(parsed);
  }
  const firstEntryWithStart = matrix.entries.find((entry) => entry.start_date);
  if (firstEntryWithStart?.start_date) {
    const parsed = parseDate(firstEntryWithStart.start_date);
    if (parsed) return toDateValue(parsed);
  }
  return toDateValue(new Date());
}

function formatRangeLabel(viewMode: PriceListViewMode, start: Date, end: Date): string {
  const startText = toDateValue(start);
  const endText = toDateValue(end);
  if (viewMode === "week") {
    return `Week: ${startText} to ${endText}`;
  }
  if (viewMode === "quarter") {
    const quarter = Math.floor(start.getMonth() / 3) + 1;
    return `Q${quarter} ${start.getFullYear()} (${startText} to ${endText})`;
  }
  if (viewMode === "year") {
    return `Year ${start.getFullYear()} (${startText} to ${endText})`;
  }
  if (viewMode === "custom") {
    return `Custom: ${startText} to ${endText}`;
  }
  return `Month: ${startText} to ${endText}`;
}

export function usePriceListCalendar() {
  const { selectedHotelId, selectedHotel } = useHotelScope();
  const now = new Date();
  const [contracts, setContracts] = useState<ContractDocument[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [baseMatrix, setBaseMatrix] = useState<PriceListMatrix | null>(null);
  const [promotedMatrix, setPromotedMatrix] = useState<PriceListMatrix | null>(null);
  const [promotions, setPromotions] = useState<PromotionOffer[]>([]);
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  const [includePromotions, setIncludePromotions] = useState(false);
  const [lastPromotionIngest, setLastPromotionIngest] = useState<PromotionAIIngestResponse | null>(null);
  const [filters, setFilters] = useState<PriceListFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<PriceListViewMode>("month");
  const [monthValue, setMonthValue] = useState(toMonthValue(new Date()));
  const [referenceDateValue, setReferenceDateValue] = useState(toDateValue(now));
  const [customStartDateValue, setCustomStartDateValue] = useState(toDateValue(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEndDateValue, setCustomEndDateValue] = useState(toDateValue(now));
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [loadingPromotions, setLoadingPromotions] = useState(false);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [ingestingPromotion, setIngestingPromotion] = useState(false);
  const contractsAbortRef = useRef<AbortController | null>(null);
  const promotionsAbortRef = useRef<AbortController | null>(null);
  const matrixAbortRef = useRef<AbortController | null>(null);

  const matrix = includePromotions ? (promotedMatrix ?? baseMatrix) : baseMatrix;

  const loadContracts = useCallback(async () => {
    const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
    const controller = new AbortController();
    contractsAbortRef.current?.abort();
    contractsAbortRef.current = controller;
    setLoadingContracts(true);
    try {
      const response = await api.get<ContractDocument[]>("/hospitality/contracts", {
        params: { hotel_id: scopedHotelId, limit: 1000, sort_by: "updated_at", sort_order: "desc" },
        signal: controller.signal,
      });
      setContracts(response.data);
      if (response.data.length === 0) {
        setSelectedContractId("");
        setBaseMatrix(null);
        setPromotedMatrix(null);
        setPromotions([]);
        setSelectedPromotionIds([]);
        return;
      }

      const selectedStillExists = response.data.some((item) => item.id === selectedContractId);
      if (!selectedStillExists) {
        const preferred = response.data.find((item) => Boolean(item.ai_extraction_run_id));
        setSelectedContractId((preferred ?? response.data[0]).id);
      }
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load contracts.");
    } finally {
      if (contractsAbortRef.current === controller) {
        contractsAbortRef.current = null;
        setLoadingContracts(false);
      }
    }
  }, [selectedContractId, selectedHotelId]);

  const loadPromotions = useCallback(async (contractId: string) => {
    const controller = new AbortController();
    promotionsAbortRef.current?.abort();
    promotionsAbortRef.current = controller;
    if (!contractId) {
      setPromotions([]);
      setSelectedPromotionIds([]);
      promotionsAbortRef.current = null;
      setLoadingPromotions(false);
      return;
    }

    const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
    setLoadingPromotions(true);
    try {
      const response = await api.get<PromotionOffer[]>("/hospitality/promotions", {
        params: {
          hotel_id: scopedHotelId,
          contract_id: contractId,
        },
        signal: controller.signal,
      });
      setPromotions(response.data);
      const allowedIds = new Set(response.data.map((promotion) => promotion.id));
      setSelectedPromotionIds((previous) => {
        const next = previous.filter((id) => allowedIds.has(id));
        return next.length === previous.length ? previous : next;
      });
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load promotions for this contract.");
      setPromotions([]);
    } finally {
      if (promotionsAbortRef.current === controller) {
        promotionsAbortRef.current = null;
        setLoadingPromotions(false);
      }
    }
  }, [selectedHotelId]);

  const loadMatrices = useCallback(async (contractId: string, promotionIds: string[]) => {
    const controller = new AbortController();
    matrixAbortRef.current?.abort();
    matrixAbortRef.current = controller;
    if (!contractId) {
      setBaseMatrix(null);
      setPromotedMatrix(null);
      matrixAbortRef.current = null;
      setLoadingMatrix(false);
      return;
    }
    setLoadingMatrix(true);
    try {
      const promoParams: Record<string, unknown> = { include_promotions: true };
      if (promotionIds.length) {
        promoParams.promotion_ids = promotionIds.join(",");
      }

      const [baseResponse, promoResponse] = await Promise.all([
        api.get<PriceListMatrix>(`/hospitality/contracts/${contractId}/price-matrix`, {
          params: { include_promotions: false },
          signal: controller.signal,
        }),
        api.get<PriceListMatrix>(`/hospitality/contracts/${contractId}/price-matrix`, {
          params: promoParams,
          signal: controller.signal,
        }),
      ]);

      setBaseMatrix(baseResponse.data);
      setPromotedMatrix(promoResponse.data);
      const sourceMatrix = includePromotions ? promoResponse.data : baseResponse.data;
      setMonthValue(resolveMonthFromMatrix(sourceMatrix));
      setReferenceDateValue(resolveDateFromMatrix(sourceMatrix));
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load price list matrix.");
      setBaseMatrix(null);
      setPromotedMatrix(null);
    } finally {
      if (matrixAbortRef.current === controller) {
        matrixAbortRef.current = null;
        setLoadingMatrix(false);
      }
    }
  }, [includePromotions]);

  const ingestPromotionEmail = useCallback(async (params: {
    file: File | null;
    operatorCode: string;
    contractIds: string[];
  }) => {
    if (ingestingPromotion) {
      return null;
    }
    if (!params.file) {
      notifyInfo("Select an offer email/document file first.");
      return null;
    }
    if (selectedHotelId === HOTEL_SCOPE_ALL || !selectedHotel) {
      notifyInfo("Select a specific hotel first.");
      return null;
    }
    const operatorCode = params.operatorCode.trim().toUpperCase();
    if (!operatorCode) {
      notifyInfo("Operator code is required.");
      return null;
    }

    setIngestingPromotion(true);
    try {
      const formData = new FormData();
      formData.append("file", params.file);
      formData.append("hotel_id", selectedHotel.id);
      formData.append("hotel_code", selectedHotel.code);
      formData.append("operator_code", operatorCode);
      for (const contractId of params.contractIds) {
        if (contractId.trim()) {
          formData.append("contract_ids", contractId.trim());
        }
      }

      const response = await api.post<PromotionAIIngestResponse>("/hospitality/promotions/ai-ingest", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastPromotionIngest(response.data);
      notifySuccess("Promotion email ingested with AI and mapped to selected contracts.");

      const createdPromotionId = response.data.promotion?.id;
      const nextContractId = response.data.impacted_contract_ids.includes(selectedContractId)
        ? selectedContractId
        : (response.data.impacted_contract_ids[0] ?? selectedContractId);

      if (createdPromotionId) {
        setSelectedPromotionIds([createdPromotionId]);
      }
      setIncludePromotions(true);
      if (nextContractId && nextContractId !== selectedContractId) {
        setSelectedContractId(nextContractId);
      }

      const matrixContractId = nextContractId || selectedContractId;
      if (matrixContractId) {
        await loadPromotions(matrixContractId);
        await loadMatrices(matrixContractId, createdPromotionId ? [createdPromotionId] : selectedPromotionIds);
      } else {
        await loadContracts();
      }
      return response.data;
    } catch (error) {
      notifyError(error, "Could not ingest promotion email with AI.");
      return null;
    } finally {
      setIngestingPromotion(false);
    }
  }, [ingestingPromotion, loadContracts, loadMatrices, loadPromotions, selectedContractId, selectedHotel, selectedHotelId, selectedPromotionIds]);

  useEffect(() => {
    loadContracts().catch(() => null);
  }, [loadContracts]);

  useEffect(() => {
    if (!selectedContractId) {
      setBaseMatrix(null);
      setPromotedMatrix(null);
      setPromotions([]);
      setSelectedPromotionIds([]);
      return;
    }
    loadPromotions(selectedContractId).catch(() => null);
  }, [loadPromotions, selectedContractId]);

  useEffect(() => {
    if (!selectedContractId) return;
    loadMatrices(selectedContractId, selectedPromotionIds).catch(() => null);
  }, [loadMatrices, selectedContractId, selectedPromotionIds]);

  useEffect(() => {
    return () => {
      contractsAbortRef.current?.abort();
      promotionsAbortRef.current?.abort();
      matrixAbortRef.current?.abort();
    };
  }, []);

  const periodLabels = useMemo(() => {
    const labels = new Set<string>();
    if (matrix) {
      matrix.period_ranges.forEach((period) => {
        if (period.label) labels.add(period.label);
      });
      matrix.entries.forEach((entry) => {
        if (entry.period_label) labels.add(entry.period_label);
      });
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  }, [matrix]);

  const resolvedDateRange = useMemo(() => {
    if (viewMode === "week") return weekRange(referenceDateValue);
    if (viewMode === "quarter") return quarterRange(referenceDateValue);
    if (viewMode === "year") return yearRange(referenceDateValue);
    if (viewMode === "custom") {
      const range = customRange(customStartDateValue, customEndDateValue);
      if (range) return range;
      return monthRange(monthValue);
    }
    return monthRange(monthValue);
  }, [customEndDateValue, customStartDateValue, monthValue, referenceDateValue, viewMode]);

  const customRangeValid = useMemo(
    () => viewMode !== "custom" || customRange(customStartDateValue, customEndDateValue) !== null,
    [customEndDateValue, customStartDateValue, viewMode],
  );

  const rangeLabel = useMemo(
    () => formatRangeLabel(viewMode, resolvedDateRange.start, resolvedDateRange.end),
    [resolvedDateRange.end, resolvedDateRange.start, viewMode],
  );

  const days = useMemo(() => {
    const { start, end } = resolvedDateRange;
    const output: Date[] = [];
    const pointer = new Date(start);
    while (pointer <= end) {
      output.push(new Date(pointer));
      pointer.setDate(pointer.getDate() + 1);
    }
    return output;
  }, [resolvedDateRange]);

  const filteredEntries = useMemo(() => {
    if (!matrix) return [];
    return matrix.entries.filter((entry) => {
      if (!isEntryInRange(entry, resolvedDateRange.start, resolvedDateRange.end)) return false;
      if (filters.roomType !== "all" && entry.room_type !== filters.roomType) return false;
      if (filters.boardType !== "all" && entry.board_type !== filters.boardType) return false;
      if (filters.ageBucket !== "all" && entry.age_bucket !== filters.ageBucket) return false;
      if (filters.currency !== "all" && (entry.currency ?? "") !== filters.currency) return false;
      if (filters.periodLabel !== "all" && (entry.period_label ?? "") !== filters.periodLabel) return false;
      return true;
    });
  }, [filters.ageBucket, filters.boardType, filters.currency, filters.periodLabel, filters.roomType, matrix, resolvedDateRange.end, resolvedDateRange.start]);

  const rows = useMemo(() => {
    const grouped = new Map<string, PriceListEntry[]>();
    for (const entry of filteredEntries) {
      const rowKey = `${entry.room_type}|${entry.board_type}|${entry.age_bucket}|${entry.currency ?? ""}`;
      const existing = grouped.get(rowKey) ?? [];
      existing.push(entry);
      grouped.set(rowKey, existing);
    }

    const output: PriceMatrixRow[] = [];
    for (const [key, entries] of grouped.entries()) {
      const first = entries[0];
      const values: Record<string, CellValue> = {};
      const sortedEntries = [...entries].sort((left, right) => {
        const leftStart = parseDate(left.start_date);
        const rightStart = parseDate(right.start_date);
        const leftValue = leftStart ? leftStart.getTime() : Number.MIN_SAFE_INTEGER;
        const rightValue = rightStart ? rightStart.getTime() : Number.MIN_SAFE_INTEGER;
        return rightValue - leftValue;
      });

      for (const day of days) {
        const match = sortedEntries.find((entry) => entryAppliesOnDay(entry, day));
        if (!match) {
          continue;
        }
        values[dateKey(day)] = {
          price: match.price,
          periodLabel: match.period_label,
          basePrice: match.base_price ?? null,
          deltaAmount: match.delta_amount ?? null,
          deltaPercent: match.delta_percent ?? null,
          promotionApplied: Boolean(match.promotion_applied),
          appliedPromotions: match.applied_promotions ?? [],
        };
      }

      output.push({
        key,
        roomType: first.room_type,
        boardType: first.board_type,
        ageBucket: first.age_bucket,
        ageLabel: first.age_label,
        currency: first.currency ?? "",
        values,
      });
    }

    output.sort((left, right) => {
      const byRoom = left.roomType.localeCompare(right.roomType, undefined, { sensitivity: "base", numeric: true });
      if (byRoom !== 0) return byRoom;
      const byBoard = left.boardType.localeCompare(right.boardType, undefined, { sensitivity: "base", numeric: true });
      if (byBoard !== 0) return byBoard;
      return left.ageLabel.localeCompare(right.ageLabel, undefined, { sensitivity: "base", numeric: true });
    });
    return output;
  }, [days, filteredEntries]);

  const changedEntryCount = useMemo(
    () => (promotedMatrix?.entries ?? []).filter((entry) => Boolean(entry.promotion_applied)).length,
    [promotedMatrix],
  );

  const updateFilter = useCallback(<Key extends keyof PriceListFilters>(key: Key, value: PriceListFilters[Key]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setMonthValue(resolveMonthFromMatrix(matrix));
    setReferenceDateValue(resolveDateFromMatrix(matrix));
    if (matrix) {
      const first = resolveDateFromMatrix(matrix);
      setCustomStartDateValue(first);
      setCustomEndDateValue(first);
    }
  }, [matrix]);

  const refresh = useCallback(async () => {
    await loadContracts();
    if (selectedContractId) {
      await Promise.all([
        loadPromotions(selectedContractId),
        loadMatrices(selectedContractId, selectedPromotionIds),
      ]);
    }
  }, [loadContracts, loadMatrices, loadPromotions, selectedContractId, selectedPromotionIds]);

  return {
    contracts,
    selectedContractId,
    setSelectedContractId,
    matrix,
    baseMatrix,
    promotedMatrix,
    promotions,
    selectedPromotionIds,
    setSelectedPromotionIds,
    includePromotions,
    setIncludePromotions,
    ingestingPromotion,
    lastPromotionIngest,
    ingestPromotionEmail,
    filters,
    viewMode,
    setViewMode,
    monthValue,
    setMonthValue,
    referenceDateValue,
    setReferenceDateValue,
    customStartDateValue,
    setCustomStartDateValue,
    customEndDateValue,
    setCustomEndDateValue,
    customRangeValid,
    rangeLabel,
    days,
    rows,
    loadingContracts,
    loadingPromotions,
    loadingMatrix,
    changedEntryCount,
    updateFilter,
    resetFilters,
    refresh,
    periodLabels,
  };
}
