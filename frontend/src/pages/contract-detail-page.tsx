import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileSearch, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { api, isRequestCancelled } from "@/api/client";
import type { ContractDocument, PricingRule, PromotionOffer, SyncRun } from "@/api/types";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function parseDateOnly(value: unknown): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const token = raw.includes("T") ? raw.slice(0, 10) : raw;
  const parsed = new Date(`${token}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(value: Date | null): string {
  if (!value) return "open";
  return value.toLocaleDateString();
}

function formatWindow(startDate: Date | null, endDate: Date | null): string {
  if (!startDate && !endDate) return "-";
  return `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`;
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

function parsePercentFromExpression(expression: string): number | null {
  const match = expression.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEarlyBookingRule(rule: PricingRule): boolean {
  if (rule.rule_type !== "promotion") return false;
  const metadata = (rule.metadata ?? {}) as Record<string, unknown>;
  const category = toMetadataString(metadata, "promotion_category").toLowerCase();
  if (category === "early_booking" || category === "early-booking" || category === "early booking") {
    return true;
  }
  const haystack = [rule.name, rule.expression, toMetadataString(metadata, "offer_name"), toMetadataString(metadata, "description")]
    .join(" ")
    .toLowerCase();
  return ["early booking", "early-booking", "earlybooking", "early bird", "early-bird", "earlybird"].some((token) =>
    haystack.includes(token),
  );
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
        setSyncRuns(syncResponse.data);
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

  const earlyBookingRules = useMemo(() => {
    return rules
      .filter((rule) => isEarlyBookingRule(rule))
      .map((rule) => {
        const metadata = (rule.metadata ?? {}) as Record<string, unknown>;
        const discount = toMetadataNumber(metadata, "discount_percent") ?? parsePercentFromExpression(rule.expression);
        const bookingStartDate = parseDateOnly(toMetadataString(metadata, "booking_start_date"));
        const bookingEndDate = parseDateOnly(toMetadataString(metadata, "booking_end_date"));
        const stayStartDate =
          parseDateOnly(toMetadataString(metadata, "arrival_start_date")) ?? parseDateOnly(toMetadataString(metadata, "start_date"));
        const stayEndDate =
          parseDateOnly(toMetadataString(metadata, "arrival_end_date")) ?? parseDateOnly(toMetadataString(metadata, "end_date"));
        const hasBookingWindow = Boolean(bookingStartDate || bookingEndDate);
        const hasStayWindow = Boolean(stayStartDate || stayEndDate);
        const scope = toMetadataString(metadata, "scope") || "all";
        const roomFilters = Array.isArray(metadata.applicable_room_types)
          ? metadata.applicable_room_types.map((item) => String(item).trim()).filter(Boolean)
          : [];
        const boardFilters = Array.isArray(metadata.applicable_board_types)
          ? metadata.applicable_board_types.map((item) => String(item).trim()).filter(Boolean)
          : [];
        const windowComplete = hasBookingWindow && hasStayWindow;

        return {
          id: rule.id,
          name: rule.name,
          isActive: rule.is_active,
          discountPercent: discount,
          bookingStartDate,
          bookingEndDate,
          stayStartDate,
          stayEndDate,
          windowComplete,
          scope,
          nonCumulative: Boolean(metadata.non_cumulative),
          roomFilters,
          boardFilters,
        };
      });
  }, [rules]);

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

          <SectionCard
            title="Early Booking Rules"
            description="Early-booking discounts are applied only when BOTH booking date and stay dates fall inside the configured windows."
          >
            {earlyBookingRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No early-booking promotion rules were detected for this contract.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Booking Window</TableHead>
                      <TableHead>Stay Window</TableHead>
                      <TableHead>Window Status</TableHead>
                      <TableHead>Scope</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earlyBookingRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="max-w-[20rem]">
                          <p className="font-medium">{rule.name}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {!rule.isActive ? <Badge variant="muted">inactive</Badge> : null}
                            {rule.nonCumulative ? <Badge variant="outline">non-cumulative</Badge> : null}
                            {rule.roomFilters.length ? <Badge variant="outline">rooms: {rule.roomFilters.join(", ")}</Badge> : null}
                            {rule.boardFilters.length ? <Badge variant="outline">boards: {rule.boardFilters.join(", ")}</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {rule.discountPercent != null ? (
                            <Badge
                              variant="outline"
                              className={
                                Math.abs(rule.discountPercent - 10) <= 0.05
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : Math.abs(rule.discountPercent - 5) <= 0.05
                                    ? "border-sky-200 bg-sky-50 text-sky-700"
                                    : undefined
                              }
                            >
                              {rule.discountPercent}%
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{formatWindow(rule.bookingStartDate, rule.bookingEndDate)}</TableCell>
                        <TableCell>{formatWindow(rule.stayStartDate, rule.stayEndDate)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={rule.windowComplete ? "outline" : "danger"}
                            className={rule.windowComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : undefined}
                          >
                            {rule.windowComplete ? "Complete (booking + stay)" : "Incomplete window"}
                          </Badge>
                        </TableCell>
                        <TableCell>{rule.scope}</TableCell>
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
