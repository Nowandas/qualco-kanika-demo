import { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  PencilLine,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import toast, { type Toast as HotToast } from "react-hot-toast";

import { cn } from "@/lib/utils";

type ApiErrorPayload = {
  detail?: string | Array<{ msg?: string }> | Record<string, unknown>;
  message?: string;
};

type NotifyVariant = "success" | "error" | "info";

const variantTitle: Record<NotifyVariant, string> = {
  success: "Success",
  error: "Action Failed",
  info: "Notice",
};

const variantIconContainerClass: Record<NotifyVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-600",
  error: "border-rose-200 bg-rose-50 text-rose-600",
  info: "border-sky-200 bg-sky-50 text-sky-600",
};

const variantBarClass: Record<NotifyVariant, string> = {
  success: "bg-gradient-to-r from-emerald-500/85 via-sky-500/85 to-cyan-500/85",
  error: "bg-gradient-to-r from-rose-500/85 via-orange-500/85 to-amber-500/85",
  info: "bg-gradient-to-r from-sky-500/85 via-blue-500/85 to-indigo-500/85",
};

const UNSAFE_ERROR_PATTERNS = [
  /traceback/i,
  /\bexception\b/i,
  /\bstack\b/i,
  /\bsql\b/i,
  /\bmongo(db)?\b/i,
  /\bsecret\b/i,
  /\bpassword\b/i,
  /\btoken=/i,
  /\bselect\s+.+\s+from\b/i,
];

function sanitizeUserMessage(input: string, fallback: string): string {
  const normalized = input.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }
  const maxLength = normalized.includes("Reference:") ? 520 : 240;
  if (normalized.length > maxLength) {
    return fallback;
  }
  if (UNSAFE_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return fallback;
  }
  return normalized;
}

function resolveSuccessIcon(message: string): LucideIcon {
  const normalized = message.toLowerCase();

  if (/(delete|deleted|remove|removed|disable|disabled)/.test(normalized)) return Trash2;
  if (/(create|created|add|added|invitation)/.test(normalized)) return PlusCircle;
  if (/(sync|synchron|import)/.test(normalized)) return RefreshCw;
  if (/(sign in|signed in|login)/.test(normalized)) return LogIn;
  if (/(sign out|signed out|logout)/.test(normalized)) return LogOut;
  if (/(update|updated|changed|default|avatar|enable|enabled|role)/.test(normalized)) return PencilLine;

  return CheckCircle2;
}

function resolveErrorIcon(message: string): LucideIcon {
  const normalized = message.toLowerCase();

  if (/(forbidden|unauthorized|permission|admin access|staff access)/.test(normalized)) return ShieldAlert;
  if (/(network|connect|timeout|offline|getaddrinfo|dns)/.test(normalized)) return WifiOff;
  if (/(not found|missing)/.test(normalized)) return XCircle;

  return AlertTriangle;
}

function resolveIcon(variant: NotifyVariant, message: string): LucideIcon {
  if (variant === "error") return resolveErrorIcon(message);
  if (variant === "info") return Info;
  return resolveSuccessIcon(message);
}

function NotificationToast({
  toastRef,
  variant,
  message,
  durationMs,
}: {
  toastRef: HotToast;
  variant: NotifyVariant;
  message: string;
  durationMs: number;
}) {
  const Icon = resolveIcon(variant, message);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setProgress(0));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="pointer-events-auto w-[min(92vw,360px)] overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-[0_14px_32px_-18px_rgba(15,23,42,0.45)]"
      style={{
        opacity: toastRef.visible ? 1 : 0,
        transform: toastRef.visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.985)",
        transition: "all 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div className="flex items-start gap-2.5 p-2.5">
        <div className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border", variantIconContainerClass[variant])}>
          <Icon className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-foreground/95">{variantTitle[variant]}</p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">{message}</p>
        </div>

        <button
          type="button"
          onClick={() => toast.dismiss(toastRef.id)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 w-full bg-muted/65">
        <div
          className={cn("h-full origin-left", variantBarClass[variant])}
          style={{
            width: `${progress}%`,
            transition: `width ${durationMs}ms linear`,
          }}
        />
      </div>
    </div>
  );
}

function showNotification(variant: NotifyVariant, message: string, duration = 1800) {
  toast.custom(
    (toastRef) => (
      <NotificationToast toastRef={toastRef} variant={variant} message={message} durationMs={duration} />
    ),
    { duration },
  );
}

export function apiErrorMessage(error: unknown, fallback = "Action failed."): string {
  if (isAxiosError<ApiErrorPayload>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return sanitizeUserMessage(detail, fallback);
    }

    if (Array.isArray(detail)) {
      const fromArray = detail
        .map((item) => item?.msg?.trim())
        .filter(Boolean)
        .join(", ");
      if (fromArray) {
        return sanitizeUserMessage(fromArray, fallback);
      }
    }

    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const detailMessage = (detail as { message?: string }).message;
      if (typeof detailMessage === "string" && detailMessage.trim()) {
        return sanitizeUserMessage(detailMessage, fallback);
      }
    }

    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) {
      return sanitizeUserMessage(message, fallback);
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return sanitizeUserMessage(error.message, fallback);
  }

  return fallback;
}

export function notifySuccess(message: string) {
  showNotification("success", message, 1600);
}

export function notifyError(error: unknown, fallback = "Action failed.") {
  showNotification("error", apiErrorMessage(error, fallback), 2100);
}

export function notifyInfo(message: string) {
  showNotification("info", message, 1600);
}
