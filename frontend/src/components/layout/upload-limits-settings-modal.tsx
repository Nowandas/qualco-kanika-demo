import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";

import { api } from "@/api/client";
import type { UploadLimits, UploadLimitsUpdatePayload } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

type UploadLimitFieldKey = keyof UploadLimitsUpdatePayload;

const FIELD_META: Array<{ key: UploadLimitFieldKey; label: string; description: string }> = [
  {
    key: "contract_mb",
    label: "Contract Upload",
    description: "General contract file uploads.",
  },
  {
    key: "pricing_ai_mb",
    label: "Pricing AI Upload",
    description: "Recommend/extract AI contract uploads.",
  },
  {
    key: "promotion_mb",
    label: "Promotion Upload",
    description: "Promotion ingestion and AI promotion uploads.",
  },
  {
    key: "reconciliation_mb",
    label: "Reconciliation Upload",
    description: "Workbook preview, AI mapping, and reconciliation import.",
  },
];

const FALLBACK_LIMITS: UploadLimitsUpdatePayload = {
  contract_mb: 10,
  promotion_mb: 8,
  reconciliation_mb: 8,
  pricing_ai_mb: 10,
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function UploadLimitsSettingsModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [limits, setLimits] = useState<UploadLimitsUpdatePayload>(FALLBACK_LIMITS);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get<UploadLimits>("/hospitality/upload-limits");
        const data = response.data;
        setLimits({
          contract_mb: Number(data.contract_mb) || FALLBACK_LIMITS.contract_mb,
          promotion_mb: Number(data.promotion_mb) || FALLBACK_LIMITS.promotion_mb,
          reconciliation_mb: Number(data.reconciliation_mb) || FALLBACK_LIMITS.reconciliation_mb,
          pricing_ai_mb: Number(data.pricing_ai_mb) || FALLBACK_LIMITS.pricing_ai_mb,
        });
        setLastUpdatedBy(data.updated_by_user_id ?? null);
        setLastUpdatedAt(data.updated_at ?? null);
      } catch (error) {
        notifyError(error, "Could not load upload limits settings.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open]);

  const canSubmit = useMemo(() => {
    return Object.values(limits).every((value) => Number.isInteger(value) && value >= 1 && value <= 100);
  }, [limits]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const setField = (key: UploadLimitFieldKey, rawValue: string) => {
    const trimmed = rawValue.trim();
    const parsed = Number.parseInt(trimmed || "0", 10);
    setLimits((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }));
  };

  const onSave = async () => {
    if (!canSubmit) {
      notifyInfo("Each upload limit must be between 1 and 100 MB.");
      return;
    }

    setSaving(true);
    try {
      const response = await api.patch<UploadLimits>("/hospitality/upload-limits", limits);
      const data = response.data;
      setLimits({
        contract_mb: Number(data.contract_mb) || limits.contract_mb,
        promotion_mb: Number(data.promotion_mb) || limits.promotion_mb,
        reconciliation_mb: Number(data.reconciliation_mb) || limits.reconciliation_mb,
        pricing_ai_mb: Number(data.pricing_ai_mb) || limits.pricing_ai_mb,
      });
      setLastUpdatedBy(data.updated_by_user_id ?? null);
      setLastUpdatedAt(data.updated_at ?? null);
      notifySuccess("Upload limits updated.");
    } catch (error) {
      notifyError(error, "Could not update upload limits.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Upload Limits</p>
            <p className="text-xs text-muted-foreground">Configure max upload size (MB) for each ingestion flow.</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close upload limit settings">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_META.map((field) => (
              <div key={field.key} className="rounded-xl border border-border/70 p-3">
                <Label htmlFor={`upload-limit-${field.key}`}>{field.label}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    id={`upload-limit-${field.key}`}
                    inputMode="numeric"
                    min={1}
                    max={100}
                    type="number"
                    value={limits[field.key]}
                    disabled={loading || saving}
                    onChange={(event) => setField(field.key, event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">MB</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Allowed range: 1 to 100 MB per category.
            </p>
            <p>
              {lastUpdatedAt
                ? `Last updated: ${new Date(lastUpdatedAt).toLocaleString()}${lastUpdatedBy ? ` · by ${lastUpdatedBy}` : ""}`
                : "Using defaults until first update."}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button type="button" onClick={onSave} disabled={loading || saving || !canSubmit}>
            <Save className="mr-1.5 size-4" />
            {saving ? "Saving..." : "Save limits"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
