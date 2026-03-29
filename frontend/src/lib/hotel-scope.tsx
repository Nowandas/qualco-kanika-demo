import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";
import type { Hotel } from "@/api/types";
import { APP_STORAGE_SELECTED_HOTEL_KEY } from "@/config/app";
import { notifyError, notifySuccess } from "@/lib/notify";

export const HOTEL_SCOPE_ALL = "all";

type HotelScopeSelection = typeof HOTEL_SCOPE_ALL | string;

type HotelCreateInput = {
  code: string;
  name: string;
  is_active?: boolean;
};

type HotelUpdateInput = {
  code?: string;
  name?: string;
  is_active?: boolean;
};

type HotelScopeContextValue = {
  hotels: Hotel[];
  loading: boolean;
  busy: boolean;
  selectedHotelId: HotelScopeSelection;
  selectedHotel: Hotel | null;
  setSelectedHotelId: (hotelId: HotelScopeSelection) => void;
  refreshHotels: () => Promise<void>;
  createHotel: (payload: HotelCreateInput) => Promise<Hotel | null>;
  updateHotel: (hotelId: string, payload: HotelUpdateInput) => Promise<Hotel | null>;
};

const HotelScopeContext = createContext<HotelScopeContextValue | null>(null);

function sortHotels(items: Hotel[]): Hotel[] {
  return [...items].sort((left, right) => {
    if (left.is_active !== right.is_active) {
      return left.is_active ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
  });
}

export function HotelScopeProvider({ children }: { children: React.ReactNode }) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedHotelIdState, setSelectedHotelIdState] = useState<HotelScopeSelection>(() => {
    const value = localStorage.getItem(APP_STORAGE_SELECTED_HOTEL_KEY);
    if (!value || !value.trim()) {
      return HOTEL_SCOPE_ALL;
    }
    return value;
  });

  const setSelectedHotelId = useCallback((hotelId: HotelScopeSelection) => {
    const value = hotelId && hotelId.trim() ? hotelId : HOTEL_SCOPE_ALL;
    setSelectedHotelIdState(value);
    localStorage.setItem(APP_STORAGE_SELECTED_HOTEL_KEY, value);
  }, []);

  const refreshHotels = useCallback(async () => {
    try {
      const response = await api.get<Hotel[]>("/hotels", { params: { include_inactive: true } });
      const sorted = sortHotels(response.data);
      setHotels(sorted);
      setSelectedHotelIdState((previous) => {
        if (previous === HOTEL_SCOPE_ALL) {
          return previous;
        }
        const exists = sorted.some((hotel) => hotel.id === previous);
        if (exists) {
          return previous;
        }
        localStorage.setItem(APP_STORAGE_SELECTED_HOTEL_KEY, HOTEL_SCOPE_ALL);
        return HOTEL_SCOPE_ALL;
      });
    } catch (error) {
      notifyError(error, "Could not load hotels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHotels().catch(() => null);
  }, [refreshHotels]);

  const createHotel = useCallback(async (payload: HotelCreateInput) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = await api.post<Hotel>("/hotels", payload);
      const created = response.data;
      setHotels((previous) => sortHotels([...previous, created]));
      setSelectedHotelId(created.id);
      notifySuccess(`Hotel ${created.code} created.`);
      return created;
    } catch (error) {
      notifyError(error, "Could not create hotel.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy, setSelectedHotelId]);

  const updateHotel = useCallback(async (hotelId: string, payload: HotelUpdateInput) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = await api.patch<Hotel>(`/hotels/${hotelId}`, payload);
      const updated = response.data;
      setHotels((previous) => sortHotels(previous.map((hotel) => (hotel.id === hotelId ? updated : hotel))));
      notifySuccess(`Hotel ${updated.code} updated.`);
      return updated;
    } catch (error) {
      notifyError(error, "Could not update hotel.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const selectedHotel = useMemo(() => {
    if (selectedHotelIdState === HOTEL_SCOPE_ALL) {
      return null;
    }
    return hotels.find((hotel) => hotel.id === selectedHotelIdState) ?? null;
  }, [hotels, selectedHotelIdState]);

  const value = useMemo(
    () => ({
      hotels,
      loading,
      busy,
      selectedHotelId: selectedHotelIdState,
      selectedHotel,
      setSelectedHotelId,
      refreshHotels,
      createHotel,
      updateHotel,
    }),
    [hotels, loading, busy, selectedHotelIdState, selectedHotel, setSelectedHotelId, refreshHotels, createHotel, updateHotel],
  );

  return <HotelScopeContext.Provider value={value}>{children}</HotelScopeContext.Provider>;
}

export function useHotelScope() {
  const context = useContext(HotelScopeContext);
  if (!context) {
    throw new Error("useHotelScope must be used within HotelScopeProvider");
  }
  return context;
}
