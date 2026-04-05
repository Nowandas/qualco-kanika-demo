import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, RefreshCw, Search, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

import type { ReconciliationAIMapping, ReconciliationWorkbookPreview, ValidationLineResult } from "@/api/types";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useReconciliations } from "@/features/hospitality/use-reconciliations";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyError, notifyInfo } from "@/lib/notify";
import { cn } from "@/lib/utils";

const SOURCE_SYSTEM_OPTIONS = [
  { value: "tour_operator", label: "Tour operator list" },
  { value: "pms", label: "PMS export" },
  { value: "accounting", label: "Accounting export" },
  { value: "other", label: "Other source" },
];

const AI_MODEL_OPTIONS = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.2", "gpt-4.1"];
const RESERVATIONS_PAGE_SIZE_OPTIONS = [25, 50, 100, 250];
type WizardStep = 1 | 2 | 3;

const WIZARD_STEPS: Array<{ step: WizardStep; title: string; description: string }> = [
  { step: 1, title: "Upload", description: "File and source setup" },
  { step: 2, title: "Select Sheet", description: "Choose table and map" },
  { step: 3, title: "Review & Persist", description: "Save mapped rows to database" },
];

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNumeric(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toSortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value && value.trim()))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );
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

function guessReservationIdColumn(headers: string[]): string {
  const candidates = headers
    .map((header) => header.trim())
    .filter((header) => header.length > 0);
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

function ResultsTable({ rows }: { rows: ValidationLineResult[] }) {
  const [selectedRow, setSelectedRow] = useState<ValidationLineResult | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No reconciliation lines match the current filters.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border/80">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reservation</TableHead>
              <TableHead>Stay</TableHead>
              <TableHead>Occupancy</TableHead>
              <TableHead>Room / Board</TableHead>
              <TableHead>Promo</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const mismatch = row.status === "mismatch";
              const variance = row.actual_price - row.expected_price;
              return (
                <TableRow
                  key={`${row.reservation_id}-${row.stay_date}-${row.room_type}-${row.board_type}-${index}`}
                  className={cn(mismatch ? "bg-rose-50/70 hover:bg-rose-50" : "bg-emerald-50/50 hover:bg-emerald-50/80")}
                >
                  <TableCell>
                    <p className="font-medium">{row.reservation_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.hotel_code} · {row.operator_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      booking {row.booking_code || row.reservation_id}
                      {row.booking_date ? ` · ${formatDate(row.booking_date)}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{formatDate(row.stay_date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.check_in_date ? formatDate(row.check_in_date) : "-"} → {row.check_out_date ? formatDate(row.check_out_date) : "-"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {row.pax_adults}A / {row.pax_children}C
                    </span>
                    <p className="text-xs text-muted-foreground">{row.nights} night(s)</p>
                  </TableCell>
                  <TableCell>
                    <p>{row.room_type}</p>
                    <p className="text-xs text-muted-foreground">{row.board_type}</p>
                  </TableCell>
                  <TableCell>{row.promo_code ? <Badge variant="outline">{row.promo_code}</Badge> : "-"}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.expected_price)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.actual_price)}</TableCell>
                  <TableCell className={cn("text-right font-medium", mismatch ? "text-rose-700" : "text-emerald-700")}>
                    {variance >= 0 ? "+" : ""}
                    {formatMoney(variance)}
                    <p className="text-[11px] text-muted-foreground">{row.variance_percent.toFixed(2)}%</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={mismatch ? "danger" : "outline"}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[24rem] text-xs text-muted-foreground">{row.reason}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRow(row)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedRow
        ? createPortal(
          <div className="fixed inset-0 z-[245] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-4xl rounded-2xl border border-border/70 bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Expected Price Calculation</p>
                  <p className="text-xs text-muted-foreground">
                    Reservation {selectedRow.reservation_id} · {formatDate(selectedRow.stay_date)}
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedRow(null)} aria-label="Close details">
                  <X className="size-4" />
                </Button>
              </div>

              <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">booking {selectedRow.booking_code || selectedRow.reservation_id}</Badge>
                  <Badge variant="outline">booking date {selectedRow.booking_date ? formatDate(selectedRow.booking_date) : "-"}</Badge>
                  <Badge variant="outline">
                    stay window {selectedRow.check_in_date ? formatDate(selectedRow.check_in_date) : "-"} →{" "}
                    {selectedRow.check_out_date ? formatDate(selectedRow.check_out_date) : "-"}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Expected</p>
                    <p className="text-lg font-semibold">{formatMoney(selectedRow.expected_price)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Actual</p>
                    <p className="text-lg font-semibold">{formatMoney(selectedRow.actual_price)}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Variance</p>
                    <p className={cn("text-lg font-semibold", selectedRow.status === "mismatch" ? "text-rose-700" : "text-emerald-700")}>
                      {selectedRow.variance_amount >= 0 ? "+" : ""}
                      {formatMoney(selectedRow.variance_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedRow.variance_percent.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      Source {formatRateSource(selectedRow.expected_calculation?.base_rate_source ?? null)}
                    </Badge>
                    <Badge variant="outline">
                      Room/Board key {selectedRow.expected_calculation?.room_board_key ?? `${selectedRow.room_type}::${selectedRow.board_type}`}
                    </Badge>
                  </div>
                  {selectedRow.expected_calculation?.source_details ? (
                    <p className="text-xs text-muted-foreground">{selectedRow.expected_calculation.source_details}</p>
                  ) : null}
                  {selectedRow.expected_calculation?.missing_base_rate_dates?.length ? (
                    <div className="rounded-md border border-rose-300 bg-rose-50/80 p-2 text-xs text-rose-800">
                      Missing price-list daily rates for: {selectedRow.expected_calculation.missing_base_rate_dates.join(", ")}
                      {selectedRow.expected_calculation.available_board_types?.length ? (
                        <span>
                          {" "}Available board types for same room/date: {selectedRow.expected_calculation.available_board_types.join(", ")}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rounded-md border border-border/70 bg-background p-3 text-sm">
                    <p>
                      Base rate {formatMoney(selectedRow.expected_calculation?.base_rate ?? selectedRow.expected_price / Math.max(selectedRow.nights, 1))}
                      {selectedRow.expected_calculation?.base_adult_units && selectedRow.expected_calculation.base_adult_units > 1 ? (
                        <>
                          {" × Adults "}
                          {selectedRow.expected_calculation.base_adult_units}
                        </>
                      ) : null}
                      {" × "}
                      Nights {selectedRow.expected_calculation?.nights ?? selectedRow.nights}
                      {" = "}
                      {formatMoney(
                        selectedRow.expected_calculation?.base_subtotal ??
                          (selectedRow.expected_calculation?.base_rate ?? selectedRow.expected_price / Math.max(selectedRow.nights, 1)) *
                            (selectedRow.expected_calculation?.nights ?? selectedRow.nights),
                      )}
                    </p>
                  </div>

                  {selectedRow.expected_calculation?.nightly_base_rates?.length ? (
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
                            {selectedRow.expected_calculation.nightly_base_rates.slice(0, 14).map((item, index) => (
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
                      {selectedRow.expected_calculation.nightly_base_rates.length > 14 ? (
                        <p className="text-xs text-muted-foreground">
                          Showing first 14 nights out of {selectedRow.expected_calculation.nightly_base_rates.length}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedRow.expected_calculation?.guest_adjustments?.length ? (
                    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p className="font-medium">Guest rule adjustments</p>
                      {selectedRow.expected_calculation.guest_adjustments.map((item, index) => (
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
                  ) : selectedRow.expected_calculation?.child_discount?.applied ? (
                    <div className="rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p>
                        Child pricing adjustment ({selectedRow.expected_calculation.child_discount.children_count} children,{" "}
                        {selectedRow.expected_calculation.child_discount.discount_percent.toFixed(2)}%)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(selectedRow.expected_calculation.child_discount.subtotal_before)} →{" "}
                        {formatMoney(selectedRow.expected_calculation.child_discount.subtotal_after)}
                        {" (adjustment "}
                        {formatMoney(selectedRow.expected_calculation.child_discount.adjustment_amount)}
                        )
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No extra guest adjustments were applied.</p>
                  )}

                  {selectedRow.expected_calculation?.board_supplement_adjustments?.length ? (
                    <div className="space-y-2 rounded-md border border-border/70 bg-background p-3 text-sm">
                      <p className="font-medium">Board supplement adjustments</p>
                      {selectedRow.expected_calculation.board_supplement_adjustments.map((item, index) => (
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

                  {selectedRow.expected_calculation?.promotion_adjustments?.length ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Promotion adjustments</p>
                      {selectedRow.expected_calculation.promotion_adjustments.map((promo, promoIndex) => (
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
                      Final expected price:{" "}
                      {formatMoney(selectedRow.expected_calculation?.final_expected_price ?? selectedRow.expected_price)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <p className="text-sm font-medium">Applied rule tags</p>
                  {selectedRow.applied_rules.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedRow.applied_rules.map((rule, ruleIndex) => (
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
    </>
  );
}

export function ReconciliationsPage() {
  const { selectedHotelId, selectedHotel } = useHotelScope();
  const {
    contracts,
    selectedContractId,
    setSelectedContractId,
    loadingContracts,
    busy,
    reservations,
    reservationsTotal,
    loadingReservations,
    lastValidationRun,
    refresh,
    previewWorkbook,
    mapWithAi,
    persistImport,
    loadReservations,
    queryReservations,
    deletePersistedReservation,
    deletePersistedReservations,
    runValidationFromLines,
  } = useReconciliations();

  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [wizardSourceSystem, setWizardSourceSystem] = useState("tour_operator");
  const [wizardModel, setWizardModel] = useState("gpt-5.4-mini");
  const [wizardMappingInstructions, setWizardMappingInstructions] = useState(
    "Map each reservation line to contract pricing validation fields. Infer board_type from meal plan names, normalize room names, preserve amounts, and only keep rows with reliable actual_price and stay_date.",
  );
  const [wizardWorkbookPreview, setWizardWorkbookPreview] = useState<ReconciliationWorkbookPreview | null>(null);
  const [wizardSelectedSheet, setWizardSelectedSheet] = useState("");
  const [wizardReservationIdColumn, setWizardReservationIdColumn] = useState("");
  const [wizardMapping, setWizardMapping] = useState<ReconciliationAIMapping | null>(null);
  const [tableRunLabel, setTableRunLabel] = useState("");
  const [tableToleranceAmount, setTableToleranceAmount] = useState("1.0");
  const [tableTolerancePercent, setTableTolerancePercent] = useState("1.0");
  const [reservationsSearchText, setReservationsSearchText] = useState("");
  const [reservationsRoomType, setReservationsRoomType] = useState("");
  const [reservationsBoardType, setReservationsBoardType] = useState("");
  const [reservationsSourceSystem, setReservationsSourceSystem] = useState("all");
  const [reservationsStartDate, setReservationsStartDate] = useState("");
  const [reservationsEndDate, setReservationsEndDate] = useState("");
  const [reservationsSortBy, setReservationsSortBy] = useState<"stay_date" | "actual_price" | "room_type" | "reservation_id" | "created_at">("stay_date");
  const [reservationsSortOrder, setReservationsSortOrder] = useState<"asc" | "desc">("desc");
  const [reservationsPage, setReservationsPage] = useState(1);
  const [reservationsPageSize, setReservationsPageSize] = useState(50);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "match" | "mismatch">("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [boardTypeFilter, setBoardTypeFilter] = useState("all");
  const [promotionFilter, setPromotionFilter] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<"variance_desc" | "variance_asc" | "stay_desc" | "stay_asc">("variance_desc");
  const [minAbsVariance, setMinAbsVariance] = useState("");

  const selectedContract = useMemo(
    () => contracts.find((item) => item.id === selectedContractId) ?? null,
    [contracts, selectedContractId],
  );

  const rows = lastValidationRun?.results ?? [];
  const roomTypeOptions = useMemo(() => toSortedUnique(rows.map((item) => item.room_type)), [rows]);
  const boardTypeOptions = useMemo(() => toSortedUnique(rows.map((item) => item.board_type)), [rows]);

  const filteredRows = useMemo(() => {
    const minVariance = parseNumeric(minAbsVariance, 0);
    const searched = rows.filter((row) => {
      const query = searchText.trim().toLowerCase();
      if (!query) return true;
      const haystack = [
        row.reservation_id,
        row.hotel_code,
        row.operator_code,
        row.room_type,
        row.board_type,
        row.reason,
        row.promo_code ?? "",
        row.applied_promotions.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const scoped = searched.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (roomTypeFilter !== "all" && row.room_type !== roomTypeFilter) return false;
      if (boardTypeFilter !== "all" && row.board_type !== boardTypeFilter) return false;
      const hasPromotion = Boolean(row.promo_code || row.applied_promotions.length);
      if (promotionFilter === "with" && !hasPromotion) return false;
      if (promotionFilter === "without" && hasPromotion) return false;
      if (Math.abs(row.variance_amount) < Math.abs(minVariance)) return false;
      return true;
    });

    return [...scoped].sort((left, right) => {
      if (sortBy === "variance_desc") {
        return Math.abs(right.variance_amount) - Math.abs(left.variance_amount);
      }
      if (sortBy === "variance_asc") {
        return Math.abs(left.variance_amount) - Math.abs(right.variance_amount);
      }
      const leftTime = new Date(`${left.stay_date}T00:00:00`).getTime();
      const rightTime = new Date(`${right.stay_date}T00:00:00`).getTime();
      if (sortBy === "stay_desc") {
        return rightTime - leftTime;
      }
      return leftTime - rightTime;
    });
  }, [rows, searchText, statusFilter, roomTypeFilter, boardTypeFilter, promotionFilter, minAbsVariance, sortBy]);

  const mismatchCount = lastValidationRun?.mismatch_count ?? 0;
  const matchCount = lastValidationRun?.match_count ?? 0;
  const mismatchRate = lastValidationRun?.mismatch_rate ?? 0;
  const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
  const selectedSheetPreview = useMemo(() => {
    if (!wizardWorkbookPreview || !wizardSelectedSheet) return null;
    return wizardWorkbookPreview.sheets.find((sheet) => sheet.sheet_name === wizardSelectedSheet) ?? null;
  }, [wizardSelectedSheet, wizardWorkbookPreview]);

  useEffect(() => {
    if (!selectedSheetPreview) {
      setWizardReservationIdColumn("");
      return;
    }
    const headers = selectedSheetPreview.sample_headers.filter((header) => header && header.trim());
    if (!headers.length) {
      setWizardReservationIdColumn("");
      return;
    }
    if (wizardReservationIdColumn && headers.includes(wizardReservationIdColumn)) {
      return;
    }
    setWizardReservationIdColumn(guessReservationIdColumn(headers));
  }, [selectedSheetPreview, wizardReservationIdColumn]);

  const reservationsPageCount = useMemo(
    () => Math.max(1, Math.ceil(reservationsTotal / reservationsPageSize)),
    [reservationsPageSize, reservationsTotal],
  );
  const reservationsRangeStart = reservationsTotal === 0 ? 0 : (reservationsPage - 1) * reservationsPageSize + 1;
  const reservationsRangeEnd = reservationsTotal === 0 ? 0 : Math.min(reservationsTotal, reservationsPage * reservationsPageSize);

  useEffect(() => {
    setReservationsPage((current) => Math.min(Math.max(1, current), reservationsPageCount));
  }, [reservationsPageCount]);

  useEffect(() => {
    setReservationsPage(1);
  }, [
    reservationsBoardType,
    reservationsEndDate,
    reservationsRoomType,
    reservationsSearchText,
    reservationsSortBy,
    reservationsSortOrder,
    reservationsSourceSystem,
    reservationsStartDate,
    reservationsPageSize,
    scopedHotelId,
    selectedContractId,
  ]);

  const loadPersistedReservations = useCallback(async () => {
    if (!selectedContractId) return;
    await loadReservations({
      contractId: selectedContractId,
      hotelId: scopedHotelId,
      searchText: reservationsSearchText.trim() || undefined,
      roomType: reservationsRoomType.trim() || undefined,
      boardType: reservationsBoardType.trim() || undefined,
      sourceSystem: reservationsSourceSystem !== "all" ? reservationsSourceSystem : undefined,
      startDate: reservationsStartDate || undefined,
      endDate: reservationsEndDate || undefined,
      sortBy: reservationsSortBy,
      sortOrder: reservationsSortOrder,
      limit: reservationsPageSize,
      offset: (reservationsPage - 1) * reservationsPageSize,
    });
  }, [
    loadReservations,
    reservationsBoardType,
    reservationsEndDate,
    reservationsPage,
    reservationsPageSize,
    reservationsRoomType,
    reservationsSearchText,
    reservationsSortBy,
    reservationsSortOrder,
    reservationsSourceSystem,
    reservationsStartDate,
    scopedHotelId,
    selectedContractId,
  ]);

  useEffect(() => {
    if (!selectedContractId) return;
    const timeout = window.setTimeout(() => {
      loadPersistedReservations().catch(() => null);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadPersistedReservations, selectedContractId]);

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep(1);
    setWizardFile(null);
    setWizardWorkbookPreview(null);
    setWizardSelectedSheet("");
    setWizardReservationIdColumn("");
    setWizardMapping(null);
  };

  const openWizard = () => {
    if (selectedHotelId === HOTEL_SCOPE_ALL || !selectedHotel) {
      notifyInfo("Select a hotel from the sidebar before running reconciliation.");
      return;
    }
    if (!selectedContractId) {
      notifyInfo("Select a contract first.");
      return;
    }
    setWizardStep(1);
    setWizardWorkbookPreview(null);
    setWizardSelectedSheet("");
    setWizardReservationIdColumn("");
    setWizardMapping(null);
    setWizardOpen(true);
  };

  const onAnalyzeWorkbook = async () => {
    if (!wizardFile) {
      notifyInfo("Select an Excel file first.");
      return;
    }
    if (!selectedContractId) {
      notifyInfo("Select a contract first.");
      return;
    }

    const preview = await previewWorkbook({
      file: wizardFile,
      contractId: selectedContractId,
      sampleRows: 6,
    });
    if (!preview) return;
    setWizardWorkbookPreview(preview);
    const suggestedSheetName = preview.suggested_sheet_name ?? preview.sheets[0]?.sheet_name ?? "";
    const selectedSheet = preview.sheets.find((sheet) => sheet.sheet_name === suggestedSheetName) ?? preview.sheets[0] ?? null;
    setWizardSelectedSheet(suggestedSheetName);
    setWizardReservationIdColumn(guessReservationIdColumn(selectedSheet?.sample_headers ?? []));
    setWizardMapping(null);
    setWizardStep(2);
  };

  const onGenerateAIMapping = async () => {
    if (!wizardFile || !selectedContractId || !wizardSelectedSheet) {
      notifyInfo("Upload workbook and select a sheet first.");
      return;
    }
    if (!wizardReservationIdColumn) {
      notifyInfo("Select the reservation ID column first.");
      return;
    }
    const mapping = await mapWithAi({
      file: wizardFile,
      contractId: selectedContractId,
      sheetName: wizardSelectedSheet,
      sourceSystem: wizardSourceSystem,
      reservationIdColumn: wizardReservationIdColumn || undefined,
      sampleLimit: 1000,
      model: wizardModel,
      mappingInstructions: wizardMappingInstructions,
    });
    if (!mapping) return;
    setWizardMapping(mapping);
    setWizardStep(3);
  };

  const onPersistImport = async () => {
    if (!wizardMapping || !selectedContractId) {
      notifyInfo("Generate AI mapping first.");
      return;
    }
    const persisted = await persistImport({
      fileName: wizardFile?.name ?? wizardMapping.file_name,
      contractId: selectedContractId,
      sheetName: wizardMapping.sheet_name,
      sourceSystem: wizardSourceSystem,
      reservationIdColumn: wizardReservationIdColumn || wizardMapping.reservation_id_column || undefined,
      mappingSummary: wizardMapping.mapping_summary,
      analysisProvider: wizardMapping.analysis_provider,
      analysisModel: wizardMapping.analysis_model,
      analysisUsage: wizardMapping.analysis_usage,
      lines: wizardMapping.lines,
    });
    if (!persisted) return;
    await loadPersistedReservations();
    closeWizard();
  };

  const onRunReconciliationFromPersisted = async () => {
    if (!selectedContractId) {
      notifyInfo("Select a contract first.");
      return;
    }
    let filteredBatch;
    try {
      filteredBatch = await queryReservations({
        contractId: selectedContractId,
        hotelId: scopedHotelId,
        searchText: reservationsSearchText.trim() || undefined,
        roomType: reservationsRoomType.trim() || undefined,
        boardType: reservationsBoardType.trim() || undefined,
        sourceSystem: reservationsSourceSystem !== "all" ? reservationsSourceSystem : undefined,
        startDate: reservationsStartDate || undefined,
        endDate: reservationsEndDate || undefined,
        sortBy: reservationsSortBy,
        sortOrder: reservationsSortOrder,
        limit: 1000,
        offset: 0,
      });
    } catch (error) {
      notifyError(error, "Could not load filtered reservations for reconciliation.");
      return;
    }

    const selectedRows = filteredBatch.items;
    if (!selectedRows.length) {
      notifyInfo("No persisted reservation rows found for the current filters.");
      return;
    }
    if (filteredBatch.total > 1000) {
      notifyInfo("Using the first 1000 filtered rows due validation batch limit.");
    }
    const lines = selectedRows.map((row) => ({
      reservation_id: row.reservation_id,
      booking_code: row.booking_code ?? row.reservation_id,
      booking_date: row.booking_date ?? undefined,
      hotel_code: row.hotel_code,
      operator_code: row.operator_code,
      contract_id: row.contract_id,
      room_type: row.room_type,
      board_type: row.board_type,
      check_in_date: row.check_in_date ?? undefined,
      check_out_date: row.check_out_date ?? undefined,
      stay_date: row.stay_date,
      nights: row.nights,
      pax_adults: row.pax_adults,
      pax_children: row.pax_children,
      actual_price: row.actual_price,
      contract_rate: row.contract_rate ?? undefined,
      promo_code: row.promo_code ?? undefined,
    }));
    await runValidationFromLines({
      contractId: selectedContractId,
      lines,
      runLabel: tableRunLabel.trim() || "Reconciliation from persisted reservations",
      toleranceAmount: parseNumeric(tableToleranceAmount, 1.0),
      tolerancePercent: parseNumeric(tableTolerancePercent, 1.0),
    });
  };

  const onDeletePersistedReservation = useCallback(async (rowId: string, reservationId: string) => {
    const confirmed = window.confirm(
      `Delete imported reservation ${reservationId}? This will remove it from persisted reconciliation rows.`,
    );
    if (!confirmed) return;
    const deleted = await deletePersistedReservation(rowId);
    if (!deleted?.deleted) return;
    await loadPersistedReservations();
  }, [deletePersistedReservation, loadPersistedReservations]);

  const onDeleteFilteredReservations = useCallback(async () => {
    if (!selectedContractId) {
      notifyInfo("Select a contract first.");
      return;
    }
    if (reservationsTotal <= 0) {
      notifyInfo("No imported rows to delete for the current filters.");
      return;
    }
    const confirmed = window.confirm(
      `Delete all ${reservationsTotal} imported reservation row(s) that match the current filters? This action cannot be undone.`,
    );
    if (!confirmed) return;
    const deleted = await deletePersistedReservations({
      contractId: selectedContractId,
      hotelId: scopedHotelId,
      searchText: reservationsSearchText.trim() || undefined,
      roomType: reservationsRoomType.trim() || undefined,
      boardType: reservationsBoardType.trim() || undefined,
      sourceSystem: reservationsSourceSystem !== "all" ? reservationsSourceSystem : undefined,
      startDate: reservationsStartDate || undefined,
      endDate: reservationsEndDate || undefined,
    });
    if (!deleted) return;
    setReservationsPage(1);
    await loadPersistedReservations();
  }, [
    deletePersistedReservations,
    loadPersistedReservations,
    reservationsBoardType,
    reservationsEndDate,
    reservationsRoomType,
    reservationsSearchText,
    reservationsSourceSystem,
    reservationsStartDate,
    reservationsTotal,
    scopedHotelId,
    selectedContractId,
  ]);

  return (
    <>
      <PageShell
        title="Reconciliations"
        description="Upload reservation lists per hotel, map source columns with AI, and validate charged prices against contract price lists and imported promotions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refresh()} disabled={loadingContracts || busy}>
              <RefreshCw className="mr-1.5 size-4" />
              Refresh
            </Button>
            <Button onClick={openWizard} disabled={loadingContracts || busy || !selectedContractId}>
              <Sparkles className="mr-1.5 size-4" />
              Open Reconciliation Wizard
            </Button>
          </div>
        }
      >
        <SectionCard title="Scope" description="Run reconciliation for the selected hotel and contract.">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Hotel scope</Label>
              <Input value={selectedHotel ? `${selectedHotel.name} (${selectedHotel.code})` : "Select hotel from sidebar"} disabled />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Contract</Label>
              <Select value={selectedContractId} onValueChange={setSelectedContractId} disabled={loadingContracts || contracts.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingContracts ? "Loading contracts..." : "Select contract"} />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.file_name} · {contract.operator_code} · {contract.hotel_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedHotelId === HOTEL_SCOPE_ALL ? (
            <p className="mt-3 text-xs text-amber-700">
              Select a specific hotel from the sidebar dropdown to run reconciliation uploads.
            </p>
          ) : null}
          {selectedContract ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{selectedContract.file_name}</Badge>
              <Badge variant="outline">{selectedContract.operator_code}</Badge>
              <Badge variant="outline">{selectedContract.season_label ?? "No season label"}</Badge>
              <Badge variant="outline">{selectedContract.source}</Badge>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Imported Reservations" description="Persisted reservation rows imported from Excel, with server-side search, filtering, and sorting.">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5 xl:col-span-2">
                <Label>Search</Label>
                <Input
                  value={reservationsSearchText}
                  onChange={(event) => setReservationsSearchText(event.target.value)}
                  placeholder="Reservation, room, board, file, promo..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Room type</Label>
                <Input value={reservationsRoomType} onChange={(event) => setReservationsRoomType(event.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Board type</Label>
                <Input value={reservationsBoardType} onChange={(event) => setReservationsBoardType(event.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Source system</Label>
                <Select value={reservationsSourceSystem} onValueChange={setReservationsSourceSystem}>
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
                <Label>Stay date from</Label>
                <Input type="date" value={reservationsStartDate} onChange={(event) => setReservationsStartDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Stay date to</Label>
                <Input type="date" value={reservationsEndDate} onChange={(event) => setReservationsEndDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort by</Label>
                <Select value={reservationsSortBy} onValueChange={(value) => setReservationsSortBy(value as typeof reservationsSortBy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stay_date">Stay date</SelectItem>
                    <SelectItem value="actual_price">Actual price</SelectItem>
                    <SelectItem value="room_type">Room type</SelectItem>
                    <SelectItem value="reservation_id">Reservation id</SelectItem>
                    <SelectItem value="created_at">Imported at</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Order</Label>
                <Select value={reservationsSortOrder} onValueChange={(value) => setReservationsSortOrder(value as typeof reservationsSortOrder)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => loadPersistedReservations()} disabled={loadingReservations || busy || !selectedContractId}>
                {loadingReservations ? "Loading..." : "Load persisted rows"}
              </Button>
              <Button type="button" onClick={onRunReconciliationFromPersisted} disabled={busy || loadingReservations || reservationsTotal === 0}>
                Run Reconciliation For Current Filters
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void onDeleteFilteredReservations()}
                disabled={busy || loadingReservations || reservationsTotal === 0}
              >
                <Trash2 className="mr-1.5 size-4" />
                Delete Filtered Rows
              </Button>
              <Badge variant="outline">total {reservationsTotal}</Badge>
              <Badge variant="outline">showing {reservationsRangeStart}-{reservationsRangeEnd}</Badge>
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Rows per page</Label>
                <Select
                  value={String(reservationsPageSize)}
                  onValueChange={(value) => {
                    const next = Number(value);
                    if (Number.isFinite(next)) {
                      setReservationsPageSize(next);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[7rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESERVATIONS_PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Run label</Label>
                <Input value={tableRunLabel} onChange={(event) => setTableRunLabel(event.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Tolerance amount</Label>
                <Input value={tableToleranceAmount} onChange={(event) => setTableToleranceAmount(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tolerance percent</Label>
                <Input value={tableTolerancePercent} onChange={(event) => setTableTolerancePercent(event.target.value)} />
              </div>
            </div>

            {loadingReservations ? (
              <p className="text-sm text-muted-foreground">Loading persisted reservation rows...</p>
            ) : reservations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No persisted rows found for the current filters.</p>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-lg border border-border/80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reservation</TableHead>
                        <TableHead>Booking Date</TableHead>
                        <TableHead>Stay Date</TableHead>
                        <TableHead>Check-In</TableHead>
                        <TableHead>Check-Out</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Board</TableHead>
                        <TableHead>Guests</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Contract</TableHead>
                        <TableHead>Promo</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservations.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <p>{row.reservation_id}</p>
                            <p className="text-xs text-muted-foreground">booking {row.booking_code ?? row.reservation_id}</p>
                          </TableCell>
                          <TableCell>{row.booking_date ? formatDate(row.booking_date) : "-"}</TableCell>
                          <TableCell>{formatDate(row.stay_date)}</TableCell>
                          <TableCell>{row.check_in_date ? formatDate(row.check_in_date) : "-"}</TableCell>
                          <TableCell>{row.check_out_date ? formatDate(row.check_out_date) : "-"}</TableCell>
                          <TableCell>{row.room_type}</TableCell>
                          <TableCell>{row.board_type}</TableCell>
                          <TableCell>
                            {row.pax_adults}A/{row.pax_children}C · {row.nights}N
                          </TableCell>
                          <TableCell className="text-right">{formatMoney(row.actual_price)}</TableCell>
                          <TableCell className="text-right">{row.contract_rate != null ? formatMoney(row.contract_rate) : "-"}</TableCell>
                          <TableCell>{row.promo_code ? <Badge variant="outline">{row.promo_code}</Badge> : "-"}</TableCell>
                          <TableCell>{row.source_system ?? "-"}</TableCell>
                          <TableCell className="max-w-[16rem] truncate">{row.file_name}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => void onDeletePersistedReservation(row.id, row.reservation_id)}
                              disabled={busy || loadingReservations}
                            >
                              <Trash2 className="mr-1.5 size-3.5" />
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Page {reservationsPage} of {reservationsPageCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReservationsPage((current) => Math.max(1, current - 1))}
                      disabled={loadingReservations || reservationsPage <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReservationsPage((current) => Math.min(reservationsPageCount, current + 1))}
                      disabled={loadingReservations || reservationsPage >= reservationsPageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Search and Filters" description="Search is always visible. Expand filters for advanced slicing of reconciliation output.">
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="reconciliation-search">Search results</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="reconciliation-search"
                    className="pl-9"
                    placeholder="Search reservation, room, board, promo, reason..."
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                </div>
              </div>
              <Button variant="outline" type="button" onClick={() => setFiltersCollapsed((previous) => !previous)} className="justify-between">
                {filtersCollapsed ? "Show filters" : "Hide filters"}
                <ChevronDown className={`ml-2 size-4 transition-transform ${filtersCollapsed ? "" : "rotate-180"}`} />
              </Button>
            </div>

            {!filtersCollapsed ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="match">Match</SelectItem>
                      <SelectItem value="mismatch">Mismatch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Room type</Label>
                  <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All room types</SelectItem>
                      {roomTypeOptions.map((room) => (
                        <SelectItem key={room} value={room}>
                          {room}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Board type</Label>
                  <Select value={boardTypeFilter} onValueChange={setBoardTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All board types</SelectItem>
                      {boardTypeOptions.map((board) => (
                        <SelectItem key={board} value={board}>
                          {board}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Promotion scope</Label>
                  <Select value={promotionFilter} onValueChange={(value) => setPromotionFilter(value as typeof promotionFilter)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All lines</SelectItem>
                      <SelectItem value="with">With promotions</SelectItem>
                      <SelectItem value="without">Without promotions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Min absolute variance</Label>
                  <Input value={minAbsVariance} onChange={(event) => setMinAbsVariance(event.target.value)} placeholder="e.g. 5" />
                </div>

                <div className="space-y-1.5">
                  <Label>Sort by</Label>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="variance_desc">Variance (high to low)</SelectItem>
                      <SelectItem value="variance_asc">Variance (low to high)</SelectItem>
                      <SelectItem value="stay_desc">Stay date (newest)</SelectItem>
                      <SelectItem value="stay_asc">Stay date (oldest)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Reconciliation Results" description="Color-coded output from the latest run. Red rows are mismatches that need review.">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">lines {rows.length}</Badge>
            <Badge variant="outline">matches {matchCount}</Badge>
            <Badge variant="outline">mismatches {mismatchCount}</Badge>
            <Badge variant="outline">mismatch rate {mismatchRate.toFixed(2)}%</Badge>
            {lastValidationRun?.run_label ? <Badge variant="outline">{lastValidationRun.run_label}</Badge> : null}
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <SlidersHorizontal className="size-4" />
            <span>{filteredRows.length} rows after filters</span>
            <Badge variant="outline" className="ml-2 border-emerald-300 bg-emerald-100/70 text-emerald-900">
              <CheckCircle2 className="mr-1 size-3.5" />
              Match
            </Badge>
            <Badge variant="outline" className="border-rose-300 bg-rose-100/80 text-rose-900">
              <AlertTriangle className="mr-1 size-3.5" />
              Mismatch
            </Badge>
          </div>

          <ResultsTable rows={filteredRows} />
        </SectionCard>
      </PageShell>

      {wizardOpen
        ? createPortal(
          <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Reconciliation Wizard</p>
                  <p className="text-xs text-muted-foreground">
                    Step {wizardStep} of 3
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={closeWizard} aria-label="Close reconciliation wizard">
                  <X className="size-4" />
                </Button>
              </div>

              <div className="border-b border-border/70 px-4 py-3">
                <div className="grid gap-2 md:grid-cols-3">
                  {WIZARD_STEPS.map((item) => {
                    const active = wizardStep === item.step;
                    const complete = wizardStep > item.step;
                    return (
                      <button
                        type="button"
                        key={item.step}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          active ? "border-primary bg-primary/5" : "border-border/70",
                          complete ? "border-emerald-300 bg-emerald-50/70" : "",
                        )}
                        onClick={() => {
                          if (item.step <= wizardStep) {
                            setWizardStep(item.step);
                          }
                        }}
                        disabled={item.step > wizardStep}
                      >
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
                            active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            complete ? "border-emerald-500 bg-emerald-500 text-white" : "",
                          )}
                        >
                          {item.step}
                        </span>
                        <span className="leading-tight">
                          <span className="block text-xs font-semibold">{item.title}</span>
                          <span className="block text-[11px] text-muted-foreground">{item.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex h-[70vh] min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {wizardStep === 1 ? (
                    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label>Reservation file (Excel)</Label>
                          <Input
                            type="file"
                            accept=".xlsx,.xlsm,.xls"
                            onChange={(event) => setWizardFile(event.target.files?.[0] ?? null)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Source system</Label>
                          <Select value={wizardSourceSystem} onValueChange={setWizardSourceSystem}>
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
                          <Label>AI model</Label>
                          <Select value={wizardModel} onValueChange={setWizardModel}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AI_MODEL_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Mapping instructions</Label>
                        <Textarea
                          value={wizardMappingInstructions}
                          onChange={(event) => setWizardMappingInstructions(event.target.value)}
                          rows={5}
                          placeholder="Optional mapping instructions for AI."
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">Hotel: {selectedHotel?.code ?? "-"}</Badge>
                        <Badge variant="outline">Contract: {selectedContract?.file_name ?? "-"}</Badge>
                      </div>
                    </div>
                  ) : null}

                  {wizardStep === 2 ? (
                    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                      {!wizardWorkbookPreview ? (
                        <p className="text-sm text-muted-foreground">Analyze a workbook in Step 1 to continue.</p>
                      ) : (
                        <>
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-1.5">
                              <Label>Sheet</Label>
                              <Select value={wizardSelectedSheet} onValueChange={setWizardSelectedSheet}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {wizardWorkbookPreview.sheets.map((sheet) => (
                                    <SelectItem key={sheet.sheet_name} value={sheet.sheet_name}>
                                      {sheet.sheet_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Unique reservation ID column</Label>
                              <Select
                                value={wizardReservationIdColumn}
                                onValueChange={setWizardReservationIdColumn}
                                disabled={!selectedSheetPreview?.sample_headers?.length}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from(
                                    new Set((selectedSheetPreview?.sample_headers ?? []).map((header) => header.trim()).filter((header) => header.length > 0)),
                                  )
                                    .map((header) => (
                                      <SelectItem key={header} value={header}>
                                        {header}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end gap-2">
                              <Badge variant="outline">sheets {wizardWorkbookPreview.sheet_count}</Badge>
                              <Badge variant="outline">suggested {wizardWorkbookPreview.suggested_sheet_name ?? "-"}</Badge>
                            </div>
                          </div>

                          {selectedSheetPreview ? (
                            <div className="space-y-3 rounded-lg border border-border/70 bg-background p-3">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                  rows {selectedSheetPreview.non_empty_rows}/{selectedSheetPreview.total_rows}
                                </span>
                                <span>·</span>
                                <span>cols {selectedSheetPreview.column_count}</span>
                                <span>·</span>
                                <span>confidence {selectedSheetPreview.confidence}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                detected fields: {selectedSheetPreview.detected_fields.length ? selectedSheetPreview.detected_fields.join(", ") : "none"}
                              </p>
                              {selectedSheetPreview.sample_headers.length ? (
                                <div className="overflow-x-auto rounded-md border border-border/60">
                                  <table className="min-w-full text-xs">
                                    <thead className="bg-muted/40">
                                      <tr>
                                        {selectedSheetPreview.sample_headers.slice(0, 8).map((header, index) => (
                                          <th key={`selected-h-${index}`} className="px-2 py-1 text-left font-medium">
                                            {header}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {selectedSheetPreview.sample_rows.slice(0, 5).map((row, rowIndex) => (
                                        <tr key={`selected-r-${rowIndex}`} className="border-t border-border/50">
                                          {row.slice(0, 8).map((cell, cellIndex) => (
                                            <td key={`selected-c-${rowIndex}-${cellIndex}`} className="px-2 py-1">
                                              {cell || "-"}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}

                  {wizardStep === 3 ? (
                    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/20 p-4">
                      {!wizardMapping ? (
                        <p className="text-sm text-muted-foreground">Generate AI mapping in Step 2 to continue.</p>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className="max-w-full break-all">sheet {wizardMapping.sheet_name}</Badge>
                            <Badge variant="outline">mapped lines {wizardMapping.line_count}</Badge>
                            <Badge variant="outline" className="max-w-full break-all">
                              id column {wizardReservationIdColumn || wizardMapping.reservation_id_column || "-"}
                            </Badge>
                            <Badge variant="outline" className="max-w-full break-all">model {wizardMapping.analysis_model}</Badge>
                          </div>
                          <p className="break-words text-sm">{wizardMapping.mapping_summary}</p>

                          {Object.keys(wizardMapping.header_mapping).length ? (
                            <div className="overflow-x-auto rounded-md border border-border/70">
                              <table className="min-w-full text-xs">
                                <thead className="bg-muted/40">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Target field</th>
                                    <th className="px-2 py-1 text-left">Source column</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(wizardMapping.header_mapping).slice(0, 12).map(([target, source]) => (
                                    <tr key={target} className="border-t border-border/50">
                                      <td className="px-2 py-1 font-medium">{target}</td>
                                      <td className="break-all px-2 py-1">{source}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}

                          <p className="text-xs text-muted-foreground">
                            Persist this mapped dataset first. Then use the “Imported Reservations” table filters (date, room type, search, sort)
                            and run reconciliation on the selected subset.
                          </p>

                          <div className="overflow-x-auto rounded-md border border-border/70">
                            <table className="min-w-full text-xs">
                              <thead className="bg-muted/40">
                                <tr>
                                  <th className="px-2 py-1 text-left">Reservation</th>
                                  <th className="px-2 py-1 text-left">Booking Date</th>
                                  <th className="px-2 py-1 text-left">Stay Date</th>
                                  <th className="px-2 py-1 text-left">Check-In</th>
                                  <th className="px-2 py-1 text-left">Check-Out</th>
                                  <th className="px-2 py-1 text-left">Room</th>
                                  <th className="px-2 py-1 text-left">Board</th>
                                  <th className="px-2 py-1 text-right">Actual</th>
                                  <th className="px-2 py-1 text-left">Occupancy</th>
                                </tr>
                              </thead>
                              <tbody>
                                {wizardMapping.lines.slice(0, 10).map((line, index) => (
                                  <tr key={`${line.reservation_id}-${line.stay_date}-${index}`} className="border-t border-border/50">
                                    <td className="break-all px-2 py-1">
                                      <p>{line.reservation_id}</p>
                                      <p className="text-[11px] text-muted-foreground">booking {line.booking_code ?? line.reservation_id}</p>
                                    </td>
                                    <td className="break-words px-2 py-1">{line.booking_date ?? "-"}</td>
                                    <td className="break-words px-2 py-1">{line.stay_date}</td>
                                    <td className="break-words px-2 py-1">{line.check_in_date ?? "-"}</td>
                                    <td className="break-words px-2 py-1">{line.check_out_date ?? "-"}</td>
                                    <td className="break-words px-2 py-1">{line.room_type}</td>
                                    <td className="break-words px-2 py-1">{line.board_type}</td>
                                    <td className="px-2 py-1 text-right">{formatMoney(line.actual_price)}</td>
                                    <td className="px-2 py-1">
                                      {line.pax_adults}A/{line.pax_children}C · {line.nights}N
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWizardStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current))}
                    disabled={wizardStep === 1 || busy}
                  >
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" onClick={closeWizard} disabled={busy}>
                      Cancel
                    </Button>
                    {wizardStep === 1 ? (
                      <Button type="button" onClick={onAnalyzeWorkbook} disabled={busy || !wizardFile}>
                        <FileSpreadsheet className="mr-1.5 size-4" />
                        {busy ? "Analyzing..." : "Analyze & Continue"}
                      </Button>
                    ) : null}
                    {wizardStep === 2 ? (
                      <Button type="button" onClick={onGenerateAIMapping} disabled={busy || !wizardSelectedSheet || !wizardFile || !wizardReservationIdColumn}>
                        <Sparkles className="mr-1.5 size-4" />
                        {busy ? "Mapping..." : "Map with AI & Continue"}
                      </Button>
                    ) : null}
                    {wizardStep === 3 ? (
                      <Button type="button" onClick={onPersistImport} disabled={busy || !wizardMapping}>
                        {busy ? "Persisting..." : "Persist Import"}
                      </Button>
                    ) : null}
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
