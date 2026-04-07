import { useCallback, useEffect, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type { Invitation, InvitationCreateResult, InvitationTokenIssueResult, UserRole } from "@/api/types";
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
  const [issuingTokenInvitationId, setIssuingTokenInvitationId] = useState<string | null>(null);
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

  const issueInvitationToken = useCallback(
    async (invitationId: string) => {
      if (!invitationId.trim()) {
        return null;
      }
      setIssuingTokenInvitationId(invitationId);
      try {
        const response = await api.post<InvitationTokenIssueResult>(`/invitations/${encodeURIComponent(invitationId)}/issue-token`);
        await load();
        return response.data;
      } catch (error) {
        notifyError(error, "Could not issue a fresh invitation token.");
        return null;
      } finally {
        setIssuingTokenInvitationId((current) => (current === invitationId ? null : current));
      }
    },
    [load],
  );

  const copyInvitationTokenForInvitation = useCallback(
    async (invitationId: string) => {
      const issued = await issueInvitationToken(invitationId);
      if (!issued) {
        return;
      }
      await copyText(issued.token, "Invitation token copied.");
    },
    [copyText, issueInvitationToken],
  );

  const copyInvitationLinkForInvitation = useCallback(
    async (invitationId: string) => {
      const issued = await issueInvitationToken(invitationId);
      if (!issued) {
        return;
      }
      await copyText(invitationLink(issued.token), "Invitation link copied.");
    },
    [copyText, issueInvitationToken],
  );

  return {
    items,
    loading,
    issuingTokenInvitationId,
    createInvitation,
    copyInvitationToken,
    copyInvitationLink,
    copyInvitationTokenForInvitation,
    copyInvitationLinkForInvitation,
  };
}
