import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, FileUp, Filter, RefreshCw, Sparkles } from "lucide-react";

import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePriceListCalendar } from "@/features/hospitality/use-price-list-calendar";
import { cn } from "@/lib/utils";

function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

export function PriceListsCalendarPage() {
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [offerFile, setOfferFile] = useState<File | null>(null);
  const [offerOperatorCode, setOfferOperatorCode] = useState("EASYJET");
  const [contractSearch, setContractSearch] = useState("");
  const [selectedImpactContractIds, setSelectedImpactContractIds] = useState<string[]>([]);

  const {
    contracts,
    selectedContractId,
    setSelectedContractId,
    matrix,
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
  } = usePriceListCalendar();

  useEffect(() => {
    setSelectedImpactContractIds((previous) => {
      const availableIds = new Set(contracts.map((contract) => contract.id));
      const filtered = previous.filter((id) => availableIds.has(id));
      if (filtered.length > 0) {
        return filtered;
      }
      return selectedContractId ? [selectedContractId] : [];
    });
  }, [contracts, selectedContractId]);

  const filteredContractsForImpact = useMemo(() => {
    const query = contractSearch.trim().toLowerCase();
    if (!query) return contracts;
    return contracts.filter((contract) => {
      const haystack = `${contract.file_name} ${contract.operator_code} ${contract.hotel_code} ${contract.season_label ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [contractSearch, contracts]);

  const onToggleImpactContract = (contractId: string, checked: boolean) => {
    setSelectedImpactContractIds((previous) => {
      if (checked) {
        if (previous.includes(contractId)) return previous;
        return [...previous, contractId];
      }
      return previous.filter((item) => item !== contractId);
    });
  };

  const onTogglePromotionFilter = (promotionId: string, checked: boolean) => {
    setSelectedPromotionIds((previous) => {
      if (checked) {
        if (previous.includes(promotionId)) return previous;
        return [...previous, promotionId];
      }
      return previous.filter((item) => item !== promotionId);
    });
  };

  const onIngestPromotion = async () => {
    await ingestPromotionEmail({
      file: offerFile,
      operatorCode: offerOperatorCode,
      contractIds: selectedImpactContractIds,
    });
  };

  return (
    <PageShell
      title="Price Lists Calendar"
      description="Compare base contract prices against AI-ingested promotions and visualize deltas with calendar matrix highlighting."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => resetFilters()}>
            Reset
          </Button>
          <Button variant="outline" onClick={() => refresh()} disabled={loadingContracts || loadingMatrix}>
            <RefreshCw className="mr-1.5 size-4" />
            Refresh
          </Button>
        </div>
      }
    >
      <SectionCard
        title="Offer Email AI Ingestion"
        description="Upload promotional offer communication (email/PDF), map it with AI, and apply it to one or more contracts."
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Operator code</Label>
              <Input value={offerOperatorCode} onChange={(event) => setOfferOperatorCode(event.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Offer file</Label>
              <Input
                type="file"
                accept=".pdf,.txt,.eml,.doc,.docx"
                onChange={(event) => setOfferFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Affected contracts (multi-select)</Label>
              <Badge variant="outline">{selectedImpactContractIds.length} selected</Badge>
            </div>
            <Input
              value={contractSearch}
              onChange={(event) => setContractSearch(event.target.value)}
              placeholder="Search contracts by file/operator/hotel"
            />
            <div className="max-h-44 overflow-auto rounded-lg border border-border/80 p-2">
              {filteredContractsForImpact.length === 0 ? (
                <p className="text-xs text-muted-foreground">No contracts found.</p>
              ) : (
                <div className="space-y-1.5">
                  {filteredContractsForImpact.map((contract) => {
                    const checked = selectedImpactContractIds.includes(contract.id);
                    return (
                      <label key={contract.id} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 rounded border-border"
                          checked={checked}
                          onChange={(event) => onToggleImpactContract(contract.id, event.target.checked)}
                        />
                        <span className="leading-tight">
                          {contract.file_name}
                          <span className="block text-xs text-muted-foreground">
                            {contract.operator_code} · {contract.hotel_code} {contract.season_label ? `· ${contract.season_label}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={onIngestPromotion}
              disabled={ingestingPromotion || !offerFile || selectedImpactContractIds.length === 0}
            >
              <Sparkles className="mr-1.5 size-4" />
              {ingestingPromotion ? "Ingesting..." : "Ingest offer with AI and apply"}
            </Button>
            <Badge variant="outline">
              <FileUp className="mr-1 size-3.5" />
              AI parsing: discount, booking window, arrival window, non-cumulative terms
            </Badge>
          </div>

          {lastPromotionIngest ? (
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-sm">
              <p className="font-semibold">{lastPromotionIngest.analysis_summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Promotion: {lastPromotionIngest.promotion.offer_name} · {lastPromotionIngest.promotion.discount_percent ?? 0}% ·
                {` `}impacted contracts: {lastPromotionIngest.impacted_contract_ids.length}
              </p>
              {lastPromotionIngest.contract_rule_updates.length ? (
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                  {lastPromotionIngest.contract_rule_updates.map((item) => (
                    <div key={item.contract_id} className="rounded border border-border/70 p-2">
                      <p className="font-medium text-foreground">{item.contract_file_name}</p>
                      <p>{item.promotion_rule_added ? "Promotion rule added" : "Promotion rule already present"}</p>
                      <p>Total rules: {item.total_rules_after_update}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Matrix Configuration" description="Select a contract and choose whether to view base or promotion-adjusted price lists.">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-4 lg:items-end">
            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
              <Label>View</Label>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as "month" | "week" | "quarter" | "year" | "custom")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={cn("space-y-1.5", viewMode === "custom" ? "lg:col-span-2" : "")}>
              {viewMode === "month" ? (
                <>
                  <Label>Month</Label>
                  <Input type="month" value={monthValue} onChange={(event) => setMonthValue(event.target.value)} />
                </>
              ) : null}

              {viewMode === "week" || viewMode === "quarter" || viewMode === "year" ? (
                <>
                  <Label>Reference date</Label>
                  <Input type="date" value={referenceDateValue} onChange={(event) => setReferenceDateValue(event.target.value)} />
                </>
              ) : null}

              {viewMode === "custom" ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Start date</Label>
                    <Input type="date" value={customStartDateValue} onChange={(event) => setCustomStartDateValue(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>End date</Label>
                    <Input type="date" value={customEndDateValue} onChange={(event) => setCustomEndDateValue(event.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setFiltersCollapsed((previous) => !previous)}
              className="justify-between"
            >
              {filtersCollapsed ? "Show filters" : "Hide filters"}
              <ChevronDown className={`ml-2 size-4 transition-transform ${filtersCollapsed ? "" : "rotate-180"}`} />
            </Button>
          </div>

          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 lg:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={includePromotions}
                onChange={(event) => setIncludePromotions(event.target.checked)}
              />
              Show promotion-adjusted price lists
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">promotions {promotions.length}</Badge>
              <Badge variant="outline">active filters {selectedPromotionIds.length || "all"}</Badge>
              <Badge variant="outline">changed entries {changedEntryCount}</Badge>
              <Badge variant="outline">{rangeLabel}</Badge>
              <Badge variant="outline">days {days.length}</Badge>
              {loadingPromotions ? <Badge variant="outline">loading promotions...</Badge> : null}
            </div>
            {!customRangeValid ? (
              <p className="text-xs text-amber-700">
                Custom range is invalid, so the view falls back to the selected month range.
              </p>
            ) : null}

            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">Promotion Filters</p>
              {promotions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No promotions linked to this contract yet.</p>
              ) : (
                <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
                  {promotions.map((promotion) => {
                    const checked = selectedPromotionIds.includes(promotion.id);
                    return (
                      <label key={promotion.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2 text-xs hover:bg-muted/40">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 rounded border-border"
                          checked={checked}
                          onChange={(event) => onTogglePromotionFilter(promotion.id, event.target.checked)}
                        />
                        <span className="leading-tight">
                          <span className="block font-medium text-foreground">
                            {promotion.offer_name} ({promotion.discount_percent ?? 0}%)
                          </span>
                          <span className="text-muted-foreground">
                            arrival {promotion.arrival_start_date ?? promotion.start_date ?? "?"} to {promotion.arrival_end_date ?? promotion.end_date ?? "?"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {!filtersCollapsed ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Room type</Label>
                <Select value={filters.roomType} onValueChange={(value) => updateFilter("roomType", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All room types</SelectItem>
                    {(matrix?.room_types ?? []).map((roomType) => (
                      <SelectItem key={roomType} value={roomType}>
                        {roomType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Board type</Label>
                <Select value={filters.boardType} onValueChange={(value) => updateFilter("boardType", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All board types</SelectItem>
                    {(matrix?.board_types ?? []).map((boardType) => (
                      <SelectItem key={boardType} value={boardType}>
                        {boardType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Age bucket</Label>
                <Select value={filters.ageBucket} onValueChange={(value) => updateFilter("ageBucket", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ages</SelectItem>
                    {(matrix?.age_buckets ?? []).map((ageBucket) => (
                      <SelectItem key={ageBucket} value={ageBucket}>
                        {ageBucket}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Period</Label>
                <Select value={filters.periodLabel} onValueChange={(value) => updateFilter("periodLabel", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All periods</SelectItem>
                    {periodLabels.map((periodLabel) => (
                      <SelectItem key={periodLabel} value={periodLabel}>
                        {periodLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={filters.currency} onValueChange={(value) => updateFilter("currency", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All currencies</SelectItem>
                    {(matrix?.currencies ?? []).map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Calendar Matrix" description="Toggle promotions ON/OFF to compare base contract pricing with updated pricing.">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{matrix?.contract_file_name ?? "No contract selected"}</Badge>
          <Badge variant="outline">{matrix?.operator_code ?? "-"}</Badge>
          <Badge variant="outline">{matrix?.hotel_code ?? "-"}</Badge>
          <Badge variant="outline">{includePromotions ? "mode: promotions ON" : "mode: base contract"}</Badge>
          <Badge variant="outline">rows {rows.length}</Badge>
          <Badge variant="outline">days {days.length}</Badge>
        </div>

        {loadingMatrix ? (
          <p className="text-sm text-muted-foreground">Loading price list matrix...</p>
        ) : !matrix ? (
          <p className="text-sm text-muted-foreground">Select a contract to render matrix prices.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pricing entries match the current filters. If this contract was ingested without AI pricing extraction, persist it from
            the Pricing AI page first.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[20rem]">Option</TableHead>
                  {days.map((day) => (
                    <TableHead key={dayKey(day)} className="min-w-[4.2rem] text-center">
                      <div className="flex flex-col leading-tight">
                        <span>{day.getDate()}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {day.toLocaleDateString(undefined, { weekday: "short" })}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">
                          {row.roomType} · {row.boardType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.ageLabel} ({row.ageBucket}) {row.currency ? `· ${row.currency}` : ""}
                        </p>
                      </div>
                    </TableCell>
                    {days.map((day) => {
                      const key = dayKey(day);
                      const cell = row.values[key];
                      const changed = includePromotions && Boolean(cell?.promotionApplied);
                      const promoTitle = cell?.appliedPromotions.length ? `Promotions: ${cell.appliedPromotions.join(", ")}` : "";
                      return (
                        <TableCell
                          key={`${row.key}-${key}`}
                          className={cn(
                            "text-center text-xs",
                            changed ? "bg-emerald-100/70 font-semibold text-emerald-900" : "",
                          )}
                          title={[promoTitle, cell?.periodLabel ?? ""].filter(Boolean).join(" · ")}
                        >
                          {cell ? (
                            <div className="leading-tight">
                              <div>{cell.price.toFixed(2)}</div>
                              {changed && cell.basePrice != null ? (
                                <div className="text-[10px] text-emerald-900/80">
                                  {cell.basePrice.toFixed(2)} → {cell.price.toFixed(2)}
                                </div>
                              ) : null}
                            </div>
                          ) : "-"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {matrix?.period_ranges?.length ? (
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CalendarDays className="size-4" />
              Detected contract periods
            </div>
            <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-3">
              {matrix.period_ranges.map((period) => (
                <div key={`${period.label}-${period.start_date}-${period.end_date}`} className="rounded-md border border-border/70 p-2">
                  <p className="font-medium">{period.label}</p>
                  <p>
                    {period.start_date ?? "?"} to {period.end_date ?? "?"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="size-4" />
          {includePromotions
            ? "Green cells indicate prices altered by active promotion rules."
            : "Prices are based on the main contract rules only."}
        </div>
      </SectionCard>
    </PageShell>
  );
}
