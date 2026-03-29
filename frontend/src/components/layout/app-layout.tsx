import { useState } from "react";
import { PanelLeft, SlidersHorizontal } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { Sidebar } from "@/components/layout/sidebar";
import { UploadLimitsSettingsModal } from "@/components/layout/upload-limits-settings-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { avatarUrl } from "@/lib/avatar";
import { useAuth } from "@/lib/auth";
import { HotelScopeProvider } from "@/lib/hotel-scope";
import { notifyError, notifySuccess } from "@/lib/notify";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [limitsModalOpen, setLimitsModalOpen] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    try {
      await logout();
      notifySuccess("Signed out.");
    } catch (error) {
      notifyError(error, "Could not sign out.");
    } finally {
      navigate("/");
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileOpen((current) => !current);
      return;
    }
    setCollapsed((current) => !current);
  };

  return (
    <HotelScopeProvider>
      <div className="group/sidebar-wrapper flex min-h-svh w-full">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/30 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 transition-[width,height] ease-linear md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="sm" className="size-8 p-0" onClick={toggleSidebar}>
                <PanelLeft className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mr-2 h-4" />
              <AppBreadcrumb />
            </div>

            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9 rounded-lg">
                <AvatarImage src={avatarUrl(user?.avatar_seed, user?.avatar_style)} />
                <AvatarFallback>{user?.full_name?.slice(0, 2).toUpperCase() ?? "U"}</AvatarFallback>
              </Avatar>

              <div className="hidden text-right sm:block">
                <p className="max-w-[200px] truncate text-sm font-medium">{user?.full_name}</p>
                <p className="max-w-[200px] truncate text-xs text-muted-foreground">{user?.email} · {user?.role}</p>
              </div>

              {user?.role === "admin" ? (
                <Button size="sm" variant="outline" onClick={() => setLimitsModalOpen(true)}>
                  <SlidersHorizontal className="mr-1.5 size-4" />
                  Settings
                </Button>
              ) : null}

              <Button size="sm" variant="secondary" onClick={onLogout}>
                Logout
              </Button>
            </div>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4 pt-4 md:p-6 md:pt-4">
            <Outlet />
          </div>
        </div>
      </div>
      <UploadLimitsSettingsModal open={limitsModalOpen} onClose={() => setLimitsModalOpen(false)} />
    </HotelScopeProvider>
  );
}
