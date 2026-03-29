import { useState } from "react";
import { ChevronDown, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "@/api/client";
import type { ContractDocument } from "@/api/types";
import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type ContractSortBy, type ContractSortOrder, useContractsExplorer } from "@/features/hospitality/use-contracts-explorer";
import { openBlobSafely } from "@/lib/blob-safety";
import { notifyError, notifyInfo } from "@/lib/notify";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function truncate(value: string, maxLength = 105): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

const SORT_OPTIONS: Array<{ value: ContractSortBy; label: string }> = [
  { value: "updated_at", label: "Updated At" },
  { value: "created_at", label: "Created At" },
  { value: "file_name", label: "File Name" },
  { value: "hotel_code", label: "Hotel Code" },
  { value: "operator_code", label: "Operator Code" },
  { value: "season_label", label: "Season Label" },
  { value: "source", label: "Source" },
  { value: "file_size", label: "File Size" },
  { value: "rule_count", label: "Rules Count" },
  { value: "room_count", label: "Room Types Count" },
  { value: "board_count", label: "Board Types Count" },
  { value: "discount_count", label: "Discounts Count" },
];

export function ContractsPage() {
  const navigate = useNavigate();
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const {
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
  } = useContractsExplorer();

  const openContractFile = async (contract: ContractDocument) => {
    if (!contract.has_uploaded_file) {
      notifyInfo("No uploaded file is available for this contract.");
      return;
    }
    if (openingFileId) {
      return;
    }
    setOpeningFileId(contract.id);
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
      setOpeningFileId(null);
    }
  };

  return (
    <PageShell
      title="Parsed Contracts"
      description="Explore parsed contracts with full-text search, structured filters, and sortable operational data."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => resetFilters()} disabled={busy}>
            Reset
          </Button>
          <Button variant="outline" onClick={() => refresh()} disabled={busy}>
            Refresh
          </Button>
        </div>
      }
    >
      <SectionCard
        title="Search and Filters"
        description="Search across parsed text and extracted terms, then narrow by hotel, operator, season, source, and rule coverage."
      >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="contracts-search">Full-text search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="contracts-search"
                  className="pl-9"
                  placeholder="Search file name, hotel/operator code, season, parsed text, room type, board type, discounts..."
                  value={filters.searchText}
                  onChange={(event) => updateFilter("searchText", event.target.value)}
                />
              </div>
            </div>
            <Button
              variant="outline"
              type="button"
              onClick={() => setFiltersCollapsed((previous) => !previous)}
              className="justify-between"
            >
              {filtersCollapsed ? "Show filters" : "Hide filters"}
              <ChevronDown className={`ml-2 size-4 transition-transform ${filtersCollapsed ? "" : "rotate-180"}`} />
            </Button>
          </div>

          {!filtersCollapsed ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Hotel</Label>
                <Select value={filters.hotelCode} onValueChange={(value) => updateFilter("hotelCode", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All hotels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All hotels</SelectItem>
                    {filterOptions.hotels.map((hotelCode) => (
                      <SelectItem key={hotelCode} value={hotelCode}>
                        {hotelCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Operator</Label>
                <Select value={filters.operatorCode} onValueChange={(value) => updateFilter("operatorCode", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All operators" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All operators</SelectItem>
                    {filterOptions.operators.map((operatorCode) => (
                      <SelectItem key={operatorCode} value={operatorCode}>
                        {operatorCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Season</Label>
                <Select value={filters.seasonLabel} onValueChange={(value) => updateFilter("seasonLabel", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All seasons" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All seasons</SelectItem>
                    {filterOptions.seasons.map((seasonLabel) => (
                      <SelectItem key={seasonLabel} value={seasonLabel}>
                        {seasonLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={filters.source} onValueChange={(value) => updateFilter("source", value as typeof filters.source)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="upload">Upload</SelectItem>
                    <SelectItem value="seed">Seed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Rules</Label>
                <Select value={filters.hasRules} onValueChange={(value) => updateFilter("hasRules", value as typeof filters.hasRules)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="with_rules">With rules</SelectItem>
                    <SelectItem value="without_rules">Without rules</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Sort by</Label>
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as ContractSortBy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as ContractSortOrder)}>
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
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Contracts Table"
        description="Click any record to open detail view with generated rules and extracted pricing data."
      >
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          <span>{rows.length} records</span>
          <SlidersHorizontal className="ml-3 size-4" />
          <span>Sorted by {SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? sortBy}</span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading parsed contracts...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contracts match the current search and filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Season</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>File Size</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Rules</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.contract.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/contracts/${row.contract.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium">{row.contract.file_name}</p>
                      <p className="text-xs text-muted-foreground">{row.contract.id}</p>
                      {row.contract.has_uploaded_file ? (
                        <button
                          type="button"
                          className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                          onClick={async (event) => {
                            event.stopPropagation();
                            await openContractFile(row.contract);
                          }}
                        >
                          Open uploaded file
                        </button>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.contract.hotel_code}</TableCell>
                    <TableCell>{row.contract.operator_code}</TableCell>
                    <TableCell>{row.contract.season_label ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.contract.source}</Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(row.contract.file_size)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">rooms {row.roomCount}</Badge>
                        <Badge variant="outline">board {row.boardCount}</Badge>
                        <Badge variant="outline">discounts {row.discountCount}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>{row.ruleCount}</TableCell>
                    <TableCell>{formatDate(row.contract.updated_at)}</TableCell>
                    <TableCell className="max-w-[25rem]">
                      <span className="text-xs text-muted-foreground">{truncate(row.contract.parsed_text_preview || "-", 120)}</span>
                    </TableCell>
                    <TableCell>
                      {row.contract.has_uploaded_file ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={openingFileId === row.contract.id}
                          onClick={async (event) => {
                            event.stopPropagation();
                            await openContractFile(row.contract);
                          }}
                        >
                          {openingFileId === row.contract.id ? "Opening..." : "View file"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/app/contracts/${row.contract.id}`);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
