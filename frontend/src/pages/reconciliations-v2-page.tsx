import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, FileSpreadsheet, Loader2, RefreshCw, Search, Sparkles, UploadCloud, X } from "lucide-react";
import { createPortal } from "react-dom";

import type {
  PricingRule,
  ReconciliationReservation,
  ReconciliationSheetPreview,
  ValidationLineInput,
  ValidationLineResult,
} from "@/api/types";
import { api, isRequestCancelled } from "@/api/client";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useReconciliationsV2 } from "@/features/hospitality/use-reconciliations-v2";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";

const SOURCE_SYSTEM_OPTIONS = [
  { value: "pms", label: "PMS (Primary)" },
  { value: "tour_operator", label: "Tour operator" },
  { value: "accounting", label: "Accounting" },
  { value: "ota", label: "OTA" },
  { value: "channel_manager", label: "Channel manager" },
  { value: "other", label: "Other" },
];

const AI_MODEL_OPTIONS = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-4.1"];

const DEFAULT_MAPPING_INSTRUCTIONS =
  "Map by business meaning regardless of header names or column order. If nights exists as LOS/nights use it; otherwise derive nights from check-in/check-out dates. Preserve reservation identity and only keep rows with reliable actual_price.";

type V2Tab = "reservations" | "import_wizard";

const TAB_OPTIONS: Array<{ value: V2Tab; label: string }> = [
  { value: "reservations", label: "Reservations" },
  { value: "import_wizard", label: "Import Wizard" },
];

type SheetImportConfig = {
  sheetName: string;
  enabled: boolean;
  sourceSystem: string;
  reservationIdColumn: string;
  useAiMapping: boolean;
  model: string;
  mappingInstructions: string;
  sampleLimit: number;
};

type SheetImportResult = {
  sheetName: string;
  success: boolean;
  message: string;
  lineCount: number;
  importId?: string;
};

type GroupStatusFilter = "all" | "reconciled_only" | "not_reconciled" | "complete_match" | "partial_match" | "mismatch" | "no_pms_primary";
type GroupSortBy =
  | "priority"
  | "reservation_asc"
  | "reservation_desc"
  | "rows_desc"
  | "reconciled_desc"
  | "mismatch_desc"
  | "variance_abs_desc";

type ReservationGroup = {
  key: string;
  reservationId: string;
  rows: ReconciliationReservation[];
  pmsRows: ReconciliationReservation[];
  nonPmsRows: ReconciliationReservation[];
  sourceSystems: string[];
  firstStayDate: string | null;
  lastStayDate: string | null;
};

type EarlyBookingRuleWindow = {
  ruleName: string;
  discountPercent: 5 | 10;
  bookingStartDate: Date | null;
  bookingEndDate: Date | null;
  stayStartDate: Date | null;
  stayEndDate: Date | null;
};

type GroupBookingBadgeInfo = {
  label: string;
  title: string;
  className: string;
};

type GroupPromotionBadgeInfo = {
  key: string;
  label: string;
  title: string;
  className: string;
  affectedRows: number;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDateOnly(value: unknown): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoToken = raw.includes("T") ? raw.slice(0, 10) : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoToken)) {
    const [year, month, day] = isoToken.split("-").map((part) => Number(part));
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  const dayFirstMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const yearToken = dayFirstMatch[3];
    const year = yearToken.length === 2 ? 2000 + Number(yearToken) : Number(yearToken);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  if (value == null) return "";
  return String(value).trim();
}

function toMetadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toCanonicalDiscount(value: number | null): 5 | 10 | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (Math.abs(value - 5) <= 0.05) return 5;
  if (Math.abs(value - 10) <= 0.05) return 10;
  return null;
}

function parseDiscountFromExpression(expression: string): number | null {
  const match = expression.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasEarlyBookingMarker(rule: PricingRule): boolean {
  const metadata = (rule.metadata ?? {}) as Record<string, unknown>;
  const category = toMetadataString(metadata, "promotion_category").toLowerCase();
  if (category === "early_booking" || category === "early-booking" || category === "early booking") {
    return true;
  }
  const haystack = [
    rule.name,
    rule.expression,
    toMetadataString(metadata, "offer_name"),
    toMetadataString(metadata, "description"),
  ]
    .join(" ")
    .toLowerCase();
  return ["early booking", "early-booking", "earlybooking", "early bird", "early-bird", "earlybird"].some((token) =>
    haystack.includes(token),
  );
}

function buildEarlyBookingRuleWindows(rules: PricingRule[]): EarlyBookingRuleWindow[] {
  const windows: EarlyBookingRuleWindow[] = [];
  for (const rule of rules) {
    if (rule.rule_type !== "promotion" || !rule.is_active || !hasEarlyBookingMarker(rule)) continue;
    const metadata = (rule.metadata ?? {}) as Record<string, unknown>;

    const discountRaw = toMetadataNumber(metadata, "discount_percent") ?? parseDiscountFromExpression(rule.expression);
    const discountPercent = toCanonicalDiscount(discountRaw);
    if (!discountPercent) continue;

    let bookingStartDate = parseDateOnly(toMetadataString(metadata, "booking_start_date"));
    let bookingEndDate = parseDateOnly(toMetadataString(metadata, "booking_end_date"));
    let stayStartDate =
      parseDateOnly(toMetadataString(metadata, "arrival_start_date")) ?? parseDateOnly(toMetadataString(metadata, "start_date"));
    let stayEndDate =
      parseDateOnly(toMetadataString(metadata, "arrival_end_date")) ?? parseDateOnly(toMetadataString(metadata, "end_date"));

    if (bookingStartDate && bookingEndDate && bookingEndDate < bookingStartDate) {
      const swap = bookingStartDate;
      bookingStartDate = bookingEndDate;
      bookingEndDate = swap;
    }
    if (stayStartDate && stayEndDate && stayEndDate < stayStartDate) {
      const swap = stayStartDate;
      stayStartDate = stayEndDate;
      stayEndDate = swap;
    }

    // For early-booking, both booking window and stay window are mandatory.
    if (!(bookingStartDate || bookingEndDate) || !(stayStartDate || stayEndDate)) continue;

    windows.push({
      ruleName: rule.name,
      discountPercent,
      bookingStartDate,
      bookingEndDate,
      stayStartDate,
      stayEndDate,
    });
  }
  return windows;
}

function dateFitsWindow(date: Date, startDate: Date | null, endDate: Date | null): boolean {
  const value = date.getTime();
  if (startDate && value < startDate.getTime()) return false;
  if (endDate && value > endDate.getTime()) return false;
  return true;
}

function resolveGroupBookingDate(group: ReservationGroup): string | null {
  const pmsWithBookingDate = group.rows.find(
    (row) => String(row.source_system || "").toLowerCase() === "pms" && String(row.booking_date || "").trim(),
  );
  if (pmsWithBookingDate?.booking_date) return pmsWithBookingDate.booking_date;

  const anyWithBookingDate = group.rows.find((row) => String(row.booking_date || "").trim());
  return anyWithBookingDate?.booking_date ?? null;
}

function buildGroupBookingBadge(group: ReservationGroup, earlyBookingWindows: EarlyBookingRuleWindow[]): GroupBookingBadgeInfo | null {
  const bookingDateRaw = resolveGroupBookingDate(group);
  if (!bookingDateRaw) return null;

  const bookingDate = parseDateOnly(bookingDateRaw);
  const stayStart = parseDateOnly(group.firstStayDate);
  const stayEnd = parseDateOnly(group.lastStayDate);
  if (!bookingDate || !stayStart || !stayEnd) return null;

  const matchedRules = earlyBookingWindows.filter((window) => {
    const bookingMatch = dateFitsWindow(bookingDate, window.bookingStartDate, window.bookingEndDate);
    const stayStartMatch = dateFitsWindow(stayStart, window.stayStartDate, window.stayEndDate);
    const stayEndMatch = dateFitsWindow(stayEnd, window.stayStartDate, window.stayEndDate);
    return bookingMatch && stayStartMatch && stayEndMatch;
  });
  if (!matchedRules.length) return null;

  const winner = matchedRules.sort((left, right) => right.discountPercent - left.discountPercent)[0];
  const appliedLabel = winner.discountPercent === 10 ? "Early booking 10%" : "Early booking 5%";
  const className =
    winner.discountPercent === 10
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-sky-200 bg-sky-50 text-sky-700";
  const bookedLabel = formatDate(formatIsoDate(bookingDate));
  const stayRangeLabel = `${formatDate(group.firstStayDate)} - ${formatDate(group.lastStayDate)}`;

  return {
    label: appliedLabel,
    className,
    title: `Matched ${winner.ruleName}. Booking date ${bookedLabel}; stay range ${stayRangeLabel}.`,
  };
}

function formatPromotionLabel(offerName: string, discountPercent: number | null): string {
  const cleanName = offerName.trim() || "Promotion";
  if (discountPercent == null || !Number.isFinite(discountPercent) || discountPercent <= 0) {
    return cleanName;
  }
  const normalized = Math.round(discountPercent * 100) / 100;
  const discountLabel = Number.isInteger(normalized) ? `${normalized.toFixed(0)}%` : `${normalized.toFixed(2)}%`;
  return `${discountLabel} ${cleanName}`;
}

function buildGroupPromotionBadges(
  group: ReservationGroup,
  groupValidation: Record<string, ValidationLineResult> | undefined,
): GroupPromotionBadgeInfo[] {
  if (!groupValidation) return [];

  const aggregate = new Map<
    string,
    { offerName: string; discountPercent: number | null; affectedRows: number; totalAdjustment: number }
  >();

  for (const row of group.rows) {
    const validation = groupValidation[row.id];
    if (!validation) continue;

    const promotionAdjustments = validation.expected_calculation?.promotion_adjustments ?? [];
    if (promotionAdjustments.length) {
      const seenPerRow = new Set<string>();
      for (const adjustment of promotionAdjustments) {
        const offerName = String(adjustment.offer_name || "Promotion").trim() || "Promotion";
        const discountPercent = Number.isFinite(adjustment.discount_percent) ? adjustment.discount_percent : null;
        const key = `${offerName.toLowerCase()}|${discountPercent ?? ""}`;
        if (seenPerRow.has(key)) continue;
        seenPerRow.add(key);

        const existing = aggregate.get(key) ?? { offerName, discountPercent, affectedRows: 0, totalAdjustment: 0 };
        existing.affectedRows += 1;
        existing.totalAdjustment += Number.isFinite(adjustment.adjustment_amount) ? adjustment.adjustment_amount : 0;
        aggregate.set(key, existing);
      }
      continue;
    }

    const seenFallback = new Set<string>();
    for (const name of validation.applied_promotions ?? []) {
      const offerName = String(name || "").trim();
      if (!offerName) continue;
      const key = `${offerName.toLowerCase()}|`;
      if (seenFallback.has(key)) continue;
      seenFallback.add(key);

      const existing = aggregate.get(key) ?? { offerName, discountPercent: null, affectedRows: 0, totalAdjustment: 0 };
      existing.affectedRows += 1;
      aggregate.set(key, existing);
    }
  }

  return [...aggregate.entries()]
    .sort((left, right) => {
      if (right[1].affectedRows !== left[1].affectedRows) return right[1].affectedRows - left[1].affectedRows;
      const rightDiscount = right[1].discountPercent ?? 0;
      const leftDiscount = left[1].discountPercent ?? 0;
      if (rightDiscount !== leftDiscount) return rightDiscount - leftDiscount;
      return left[1].offerName.localeCompare(right[1].offerName, undefined, { sensitivity: "base" });
    })
    .map(([key, value]) => {
      const className =
        (value.discountPercent ?? 0) >= 10
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-amber-200 bg-amber-50 text-amber-700";
      const label = formatPromotionLabel(value.offerName, value.discountPercent);
      const title = `${label} applied in ${value.affectedRows} of ${group.rows.length} row(s) in this reservation group.`;
      return {
        key,
        label,
        title,
        className,
        affectedRows: value.affectedRows,
      };
    });
}

function formatRateSource(source?: string | null): string {
  switch (source) {
    case "uploaded_contract_rate":
      return "Imported contract rate";
    case "contract_pricelist_rule":
      return "Contract price-list rule";
    case "fallback_average_contract_rate":
      return "Average contract rate (fallback)";
    case "fallback_actual_price":
      return "Actual price fallback";
    case "fallback_rule_lookup_rate":
      return "Rule lookup fallback";
    case "mixed":
      return "Mixed sources";
    case "incomplete_pricelist_match":
      return "Missing daily rate(s)";
    default:
      return source || "Unknown";
  }
}

function normalizeReservationGroupKey(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return compact || value.trim().toUpperCase().replace(/\s+/g, "");
}

function toSourceLabel(value?: string | null): string {
  const normalized = String(value || "").trim().toLowerCase();
  const found = SOURCE_SYSTEM_OPTIONS.find((option) => option.value === normalized);
  return found?.label ?? (normalized ? normalized.replace(/[_-]+/g, " ") : "unspecified");
}

function guessReservationIdColumn(headers: string[]): string {
  const candidates = headers.map((header) => header.trim()).filter((header) => header.length > 0);
  if (!candidates.length) return "";

  const score = (header: string): number => {
    const token = header.toLowerCase();
    let value = 0;
    if (token.includes("reservation")) value += 6;
    if (token.includes("booking")) value += 5;
    if (token.includes("reference")) value += 4;
    if (token.includes("confirmation")) value += 4;
    if (token.includes("voucher")) value += 3;
    if (token === "id" || token.endsWith("_id") || token.endsWith(" id")) value += 3;
    if (token.includes("room") || token.includes("board") || token.includes("price")) value -= 2;
    return value;
  };

  return [...candidates].sort((left, right) => score(right) - score(left))[0] ?? "";
}

function toValidationLine(row: ReconciliationReservation, syntheticReservationId: string): ValidationLineInput {
  return {
    reservation_id: syntheticReservationId,
    contract_id: row.contract_id,
    hotel_code: row.hotel_code,
    operator_code: row.operator_code,
    room_type: row.room_type,
    board_type: row.board_type,
    booking_date: row.booking_date ?? undefined,
    stay_date: row.stay_date,
    nights: row.nights,
    pax_adults: row.pax_adults,
    pax_children: row.pax_children,
    actual_price: row.actual_price,
    contract_rate: row.contract_rate ?? undefined,
    promo_code: row.promo_code ?? undefined,
  };
}

function sortGroupRows(rows: ReconciliationReservation[]): ReconciliationReservation[] {
  return [...rows].sort((left, right) => {
    const leftIsPms = String(left.source_system || "").toLowerCase() === "pms";
    const rightIsPms = String(right.source_system || "").toLowerCase() === "pms";
    if (leftIsPms && !rightIsPms) return -1;
    if (!leftIsPms && rightIsPms) return 1;
    if (left.stay_date !== right.stay_date) return left.stay_date.localeCompare(right.stay_date);
    return left.room_type.localeCompare(right.room_type, undefined, { sensitivity: "base", numeric: true });
  });
}

function summarizeGroupValidation(
  group: ReservationGroup,
  groupValidation: Record<string, ValidationLineResult> | undefined,
): {
  key: "no_pms_primary" | "not_reconciled" | "complete_match" | "partial_match" | "mismatch";
  label: string;
  variant: "outline" | "muted" | "danger";
  className?: string;
  validatedCount: number;
  matchCount: number;
  mismatchCount: number;
  mismatchRatePercent: number;
  varianceTotal: number;
  actualTotal: number;
  expectedTotal: number;
} {
  const values = Object.values(groupValidation ?? {});
  const varianceTotal = values.reduce((sum, item) => sum + item.variance_amount, 0);
  const actualTotal = values.reduce((sum, item) => sum + item.actual_price, 0);
  const expectedTotal = values.reduce((sum, item) => sum + item.expected_price, 0);
  if (!values.length) {
    if (!group.pmsRows.length) {
      return {
        key: "no_pms_primary",
        label: "No PMS primary",
        variant: "danger",
        validatedCount: 0,
        matchCount: 0,
        mismatchCount: 0,
        mismatchRatePercent: 0,
        varianceTotal,
        actualTotal,
        expectedTotal,
      };
    }
    return {
      key: "not_reconciled",
      label: "Not reconciled",
      variant: "muted",
      validatedCount: 0,
      matchCount: 0,
      mismatchCount: 0,
      mismatchRatePercent: 0,
      varianceTotal,
      actualTotal,
      expectedTotal,
    };
  }

  const mismatchCount = values.filter((item) => item.status === "mismatch").length;
  const matchCount = values.length - mismatchCount;
  const mismatchRatePercent = (mismatchCount / values.length) * 100;
  if (mismatchCount === 0) {
    return {
      key: "complete_match",
      label: "Complete match",
      variant: "outline",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      validatedCount: values.length,
      matchCount,
      mismatchCount,
      mismatchRatePercent,
      varianceTotal,
      actualTotal,
      expectedTotal,
    };
  }

  if (matchCount > 0) {
    return {
      key: "partial_match",
      label: "Partial match",
      variant: "outline",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      validatedCount: values.length,
      matchCount,
      mismatchCount,
      mismatchRatePercent,
      varianceTotal,
      actualTotal,
      expectedTotal,
    };
  }

  return {
    key: "mismatch",
    label: "Mismatch",
    variant: "danger",
    validatedCount: values.length,
    matchCount,
    mismatchCount,
    mismatchRatePercent,
    varianceTotal,
    actualTotal,
    expectedTotal,
  };
}

export function ReconciliationsV2Page() {
  const { selectedHotelId, selectedHotel } = useHotelScope();
  const {
    contracts,
    selectedContractId,
    setSelectedContractId,
    loadingContracts,
    imports,
    loadingImports,
    reservations,
    reservationsTotal,
    loadingReservations,
    importing,
    validating,
    previewWorkbook,
    mapSheetWithAi,
    previewSheetExtraction,
    persistImportV2,
    loadImports,
    loadAllReservations,
    runValidationFromLines,
    runSheetImports,
  } = useReconciliationsV2();

  const [activeTab, setActiveTab] = useState<V2Tab>("reservations");
  const [importedSourcesCollapsed, setImportedSourcesCollapsed] = useState(true);

  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [analyzedSheets, setAnalyzedSheets] = useState<ReconciliationSheetPreview[]>([]);
  const [sheetSelection, setSheetSelection] = useState<Record<string, boolean>>({});
  const [sheetConfigs, setSheetConfigs] = useState<Record<string, SheetImportConfig>>({});
  const [sheetOrder, setSheetOrder] = useState<string[]>([]);
  const [sheetHeadersByName, setSheetHeadersByName] = useState<Record<string, string[]>>({});
  const [sheetSampleRowsByName, setSheetSampleRowsByName] = useState<Record<string, string[][]>>({});
  const [workbookAnalyzing, setWorkbookAnalyzing] = useState(false);
  const [sheetImportResults, setSheetImportResults] = useState<SheetImportResult[]>([]);
  const [contractRules, setContractRules] = useState<PricingRule[]>([]);

  const [groupSearch, setGroupSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [groupStatusFilter, setGroupStatusFilter] = useState<GroupStatusFilter>("all");
  const [groupSortBy, setGroupSortBy] = useState<GroupSortBy>("priority");
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});
  const [groupValidationByGroupKey, setGroupValidationByGroupKey] = useState<Record<string, Record<string, ValidationLineResult>>>({});
  const [validatingGroupKey, setValidatingGroupKey] = useState<string | null>(null);
  const [runningAllGroups, setRunningAllGroups] = useState(false);
  const [selectedAnalysisRow, setSelectedAnalysisRow] = useState<ValidationLineResult | null>(null);
  const [groupViewModalKey, setGroupViewModalKey] = useState<string | null>(null);

  const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;

  const reloadPersistedData = useCallback(async () => {
    if (!selectedContractId) return;
    await Promise.all([
      loadImports({ contractId: selectedContractId, hotelId: scopedHotelId, limit: 1000 }),
      loadAllReservations({ contractId: selectedContractId, hotelId: scopedHotelId }),
    ]);
  }, [loadAllReservations, loadImports, scopedHotelId, selectedContractId]);

  useEffect(() => {
    if (!selectedContractId) {
      setExpandedGroupKeys({});
      setGroupValidationByGroupKey({});
      setValidatingGroupKey(null);
      setRunningAllGroups(false);
      setSelectedAnalysisRow(null);
      setGroupViewModalKey(null);
      setContractRules([]);
      return;
    }
    setExpandedGroupKeys({});
    setGroupValidationByGroupKey({});
    setValidatingGroupKey(null);
    setRunningAllGroups(false);
    setSelectedAnalysisRow(null);
    setGroupViewModalKey(null);
    reloadPersistedData().catch(() => null);
  }, [reloadPersistedData, selectedContractId]);

  useEffect(() => {
    if (!selectedContractId) {
      setContractRules([]);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await api.get<PricingRule[]>("/hospitality/rules", {
          params: { contract_id: selectedContractId },
          signal: controller.signal,
        });
        setContractRules(response.data ?? []);
      } catch (error) {
        if (!isRequestCancelled(error)) {
          notifyError(error, "Could not load contract rules for booking-date badges.");
        }
        setContractRules([]);
      }
    })();

    return () => controller.abort();
  }, [selectedContractId]);

  const selectedContract = useMemo(
    () => contracts.find((item) => item.id === selectedContractId) ?? null,
    [contracts, selectedContractId],
  );

  const reservationGroups = useMemo(() => {
    const groups = new Map<string, ReservationGroup>();
    const query = groupSearch.trim().toLowerCase();

    for (const row of reservations) {
      if (sourceFilter !== "all" && String(row.source_system || "").toLowerCase() !== sourceFilter) {
        continue;
      }
      if (query) {
        const haystack = [
          row.reservation_id,
          row.source_system || "",
          row.file_name,
          row.sheet_name || "",
          row.room_type,
          row.board_type,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) continue;
      }

      const key = row.reservation_group_key || normalizeReservationGroupKey(row.reservation_id);
      if (!key) continue;

      const existing = groups.get(key);
      const sourceValue = String(row.source_system || "unspecified").toLowerCase();
      if (!existing) {
        groups.set(key, {
          key,
          reservationId: row.reservation_id,
          rows: [row],
          pmsRows: sourceValue === "pms" ? [row] : [],
          nonPmsRows: sourceValue === "pms" ? [] : [row],
          sourceSystems: [sourceValue],
          firstStayDate: row.stay_date,
          lastStayDate: row.stay_date,
        });
        continue;
      }

      existing.rows.push(row);
      if (sourceValue === "pms") existing.pmsRows.push(row);
      else existing.nonPmsRows.push(row);
      if (!existing.sourceSystems.includes(sourceValue)) existing.sourceSystems.push(sourceValue);
      if (!existing.firstStayDate || row.stay_date < existing.firstStayDate) existing.firstStayDate = row.stay_date;
      if (!existing.lastStayDate || row.stay_date > existing.lastStayDate) existing.lastStayDate = row.stay_date;
    }

    return [...groups.values()].sort((left, right) => {
      if (left.pmsRows.length && !right.pmsRows.length) return -1;
      if (!left.pmsRows.length && right.pmsRows.length) return 1;
      if (left.rows.length !== right.rows.length) return right.rows.length - left.rows.length;
      return left.reservationId.localeCompare(right.reservationId, undefined, { sensitivity: "base", numeric: true });
    });
  }, [groupSearch, reservations, sourceFilter]);

  const groupSummaryByKey = useMemo(() => {
    const next: Record<string, ReturnType<typeof summarizeGroupValidation>> = {};
    for (const group of reservationGroups) {
      next[group.key] = summarizeGroupValidation(group, groupValidationByGroupKey[group.key]);
    }
    return next;
  }, [groupValidationByGroupKey, reservationGroups]);

  const earlyBookingWindows = useMemo(
    () => buildEarlyBookingRuleWindows(contractRules),
    [contractRules],
  );

  const groupBookingBadgeByKey = useMemo(() => {
    const next: Record<string, GroupBookingBadgeInfo | null> = {};
    for (const group of reservationGroups) {
      next[group.key] = buildGroupBookingBadge(group, earlyBookingWindows);
    }
    return next;
  }, [earlyBookingWindows, reservationGroups]);

  const groupPromotionBadgesByKey = useMemo(() => {
    const next: Record<string, GroupPromotionBadgeInfo[]> = {};
    for (const group of reservationGroups) {
      next[group.key] = buildGroupPromotionBadges(group, groupValidationByGroupKey[group.key]);
    }
    return next;
  }, [groupValidationByGroupKey, reservationGroups]);

  const displayReservationGroups = useMemo(() => {
    const filtered = reservationGroups.filter((group) => {
      const summary = groupSummaryByKey[group.key];
      if (!summary) return groupStatusFilter === "all";
      if (groupStatusFilter === "all") return true;
      if (groupStatusFilter === "reconciled_only") return summary.validatedCount > 0;
      return summary.key === groupStatusFilter;
    });

    const sorted = [...filtered].sort((left, right) => {
      const leftSummary = groupSummaryByKey[left.key] ?? summarizeGroupValidation(left, undefined);
      const rightSummary = groupSummaryByKey[right.key] ?? summarizeGroupValidation(right, undefined);

      if (groupSortBy === "reservation_asc") {
        return left.reservationId.localeCompare(right.reservationId, undefined, { sensitivity: "base", numeric: true });
      }
      if (groupSortBy === "reservation_desc") {
        return right.reservationId.localeCompare(left.reservationId, undefined, { sensitivity: "base", numeric: true });
      }
      if (groupSortBy === "rows_desc") {
        if (left.rows.length !== right.rows.length) return right.rows.length - left.rows.length;
      }
      if (groupSortBy === "reconciled_desc") {
        if (leftSummary.validatedCount !== rightSummary.validatedCount) {
          return rightSummary.validatedCount - leftSummary.validatedCount;
        }
      }
      if (groupSortBy === "mismatch_desc") {
        if (leftSummary.mismatchCount !== rightSummary.mismatchCount) {
          return rightSummary.mismatchCount - leftSummary.mismatchCount;
        }
      }
      if (groupSortBy === "variance_abs_desc") {
        const leftVariance = Math.abs(leftSummary.varianceTotal);
        const rightVariance = Math.abs(rightSummary.varianceTotal);
        if (leftVariance !== rightVariance) return rightVariance - leftVariance;
      }

      if (left.pmsRows.length && !right.pmsRows.length) return -1;
      if (!left.pmsRows.length && right.pmsRows.length) return 1;
      if (left.rows.length !== right.rows.length) return right.rows.length - left.rows.length;
      return left.reservationId.localeCompare(right.reservationId, undefined, { sensitivity: "base", numeric: true });
    });

    return sorted;
  }, [groupSortBy, groupStatusFilter, groupSummaryByKey, reservationGroups]);

  const allDisplayedGroupsExpanded = useMemo(() => {
    if (!displayReservationGroups.length) return false;
    return displayReservationGroups.every((group) => Boolean(expandedGroupKeys[group.key]));
  }, [displayReservationGroups, expandedGroupKeys]);

  const onToggleAllDisplayedGroups = useCallback(() => {
    if (!displayReservationGroups.length) return;
    setExpandedGroupKeys((current) => {
      const next = { ...current };
      if (allDisplayedGroupsExpanded) {
        for (const group of displayReservationGroups) {
          next[group.key] = false;
        }
      } else {
        for (const group of displayReservationGroups) {
          next[group.key] = true;
        }
      }
      return next;
    });
  }, [allDisplayedGroupsExpanded, displayReservationGroups]);

  const onAnalyzeWorkbook = useCallback(async () => {
    if (!wizardFile) {
      notifyInfo("Choose an Excel file first.");
      return;
    }
    if (!selectedContractId) {
      notifyInfo("Select a contract before analyzing workbook.");
      return;
    }

    setWorkbookAnalyzing(true);
    try {
      const preview = await previewWorkbook({
        file: wizardFile,
        contractId: selectedContractId,
        sampleRows: 8,
      });
      if (!preview) return;

      const nextSelection: Record<string, boolean> = {};
      for (const sheet of preview.sheets) {
        nextSelection[sheet.sheet_name] = false;
      }

      setAnalyzedSheets(preview.sheets);
      setSheetSelection(nextSelection);
      setSheetConfigs({});
      setSheetOrder([]);
      setSheetHeadersByName({});
      setSheetSampleRowsByName({});
      setSheetImportResults([]);
    } finally {
      setWorkbookAnalyzing(false);
    }
  }, [previewWorkbook, selectedContractId, wizardFile]);

  const onCreateSelectedSheetConfigs = useCallback(() => {
    if (!analyzedSheets.length) {
      notifyInfo("Analyze a workbook first.");
      return;
    }

    const selected = analyzedSheets.filter((sheet) => sheetSelection[sheet.sheet_name]);
    if (!selected.length) {
      notifyInfo("Select one or more sheets first.");
      return;
    }

    const nextConfigs: Record<string, SheetImportConfig> = {};
    const nextHeaders: Record<string, string[]> = {};
    const nextSamples: Record<string, string[][]> = {};
    const nextOrder: string[] = [];

    for (const sheet of selected) {
      const guessedSource = /\bpms\b/i.test(sheet.sheet_name) ? "pms" : "tour_operator";
      const guessedReservationIdColumn = guessReservationIdColumn(sheet.sample_headers);

      nextConfigs[sheet.sheet_name] = {
        sheetName: sheet.sheet_name,
        enabled: true,
        sourceSystem: guessedSource,
        reservationIdColumn: guessedReservationIdColumn,
        useAiMapping: true,
        model: "gpt-5.4",
        mappingInstructions: DEFAULT_MAPPING_INSTRUCTIONS,
        sampleLimit: 800,
      };
      nextHeaders[sheet.sheet_name] = sheet.sample_headers;
      nextSamples[sheet.sheet_name] = sheet.sample_rows;
      nextOrder.push(sheet.sheet_name);
    }

    setSheetConfigs(nextConfigs);
    setSheetHeadersByName(nextHeaders);
    setSheetSampleRowsByName(nextSamples);
    setSheetOrder(nextOrder);
    setSheetImportResults([]);

    notifySuccess(`Created configuration cards for ${selected.length} sheet(s).`);
  }, [analyzedSheets, sheetSelection]);

  const updateSheetConfig = useCallback((sheetName: string, updater: (current: SheetImportConfig) => SheetImportConfig) => {
    setSheetConfigs((current) => {
      const existing = current[sheetName];
      if (!existing) return current;
      return { ...current, [sheetName]: updater(existing) };
    });
  }, []);

  const onImportSelectedSheets = useCallback(async () => {
    if (!wizardFile) {
      notifyInfo("Choose a workbook first.");
      return;
    }
    if (!selectedContractId || !selectedContract) {
      notifyInfo("Select a contract first.");
      return;
    }

    const selectedSheets = sheetOrder
      .map((sheetName) => sheetConfigs[sheetName])
      .filter((config): config is SheetImportConfig => Boolean(config?.enabled));

    if (!selectedSheets.length) {
      notifyInfo("Enable at least one configured sheet to import.");
      return;
    }

    setSheetImportResults([]);

    await runSheetImports(async () => {
      const settled = await Promise.allSettled(
        selectedSheets.map(async (config): Promise<SheetImportResult> => {
          try {
            let lines: ValidationLineInput[] = [];
            let mappingSummary: string | undefined;
            let analysisModel: string | undefined;
            let analysisUsage: Record<string, number> | undefined;

            if (config.useAiMapping) {
              const mapped = await mapSheetWithAi({
                file: wizardFile,
                contractId: selectedContractId,
                sheetName: config.sheetName,
                sourceSystem: config.sourceSystem,
                reservationIdColumn: config.reservationIdColumn || undefined,
                sampleLimit: config.sampleLimit,
                model: config.model,
                mappingInstructions: config.mappingInstructions,
              });
              lines = mapped.lines;
              mappingSummary = mapped.mapping_summary;
              analysisModel = mapped.analysis_model;
              analysisUsage = mapped.analysis_usage;
            } else {
              const preview = await previewSheetExtraction({
                file: wizardFile,
                contractId: selectedContractId,
                sheetName: config.sheetName,
                sampleLimit: config.sampleLimit,
              });
              lines = preview.lines;
              mappingSummary = "Imported with deterministic header mapping (non-AI mode).";
            }

            if (!lines.length) {
              return {
                sheetName: config.sheetName,
                success: false,
                message: "No valid reservation rows mapped for this sheet.",
                lineCount: 0,
              };
            }

            const persisted = await persistImportV2({
              fileName: wizardFile.name,
              contractId: selectedContractId,
              sheetName: config.sheetName,
              sourceSystem: config.sourceSystem,
              reservationIdColumn: config.reservationIdColumn || undefined,
              mappingSummary,
              analysisProvider: config.useAiMapping ? "openai" : undefined,
              analysisModel,
              analysisUsage,
              lines,
            });

            return {
              sheetName: config.sheetName,
              success: true,
              message: `Imported ${persisted.line_count} row(s).`,
              lineCount: persisted.line_count,
              importId: persisted.id,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Import failed.";
            return {
              sheetName: config.sheetName,
              success: false,
              message,
              lineCount: 0,
            };
          }
        }),
      );

      const results: SheetImportResult[] = settled.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        return {
          sheetName: selectedSheets[index]?.sheetName ?? `sheet-${index + 1}`,
          success: false,
          message: result.reason instanceof Error ? result.reason.message : "Import failed.",
          lineCount: 0,
        };
      });

      setSheetImportResults(results);
      const successCount = results.filter((item) => item.success).length;
      if (successCount > 0) notifySuccess(`Imported ${successCount} sheet(s) into Reconciliations V2.`);
      if (successCount < results.length) notifyInfo(`${results.length - successCount} sheet(s) need attention before re-import.`);

      await reloadPersistedData();
      setActiveTab("reservations");
    });
  }, [
    mapSheetWithAi,
    persistImportV2,
    previewSheetExtraction,
    reloadPersistedData,
    runSheetImports,
    selectedContract,
    selectedContractId,
    sheetConfigs,
    sheetOrder,
    wizardFile,
  ]);

  const onRunGroupValidation = useCallback(async (group: ReservationGroup) => {
    if (!selectedContractId) {
      notifyInfo("Choose a contract first.");
      return;
    }

    const syntheticReservationToRowId: Record<string, string> = {};
    const validationLines = group.rows.map((row, index) => {
      const syntheticReservationId = `${row.reservation_id}__${String(row.source_system || "unspecified").toUpperCase()}__${index + 1}`;
      syntheticReservationToRowId[syntheticReservationId] = row.id;
      return toValidationLine(row, syntheticReservationId);
    });

    setValidatingGroupKey(group.key);
    try {
      const run = await runValidationFromLines({
        contractId: selectedContractId,
        lines: validationLines,
        runLabel: `Reconciliations V2 · ${group.reservationId}`,
        toleranceAmount: 1,
        tolerancePercent: 1,
      });
      if (!run) return;

      const next: Record<string, ValidationLineResult> = {};
      for (const result of run.results) {
        const rowId = syntheticReservationToRowId[result.reservation_id];
        if (!rowId) continue;
        next[rowId] = result;
      }

      setGroupValidationByGroupKey((current) => ({
        ...current,
        [group.key]: next,
      }));
      setExpandedGroupKeys((current) => ({ ...current, [group.key]: true }));
    } finally {
      setValidatingGroupKey((current) => (current === group.key ? null : current));
    }
  }, [runValidationFromLines, selectedContractId]);

  const onRunAllGroupValidations = useCallback(async () => {
    if (!selectedContractId) {
      notifyInfo("Choose a contract first.");
      return;
    }

    const groupsToRun = displayReservationGroups.filter((group) => group.rows.length > 0);
    if (!groupsToRun.length) {
      notifyInfo("No reservation groups available for reconciliation.");
      return;
    }

    const syntheticReservationToLocation: Record<string, { groupKey: string; rowId: string }> = {};
    const validationLines: ValidationLineInput[] = [];

    for (const group of groupsToRun) {
      for (const [index, row] of group.rows.entries()) {
        const syntheticReservationId = `${group.key}__${String(row.source_system || "unspecified").toUpperCase()}__${index + 1}`;
        syntheticReservationToLocation[syntheticReservationId] = { groupKey: group.key, rowId: row.id };
        validationLines.push(toValidationLine(row, syntheticReservationId));
      }
    }

    if (!validationLines.length) {
      notifyInfo("No reservation rows found to validate.");
      return;
    }

    setRunningAllGroups(true);
    try {
      const run = await runValidationFromLines({
        contractId: selectedContractId,
        lines: validationLines,
        runLabel: `Reconciliations V2 · run all (${groupsToRun.length} groups)`,
        toleranceAmount: 1,
        tolerancePercent: 1,
      });
      if (!run) return;

      const groupedResults: Record<string, Record<string, ValidationLineResult>> = {};
      for (const result of run.results) {
        const location = syntheticReservationToLocation[result.reservation_id];
        if (!location) continue;
        if (!groupedResults[location.groupKey]) groupedResults[location.groupKey] = {};
        groupedResults[location.groupKey][location.rowId] = result;
      }

      setGroupValidationByGroupKey((current) => ({
        ...current,
        ...groupedResults,
      }));
      setExpandedGroupKeys((current) => {
        const next = { ...current };
        for (const group of groupsToRun) {
          next[group.key] = true;
        }
        return next;
      });
      notifySuccess(`Reconciliation completed for ${groupsToRun.length} group(s).`);
    } finally {
      setRunningAllGroups(false);
    }
  }, [displayReservationGroups, runValidationFromLines, selectedContractId]);

  const groupViewModalData = useMemo(() => {
    if (!groupViewModalKey) return null;
    const group = reservationGroups.find((item) => item.key === groupViewModalKey);
    if (!group) return null;
    const validationByRowId = groupValidationByGroupKey[group.key];
    if (!validationByRowId) return null;

    const validatedRows = sortGroupRows(group.rows)
      .map((row) => ({
        row,
        validation: validationByRowId[row.id],
      }))
      .filter((item): item is { row: ReconciliationReservation; validation: ValidationLineResult } => Boolean(item.validation));

    const sourceLabels = Array.from(new Set(validatedRows.map((item) => toSourceLabel(item.row.source_system))));
    const stayDates = Array.from(new Set(validatedRows.map((item) => item.row.stay_date))).sort((a, b) => a.localeCompare(b));

    const matrixByDateAndSource = new Map<
      string,
      {
        actual: number;
        expected: number;
        variance: number;
        count: number;
        mismatchCount: number;
      }
    >();
    const totalsByDate = new Map<
      string,
      {
        actual: number;
        expected: number;
        variance: number;
        count: number;
        mismatchCount: number;
        sources: Set<string>;
      }
    >();

    for (const item of validatedRows) {
      const sourceLabel = toSourceLabel(item.row.source_system);
      const key = `${item.row.stay_date}::${sourceLabel}`;
      const existing = matrixByDateAndSource.get(key) ?? { actual: 0, expected: 0, variance: 0, count: 0, mismatchCount: 0 };
      existing.actual += item.validation.actual_price;
      existing.expected += item.validation.expected_price;
      existing.variance += item.validation.variance_amount;
      existing.count += 1;
      if (item.validation.status === "mismatch") existing.mismatchCount += 1;
      matrixByDateAndSource.set(key, existing);

      const dateTotal = totalsByDate.get(item.row.stay_date) ?? {
        actual: 0,
        expected: 0,
        variance: 0,
        count: 0,
        mismatchCount: 0,
        sources: new Set<string>(),
      };
      dateTotal.actual += item.validation.actual_price;
      dateTotal.expected += item.validation.expected_price;
      dateTotal.variance += item.validation.variance_amount;
      dateTotal.count += 1;
      if (item.validation.status === "mismatch") dateTotal.mismatchCount += 1;
      dateTotal.sources.add(sourceLabel);
      totalsByDate.set(item.row.stay_date, dateTotal);
    }

    const perDayTotals = [...totalsByDate.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, summary]) => ({
        date,
        actual: summary.actual,
        expected: summary.expected,
        variance: summary.variance,
        count: summary.count,
        mismatchCount: summary.mismatchCount,
        sourceCount: summary.sources.size,
      }));

    return {
      group,
      validationByRowId,
      validatedRows,
      sourceLabels,
      stayDates,
      matrixByDateAndSource,
      perDayTotals,
      matchCount: validatedRows.filter((item) => item.validation.status === "match").length,
      mismatchCount: validatedRows.filter((item) => item.validation.status === "mismatch").length,
    };
  }, [groupValidationByGroupKey, groupViewModalKey, reservationGroups]);

  return (
    <>
      <PageShell
      title="Reconciliations V2"
      description="Append-only, multi-source reconciliation grouped by reservation reference. PMS rows act as primary baseline."
      actions={
        <Button type="button" variant="outline" onClick={() => reloadPersistedData()} disabled={!selectedContractId || loadingReservations || loadingImports}>
          <RefreshCw className={cn("mr-2 size-4", loadingReservations || loadingImports ? "animate-spin" : "")} />
          Refresh data
        </Button>
      }
    >
      <SectionCard title="Scope" description="Choose hotel and contract context before importing or comparing rows.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Hotel scope</Label>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              {selectedHotel ? `${selectedHotel.code} · ${selectedHotel.name}` : "All hotels selected"}
            </div>
            {!selectedHotel ? (
              <p className="text-xs text-amber-700">Select a specific hotel from sidebar for production-safe reconciliation imports.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Contract</Label>
            <Select value={selectedContractId} onValueChange={setSelectedContractId} disabled={loadingContracts || contracts.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={loadingContracts ? "Loading contracts..." : "Select contract"} />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>
                    {contract.file_name} · {contract.operator_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      <div className="rounded-xl border border-border/70 bg-muted/10 p-1.5">
        <div className="flex flex-wrap gap-1.5">
          {TAB_OPTIONS.map((tab) => (
            <Button
              key={tab.value}
              type="button"
              size="sm"
              variant={activeTab === tab.value ? "default" : "ghost"}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {activeTab === "import_wizard" ? (
        <SectionCard
          title="Import Wizard"
          description="Analyze workbook, multi-select the sheets you want, create config cards only for selected sheets, then import."
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label>Workbook file (.xlsx, .xlsm, .xls)</Label>
                <Input type="file" accept=".xlsx,.xlsm,.xls" onChange={(event) => setWizardFile(event.target.files?.[0] ?? null)} />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={onAnalyzeWorkbook} disabled={!wizardFile || !selectedContractId || workbookAnalyzing}>
                  {workbookAnalyzing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UploadCloud className="mr-2 size-4" />}
                  Analyze workbook
                </Button>
              </div>
            </div>

            {analyzedSheets.length ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Step 1: Select sheets to configure</p>
                  <Button type="button" size="sm" variant="outline" onClick={onCreateSelectedSheetConfigs}>
                    Create configs for selected sheets
                  </Button>
                </div>
                <div className="space-y-2">
                  {analyzedSheets.map((sheet) => (
                    <label key={sheet.sheet_name} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(sheetSelection[sheet.sheet_name])}
                          onChange={(event) =>
                            setSheetSelection((current) => ({
                              ...current,
                              [sheet.sheet_name]: event.target.checked,
                            }))
                          }
                        />
                        <span className="font-medium">{sheet.sheet_name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        confidence {(sheet.confidence * 100).toFixed(0)}% · rows {sheet.non_empty_rows}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {sheetOrder.length ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold">Step 2: Configure and import selected sheets</p>
                {sheetOrder.map((sheetName) => {
                  const config = sheetConfigs[sheetName];
                  if (!config) return null;
                  const headers = sheetHeadersByName[sheetName] ?? [];
                  const sampleRows = sheetSampleRowsByName[sheetName] ?? [];

                  return (
                    <div key={sheetName} className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{sheetName}</p>
                          <p className="text-xs text-muted-foreground">Only selected sheets have configuration cards.</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            onChange={(event) => updateSheetConfig(sheetName, (current) => ({ ...current, enabled: event.target.checked }))}
                          />
                          Include in import
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1.5">
                          <Label>Source system</Label>
                          <Select
                            value={config.sourceSystem}
                            onValueChange={(value) => updateSheetConfig(sheetName, (current) => ({ ...current, sourceSystem: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SOURCE_SYSTEM_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Reservation ID column</Label>
                          <Select
                            value={config.reservationIdColumn || "auto"}
                            onValueChange={(value) =>
                              updateSheetConfig(sheetName, (current) => ({
                                ...current,
                                reservationIdColumn: value === "auto" ? "" : value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto-detect</SelectItem>
                              {headers.map((header) => (
                                <SelectItem key={`${sheetName}-${header}`} value={header}>
                                  {header}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Sample limit</Label>
                          <Input
                            type="number"
                            min={50}
                            max={1200}
                            value={config.sampleLimit}
                            onChange={(event) =>
                              updateSheetConfig(sheetName, (current) => ({
                                ...current,
                                sampleLimit: Math.max(50, Math.min(1200, Number(event.target.value) || 250)),
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Mapping mode</Label>
                          <Select
                            value={config.useAiMapping ? "ai" : "deterministic"}
                            onValueChange={(value) => updateSheetConfig(sheetName, (current) => ({ ...current, useAiMapping: value === "ai" }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ai">AI mapping</SelectItem>
                              <SelectItem value="deterministic">Deterministic mapping</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {config.useAiMapping ? (
                        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                          <div className="space-y-1.5">
                            <Label>AI model</Label>
                            <Select
                              value={config.model}
                              onValueChange={(value) => updateSheetConfig(sheetName, (current) => ({ ...current, model: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AI_MODEL_OPTIONS.map((model) => (
                                  <SelectItem key={`${sheetName}-${model}`} value={model}>
                                    {model}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Sheet-specific mapping instructions</Label>
                            <Textarea
                              value={config.mappingInstructions}
                              rows={3}
                              onChange={(event) =>
                                updateSheetConfig(sheetName, (current) => ({ ...current, mappingInstructions: event.target.value }))
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {sampleRows.length ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Sample rows</Label>
                          <div className="overflow-x-auto rounded-md border border-border/70">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {(headers.length ? headers : sampleRows[0]?.map((_, idx) => `Column ${idx + 1}`) ?? []).map((header) => (
                                    <TableHead key={`${sheetName}-header-${header}`} className="whitespace-nowrap">
                                      {header}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sampleRows.slice(0, 3).map((row, rowIndex) => (
                                  <TableRow key={`${sheetName}-sample-${rowIndex}`}>
                                    {row.map((cell, cellIndex) => (
                                      <TableCell key={`${sheetName}-sample-${rowIndex}-${cellIndex}`} className="whitespace-nowrap text-xs">
                                        {cell || "-"}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={onImportSelectedSheets} disabled={importing || !selectedContractId || !wizardFile}>
                    {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                    Import selected sheets
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Import runs only for configured sheets that are enabled. Existing rows are preserved.
                  </p>
                </div>

                {sheetImportResults.length ? (
                  <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                    <p className="mb-2 text-sm font-semibold">Import Results</p>
                    <div className="space-y-2">
                      {sheetImportResults.map((result) => (
                        <div key={result.sheetName} className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant={result.success ? "outline" : "danger"}>{result.sheetName}</Badge>
                          <span className={cn(result.success ? "text-emerald-700" : "text-rose-700")}>{result.message}</span>
                          {result.importId ? <span className="text-xs text-muted-foreground">Import #{result.importId}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!analyzedSheets.length ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                Analyze a workbook first. Then select the sheets you want and create only those sheet configs.
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "reservations" ? (
        <>
          <SectionCard title="Imported Sources" description="All persisted imports for current contract. PMS rows should be imported with source system = PMS.">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{imports.length} import batch(es) loaded.</p>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setImportedSourcesCollapsed((current) => !current)}>
                    {importedSourcesCollapsed ? <ChevronRight className="mr-2 size-4" /> : <ChevronDown className="mr-2 size-4" />}
                    {importedSourcesCollapsed ? "Expand" : "Collapse"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => reloadPersistedData()} disabled={!selectedContractId || loadingImports}>
                    <RefreshCw className={cn("mr-2 size-4", loadingImports ? "animate-spin" : "")} />
                    Reload imports
                  </Button>
                </div>
              </div>
              {!importedSourcesCollapsed ? (
                <div className="overflow-x-auto rounded-lg border border-border/80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>File / Sheet</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead className="text-right">Rows</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {imports.length ? (
                        imports.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
                            <TableCell>
                              <p className="font-medium">{item.file_name}</p>
                              <p className="text-xs text-muted-foreground">{item.sheet_name}</p>
                            </TableCell>
                            <TableCell>{toSourceLabel(item.source_system)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.ingestion_mode || "v1_replace"}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{item.line_count}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-sm text-muted-foreground">
                            No imports found for this scope.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Reservation Groups"
            description="Grouped by reservation reference. Run reconciliation per group and expand rows for detailed variance analysis."
            contentClassName="space-y-4"
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Search reservation groups</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      className="pl-9"
                      placeholder="Reservation ID, source, file, room..."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Source filter</Label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {SOURCE_SYSTEM_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Reconciliation status</Label>
                  <Select value={groupStatusFilter} onValueChange={(value) => setGroupStatusFilter(value as GroupStatusFilter)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All groups</SelectItem>
                      <SelectItem value="reconciled_only">Reconciled only</SelectItem>
                      <SelectItem value="not_reconciled">Not reconciled</SelectItem>
                      <SelectItem value="complete_match">Complete match</SelectItem>
                      <SelectItem value="partial_match">Partial match</SelectItem>
                      <SelectItem value="mismatch">Mismatch</SelectItem>
                      <SelectItem value="no_pms_primary">No PMS primary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Sort groups by</Label>
                  <Select value={groupSortBy} onValueChange={(value) => setGroupSortBy(value as GroupSortBy)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Default priority</SelectItem>
                      <SelectItem value="mismatch_desc">Mismatch count (high to low)</SelectItem>
                      <SelectItem value="variance_abs_desc">Total variance (high to low)</SelectItem>
                      <SelectItem value="reconciled_desc">Reconciled rows (high to low)</SelectItem>
                      <SelectItem value="rows_desc">Total rows (high to low)</SelectItem>
                      <SelectItem value="reservation_asc">Reservation (A-Z)</SelectItem>
                      <SelectItem value="reservation_desc">Reservation (Z-A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {displayReservationGroups.length} grouped reservation(s)
                  {displayReservationGroups.length !== reservationGroups.length ? ` (filtered from ${reservationGroups.length})` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span>{reservationsTotal} total persisted row(s)</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onToggleAllDisplayedGroups}
                    disabled={!displayReservationGroups.length}
                    className="h-8"
                  >
                    {allDisplayedGroupsExpanded ? <ChevronDown className="mr-2 size-4" /> : <ChevronRight className="mr-2 size-4" />}
                    {allDisplayedGroupsExpanded ? "Collapse all" : "Expand all"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRunAllGroupValidations}
                    disabled={validating || runningAllGroups || !selectedContractId || !displayReservationGroups.length}
                    className="h-8"
                  >
                    {runningAllGroups ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}
                    Run all
                  </Button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[64px]">Expand</TableHead>
                      <TableHead>Reservation</TableHead>
                      <TableHead>Date range</TableHead>
                      <TableHead>Sources</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Reconciled</TableHead>
                      <TableHead className="text-right">Match</TableHead>
                      <TableHead className="text-right">Mismatch</TableHead>
                      <TableHead className="text-right">Variance total</TableHead>
                      <TableHead className="text-right">PMS rows</TableHead>
                      <TableHead className="text-right">Other rows</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayReservationGroups.length ? (
                      displayReservationGroups.map((group) => {
                        const isExpanded = Boolean(expandedGroupKeys[group.key]);
                        const validationByRowId = groupValidationByGroupKey[group.key];
                        const sortedRows = sortGroupRows(group.rows);
                        const statusSummary = groupSummaryByKey[group.key] ?? summarizeGroupValidation(group, validationByRowId);
                        const isGroupValidating = validating && validatingGroupKey === group.key;
                        const bookingBadge = groupBookingBadgeByKey[group.key];
                        const promotionBadges = groupPromotionBadgesByKey[group.key] ?? [];

                        return (
                          <Fragment key={group.key}>
                            <TableRow key={`${group.key}-summary`} className={cn(isExpanded ? "bg-muted/25" : undefined)}>
                              <TableCell>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() =>
                                    setExpandedGroupKeys((current) => ({
                                      ...current,
                                      [group.key]: !current[group.key],
                                    }))
                                  }
                                  aria-label={isExpanded ? "Collapse reconciliation detail" : "Expand reconciliation detail"}
                                >
                                  {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <p className="font-medium">{group.reservationId}</p>
                                <p className="text-xs text-muted-foreground">{group.key}</p>
                                {bookingBadge ? (
                                  <Badge
                                    variant="outline"
                                    className={cn("mt-1.5", bookingBadge.className)}
                                    title={bookingBadge.title}
                                  >
                                    {bookingBadge.label}
                                  </Badge>
                                ) : null}
                                {promotionBadges.length ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {promotionBadges.slice(0, 3).map((badge) => (
                                      <Badge
                                        key={`${group.key}-${badge.key}`}
                                        variant="outline"
                                        className={badge.className}
                                        title={badge.title}
                                      >
                                        {badge.label}
                                      </Badge>
                                    ))}
                                    {promotionBadges.length > 3 ? (
                                      <Badge variant="outline" className="border-border/70 bg-background text-muted-foreground">
                                        +{promotionBadges.length - 3} more
                                      </Badge>
                                    ) : null}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell>
                                {formatDate(group.firstStayDate)} - {formatDate(group.lastStayDate)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  {group.sourceSystems.map((source) => (
                                    <Badge key={`${group.key}-${source}`} variant="outline">
                                      {toSourceLabel(source)}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusSummary.variant} className={statusSummary.className}>
                                  {statusSummary.label}
                                </Badge>
                                {statusSummary.validatedCount ? (
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    mismatch rate {statusSummary.mismatchRatePercent.toFixed(1)}%
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right">{statusSummary.validatedCount}</TableCell>
                              <TableCell className="text-right">{statusSummary.matchCount}</TableCell>
                              <TableCell className="text-right">{statusSummary.mismatchCount}</TableCell>
                              <TableCell className={cn("text-right", statusSummary.varianceTotal === 0 ? "text-emerald-700" : "text-rose-700")}>
                                {statusSummary.varianceTotal >= 0 ? "+" : ""}
                                {formatMoney(statusSummary.varianceTotal)}
                              </TableCell>
                              <TableCell className="text-right">{group.pmsRows.length}</TableCell>
                              <TableCell className="text-right">{group.nonPmsRows.length}</TableCell>
                              <TableCell className="text-right">{group.rows.length}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setGroupViewModalKey(group.key)}
                                    disabled={!validationByRowId}
                                  >
                                    <Eye className="mr-2 size-4" />
                                    View
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onRunGroupValidation(group)}
                                    disabled={validating || !selectedContractId}
                                  >
                                    {isGroupValidating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileSpreadsheet className="mr-2 size-4" />}
                                    {validationByRowId ? "Re-run" : "Run"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {isExpanded ? (
                              <TableRow key={`${group.key}-detail`} className="bg-muted/15">
                                <TableCell colSpan={13} className="p-0">
                                  <div className="space-y-3 p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">Group key: {group.key}</Badge>
                                      <Badge variant={group.pmsRows.length ? "outline" : "danger"}>
                                        {group.pmsRows.length ? "PMS primary found" : "No PMS primary row"}
                                      </Badge>
                                      {!group.pmsRows.length ? (
                                        <span className="text-xs text-amber-700">
                                          Import at least one PMS source to create a reliable baseline for this group.
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="overflow-x-auto rounded-lg border border-border/70 bg-background">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Source</TableHead>
                                            <TableHead>Stay</TableHead>
                                            <TableHead>Room / Board</TableHead>
                                            <TableHead className="text-right">Actual</TableHead>
                                            <TableHead className="text-right">Expected</TableHead>
                                            <TableHead className="text-right">Variance</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Analysis</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {sortedRows.map((row) => {
                                            const isPms = String(row.source_system || "").toLowerCase() === "pms";
                                            const validation = validationByRowId?.[row.id];
                                            const variance = validation ? validation.variance_amount : undefined;

                                            return (
                                              <TableRow key={`${group.key}-${row.id}`} className={cn(isPms ? "bg-blue-50/40" : undefined)}>
                                                <TableCell>{isPms ? <Badge variant="outline">Primary (PMS)</Badge> : <Badge variant="muted">Reconciliation</Badge>}</TableCell>
                                                <TableCell>{toSourceLabel(row.source_system)}</TableCell>
                                                <TableCell>
                                                  <p>{formatDate(row.stay_date)}</p>
                                                  <p className="text-xs text-muted-foreground">{row.nights} night(s)</p>
                                                </TableCell>
                                                <TableCell>
                                                  <p>{row.room_type}</p>
                                                  <p className="text-xs text-muted-foreground">{row.board_type}</p>
                                                </TableCell>
                                                <TableCell className="text-right">{formatMoney(row.actual_price)}</TableCell>
                                                <TableCell className="text-right">{validation ? formatMoney(validation.expected_price) : "-"}</TableCell>
                                                <TableCell
                                                  className={cn(
                                                    "text-right",
                                                    variance == null ? "text-muted-foreground" : variance === 0 ? "text-emerald-700" : "text-rose-700",
                                                  )}
                                                >
                                                  {variance == null ? "-" : `${variance >= 0 ? "+" : ""}${formatMoney(variance)}`}
                                                </TableCell>
                                                <TableCell>
                                                  {validation ? (
                                                    <div className="space-y-1">
                                                      <Badge variant={validation.status === "mismatch" ? "danger" : "outline"}>{validation.status}</Badge>
                                                      {validation.applied_promotions.length ? (
                                                        <div className="flex flex-wrap gap-1">
                                                          {validation.applied_promotions.slice(0, 2).map((promotionName, index) => (
                                                            <Badge
                                                              key={`${row.id}-${promotionName}-${index}`}
                                                              variant="outline"
                                                              className="border-amber-200 bg-amber-50 text-amber-700"
                                                            >
                                                              {promotionName}
                                                            </Badge>
                                                          ))}
                                                          {validation.applied_promotions.length > 2 ? (
                                                            <Badge variant="outline" className="border-border/70 text-muted-foreground">
                                                              +{validation.applied_promotions.length - 2}
                                                            </Badge>
                                                          ) : null}
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  ) : (
                                                    <span className="text-xs text-muted-foreground">Not run</span>
                                                  )}
                                                </TableCell>
                                                <TableCell>
                                                  <div className="space-y-1">
                                                    <p className="text-xs">{row.file_name}</p>
                                                    <p className="text-[11px] text-muted-foreground">{row.sheet_name || "-"}</p>
                                                    {validation?.reason ? <p className="text-[11px] text-muted-foreground">{validation.reason}</p> : null}
                                                    {validation ? (
                                                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedAnalysisRow(validation)}>
                                                        View
                                                      </Button>
                                                    ) : (
                                                      <span className="text-[11px] text-muted-foreground">Run reconciliation to view analysis.</span>
                                                    )}
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>

                                    {validationByRowId ? (
                                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <CheckCircle2 className="size-4 text-emerald-700" />
                                          <span>Validation completed for {Object.keys(validationByRowId).length} row(s) in this reservation group.</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">
                                        Run reconciliation for this group to populate expected pricing analysis and variance status.
                                      </p>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={13} className="text-sm text-muted-foreground">
                          No reservation groups found for current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </SectionCard>
        </>
      ) : null}
      </PageShell>

      {selectedAnalysisRow
        ? createPortal(
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-4xl rounded-2xl border border-border/70 bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Expected Price Calculation</p>
                  <p className="text-xs text-muted-foreground">
                    Reservation {selectedAnalysisRow.reservation_id} · {formatDate(selectedAnalysisRow.stay_date)}
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedAnalysisRow(null)} aria-label="Close analysis details">
                  <X className="size-4" />
                </Button>
              </div>

              <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Expected</p>
                    <p className="text-lg font-semibold">{formatMoney(selectedAnalysisRow.expected_price)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <p className="text-lg font-semibold">{formatMoney(selectedAnalysisRow.actual_price)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Variance</p>
                    <p className={cn("text-lg font-semibold", selectedAnalysisRow.status === "mismatch" ? "text-rose-700" : "text-emerald-700")}>
                      {selectedAnalysisRow.variance_amount >= 0 ? "+" : ""}
                      {formatMoney(selectedAnalysisRow.variance_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedAnalysisRow.variance_percent.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Source {formatRateSource(selectedAnalysisRow.expected_calculation?.base_rate_source ?? null)}</Badge>
                    <Badge variant="outline">
                      Room/Board key{" "}
                      {selectedAnalysisRow.expected_calculation?.room_board_key ?? `${selectedAnalysisRow.room_type}::${selectedAnalysisRow.board_type}`}
                    </Badge>
                  </div>
                  {selectedAnalysisRow.expected_calculation?.source_details ? (
                    <p className="text-xs text-muted-foreground">{selectedAnalysisRow.expected_calculation.source_details}</p>
                  ) : null}
                  {selectedAnalysisRow.expected_calculation?.missing_base_rate_dates?.length ? (
                    <div className="rounded-md border border-rose-300 bg-rose-50/80 p-2 text-xs text-rose-800">
                      Missing price-list daily rates for: {selectedAnalysisRow.expected_calculation.missing_base_rate_dates.join(", ")}
                      {selectedAnalysisRow.expected_calculation.available_board_types?.length ? (
                        <span> Available board types: {selectedAnalysisRow.expected_calculation.available_board_types.join(", ")}</span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-md border border-border/70 bg-background p-3 text-sm">
                    <p>
                      Base rate {formatMoney(selectedAnalysisRow.expected_calculation?.base_rate ?? selectedAnalysisRow.expected_price / Math.max(selectedAnalysisRow.nights, 1))}
                      {selectedAnalysisRow.expected_calculation?.base_adult_units && selectedAnalysisRow.expected_calculation.base_adult_units > 1 ? (
                        <>
                          {" × Adults "}
                          {selectedAnalysisRow.expected_calculation.base_adult_units}
                        </>
                      ) : null}
                      {" × "}
                      Nights {selectedAnalysisRow.expected_calculation?.nights ?? selectedAnalysisRow.nights}
                      {" = "}
                      {formatMoney(
                        selectedAnalysisRow.expected_calculation?.base_subtotal ??
                          (selectedAnalysisRow.expected_calculation?.base_rate ?? selectedAnalysisRow.expected_price / Math.max(selectedAnalysisRow.nights, 1)) *
                            (selectedAnalysisRow.expected_calculation?.nights ?? selectedAnalysisRow.nights),
                      )}
                    </p>
                  </div>

                  {selectedAnalysisRow.expected_calculation?.nightly_base_rates?.length ? (
                    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p className="font-medium">Nightly base-rate allocation</p>
                      <div className="overflow-x-auto rounded-md border border-border/70">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Price-list Room</TableHead>
                              <TableHead className="text-right">Rate</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Period</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedAnalysisRow.expected_calculation.nightly_base_rates.slice(0, 14).map((item, index) => (
                              <TableRow key={`${item.date}-${item.source_key}-${index}`}>
                                <TableCell>{formatDate(item.date)}</TableCell>
                                <TableCell>
                                  <div className="min-w-[190px]">
                                    <p className="line-clamp-2">{item.pricelist_room_type || "-"}</p>
                                    {item.pricelist_board_type ? (
                                      <p className="text-xs text-muted-foreground">Board {item.pricelist_board_type}</p>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <p>{formatMoney(item.rate)}</p>
                                  {typeof item.base_adult_unit_rate === "number" ? (
                                    <p className="text-xs text-muted-foreground">
                                      {formatMoney(item.base_adult_unit_rate)} × {item.base_adult_units ?? 1}
                                      {typeof item.board_supplement_amount === "number" && item.board_supplement_amount !== 0
                                        ? ` + ${formatMoney(item.board_supplement_amount)}`
                                        : ""}
                                    </p>
                                  ) : null}
                                </TableCell>
                                <TableCell>{item.source}</TableCell>
                                <TableCell>{item.period_label || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {selectedAnalysisRow.expected_calculation.nightly_base_rates.length > 14 ? (
                        <p className="text-xs text-muted-foreground">
                          Showing first 14 nights out of {selectedAnalysisRow.expected_calculation.nightly_base_rates.length}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedAnalysisRow.expected_calculation?.guest_adjustments?.length ? (
                    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p className="font-medium">Guest rule adjustments</p>
                      {selectedAnalysisRow.expected_calculation.guest_adjustments.map((item, index) => (
                        <div key={`${item.guest_type}-${item.age_bucket}-${item.rule_name}-${index}`} className="rounded-md border border-border/60 p-2">
                          <p>
                            {item.guest_type === "adult_extra" ? "Extra adult" : "Child"} · {item.age_bucket} · {item.rule_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            unit {formatMoney(item.unit_rate)} × {item.units} unit(s) = {formatMoney(item.subtotal_amount)}
                            {" · positions "}
                            {item.guest_positions.join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : selectedAnalysisRow.expected_calculation?.child_discount?.applied ? (
                    <div className="rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p>
                        Child pricing adjustment ({selectedAnalysisRow.expected_calculation.child_discount.children_count} children,{" "}
                        {selectedAnalysisRow.expected_calculation.child_discount.discount_percent.toFixed(2)}%)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(selectedAnalysisRow.expected_calculation.child_discount.subtotal_before)} →{" "}
                        {formatMoney(selectedAnalysisRow.expected_calculation.child_discount.subtotal_after)}
                        {" (adjustment "}
                        {formatMoney(selectedAnalysisRow.expected_calculation.child_discount.adjustment_amount)}
                        )
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No extra guest adjustments were applied.</p>
                  )}

                  {selectedAnalysisRow.expected_calculation?.board_supplement_adjustments?.length ? (
                    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p className="font-medium">Board supplement adjustments</p>
                      {selectedAnalysisRow.expected_calculation.board_supplement_adjustments.map((item, index) => (
                        <div
                          key={`${item.target_board_type}-${item.source_board_type ?? "-"}-${item.rule_name}-${index}`}
                          className="rounded-md border border-border/60 p-2"
                        >
                          <p>
                            {item.source_board_type ? `${item.source_board_type} → ` : ""}
                            {item.target_board_type} · {item.rule_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            unit {formatMoney(item.unit_amount)} × {item.nights_applied} night(s) = {formatMoney(item.subtotal_amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedAnalysisRow.expected_calculation?.promotion_adjustments?.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Promotion adjustments</p>
                      {selectedAnalysisRow.expected_calculation.promotion_adjustments.map((promo, promoIndex) => (
                        <div key={`${promo.offer_name}-${promoIndex}`} className="rounded-md border border-border/70 bg-background p-3 text-sm">
                          <p>
                            {promo.offer_name} ({promo.discount_percent.toFixed(2)}%)
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(promo.subtotal_before)} → {formatMoney(promo.subtotal_after)}
                            {" (adjustment "}
                            {formatMoney(promo.adjustment_amount)}
                            )
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No promotions applied to this reservation line.</p>
                  )}

                  <div className="rounded-md border border-emerald-300 bg-emerald-50/60 p-3 text-sm">
                    <p className="font-medium">
                      Final expected price: {formatMoney(selectedAnalysisRow.expected_calculation?.final_expected_price ?? selectedAnalysisRow.expected_price)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <p className="text-sm font-medium">Applied rule tags</p>
                  {selectedAnalysisRow.applied_rules.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedAnalysisRow.applied_rules.map((rule, ruleIndex) => (
                        <Badge key={`${rule}-${ruleIndex}`} variant="outline">
                          {rule}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No rule tags recorded.</p>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      {groupViewModalData
        ? createPortal(
          <div className="fixed inset-0 z-[245] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
            <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Group Reconciliation View</p>
                  <p className="text-xs text-muted-foreground">
                    Reservation {groupViewModalData.group.reservationId} · {groupViewModalData.group.key}
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setGroupViewModalKey(null)} aria-label="Close group reconciliation view">
                  <X className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Reconciled rows</p>
                    <p className="text-lg font-semibold">{groupViewModalData.validatedRows.length}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-emerald-50/60 p-3">
                    <p className="text-xs text-emerald-700">Matches</p>
                    <p className="text-lg font-semibold text-emerald-700">{groupViewModalData.matchCount}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-rose-50/70 p-3">
                    <p className="text-xs text-rose-700">Mismatches</p>
                    <p className="text-lg font-semibold text-rose-700">{groupViewModalData.mismatchCount}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Source systems</p>
                    <p className="text-lg font-semibold">{groupViewModalData.sourceLabels.length}</p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <p className="text-sm font-medium">Per-Day Totals (All Reconciliations)</p>
                  <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Stay date</TableHead>
                          <TableHead className="text-right">Rows</TableHead>
                          <TableHead className="text-right">Sources</TableHead>
                          <TableHead className="text-right">Actual total</TableHead>
                          <TableHead className="text-right">Expected total</TableHead>
                          <TableHead className="text-right">Variance total</TableHead>
                          <TableHead className="text-right">Mismatch rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupViewModalData.perDayTotals.map((day) => (
                          <TableRow key={`day-total-${day.date}`}>
                            <TableCell className="font-medium">{formatDate(day.date)}</TableCell>
                            <TableCell className="text-right">{day.count}</TableCell>
                            <TableCell className="text-right">{day.sourceCount}</TableCell>
                            <TableCell className="text-right">{formatMoney(day.actual)}</TableCell>
                            <TableCell className="text-right">{formatMoney(day.expected)}</TableCell>
                            <TableCell className={cn("text-right", day.variance === 0 ? "text-emerald-700" : "text-rose-700")}>
                              {day.variance >= 0 ? "+" : ""}
                              {formatMoney(day.variance)}
                            </TableCell>
                            <TableCell className="text-right">{((day.mismatchCount / Math.max(day.count, 1)) * 100).toFixed(2)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <p className="text-sm font-medium">Reconciliation Matrix (Stay Date × Source)</p>
                  <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Stay date</TableHead>
                          {groupViewModalData.sourceLabels.map((source) => (
                            <TableHead key={`matrix-head-${source}`}>{source}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupViewModalData.stayDates.map((date) => (
                          <TableRow key={`matrix-date-${date}`}>
                            <TableCell className="font-medium">{formatDate(date)}</TableCell>
                            {groupViewModalData.sourceLabels.map((source) => {
                              const bucket = groupViewModalData.matrixByDateAndSource.get(`${date}::${source}`);
                              if (!bucket) {
                                return (
                                  <TableCell key={`matrix-cell-${date}-${source}`} className="text-xs text-muted-foreground">
                                    -
                                  </TableCell>
                                );
                              }

                              return (
                                <TableCell key={`matrix-cell-${date}-${source}`}>
                                  <div className="min-w-[170px] space-y-0.5 text-xs">
                                    <p>A {formatMoney(bucket.actual)}</p>
                                    <p>E {formatMoney(bucket.expected)}</p>
                                    <p className={cn(bucket.variance === 0 ? "text-emerald-700" : "text-rose-700")}>
                                      V {bucket.variance >= 0 ? "+" : ""}
                                      {formatMoney(bucket.variance)}
                                    </p>
                                    <p className="text-muted-foreground">
                                      {bucket.count} row(s) · {bucket.mismatchCount} mismatch
                                    </p>
                                  </div>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <p className="text-sm font-medium">Detailed Reconciled Rows</p>
                  <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead>Stay</TableHead>
                          <TableHead>Room / Board</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Analysis</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupViewModalData.validatedRows.map(({ row, validation }) => (
                          <TableRow key={`group-view-row-${row.id}`}>
                            <TableCell>{toSourceLabel(row.source_system)}</TableCell>
                            <TableCell>
                              <p>{formatDate(row.stay_date)}</p>
                              <p className="text-xs text-muted-foreground">{row.nights} night(s)</p>
                            </TableCell>
                            <TableCell>
                              <p>{row.room_type}</p>
                              <p className="text-xs text-muted-foreground">{row.board_type}</p>
                            </TableCell>
                            <TableCell className="text-right">{formatMoney(validation.actual_price)}</TableCell>
                            <TableCell className="text-right">{formatMoney(validation.expected_price)}</TableCell>
                            <TableCell className={cn("text-right", validation.variance_amount === 0 ? "text-emerald-700" : "text-rose-700")}>
                              {validation.variance_amount >= 0 ? "+" : ""}
                              {formatMoney(validation.variance_amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={validation.status === "mismatch" ? "danger" : "outline"}>
                                {validation.status === "mismatch" ? <AlertTriangle className="mr-1 size-3.5" /> : <CheckCircle2 className="mr-1 size-3.5" />}
                                {validation.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedAnalysisRow(validation)}>
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
