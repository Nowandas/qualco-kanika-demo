import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, PanelLeft, SlidersHorizontal } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { Sidebar } from "@/components/layout/sidebar";
import { UploadLimitsSettingsModal } from "@/components/layout/upload-limits-settings-modal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/lib/auth";
import { HotelScopeProvider } from "@/lib/hotel-scope";
import { notifyError, notifySuccess } from "@/lib/notify";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [limitsModalOpen, setLimitsModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "User";

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

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) {
        return;
      }
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

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
          <header className="relative z-[900] flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-white/95 px-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] backdrop-blur transition-[width,height] ease-linear md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="sm" className="size-8 p-0" onClick={toggleSidebar}>
                <PanelLeft className="size-4" />
              </Button>
              <Separator orientation="vertical" className="mr-2 h-4" />
              <AppBreadcrumb />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative" ref={profileMenuRef}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto gap-2.5 rounded-xl border border-transparent bg-white px-2.5 py-1.5 shadow-sm transition hover:border-border hover:bg-muted/60"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  onClick={() => setProfileMenuOpen((current) => !current)}
                >
                  <UserAvatar className="h-9 w-9 rounded-lg ring-1 ring-border/80" />

                  <div className="hidden min-w-0 text-right sm:block">
                    <p className="max-w-[200px] truncate text-sm font-medium">{user?.full_name}</p>
                    <p className="max-w-[200px] truncate text-xs text-muted-foreground">{user?.email}</p>
                  </div>

                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${profileMenuOpen ? "rotate-180" : ""}`}
                  />
                </Button>

                {profileMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-[1200] mt-2.5 w-72 rounded-2xl border border-border/90 bg-white/95 p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur"
                  >
                    <div className="mb-2 rounded-xl bg-muted/60 px-3 py-2.5">
                      <p className="truncate text-sm font-semibold">{user?.full_name ?? "Signed-in user"}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
                      <p className="mt-1 inline-flex rounded-full border border-border/80 bg-background px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {roleLabel}
                      </p>
                    </div>

                    {user?.role === "admin" ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="group flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-accent/80 hover:text-accent-foreground"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          setLimitsModalOpen(true);
                        }}
                      >
                        <SlidersHorizontal className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-none">Settings</span>
                          <span className="mt-1 block text-xs text-muted-foreground">Manage upload limits and controls</span>
                        </span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      className="group flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-accent/80 hover:text-accent-foreground"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        void onLogout();
                      }}
                    >
                      <LogOut className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-none">Logout</span>
                        <span className="mt-1 block text-xs text-muted-foreground">Sign out of this session</span>
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
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
