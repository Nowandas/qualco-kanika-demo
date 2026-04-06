import { FormEvent, useMemo, useState } from "react";
import { Bot, Database, FileUp, Lightbulb, Sparkles, WandSparkles } from "lucide-react";

import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePricingAiIngestion } from "@/features/hospitality/use-pricing-ai-ingestion";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

const DEFAULT_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      hotel_name: { type: "string" },
      tour_operator: { type: "string" },
      season_label: { type: "string" },
      room_types: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      seasonal_pricing_periods: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            start_date: { type: "string" },
            end_date: { type: "string" },
          },
        },
      },
      board_types: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      pricing_lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            room_type: { type: "string" },
            board_type: { type: "string" },
            period_label: { type: "string" },
            start_date: { type: "string" },
            end_date: { type: "string" },
            adult_price: { type: "number" },
            currency: { type: "string" },
          },
        },
      },
      extra_guest_rules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            condition: { type: "string" },
            guest_type: { type: "string" },
            guest_position: { type: "number" },
            age_min: { type: "number" },
            age_max: { type: "number" },
            percent_of_adult: { type: "number" },
          },
        },
      },
      discounts: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      supplements: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      marketing_contributions: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      promotional_offers: { type: "array", items: { type: "object" } },
      notes: { type: "string" },
    },
    additionalProperties: true,
  },
  null,
  2,
);

const MODEL_OPTIONS = ["gpt-5.2", "gpt-5.4", "gpt-5.4-mini", "gpt-4.1", "gpt-4.1-mini"];

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function toStringList(value: unknown, limit = 60): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const item of value) {
    if (item == null) continue;
    if (typeof item === "string") {
      const text = item.trim();
      if (text) output.push(text);
      continue;
    }
    if (typeof item === "object") {
      const maybeName = String((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).label ?? "").trim();
      if (maybeName) output.push(maybeName);
    }
    if (output.length >= limit) break;
  }
  return output;
}

function toObjectList(value: unknown, limit = 80): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const output: Record<string, unknown>[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      output.push(item as Record<string, unknown>);
      if (output.length >= limit) break;
    }
  }
  return output;
}

export function PricingIngestionPage() {
  const { selectedHotelId, selectedHotel } = useHotelScope();
  const isHotelSelected = selectedHotelId !== HOTEL_SCOPE_ALL && Boolean(selectedHotel);
  const {
    recommendingModel,
    extracting,
    persisting,
    lastRecommendation,
    lastExtraction,
    lastPersisted,
    recommendModel,
    extractPricing,
    persistExtraction,
  } = usePricingAiIngestion();

  const [operatorCode, setOperatorCode] = useState("JET2");
  const [seasonLabel, setSeasonLabel] = useState("S25");
  const [model, setModel] = useState("gpt-5.2");
  const [mappingInstructions, setMappingInstructions] = useState(
    "Treat input as a tour-operator commercial terms contract. Extract room types, seasonal pricing periods, board types, pricing lines, extra guest pricing rules (including 2nd child / 3rd adult logic), discounts, supplements, marketing contributions and promotional offers. For each extra guest rule capture guest_type, guest_position, age_min/age_max (if present), and percent_of_adult. Available board types are HB, BB, FB.",
  );
  const [schemaText, setSchemaText] = useState(DEFAULT_SCHEMA);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reviewedJson, setReviewedJson] = useState("{}");

  const usageSummary = useMemo(() => {
    if (!lastExtraction) {
      return "";
    }
    const usage = lastExtraction.usage;
    const prompt = Number(usage.prompt_tokens ?? 0);
    const completion = Number(usage.completion_tokens ?? 0);
    const total = Number(usage.total_tokens ?? 0);
    return `prompt ${prompt} · completion ${completion} · total ${total}`;
  }, [lastExtraction]);

  const onExtract = async (event: FormEvent) => {
    event.preventDefault();
    if (!isHotelSelected || !selectedHotel) {
      notifyInfo("Select a hotel from the sidebar first.");
      return;
    }
    if (!selectedFile) {
      notifyInfo("Select a contract PDF first.");
      return;
    }

    const extraction = await extractPricing({
      file: selectedFile,
      hotelId: selectedHotel.id,
      hotelCode: selectedHotel.code,
      operatorCode: operatorCode.trim(),
      seasonLabel: seasonLabel.trim(),
      model: model.trim(),
      schemaJson: schemaText,
      mappingInstructions,
    });

    if (extraction) {
      setReviewedJson(toPrettyJson(extraction.extracted_data));
    }
  };

  const onRecommendModel = async () => {
    if (!isHotelSelected || !selectedHotel) {
      notifyInfo("Select a hotel from the sidebar first.");
      return;
    }
    if (!selectedFile) {
      notifyInfo("Select a contract PDF first.");
      return;
    }

    const recommendation = await recommendModel({
      file: selectedFile,
      hotelId: selectedHotel.id,
      hotelCode: selectedHotel.code,
      operatorCode: operatorCode.trim(),
      seasonLabel: seasonLabel.trim(),
    });
    if (!recommendation) {
      return;
    }
  };

  const onApplyRecommendationToExtraction = () => {
    if (!lastRecommendation) {
      notifyInfo("Run content analysis first.");
      return;
    }
    setMappingInstructions(lastRecommendation.suggested_mapping_instructions);
    setSchemaText(recommendedSchemaText);
    notifySuccess("Applied recommended schema and mapping instructions to extraction setup.");
  };

  const recommendationSignals = useMemo(() => {
    if (!lastRecommendation) {
      return null;
    }
    const read = (key: string) => {
      const value = Number(lastRecommendation.detected_signals?.[key] ?? 0);
      return Number.isFinite(value) ? value : 0;
    };
    return {
      complexityScore: read("complexity_score"),
      lineCount: read("line_count"),
      tableLines: read("table_like_lines"),
      guestMentions: read("guest_rule_mentions"),
      roomTypes: read("room_type_count"),
      boardTypes: read("board_type_count"),
      periods: read("seasonal_period_count"),
      pricingLines: read("pricing_line_suggestion_count"),
    };
  }, [lastRecommendation]);
  const recommendationUsageSummary = useMemo(() => {
    if (!lastRecommendation) return "";
    const usage = lastRecommendation.analysis_usage ?? {};
    const prompt = Number(usage.prompt_tokens ?? 0);
    const completion = Number(usage.completion_tokens ?? 0);
    const total = Number(usage.total_tokens ?? 0);
    if (!prompt && !completion && !total) return "";
    return `prompt ${prompt} · completion ${completion} · total ${total}`;
  }, [lastRecommendation]);
  const recommendedDataView = useMemo(() => {
    const data = lastRecommendation?.recommended_data ?? {};
    return {
      roomTypes: toStringList(data.room_types),
      boardTypes: toStringList(data.board_types),
      periods: toObjectList(data.seasonal_pricing_periods, 40),
      pricingLines: toObjectList(data.pricing_lines, 60),
      extraGuestRules: toObjectList(data.extra_guest_rules, 60),
      promotions: toObjectList(data.promotional_offers, 30),
    };
  }, [lastRecommendation]);
  const recommendedDataText = useMemo(
    () => (lastRecommendation ? toPrettyJson(lastRecommendation.recommended_data) : "{}"),
    [lastRecommendation],
  );
  const recommendedSchemaText = useMemo(
    () => (lastRecommendation ? toPrettyJson(lastRecommendation.suggested_schema) : "{}"),
    [lastRecommendation],
  );

  const onPersist = async () => {
    if (!lastExtraction) {
      notifyInfo("Run AI extraction first.");
      return;
    }
    if (!isHotelSelected || !selectedHotel) {
      notifyInfo("Select a hotel from the sidebar first.");
      return;
    }

    let reviewedData: Record<string, unknown> | undefined;
    const raw = reviewedJson.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          notifyError(new Error("Reviewed JSON must be a JSON object."), "Reviewed JSON must be a JSON object.");
          return;
        }
        reviewedData = parsed as Record<string, unknown>;
      } catch (error) {
        notifyError(error, "Reviewed JSON is invalid.");
        return;
      }
    }

    await persistExtraction({
      extractionRunId: lastExtraction.id,
      hotelId: selectedHotel.id,
      hotelCode: selectedHotel.code,
      operatorCode: operatorCode.trim(),
      seasonLabel: seasonLabel.trim(),
      reviewedData,
    });
  };

  return (
    <PageShell
      title="AI Pricing Ingestion"
      description="Upload a tour-operator pricing contract PDF, run OpenAI extraction against your schema, review output, and persist contract + rules."
    >
      <SectionCard
        title="Extraction Setup"
        description="Choose model and mapping schema. This is your testing workspace for AI extraction behavior."
      >
        <form className="space-y-4" onSubmit={onExtract}>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              <Input value={selectedHotel ? `${selectedHotel.name} (${selectedHotel.code})` : "Select hotel from sidebar"} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Operator code</Label>
              <Input value={operatorCode} onChange={(event) => setOperatorCode(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Season label</Label>
              <Input value={seasonLabel} onChange={(event) => setSeasonLabel(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Contract PDF</Label>
            <div className="relative">
              <Input
                type="file"
                accept=".pdf"
                disabled={!isHotelSelected || recommendingModel || extracting || persisting}
                onChange={(event) => {
                  if (!isHotelSelected) {
                    notifyInfo("Select a hotel from the sidebar first.");
                    event.currentTarget.value = "";
                    return;
                  }
                  setSelectedFile(event.target.files?.[0] ?? null);
                }}
              />
              {!isHotelSelected ? (
                <button
                  type="button"
                  className="absolute inset-0 cursor-not-allowed rounded-md"
                  onClick={() => notifyInfo("Select a hotel from the sidebar first.")}
                  aria-label="Select hotel first to enable contract upload"
                />
              ) : null}
            </div>
            {!isHotelSelected ? (
              <p className="text-xs text-amber-700">Select a hotel from the sidebar to enable contract upload.</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Content Feedback & Mapping Flow</p>
                <p className="text-xs text-muted-foreground">
                  Upload a pricelist contract first, then run content feedback to get recommended data, schema, and mapping guidance before persistence.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={onRecommendModel}
                disabled={recommendingModel || extracting || persisting || !selectedFile || !isHotelSelected}
              >
                <WandSparkles className="mr-1.5 size-4" />
                {recommendingModel ? "Analyzing..." : "Analyze content"}
              </Button>
            </div>

            {lastRecommendation ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">confidence {lastRecommendation.confidence}</Badge>
                  <Badge variant="outline">analysis {lastRecommendation.analysis_provider}</Badge>
                  <Badge variant="outline">model {lastRecommendation.analysis_model}</Badge>
                  {recommendationUsageSummary ? <Badge variant="outline">{recommendationUsageSummary}</Badge> : null}
                  {recommendationSignals ? <Badge variant="outline">complexity {recommendationSignals.complexityScore}</Badge> : null}
                </div>
                <p className="text-muted-foreground">{lastRecommendation.content_summary}</p>
                <div>
                  <Button type="button" variant="outline" onClick={onApplyRecommendationToExtraction}>
                    Apply Recommendation To Extraction
                  </Button>
                </div>
                {recommendationSignals ? (
                  <div className="grid gap-2 text-xs md:grid-cols-4">
                    <div className="rounded-lg border border-border/70 p-2">lines: {recommendationSignals.lineCount}</div>
                    <div className="rounded-lg border border-border/70 p-2">table-like rows: {recommendationSignals.tableLines}</div>
                    <div className="rounded-lg border border-border/70 p-2">guest-rule mentions: {recommendationSignals.guestMentions}</div>
                    <div className="rounded-lg border border-border/70 p-2">pricing line suggestions: {recommendationSignals.pricingLines}</div>
                    <div className="rounded-lg border border-border/70 p-2">room types: {recommendationSignals.roomTypes}</div>
                    <div className="rounded-lg border border-border/70 p-2">board types: {recommendationSignals.boardTypes}</div>
                    <div className="rounded-lg border border-border/70 p-2">periods: {recommendationSignals.periods}</div>
                  </div>
                ) : null}

                {lastRecommendation.coverage_feedback.length ? (
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-sm font-semibold">Coverage Feedback</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {lastRecommendation.coverage_feedback.map((item, index) => (
                        <li key={`feedback-${index}`}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {lastRecommendation.database_mapping.length ? (
                  <div className="overflow-x-auto rounded-lg border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entity</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Transform</TableHead>
                          <TableHead>Required</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lastRecommendation.database_mapping.map((mapping, index) => (
                          <TableRow key={`${mapping.target_entity}-${mapping.destination_field}-${index}`}>
                            <TableCell>{mapping.target_entity}</TableCell>
                            <TableCell className="max-w-[18rem] text-xs">{mapping.source_path}</TableCell>
                            <TableCell className="max-w-[18rem] text-xs">{mapping.destination_field}</TableCell>
                            <TableCell className="max-w-[18rem] text-xs">{mapping.transform}</TableCell>
                            <TableCell>{mapping.required ? "yes" : "no"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-sm font-semibold">Recommended Data (Pre-mapping View)</p>
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
                    <div className="rounded-md border border-border/70 p-2">room types: {recommendedDataView.roomTypes.length}</div>
                    <div className="rounded-md border border-border/70 p-2">board types: {recommendedDataView.boardTypes.length}</div>
                    <div className="rounded-md border border-border/70 p-2">periods: {recommendedDataView.periods.length}</div>
                    <div className="rounded-md border border-border/70 p-2">pricing lines: {recommendedDataView.pricingLines.length}</div>
                    <div className="rounded-md border border-border/70 p-2">extra guest rules: {recommendedDataView.extraGuestRules.length}</div>
                    <div className="rounded-md border border-border/70 p-2">promotions: {recommendedDataView.promotions.length}</div>
                  </div>

                  {recommendedDataView.roomTypes.length ? (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Room Types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {recommendedDataView.roomTypes.map((item) => (
                          <Badge key={`room-${item}`} variant="outline">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {recommendedDataView.boardTypes.length ? (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Board Types</p>
                      <div className="flex flex-wrap gap-1.5">
                        {recommendedDataView.boardTypes.map((item) => (
                          <Badge key={`board-${item}`} variant="outline">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {recommendedDataView.periods.length ? (
                    <div className="mt-3 overflow-x-auto rounded-md border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead>Start</TableHead>
                            <TableHead>End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendedDataView.periods.slice(0, 20).map((period, index) => (
                            <TableRow key={`period-${index}`}>
                              <TableCell>{String(period.label ?? period.name ?? "-")}</TableCell>
                              <TableCell>{String(period.start_date ?? period.from_date ?? "-")}</TableCell>
                              <TableCell>{String(period.end_date ?? period.to_date ?? "-")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {recommendedDataView.pricingLines.length ? (
                    <div className="mt-3 overflow-x-auto rounded-md border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Room</TableHead>
                            <TableHead>Board</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Adult Price</TableHead>
                            <TableHead>Currency</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendedDataView.pricingLines.slice(0, 30).map((line, index) => (
                            <TableRow key={`line-${index}`}>
                              <TableCell>{String(line.room_type ?? "-")}</TableCell>
                              <TableCell>{String(line.board_type ?? "-")}</TableCell>
                              <TableCell>{String(line.period_label ?? "-")}</TableCell>
                              <TableCell>{String(line.adult_price ?? "-")}</TableCell>
                              <TableCell>{String(line.currency ?? "-")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {recommendedDataView.extraGuestRules.length ? (
                    <div className="mt-3 overflow-x-auto rounded-md border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Guest Type</TableHead>
                            <TableHead>Position</TableHead>
                            <TableHead>% Adult</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendedDataView.extraGuestRules.slice(0, 30).map((rule, index) => (
                            <TableRow key={`guest-rule-${index}`}>
                              <TableCell className="max-w-[22rem] text-xs">{String(rule.description ?? rule.condition ?? "-")}</TableCell>
                              <TableCell>{String(rule.guest_type ?? "-")}</TableCell>
                              <TableCell>{String(rule.guest_position ?? "-")}</TableCell>
                              <TableCell>{String(rule.percent_of_adult ?? "-")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {recommendedDataView.promotions.length ? (
                    <div className="mt-3 overflow-x-auto rounded-md border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Discount %</TableHead>
                            <TableHead>Start</TableHead>
                            <TableHead>End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recommendedDataView.promotions.slice(0, 20).map((promo, index) => (
                            <TableRow key={`promo-${index}`}>
                              <TableCell>{String(promo.name ?? "-")}</TableCell>
                              <TableCell>{String(promo.discount_percent ?? "-")}</TableCell>
                              <TableCell>{String(promo.start_date ?? "-")}</TableCell>
                              <TableCell>{String(promo.end_date ?? "-")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  <Textarea value={recommendedDataText} readOnly className="mt-3 min-h-[220px] font-mono text-xs" />
                </div>

                <div className="rounded-lg border border-border/70 p-3">
                  <p className="text-sm font-semibold">Recommended Schema</p>
                  <p className="mt-1 text-xs text-muted-foreground">{lastRecommendation.suggested_schema_rationale}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setMappingInstructions(lastRecommendation.suggested_mapping_instructions)}
                    >
                      <Lightbulb className="mr-1 size-3.5" />
                      Use suggested mapping instructions
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSchemaText(recommendedSchemaText)}
                    >
                      <Lightbulb className="mr-1 size-3.5" />
                      Use recommended schema
                    </Button>
                  </div>
                  <Textarea value={recommendedSchemaText} readOnly className="mt-2 min-h-[220px] font-mono text-xs" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Mapping Instructions</Label>
            <Textarea
              value={mappingInstructions}
              onChange={(event) => setMappingInstructions(event.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label>JSON Schema (Structured Output Contract)</Label>
            <Textarea value={schemaText} onChange={(event) => setSchemaText(event.target.value)} className="min-h-[260px] font-mono" />
          </div>

          <Button type="submit" disabled={recommendingModel || extracting || persisting || !isHotelSelected}>
            <Sparkles className="mr-1.5 size-4" />
            {extracting ? "Extracting..." : "Extract with AI"}
          </Button>
        </form>
      </SectionCard>

      {lastExtraction ? (
        <SectionCard title="Extraction Result" description="Review and edit extracted JSON before persisting.">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">model {lastExtraction.model}</Badge>
            <Badge variant="outline">file {lastExtraction.file_name}</Badge>
            {usageSummary ? <Badge variant="outline">{usageSummary}</Badge> : null}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Normalized extracted terms</h4>
              <div className="rounded-2xl border border-border/70 bg-muted/35 p-3 text-sm">
                <p><strong>Room types:</strong> {lastExtraction.normalized_extraction.room_types.join(", ") || "-"}</p>
                <p><strong>Periods:</strong> {lastExtraction.normalized_extraction.seasonal_periods.join(", ") || "-"}</p>
                <p><strong>Board types:</strong> {lastExtraction.normalized_extraction.board_types.join(", ") || "-"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Suggested rules from extraction</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expression</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lastExtraction.suggested_rules.slice(0, 20).map((rule, index) => (
                    <TableRow key={`${rule.name}-${index}`}>
                      <TableCell>{rule.name}</TableCell>
                      <TableCell>{rule.rule_type}</TableCell>
                      <TableCell className="max-w-[20rem] text-xs">{rule.expression}</TableCell>
                      <TableCell>{rule.priority}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>Reviewed Extracted JSON</Label>
            <Textarea value={reviewedJson} onChange={(event) => setReviewedJson(event.target.value)} className="min-h-[320px] font-mono" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onPersist} disabled={recommendingModel || persisting || extracting || !isHotelSelected}>
              <Database className="mr-1.5 size-4" />
              {persisting ? "Persisting..." : "Persist contract + rules"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewedJson(toPrettyJson(lastExtraction.extracted_data))}
              disabled={persisting || extracting}
            >
              <Bot className="mr-1.5 size-4" />
              Reset to model output
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {lastPersisted ? (
        <SectionCard title="Persistence Result" description="Contract and rules saved for the selected hotel/operator.">
          <div className="space-y-1 text-sm">
            <p>
              <strong>Contract:</strong> {lastPersisted.contract.file_name} ({lastPersisted.contract.operator_code} · {lastPersisted.contract.hotel_code})
            </p>
            <p><strong>Model:</strong> {lastPersisted.model}</p>
            <p><strong>Created Rules:</strong> {lastPersisted.created_rules.length}</p>
          </div>

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expression</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastPersisted.created_rules.slice(0, 20).map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>{rule.rule_type}</TableCell>
                    <TableCell>{rule.expression}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Try with your sample file"
        description="You can upload: OLYMPIC LAGOON RESORT PAPHOS S25.pdf and tune the schema/mapping instructions until extraction quality is acceptable."
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileUp className="size-4" />
          Machine-readable pricing PDFs are parsed as text first, then structurally extracted with OpenAI and stored in Mongo after review.
        </div>
      </SectionCard>
    </PageShell>
  );
}
