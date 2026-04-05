import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpenText, Bot, Building2, Database, FileSpreadsheet, FileSearch, GalleryVerticalEnd, MailPlus, Plus, Settings2, Sparkles, Users, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

import type { Hotel } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyInfo } from "@/lib/notify";

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

type NavigationItem = {
  label: string;
  to: string;
  icon: typeof FileSearch;
  subItem?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Contract Management",
    items: [
      { label: "Contracts", to: "/app/contracts", icon: FileSearch },
      { label: "Pricing AI", to: "/app/pricing-ingestion", icon: Bot },
      { label: "Reconciliations", to: "/app/reconciliations", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Users",
    items: [
      { label: "Users", to: "/app/users", icon: Users },
      { label: "Invitations", to: "/app/invitations", icon: MailPlus },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "Demo Documentation", to: "/app/demo-documentation/overview", icon: BookOpenText },
      { label: "Business", to: "/app/demo-documentation/business", icon: Building2, subItem: true },
      { label: "Frontend", to: "/app/demo-documentation/frontend", icon: Sparkles, subItem: true },
      { label: "Backend", to: "/app/demo-documentation/backend", icon: Database, subItem: true },
    ],
  },
];

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function HotelManagementModal({
  hotels,
  busy,
  onClose,
  onCreate,
  onUpdate,
}: {
  hotels: Hotel[];
  busy: boolean;
  onClose: () => void;
  onCreate: (payload: { code: string; name: string; is_active: boolean }) => Promise<void>;
  onUpdate: (hotelId: string, payload: { code: string; name: string; is_active: boolean }) => Promise<void>;
}) {
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [editingHotelId, setEditingHotelId] = useState("");
  const [editingCode, setEditingCode] = useState("");
  const [editingName, setEditingName] = useState("");
  const [editingIsActive, setEditingIsActive] = useState(true);

  const activeHotels = useMemo(
    () => hotels.filter((hotel) => hotel.is_active).length,
    [hotels],
  );

  useEffect(() => {
    if (!hotels.length) {
      setEditingHotelId("");
      return;
    }
    setEditingHotelId((previous) => {
      if (previous && hotels.some((hotel) => hotel.id === previous)) {
        return previous;
      }
      return hotels[0].id;
    });
  }, [hotels]);

  useEffect(() => {
    if (!editingHotelId) {
      setEditingCode("");
      setEditingName("");
      setEditingIsActive(true);
      return;
    }
    const selected = hotels.find((hotel) => hotel.id === editingHotelId);
    if (!selected) {
      return;
    }
    setEditingCode(selected.code);
    setEditingName(selected.name);
    setEditingIsActive(selected.is_active);
  }, [editingHotelId, hotels]);

  const onCreateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      notifyInfo("Hotel code and name are required.");
      return;
    }
    await onCreate({
      code: newCode.trim().toUpperCase(),
      name: newName.trim(),
      is_active: newIsActive,
    });
    setNewCode("");
    setNewName("");
    setNewIsActive(true);
  };

  const onUpdateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingHotelId) {
      notifyInfo("Select a hotel to edit.");
      return;
    }
    if (!editingCode.trim() || !editingName.trim()) {
      notifyInfo("Hotel code and name are required.");
      return;
    }
    await onUpdate(editingHotelId, {
      code: editingCode.trim().toUpperCase(),
      name: editingName.trim(),
      is_active: editingIsActive,
    });
  };

  return (
    createPortal(
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Hotel Management</p>
              <p className="text-xs text-muted-foreground">
                {hotels.length} hotels · {activeHotels} active
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close hotel management">
              <X className="size-4" />
            </Button>
          </div>

          <div className="grid gap-5 p-4 md:grid-cols-2">
            <form className="space-y-3 rounded-xl border border-border/70 p-3" onSubmit={onCreateSubmit}>
              <p className="text-sm font-semibold">Create hotel</p>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="PAPHOS" />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Olympic Lagoon Resort Paphos" />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={newIsActive}
                  onChange={(event) => setNewIsActive(event.target.checked)}
                />
                Active hotel
              </label>
              <Button type="submit" disabled={busy}>
                <Plus className="mr-1.5 size-4" />
                Add hotel
              </Button>
            </form>

            <form className="space-y-3 rounded-xl border border-border/70 p-3" onSubmit={onUpdateSubmit}>
              <p className="text-sm font-semibold">Edit hotel</p>
              <div className="space-y-1.5">
                <Label>Select hotel</Label>
                <Select value={editingHotelId} onValueChange={setEditingHotelId} disabled={!hotels.length}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select hotel" />
                  </SelectTrigger>
                  <SelectContent>
                    {hotels.map((hotel) => (
                      <SelectItem key={hotel.id} value={hotel.id}>
                        {hotel.name} · {hotel.code}{hotel.is_active ? "" : " (inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={editingCode} onChange={(event) => setEditingCode(event.target.value)} disabled={!editingHotelId} />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} disabled={!editingHotelId} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={editingIsActive}
                  onChange={(event) => setEditingIsActive(event.target.checked)}
                  disabled={!editingHotelId}
                />
                Active hotel
              </label>
              <Button type="submit" variant="secondary" disabled={busy || !editingHotelId}>
                Save changes
              </Button>
            </form>
          </div>
        </div>
      </div>,
      document.body,
    )
  );
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { pathname } = useLocation();
  const {
    hotels,
    loading,
    busy,
    selectedHotelId,
    selectedHotel,
    setSelectedHotelId,
    createHotel,
    updateHotel,
  } = useHotelScope();
  const [hotelModalOpen, setHotelModalOpen] = useState(false);
  const flatNavigation = useMemo(() => navigationGroups.flatMap((group) => group.items), []);

  const baseClasses = cn(
    "h-svh border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-linear",
    collapsed ? "w-[3.2rem]" : "w-[14rem]",
    mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
  );

  return (
    <aside className={cn("fixed inset-y-0 left-0 z-40 md:sticky md:inset-y-auto md:top-0 md:self-start", baseClasses)}>
      <div className="flex h-full flex-col">
        <div className="border-b border-sidebar-border p-2">
          <div className="flex w-full items-center gap-2 rounded-lg px-2 py-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            {!collapsed ? (
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">kanika-demo</span>
                <span className="truncate text-xs text-muted-foreground">Hospitality automation</span>
              </div>
            ) : null}
          </div>

          {!collapsed ? (
            <div className="mt-2 space-y-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 p-2">
              <div className="space-y-1">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Hotel View</p>
                <Select value={selectedHotelId} onValueChange={setSelectedHotelId} disabled={loading}>
                  <SelectTrigger className="h-8 rounded-lg border-sidebar-border/80 bg-sidebar">
                    <SelectValue placeholder={loading ? "Loading hotels..." : "Select hotel"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={HOTEL_SCOPE_ALL}>All hotels</SelectItem>
                    {hotels.map((hotel) => (
                      <SelectItem key={hotel.id} value={hotel.id}>
                        {hotel.name} · {hotel.code}{hotel.is_active ? "" : " (inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="button" size="sm" variant="outline" className="w-full justify-start" onClick={() => setHotelModalOpen(true)}>
                <Settings2 className="mr-1.5 size-4" />
                Manage hotels
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 flex h-8 w-full items-center justify-center rounded-md border border-sidebar-border/70 bg-sidebar-accent/50 text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent"
              onClick={() => setHotelModalOpen(true)}
              title={selectedHotel ? `${selectedHotel.name} (${selectedHotel.code})` : "All hotels"}
            >
              <Building2 className="size-4" />
            </button>
          )}
        </div>

        <div className={cn("flex-1 p-2", collapsed ? "overflow-visible" : "overflow-y-auto")}>
          {collapsed ? (
            <nav className="space-y-1">
              {flatNavigation.map((item) => {
                const active = isActive(pathname, item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                      "justify-center px-0",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70",
                    )}
                    onClick={() => {
                      if (mobileOpen) onCloseMobile();
                    }}
                  >
                    <item.icon className="size-4 shrink-0" />
                  </Link>
                );
              })}
            </nav>
          ) : (
            <nav className="space-y-3">
              {navigationGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                          item.subItem ? "pl-7 text-[13px]" : "",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70",
                        )}
                        onClick={() => {
                          if (mobileOpen) onCloseMobile();
                        }}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="absolute inset-y-0 right-0 hidden w-px bg-sidebar-border md:block" />

      {hotelModalOpen ? (
        <HotelManagementModal
          hotels={hotels}
          busy={busy}
          onClose={() => setHotelModalOpen(false)}
          onCreate={async (payload) => {
            const created = await createHotel(payload);
            if (created) {
              setSelectedHotelId(created.id);
            }
          }}
          onUpdate={async (hotelId, payload) => {
            await updateHotel(hotelId, payload);
          }}
        />
      ) : null}
    </aside>
  );
}
