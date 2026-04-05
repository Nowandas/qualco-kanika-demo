import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bolt, ChevronDown, LogOut, PanelLeft, SlidersHorizontal } from "lucide-react";
import { Outlet, useNavigate } from "react-router-dom";

import { api } from "@/api/client";
import type { ContractDocument } from "@/api/types";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { ProfileEditModal } from "@/components/layout/profile-edit-modal";
import { Sidebar } from "@/components/layout/sidebar";
import { UploadLimitsSettingsModal } from "@/components/layout/upload-limits-settings-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/lib/auth";
import { HOTEL_SCOPE_ALL, HotelScopeProvider, useHotelScope } from "@/lib/hotel-scope";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";

export function AppLayout() {
  return (
    <HotelScopeProvider>
      <AppLayoutShell />
    </HotelScopeProvider>
  );
}

function AppLayoutShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [limitsModalOpen, setLimitsModalOpen] = useState(false);
  const [profileEditModalOpen, setProfileEditModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [quickContracts, setQuickContracts] = useState<ContractDocument[]>([]);
  const [quickContractsLoading, setQuickContractsLoading] = useState(false);
  const [quickSelectedContractId, setQuickSelectedContractId] = useState("");
  const [quickPromotionOperatorCode, setQuickPromotionOperatorCode] = useState("");
  const [quickPromotionFile, setQuickPromotionFile] = useState<File | null>(null);
  const [quickPromotionIngesting, setQuickPromotionIngesting] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const quickActionsMenuRef = useRef<HTMLDivElement | null>(null);

  const { user, logout, refresh } = useAuth();
  const { hotels, selectedHotelId, setSelectedHotelId } = useHotelScope();
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

  const onProfileUpdated = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileOpen((current) => !current);
      return;
    }
    setCollapsed((current) => !current);
  };

  const loadQuickContracts = useCallback(async () => {
    const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
    setQuickContractsLoading(true);
    try {
      const response = await api.get<ContractDocument[]>("/hospitality/contracts", {
        params: {
          hotel_id: scopedHotelId,
          limit: 1000,
          sort_by: "updated_at",
          sort_order: "desc",
        },
      });
      setQuickContracts(response.data);
      setQuickSelectedContractId((previous) => {
        if (response.data.some((item) => item.id === previous)) {
          return previous;
        }
        return response.data[0]?.id ?? "";
      });
    } catch (error) {
      notifyError(error, "Could not load contracts for quick actions.");
      setQuickContracts([]);
      setQuickSelectedContractId("");
    } finally {
      setQuickContractsLoading(false);
    }
  }, [selectedHotelId]);

  useEffect(() => {
    void loadQuickContracts();
  }, [loadQuickContracts]);

  const quickSelectedContract = useMemo(
    () => quickContracts.find((item) => item.id === quickSelectedContractId) ?? null,
    [quickContracts, quickSelectedContractId],
  );

  useEffect(() => {
    if (!quickSelectedContract) {
      return;
    }
    setQuickPromotionOperatorCode(quickSelectedContract.operator_code);
  }, [quickSelectedContract]);

  const onQuickPromotionIngest = useCallback(async () => {
    const selectedContract = quickSelectedContract;
    if (!selectedContract) {
      notifyInfo("Select a contract first.");
      return;
    }
    if (!quickPromotionFile) {
      notifyInfo("Select a promotion file first.");
      return;
    }
    if (quickPromotionIngesting) {
      return;
    }

    setQuickPromotionIngesting(true);
    try {
      const formData = new FormData();
      formData.append("file", quickPromotionFile);
      if (selectedContract.hotel_id) {
        formData.append("hotel_id", selectedContract.hotel_id);
      } else if (selectedHotelId !== HOTEL_SCOPE_ALL) {
        formData.append("hotel_id", selectedHotelId);
      }
      formData.append("hotel_code", selectedContract.hotel_code);
      formData.append("operator_code", quickPromotionOperatorCode.trim().toUpperCase() || selectedContract.operator_code);
      formData.append("contract_ids", selectedContract.id);

      const response = await api.post<{ analysis_summary?: string }>("/hospitality/promotions/ai-ingest", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      notifySuccess(response.data.analysis_summary || "Promotion parsed and applied to contract rules.");
      setQuickPromotionFile(null);
      await loadQuickContracts();
    } catch (error) {
      notifyError(error, "Could not ingest promotion from quick actions.");
    } finally {
      setQuickPromotionIngesting(false);
    }
  }, [
    loadQuickContracts,
    quickPromotionFile,
    quickPromotionIngesting,
    quickPromotionOperatorCode,
    quickSelectedContract,
    selectedHotelId,
  ]);

  useEffect(() => {
    if (!profileMenuOpen && !quickActionsOpen) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileMenuOpen && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
      if (quickActionsOpen && quickActionsMenuRef.current && !quickActionsMenuRef.current.contains(target)) {
        setQuickActionsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setQuickActionsOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen, quickActionsOpen]);

  return (
    <>
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
            <div className="relative" ref={quickActionsMenuRef}>
              <Button
                type="button"
                variant="outline"
                className="h-auto gap-2 rounded-xl px-3 py-2"
                aria-haspopup="menu"
                aria-expanded={quickActionsOpen}
                onClick={() => setQuickActionsOpen((current) => !current)}
              >
                <Bolt className="size-4" />
                <span className="hidden sm:inline">Quick Actions</span>
                <ChevronDown className={`size-4 transition-transform ${quickActionsOpen ? "rotate-180" : ""}`} />
              </Button>

              {quickActionsOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[1200] mt-2.5 w-[30rem] rounded-2xl border border-border/90 bg-white/95 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Hotel scope</Label>
                      <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={HOTEL_SCOPE_ALL}>All hotels</SelectItem>
                          {hotels.map((hotel) => (
                            <SelectItem key={hotel.id} value={hotel.id}>
                              {hotel.name} · {hotel.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Contract</Label>
                      <Select
                        value={quickSelectedContractId || "none"}
                        onValueChange={(value) => setQuickSelectedContractId(value === "none" ? "" : value)}
                        disabled={quickContractsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={quickContractsLoading ? "Loading contracts..." : "Select contract"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No contract selected</SelectItem>
                          {quickContracts.map((contract) => (
                            <SelectItem key={contract.id} value={contract.id}>
                              {contract.file_name} · {contract.operator_code} · {contract.hotel_code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!quickSelectedContractId) {
                          notifyInfo("Select a contract first.");
                          return;
                        }
                        setQuickActionsOpen(false);
                        navigate(`/app/contracts/${quickSelectedContractId}`);
                      }}
                    >
                      <ArrowUpRight className="mr-1.5 size-4" />
                      Open contract
                    </Button>
                  </div>

                  <div className="my-3 h-px bg-border/80" />

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Operator</Label>
                      <Input
                        value={quickPromotionOperatorCode}
                        onChange={(event) => setQuickPromotionOperatorCode(event.target.value)}
                        placeholder="JET2"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>Promotion file</Label>
                      <Input
                        type="file"
                        accept=".pdf,.txt,.eml,.doc,.docx"
                        onChange={(event) => setQuickPromotionFile(event.target.files?.[0] ?? null)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      AI-parse promotion terms and append promotion rule to selected contract.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onQuickPromotionIngest()}
                      disabled={quickPromotionIngesting || !quickPromotionFile || !quickSelectedContractId}
                    >
                      {quickPromotionIngesting ? "Ingesting..." : "AI ingest promo"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

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

                  <button
                    type="button"
                    role="menuitem"
                    className="group flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-accent/80 hover:text-accent-foreground"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setProfileEditModalOpen(true);
                    }}
                  >
                    <SlidersHorizontal className="mt-0.5 h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-none">Edit profile</span>
                      <span className="mt-1 block text-xs text-muted-foreground">Change your name and password</span>
                    </span>
                  </button>

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
      <ProfileEditModal
        open={profileEditModalOpen}
        user={user}
        onClose={() => setProfileEditModalOpen(false)}
        onUpdated={onProfileUpdated}
      />
    </>
  );
}
