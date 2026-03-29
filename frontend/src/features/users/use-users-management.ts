import { useCallback, useEffect, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type { PasswordResetLink, User, UserRole } from "@/api/types";
import { notifyError, notifySuccess } from "@/lib/notify";

function passwordResetLink(token: string) {
  return `${window.location.origin}/password-reset?token=${encodeURIComponent(token)}`;
}

export function useUsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const controller = new AbortController();
    loadAbortRef.current?.abort();
    loadAbortRef.current = controller;
    try {
      const response = await api.get<User[]>("/users", { signal: controller.signal });
      setUsers(response.data);
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load users.");
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

  const updateRole = useCallback(
    async (user: User, role: UserRole) => {
      try {
        await api.patch(`/users/${user.id}`, { role });
        await load();
        notifySuccess(`${user.full_name} role updated to ${role}.`);
      } catch (error) {
        notifyError(error, "Could not update user role.");
      }
    },
    [load],
  );

  const toggleActive = useCallback(
    async (user: User) => {
      try {
        await api.patch(`/users/${user.id}`, { is_active: !user.is_active });
        await load();
        notifySuccess(`${user.full_name} ${user.is_active ? "disabled" : "enabled"}.`);
      } catch (error) {
        notifyError(error, "Could not update user status.");
      }
    },
    [load],
  );

  const generatePasswordResetLink = useCallback(async (user: User) => {
    try {
      const response = await api.post<PasswordResetLink>(`/users/${user.id}/password-reset-link`, {
        expires_in_hours: 24,
      });
      const link = passwordResetLink(response.data.token);
      try {
        await navigator.clipboard.writeText(link);
        notifySuccess(`Password reset link copied for ${user.full_name}.`);
      } catch {
        window.prompt(`Copy password reset link for ${user.full_name}`, link);
        notifySuccess(`Password reset link generated for ${user.full_name}.`);
      }
    } catch (error) {
      notifyError(error, "Could not generate password reset link.");
    }
  }, []);

  return {
    users,
    loading,
    load,
    updateRole,
    toggleActive,
    generatePasswordResetLink,
  };
}
