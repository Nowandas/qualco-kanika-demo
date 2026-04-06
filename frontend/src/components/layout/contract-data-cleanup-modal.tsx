import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

type ContractDataCleanupResponse = {
  scope: string;
  deleted_collections: Record<string, number>;
  total_deleted_documents: number;
  preserved_collections: string[];
  deleted_by_user_id: string;
  deleted_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const CONFIRM_TOKEN = "CLEAN";

export function ContractDataCleanupModal({ open, onClose }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ContractDataCleanupResponse | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setRunning(false);
      setProgress(0);
      setResult(null);
      if (progressTimerRef.current != null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!running) {
      if (progressTimerRef.current != null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }
    progressTimerRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        return Math.min(92, current + Math.max(2, Math.round((100 - current) * 0.08)));
      });
    }, 180);
    return () => {
      if (progressTimerRef.current != null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [running]);

  if (!open || typeof document === "undefined") return null;

  const onRunCleanup = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_TOKEN) {
      notifyInfo(`Type ${CONFIRM_TOKEN} to confirm cleanup.`);
      return;
    }

    setRunning(true);
    setResult(null);
    setProgress(6);
    try {
      const response = await api.post<ContractDataCleanupResponse>("/hospitality/admin/cleanup-contract-data");
      setResult(response.data);
      setProgress(100);
      notifySuccess(`Cleanup finished. Deleted ${response.data.total_deleted_documents} document(s).`);
    } catch (error) {
      notifyError(error, "Could not clean contract-related data.");
    } finally {
      setRunning(false);
    }
  };

  const deletedCollections = result ? Object.entries(result.deleted_collections).sort((a, b) => b[1] - a[1]) : [];

  return createPortal(
    <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Clean Contract Data</p>
            <p className="text-xs text-muted-foreground">Delete hospitality contract-related data while preserving users and invitations.</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={running} aria-label="Close cleanup modal">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-rose-300/70 bg-rose-50 p-3 text-sm text-rose-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" />
              Permanent action
            </div>
            <p className="text-xs">
              This deletes contracts, contract files, rules, promotions, sync runs, validations, alerts, AI extractions, and reconciliation data.
            </p>
            <p className="mt-1 text-xs">
              Preserved: users, invitations, password resets, hotels, and hospitality settings.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              Type {CONFIRM_TOKEN} to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              disabled={running}
              placeholder={CONFIRM_TOKEN}
            />
          </div>

          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-rose-600 transition-[width] duration-200"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {running ? `Deleting contract data... ${Math.round(progress)}%` : progress > 0 ? `Progress ${Math.round(progress)}%` : "Not started"}
            </p>
          </div>

          {result ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-sm font-semibold">Cleanup summary</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Deleted {result.total_deleted_documents} document(s) at {new Date(result.deleted_at).toLocaleString()}.
              </p>
              <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-border/70 bg-background">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/70 text-left">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Collection</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedCollections.map(([name, count]) => (
                      <tr key={name} className="border-t border-border/60">
                        <td className="px-2 py-1.5">{name}</td>
                        <td className="px-2 py-1.5 text-right">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={running}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onRunCleanup}
            disabled={running || confirmText.trim().toUpperCase() !== CONFIRM_TOKEN}
          >
            {running ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
            {running ? "Cleaning..." : "Clean contract data"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
