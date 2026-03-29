import { useCallback, useEffect, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type { Invitation, InvitationCreateResult, UserRole } from "@/api/types";
import { notifyError, notifySuccess } from "@/lib/notify";

export type InvitationFormValues = {
  email: string;
  role: UserRole;
  expires_in_hours: number;
};

function invitationLink(token: string) {
  return `${window.location.origin}/?invitation=${encodeURIComponent(token)}`;
}

export function useInvitationsManagement() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const controller = new AbortController();
    loadAbortRef.current?.abort();
    loadAbortRef.current = controller;
    try {
      const response = await api.get<Invitation[]>("/invitations", { signal: controller.signal });
      setItems(response.data);
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load invitations.");
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load().catch(() => null);
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load]);

  const createInvitation = useCallback(
    async (values: InvitationFormValues) => {
      try {
        const response = await api.post<InvitationCreateResult>("/invitations", values);
        await load();
        notifySuccess("Invitation created. Copy and share the onboarding link now.");
        return response.data;
      } catch (error) {
        notifyError(error, "Could not create invitation.");
        return null;
      }
    },
    [load],
  );

  const copyText = useCallback(async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(successMessage);
    } catch {
      notifyError(new Error("Copy to clipboard is not available."), "Copy to clipboard is not available.");
    }
  }, []);

  const copyInvitationToken = useCallback(
    async (token: string) => {
      await copyText(token, "Invitation token copied.");
    },
    [copyText],
  );

  const copyInvitationLink = useCallback(
    async (token: string) => {
      await copyText(invitationLink(token), "Invitation link copied.");
    },
    [copyText],
  );

  return {
    items,
    loading,
    createInvitation,
    copyInvitationToken,
    copyInvitationLink,
  };
}
