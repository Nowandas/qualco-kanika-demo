import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";

import { api } from "@/api/client";
import type { User } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

type Props = {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onUpdated: () => Promise<void>;
};

export function ProfileEditModal({ open, user, onClose, onUpdated }: Props) {
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFullName(user?.full_name ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }, [open, user]);

  const passwordIntent = useMemo(() => {
    return [currentPassword, newPassword, confirmNewPassword].some((value) => value.trim().length > 0);
  }, [currentPassword, newPassword, confirmNewPassword]);

  if (!open || !user || typeof document === "undefined") {
    return null;
  }

  const onSave = async () => {
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      notifyInfo("Full name must be at least 2 characters.");
      return;
    }

    if (passwordIntent) {
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        notifyInfo("Fill current, new, and confirm password fields to change password.");
        return;
      }
      if (newPassword.length < 8) {
        notifyInfo("New password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        notifyInfo("New password and confirmation do not match.");
        return;
      }
    }

    const avatarSeed = (user.avatar_seed && user.avatar_seed.trim()) || user.email || "user-avatar";
    const avatarStyle = (user.avatar_style && user.avatar_style.trim()) || "adventurer-neutral";

    setSaving(true);
    try {
      await api.patch<User>("/users/me/profile", {
        full_name: trimmedName,
        avatar_seed: avatarSeed,
        avatar_style: avatarStyle,
      });

      if (passwordIntent) {
        await api.patch("/users/me/password", {
          current_password: currentPassword,
          new_password: newPassword,
        });
      }

      await onUpdated();
      notifySuccess(passwordIntent ? "Profile and password updated." : "Profile updated.");
      onClose();
    } catch (error) {
      notifyError(error, "Could not update profile settings.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl border border-border/70 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Edit Profile</p>
            <p className="text-xs text-muted-foreground">Update your name and password for the current account.</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={saving} aria-label="Close profile editor">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user.email} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-full-name">Full name</Label>
            <Input
              id="profile-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={saving}
              minLength={2}
              maxLength={120}
            />
          </div>

          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-sm font-semibold">Change password (optional)</p>
            <p className="mt-1 text-xs text-muted-foreground">Leave blank if you only want to update your name.</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="profile-current-password">Current password</Label>
                <Input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={saving}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-new-password">New password</Label>
                <Input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={saving}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-confirm-password">Confirm new password</Label>
                <Input
                  id="profile-confirm-password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  disabled={saving}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            <Save className="mr-1.5 size-4" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
