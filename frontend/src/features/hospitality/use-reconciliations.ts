import { useCallback, useEffect, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type {
    ContractDocument,
    ReconciliationAIMapping,
    ReconciliationReservationBulkDeleteResult,
    ReconciliationImport,
    ReconciliationReservation,
    ReconciliationReservationDeleteResult,
    ReconciliationReservationList,
    ReconciliationWorkbookPreview,
    ValidationLineInput,
    ValidationRun,
  } from "@/api/types";
import { HOTEL_SCOPE_ALL, useHotelScope } from "@/lib/hotel-scope";
import { notifyError, notifySuccess } from "@/lib/notify";

type WorkbookPreviewParams = {
  file: File;
  contractId: string;
  sampleRows?: number;
};

type AIMappingParams = {
  file: File;
  contractId: string;
  sheetName: string;
  sourceSystem?: string;
  reservationIdColumn?: string;
  sampleLimit?: number;
  model?: string;
  mappingInstructions?: string;
};

type ReconciliationRunParams = {
  file: File;
  contractId: string;
  sheetName: string;
  sourceSystem?: string;
  useAiMapping: boolean;
  runLabel?: string;
  toleranceAmount?: number;
  tolerancePercent?: number;
  model?: string;
  mappingInstructions?: string;
};

type ReconciliationBatchRunParams = {
  contractId: string;
  lines: ValidationLineInput[];
  runLabel?: string;
  toleranceAmount?: number;
  tolerancePercent?: number;
};

type ReconciliationPersistImportParams = {
  fileName: string;
  contractId: string;
  sheetName: string;
  sourceSystem?: string;
  reservationIdColumn?: string;
  mappingSummary?: string;
  analysisProvider?: "openai";
  analysisModel?: string;
  analysisUsage?: Record<string, number>;
  lines: ValidationLineInput[];
};

type ReservationListParams = {
  contractId?: string;
  hotelId?: string;
  importId?: string;
  roomType?: string;
  boardType?: string;
  sourceSystem?: string;
  searchText?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: "stay_date" | "actual_price" | "room_type" | "reservation_id" | "created_at";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export function useReconciliations() {
  const { selectedHotelId } = useHotelScope();

  const [contracts, setContracts] = useState<ContractDocument[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastWorkbookPreview, setLastWorkbookPreview] = useState<ReconciliationWorkbookPreview | null>(null);
  const [lastAIMapping, setLastAIMapping] = useState<ReconciliationAIMapping | null>(null);
  const [lastPersistedImport, setLastPersistedImport] = useState<ReconciliationImport | null>(null);
  const [reservations, setReservations] = useState<ReconciliationReservation[]>([]);
  const [reservationsTotal, setReservationsTotal] = useState(0);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [lastValidationRun, setLastValidationRun] = useState<ValidationRun | null>(null);
  const contractsAbortRef = useRef<AbortController | null>(null);
  const reservationsAbortRef = useRef<AbortController | null>(null);

  const loadContracts = useCallback(async () => {
    const scopedHotelId = selectedHotelId !== HOTEL_SCOPE_ALL ? selectedHotelId : undefined;
    const controller = new AbortController();
    contractsAbortRef.current?.abort();
    contractsAbortRef.current = controller;
    setLoadingContracts(true);
    try {
      const response = await api.get<ContractDocument[]>("/hospitality/contracts", {
        params: { hotel_id: scopedHotelId, limit: 1000, sort_by: "updated_at", sort_order: "desc" },
        signal: controller.signal,
      });
      setContracts(response.data);
      if (!response.data.length) {
        setSelectedContractId("");
        return;
      }
      const selectedExists = response.data.some((item) => item.id === selectedContractId);
      if (!selectedExists) {
        const preferred = response.data.find((item) => Boolean(item.ai_extraction_run_id));
        setSelectedContractId((preferred ?? response.data[0]).id);
      }
    } catch (error) {
      if (isRequestCancelled(error)) {
        return;
      }
      notifyError(error, "Could not load contracts for reconciliation.");
    } finally {
      if (contractsAbortRef.current === controller) {
        contractsAbortRef.current = null;
        setLoadingContracts(false);
      }
    }
  }, [selectedContractId, selectedHotelId]);

  useEffect(() => {
    loadContracts().catch(() => null);
  }, [loadContracts]);

  useEffect(() => {
    setLastWorkbookPreview(null);
    setLastAIMapping(null);
    setLastPersistedImport(null);
    setReservations([]);
    setReservationsTotal(0);
    setLastValidationRun(null);
  }, [selectedContractId]);

  const refresh = useCallback(async () => {
    await loadContracts();
  }, [loadContracts]);

  const previewWorkbook = useCallback(async (params: WorkbookPreviewParams) => {
    if (busy) return null;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", params.file);
      formData.append("contract_id", params.contractId);
      if (params.sampleRows != null) {
        formData.append("sample_rows", String(params.sampleRows));
      }

      const response = await api.post<ReconciliationWorkbookPreview>("/hospitality/validate/reconciliation/workbook-preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastWorkbookPreview(response.data);
      notifySuccess("Workbook analyzed. Select the reservation sheet.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not analyze the reconciliation workbook.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const mapWithAi = useCallback(async (params: AIMappingParams) => {
    if (busy) return null;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", params.file);
      formData.append("contract_id", params.contractId);
      formData.append("sheet_name", params.sheetName);
      if (params.sourceSystem) {
        formData.append("source_system", params.sourceSystem);
      }
      if (params.reservationIdColumn) {
        formData.append("reservation_id_column", params.reservationIdColumn);
      }
      if (params.sampleLimit != null) {
        formData.append("sample_limit", String(params.sampleLimit));
      }
      if (params.model) {
        formData.append("model", params.model);
      }
      if (params.mappingInstructions) {
        formData.append("mapping_instructions", params.mappingInstructions);
      }

      const response = await api.post<ReconciliationAIMapping>("/hospitality/validate/reconciliation/ai-map", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastAIMapping(response.data);
      notifySuccess("AI mapping completed.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not map reconciliation rows with AI.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const persistImport = useCallback(async (params: ReconciliationPersistImportParams) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = await api.post<ReconciliationImport>("/hospitality/reconciliations/imports", {
        file_name: params.fileName,
        contract_id: params.contractId,
        sheet_name: params.sheetName,
        source_system: params.sourceSystem,
        reservation_id_column: params.reservationIdColumn,
        mapping_summary: params.mappingSummary,
        analysis_provider: params.analysisProvider,
        analysis_model: params.analysisModel,
        analysis_usage: params.analysisUsage ?? {},
        lines: params.lines,
      });
      setLastPersistedImport(response.data);
      notifySuccess(`Imported ${response.data.line_count} reservation rows to database.`);
      return response.data;
    } catch (error) {
      notifyError(error, "Could not persist imported reservations.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const loadReservations = useCallback(async (params: ReservationListParams = {}) => {
    const controller = new AbortController();
    reservationsAbortRef.current?.abort();
    reservationsAbortRef.current = controller;
    setLoadingReservations(true);
    try {
      const response = await api.get<ReconciliationReservationList>("/hospitality/reconciliations/reservations", {
        params: {
          q: params.searchText || undefined,
          contract_id: params.contractId || undefined,
          hotel_id: params.hotelId || undefined,
          import_id: params.importId || undefined,
          room_type: params.roomType || undefined,
          board_type: params.boardType || undefined,
          source_system: params.sourceSystem || undefined,
          start_date: params.startDate || undefined,
          end_date: params.endDate || undefined,
          sort_by: params.sortBy || "stay_date",
          sort_order: params.sortOrder || "desc",
          limit: params.limit ?? 500,
          offset: params.offset ?? 0,
        },
        signal: controller.signal,
      });
      setReservations(response.data.items);
      setReservationsTotal(response.data.total);
      return response.data;
    } catch (error) {
      if (isRequestCancelled(error)) {
        return null;
      }
      notifyError(error, "Could not load persisted reservations.");
      setReservations([]);
      setReservationsTotal(0);
      return null;
    } finally {
      if (reservationsAbortRef.current === controller) {
        reservationsAbortRef.current = null;
        setLoadingReservations(false);
      }
    }
  }, []);

  const queryReservations = useCallback(async (params: ReservationListParams = {}) => {
    const response = await api.get<ReconciliationReservationList>("/hospitality/reconciliations/reservations", {
      params: {
        q: params.searchText || undefined,
        contract_id: params.contractId || undefined,
        hotel_id: params.hotelId || undefined,
        import_id: params.importId || undefined,
        room_type: params.roomType || undefined,
        board_type: params.boardType || undefined,
        source_system: params.sourceSystem || undefined,
        start_date: params.startDate || undefined,
        end_date: params.endDate || undefined,
        sort_by: params.sortBy || "stay_date",
        sort_order: params.sortOrder || "desc",
        limit: params.limit ?? 500,
        offset: params.offset ?? 0,
      },
    });
    return response.data;
  }, []);

  useEffect(() => {
    return () => {
      contractsAbortRef.current?.abort();
      reservationsAbortRef.current?.abort();
    };
  }, []);

  const deletePersistedReservation = useCallback(async (reservationRowId: string) => {
    if (!reservationRowId || busy) return null;
    setBusy(true);
    try {
      const response = await api.delete<ReconciliationReservationDeleteResult>(`/hospitality/reconciliations/reservations/${reservationRowId}`);
      setReservations((current) => current.filter((item) => item.id !== reservationRowId));
      notifySuccess("Imported reservation deleted.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not delete imported reservation.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const deletePersistedReservations = useCallback(async (params: ReservationListParams & { contractId: string }) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = await api.delete<ReconciliationReservationBulkDeleteResult>("/hospitality/reconciliations/reservations", {
        params: {
          contract_id: params.contractId,
          hotel_id: params.hotelId || undefined,
          import_id: params.importId || undefined,
          room_type: params.roomType || undefined,
          board_type: params.boardType || undefined,
          source_system: params.sourceSystem || undefined,
          start_date: params.startDate || undefined,
          end_date: params.endDate || undefined,
          q: params.searchText || undefined,
        },
      });
      if (response.data.deleted_count > 0) {
        notifySuccess(`Deleted ${response.data.deleted_count} imported reservation row(s).`);
      } else {
        notifySuccess("No imported reservation rows matched the current filters.");
      }
      return response.data;
    } catch (error) {
      notifyError(error, "Could not delete imported reservations.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const runReconciliation = useCallback(async (params: ReconciliationRunParams) => {
    if (busy) return null;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", params.file);
      formData.append("contract_id", params.contractId);
      formData.append("sheet_name", params.sheetName);
      formData.append("use_ai_mapping", params.useAiMapping ? "true" : "false");
      if (params.sourceSystem) {
        formData.append("source_system", params.sourceSystem);
      }
      if (params.runLabel) {
        formData.append("run_label", params.runLabel);
      }
      formData.append("tolerance_amount", String(params.toleranceAmount ?? 1.0));
      formData.append("tolerance_percent", String(params.tolerancePercent ?? 1.0));
      if (params.model) {
        formData.append("model", params.model);
      }
      if (params.mappingInstructions) {
        formData.append("mapping_instructions", params.mappingInstructions);
      }

      const response = await api.post<ValidationRun>("/hospitality/validate/reconciliation", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastValidationRun(response.data);
      notifySuccess(`Reconciliation finished. ${response.data.mismatch_count} mismatches detected.`);
      return response.data;
    } catch (error) {
      notifyError(error, "Could not run reconciliation validation.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const runValidationFromLines = useCallback(async (params: ReconciliationBatchRunParams) => {
    if (busy) return null;
    if (!params.lines.length) return null;
    setBusy(true);
    try {
      const response = await api.post<ValidationRun>("/hospitality/validate/batch", {
        contract_id: params.contractId,
        run_label: params.runLabel,
        tolerance_amount: params.toleranceAmount ?? 1.0,
        tolerance_percent: params.tolerancePercent ?? 1.0,
        lines: params.lines,
      });
      setLastValidationRun(response.data);
      notifySuccess(`Reconciliation finished. ${response.data.mismatch_count} mismatches detected.`);
      return response.data;
    } catch (error) {
      notifyError(error, "Could not run reconciliation validation.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    contracts,
    selectedContractId,
    setSelectedContractId,
    loadingContracts,
    busy,
    lastWorkbookPreview,
    lastAIMapping,
    lastPersistedImport,
    reservations,
    reservationsTotal,
    loadingReservations,
    lastValidationRun,
    refresh,
    previewWorkbook,
    mapWithAi,
    persistImport,
    loadReservations,
    queryReservations,
    deletePersistedReservation,
    deletePersistedReservations,
    runReconciliation,
    runValidationFromLines,
  };
}
