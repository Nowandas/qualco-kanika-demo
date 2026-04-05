import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileSearch, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { api, isRequestCancelled } from "@/api/client";
import type {
  ContractDocument,
  PriceListMatrix,
  PricingRule,
  PromotionAIIngestResponse,
  PromotionOffer,
  SyncRun,
} from "@/api/types";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { openBlobSafely } from "@/lib/blob-safety";
import { notifyError, notifyInfo } from "@/lib/notify";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function jsonSnippet(value: Record<string, unknown>, maxLength = 140): string {
  const serialized = JSON.stringify(value);
  if (!serialized) return "{}";
  if (serialized.length <= maxLength) return serialized;
  return `${serialized.slice(0, maxLength)}...`;
}

type DetailCardItemProps = {
  label: string;
  value: string;
};

function DetailCardItem({ label, value }: DetailCardItemProps) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm">{value || "-"}</p>
    </div>
  );
}

type TermListProps = {
  title: string;
  values: string[];
};

function normalizeTermValues(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const dedupeKey = value.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(value);
  }
  return normalized;
}

function TermList({ title, values }: TermListProps) {
  const normalizedValues = useMemo(() => normalizeTermValues(values), [values]);

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <Badge variant="outline">{normalizedValues.length}</Badge>
      </div>
      {normalizedValues.length === 0 ? (
        <p className="text-xs text-muted-foreground">No values extracted.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {normalizedValues.map((item) => (
            <Badge key={`${title}-${item.toLocaleLowerCase()}`} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContractDetailPage() {
  const navigate = useNavigate();
  const { contractId = "" } = useParams();

  const [contract, setContract] = useState<ContractDocument | null>(null);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [promotions, setPromotions] = useState<PromotionOffer[]>([]);
  const [relatedContracts, setRelatedContracts] = useState<ContractDocument[]>([]);
  const [matrix, setMatrix] = useState<PriceListMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [includePromotions, setIncludePromotions] = useState(false);
  const [selectedPromotionIds, setSelectedPromotionIds] = useState<string[]>([]);
  const [promotionOfferFile, setPromotionOfferFile] = useState<File | null>(null);
  const [promotionOperatorCode, setPromotionOperatorCode] = useState("");
  const [ingestingPromotion, setIngestingPromotion] = useState(false);
  const [lastPromotionIngest, setLastPromotionIngest] = useState<PromotionAIIngestResponse | null>(null);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (firstLoad = false) => {
      if (!contractId) {
        return;
      }
      const controller = new AbortController();
      loadAbortRef.current?.abort();
      loadAbortRef.current = controller;
      if (firstLoad) {
        setLoading(true);
      } else {
        setBusy(true);
      }

      try {
        const [contractResponse, rulesResponse, promotionsResponse, syncResponse] = await Promise.all([
          api.get<ContractDocument>(`/hospitality/contracts/${contractId}`, { signal: controller.signal }),
          api.get<PricingRule[]>("/hospitality/rules", { params: { contract_id: contractId }, signal: controller.signal }),
          api.get<PromotionOffer[]>("/hospitality/promotions", { params: { contract_id: contractId }, signal: controller.signal }),
          api.get<SyncRun[]>("/hospitality/sync-runs", { params: { contract_id: contractId }, signal: controller.signal }),
        ]);
        setContract(contractResponse.data);
        setRules(rulesResponse.data);
        setPromotions(promotionsResponse.data);
        const scopedHotelId = contractResponse.data.hotel_id ?? undefined;
        const relatedContractsResponse = await api.get<ContractDocument[]>("/hospitality/contracts", {
          params: { hotel_id: scopedHotelId, operator_code: contractResponse.data.operator_code, limit: 1000, sort_by: "updated_at", sort_order: "desc" },
          signal: controller.signal,
        });
        setRelatedContracts(relatedContractsResponse.data);
        setSyncRuns(syncResponse.data);
        setPromotionOperatorCode(contractResponse.data.operator_code);
      } catch (error) {
        if (isRequestCancelled(error)) {
          return;
        }
        notifyError(error, "Could not load contract details.");
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
          setLoading(false);
          setBusy(false);
        }
      }
    },
    [contractId],
  );

  useEffect(() => {
    load(true).catch(() => null);
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load]);

  const title = useMemo(() => contract?.file_name ?? "Contract Detail", [contract?.file_name]);

  const loadMatrix = useCallback(async () => {
    if (!contractId) {
      return;
    }
    setMatrixLoading(true);
    try {
      const response = await api.get<PriceListMatrix>(`/hospitality/contracts/${contractId}/price-matrix`, {
        params: {
          include_promotions: includePromotions,
          promotion_ids: selectedPromotionIds.length ? selectedPromotionIds.join(",") : undefined,
        },
      });
      setMatrix(response.data);
    } catch (error) {
      notifyError(error, "Could not load contract price matrix.");
      setMatrix(null);
    } finally {
      setMatrixLoading(false);
    }
  }, [contractId, includePromotions, selectedPromotionIds]);

  useEffect(() => {
    if (!contractId) {
      return;
    }
    void loadMatrix();
  }, [contractId, loadMatrix]);

  useEffect(() => {
    const allowed = new Set(promotions.map((item) => item.id));
    setSelectedPromotionIds((previous) => previous.filter((item) => allowed.has(item)));
  }, [promotions]);

  const onTogglePromotionFilter = (promotionId: string, checked: boolean) => {
    setSelectedPromotionIds((previous) => {
      if (checked) {
        if (previous.includes(promotionId)) return previous;
        return [...previous, promotionId];
      }
      return previous.filter((item) => item !== promotionId);
    });
  };

  const onIngestPromotion = useCallback(async () => {
    if (!contract) {
      return;
    }
    if (!promotionOfferFile) {
      notifyInfo("Select an offer file first.");
      return;
    }
    if (ingestingPromotion) {
      return;
    }

    setIngestingPromotion(true);
    try {
      const formData = new FormData();
      formData.append("file", promotionOfferFile);
      if (contract.hotel_id) {
        formData.append("hotel_id", contract.hotel_id);
      }
      formData.append("hotel_code", contract.hotel_code);
      formData.append("operator_code", promotionOperatorCode.trim() || contract.operator_code);
      formData.append("contract_ids", contract.id);

      const response = await api.post<PromotionAIIngestResponse>("/hospitality/promotions/ai-ingest", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastPromotionIngest(response.data);
      setPromotionOfferFile(null);
      await load(false);
      await loadMatrix();
    } catch (error) {
      notifyError(error, "Could not AI-ingest promotion offer.");
    } finally {
      setIngestingPromotion(false);
    }
  }, [contract, ingestingPromotion, load, loadMatrix, promotionOfferFile, promotionOperatorCode]);

  const periodLabels = useMemo(() => {
    if (!matrix) {
      return [];
    }
    const labels = new Set<string>();
    for (const period of matrix.period_ranges) {
      const value = String(period.label || "").trim();
      if (value) {
        labels.add(value);
      }
    }
    for (const entry of matrix.entries) {
      const value = String(entry.period_label || "").trim();
      if (value) {
        labels.add(value);
      }
    }
    return Array.from(labels);
  }, [matrix]);

  const matrixRows = useMemo(() => {
    if (!matrix) {
      return [];
    }
    type Aggregate = {
      roomType: string;
      boardType: string;
      ageLabel: string;
      currency: string;
      values: Record<string, { total: number; count: number }>;
    };
    const grouped = new Map<string, Aggregate>();
    for (const entry of matrix.entries) {
      const period = String(entry.period_label || "").trim() || "Unassigned";
      const roomType = String(entry.room_type || "").trim() || "N/A";
      const boardType = String(entry.board_type || "").trim() || "N/A";
      const ageLabel = String(entry.age_label || entry.age_bucket || "").trim() || "Adult";
      const currency = String(entry.currency || "").trim() || "-";
      const key = `${roomType}::${boardType}::${ageLabel}::${currency}`;

      let bucket = grouped.get(key);
      if (!bucket) {
        bucket = { roomType, boardType, ageLabel, currency, values: {} };
        grouped.set(key, bucket);
      }
      if (!bucket.values[period]) {
        bucket.values[period] = { total: 0, count: 0 };
      }
      bucket.values[period].total += Number(entry.price || 0);
      bucket.values[period].count += 1;
    }

    return Array.from(grouped.values()).sort((left, right) => {
      return `${left.roomType} ${left.boardType} ${left.ageLabel}`.localeCompare(
        `${right.roomType} ${right.boardType} ${right.ageLabel}`,
        undefined,
        { sensitivity: "base" },
      );
    });
  }, [matrix]);

  const openUploadedFile = useCallback(async () => {
    if (!contract) {
      return;
    }
    if (!contract.has_uploaded_file) {
      notifyInfo("No uploaded file is available for this contract.");
      return;
    }
    if (openingFile) {
      return;
    }
    setOpeningFile(true);
    try {
      const response = await api.get<Blob>(`/hospitality/contracts/${contract.id}/file`, { responseType: "blob" });
      const contentType = String(response.headers?.["content-type"] || "application/octet-stream");
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });
      const result = openBlobSafely(blob, contract.file_name || "contract-file");
      if (result === "blocked") {
        notifyInfo("Blocked preview for active content type. Download from a trusted source if needed.");
      } else if (result === "downloaded") {
        notifyInfo("Preview is limited for this file type. The file was downloaded instead.");
      }
    } catch (error) {
      notifyError(error, "Could not open uploaded contract file.");
    } finally {
      setOpeningFile(false);
    }
  }, [contract, openingFile]);

  if (!contractId) {
    return (
      <PageShell title="Contract Detail" description="No contract id was provided in the route.">
        <Button variant="outline" onClick={() => navigate("/app/contracts")}>
          <ArrowLeft className="mr-1.5 size-4" />
          Back to contracts
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={title}
      description="Review parsed contract fields, pricing rules, sync history, and parsed text in one place."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/app/contracts")}>
            <ArrowLeft className="mr-1.5 size-4" />
            Back
          </Button>
          <Button
            variant="outline"
            onClick={() => openUploadedFile()}
            disabled={busy || !contract?.has_uploaded_file || openingFile}
          >
            <FileSearch className="mr-1.5 size-4" />
            {openingFile ? "Opening file..." : "View uploaded file"}
          </Button>
          <Button variant="outline" onClick={() => load(false)} disabled={busy}>
            <RefreshCw className="mr-1.5 size-4" />
            Refresh
          </Button>
        </div>
      }
    >
      {loading || !contract ? (
        <p className="text-sm text-muted-foreground">Loading contract details...</p>
      ) : (
        <>
          <SectionCard title="Contract Metadata" description="Core identifiers and timeline details for this parsed contract.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailCardItem label="Contract ID" value={contract.id} />
              <DetailCardItem label="Hotel Code" value={contract.hotel_code} />
              <DetailCardItem label="Operator Code" value={contract.operator_code} />
              <DetailCardItem label="Season Label" value={contract.season_label ?? "-"} />
              <DetailCardItem label="Source" value={contract.source} />
              <DetailCardItem label="File Type" value={contract.file_type} />
              <DetailCardItem label="File Size" value={formatFileSize(contract.file_size)} />
              <DetailCardItem label="Uploaded By" value={contract.uploaded_by_user_id} />
              <DetailCardItem label="Created At" value={formatDate(contract.created_at)} />
              <DetailCardItem label="Updated At" value={formatDate(contract.updated_at)} />
            </div>
          </SectionCard>

          <SectionCard
            title="Uploaded File"
            description="Open the original uploaded contract source document from this record."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={contract.has_uploaded_file ? "outline" : "muted"}>
                {contract.has_uploaded_file ? "File available" : "File unavailable"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                onClick={() => openUploadedFile()}
                disabled={!contract.has_uploaded_file || openingFile}
              >
                {openingFile ? "Opening..." : "Open original file"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Extracted Terms" description="Parsed entities used to generate pricing logic and validation rules.">
            <div className="grid gap-3 xl:grid-cols-2">
              <TermList title="Room Types" values={contract.extraction.room_types} />
              <TermList title="Seasonal Periods" values={contract.extraction.seasonal_periods} />
              <TermList title="Board Types" values={contract.extraction.board_types} />
              <TermList title="Discounts" values={contract.extraction.discounts} />
              <TermList title="Supplements" values={contract.extraction.supplements} />
              <TermList title="Marketing Contributions" values={contract.extraction.marketing_contributions} />
            </div>

            <div className="mt-3">
              <TermList title="Raw Highlights" values={contract.extraction.raw_highlights} />
            </div>
          </SectionCard>

          <SectionCard title="Pricing Rules" description="Current rules generated for this contract.">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing rules found for this contract yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expression</TableHead>
                      <TableHead>Metadata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.rule_type}</Badge>
                        </TableCell>
                        <TableCell>{rule.priority}</TableCell>
                        <TableCell>
                          <Badge variant={rule.is_active ? "outline" : "muted"}>{rule.is_active ? "active" : "inactive"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[20rem] text-xs">{rule.expression}</TableCell>
                        <TableCell className="max-w-[24rem] text-xs text-muted-foreground">{jsonSnippet(rule.metadata)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Promotion Terms" description="Offer emails and promotion rules linked to this contract.">
            {promotions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No promotions are linked to this contract.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Offer</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Booking Window</TableHead>
                      <TableHead>Arrival Window</TableHead>
                      <TableHead>Non-Cumulative</TableHead>
                      <TableHead>Scope</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promotions.map((promotion) => (
                      <TableRow key={promotion.id}>
                        <TableCell className="max-w-[18rem]">
                          <p className="font-medium">{promotion.offer_name}</p>
                          <p className="text-xs text-muted-foreground">{promotion.description}</p>
                        </TableCell>
                        <TableCell>{promotion.discount_percent ?? 0}%</TableCell>
                        <TableCell>
                          {promotion.booking_start_date ?? "?"} to {promotion.booking_end_date ?? "?"}
                        </TableCell>
                        <TableCell>
                          {promotion.arrival_start_date ?? promotion.start_date ?? "?"} to {promotion.arrival_end_date ?? promotion.end_date ?? "?"}
                        </TableCell>
                        <TableCell>{promotion.non_cumulative ? "yes" : "no"}</TableCell>
                        <TableCell>{promotion.scope}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Price Matrix & Promotion Impact"
            description="Room/board/period matrix for this contract with optional promotion-adjusted view."
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border"
                    checked={includePromotions}
                    onChange={(event) => setIncludePromotions(event.target.checked)}
                  />
                  Include promotions
                </label>
                <Badge variant="outline">periods {periodLabels.length}</Badge>
                <Badge variant="outline">entries {matrix?.entries.length ?? 0}</Badge>
                <Button size="sm" variant="outline" onClick={() => loadMatrix()} disabled={matrixLoading}>
                  {matrixLoading ? "Loading matrix..." : "Refresh matrix"}
                </Button>
              </div>

              {promotions.length ? (
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
                          <span className="block font-medium text-foreground">{promotion.offer_name}</span>
                          <span className="text-muted-foreground">
                            {promotion.discount_percent ?? 0}% · {promotion.scope}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No promotions available for this contract.</p>
              )}

              {matrixRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matrix entries available yet for this contract.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Room</TableHead>
                        <TableHead>Board</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Currency</TableHead>
                        {periodLabels.map((period) => (
                          <TableHead key={period}>{period}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrixRows.map((row) => (
                        <TableRow key={`${row.roomType}-${row.boardType}-${row.ageLabel}-${row.currency}`}>
                          <TableCell>{row.roomType}</TableCell>
                          <TableCell>{row.boardType}</TableCell>
                          <TableCell>{row.ageLabel}</TableCell>
                          <TableCell>{row.currency}</TableCell>
                          {periodLabels.map((period) => {
                            const value = row.values[period];
                            const price = value ? value.total / value.count : null;
                            return <TableCell key={period}>{price == null ? "-" : price.toFixed(2)}</TableCell>;
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Promotion AI Ingestion (Contract Scope)"
            description="Upload a promotion file and apply AI-parsed promotion rules to this contract."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Operator code</Label>
                <Input value={promotionOperatorCode} onChange={(event) => setPromotionOperatorCode(event.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Offer file</Label>
                <Input
                  type="file"
                  accept=".pdf,.txt,.eml,.doc,.docx"
                  onChange={(event) => setPromotionOfferFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => onIngestPromotion()} disabled={ingestingPromotion || !promotionOfferFile}>
                {ingestingPromotion ? "Ingesting..." : "AI ingest promotion and update rules"}
              </Button>
              <Badge variant="outline">applies to current contract</Badge>
              <Badge variant="outline">related contracts {relatedContracts.length}</Badge>
            </div>

            {lastPromotionIngest ? (
              <div className="mt-3 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm">
                <p className="font-semibold">{lastPromotionIngest.analysis_summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Promotion: {lastPromotionIngest.promotion.offer_name} · {lastPromotionIngest.promotion.discount_percent ?? 0}% ·
                  impacted contracts: {lastPromotionIngest.impacted_contract_ids.length}
                </p>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Sync Runs" description="Recent Fidelio/third-party sync activity for this contract.">
            {syncRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync runs yet for this contract.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncRuns.map((syncRun) => (
                      <TableRow key={syncRun.id}>
                        <TableCell>{formatDate(syncRun.created_at)}</TableCell>
                        <TableCell>{syncRun.target_system}</TableCell>
                        <TableCell>
                          <Badge variant={syncRun.status === "failed" ? "muted" : "outline"}>{syncRun.status}</Badge>
                        </TableCell>
                        <TableCell>{syncRun.created_by_user_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Parsed Text Preview" description="Extracted machine-readable text used by contract parsing and rule generation.">
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <FileSearch className="size-4" />
                <span>{contract.parsed_text_preview.length} characters</span>
              </div>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
                {contract.parsed_text_preview || "No parsed text preview available."}
              </pre>
            </div>
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}
