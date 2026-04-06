import { useCallback, useEffect, useRef, useState } from "react";

import { api, isRequestCancelled } from "@/api/client";
import type {
  ContractDocument,
  ReconciliationAIMapping,
  ReconciliationExtraction,
  ReconciliationImport,
  ReconciliationReservation,
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

type SheetAIMappingParams = {
  file: File;
  contractId: string;
  sheetName: string;
  sourceSystem?: string;
  reservationIdColumn?: string;
  sampleLimit?: number;
  model?: string;
  mappingInstructions?: string;
};

type SheetPreviewParams = {
  file: File;
  contractId: string;
  sheetName: string;
  sampleLimit?: number;
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

type ImportsListParams = {
  contractId?: string;
  hotelId?: string;
  sourceSystem?: string;
  limit?: number;
};

type ReservationsLoadParams = {
  contractId?: string;
  hotelId?: string;
  sourceSystem?: string;
  searchText?: string;
};

const MAX_RESERVATION_FETCH_ROWS = 20000;

export function useReconciliationsV2() {
  const { selectedHotelId } = useHotelScope();

  const [contracts, setContracts] = useState<ContractDocument[]>([]);
  const [selectedContractId, setSelectedContractId] = useState("");
  const [loadingContracts, setLoadingContracts] = useState(false);

  const [imports, setImports] = useState<ReconciliationImport[]>([]);
  const [loadingImports, setLoadingImports] = useState(false);

  const [reservations, setReservations] = useState<ReconciliationReservation[]>([]);
  const [reservationsTotal, setReservationsTotal] = useState(0);
  const [loadingReservations, setLoadingReservations] = useState(false);

  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastValidationRun, setLastValidationRun] = useState<ValidationRun | null>(null);

  const contractsAbortRef = useRef<AbortController | null>(null);
  const importsAbortRef = useRef<AbortController | null>(null);
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
      const exists = response.data.some((item) => item.id === selectedContractId);
      if (!exists) {
        const preferred = response.data.find((item) => Boolean(item.ai_extraction_run_id));
        setSelectedContractId((preferred ?? response.data[0]).id);
      }
    } catch (error) {
      if (!isRequestCancelled(error)) {
        notifyError(error, "Could not load contracts for Reconciliations V2.");
      }
    } finally {
      if (contractsAbortRef.current === controller) {
        contractsAbortRef.current = null;
        setLoadingContracts(false);
      }
    }
  }, [selectedContractId, selectedHotelId]);

  const previewWorkbook = useCallback(async (params: WorkbookPreviewParams) => {
    const formData = new FormData();
    formData.append("file", params.file);
    formData.append("contract_id", params.contractId);
    if (params.sampleRows != null) {
      formData.append("sample_rows", String(params.sampleRows));
    }

    try {
      const response = await api.post<ReconciliationWorkbookPreview>("/hospitality/validate/reconciliation/workbook-preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      notifySuccess("Workbook analyzed. Configure sheet-level import settings.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not analyze workbook for Reconciliations V2.");
      return null;
    }
  }, []);

  const mapSheetWithAi = useCallback(async (params: SheetAIMappingParams) => {
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
    return response.data;
  }, []);

  const previewSheetExtraction = useCallback(async (params: SheetPreviewParams) => {
    const formData = new FormData();
    formData.append("file", params.file);
    formData.append("contract_id", params.contractId);
    formData.append("sheet_name", params.sheetName);
    if (params.sampleLimit != null) {
      formData.append("sample_limit", String(params.sampleLimit));
    }

    const response = await api.post<ReconciliationExtraction>("/hospitality/validate/reconciliation/preview", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }, []);

  const persistImportV2 = useCallback(async (params: ReconciliationPersistImportParams) => {
    const response = await api.post<ReconciliationImport>("/hospitality/reconciliations/v2/imports", {
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

    setImports((current) => {
      const next = [response.data, ...current.filter((item) => item.id !== response.data.id)];
      return next.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    });

    return response.data;
  }, []);

  const loadImports = useCallback(async (params: ImportsListParams = {}) => {
    const controller = new AbortController();
    importsAbortRef.current?.abort();
    importsAbortRef.current = controller;
    setLoadingImports(true);

    try {
      const response = await api.get<ReconciliationImport[]>("/hospitality/reconciliations/imports", {
        params: {
          contract_id: params.contractId || undefined,
          hotel_id: params.hotelId || undefined,
          source_system: params.sourceSystem || undefined,
          limit: params.limit ?? 1000,
        },
        signal: controller.signal,
      });
      setImports(response.data);
      return response.data;
    } catch (error) {
      if (!isRequestCancelled(error)) {
        notifyError(error, "Could not load reconciliation imports.");
      }
      setImports([]);
      return null;
    } finally {
      if (importsAbortRef.current === controller) {
        importsAbortRef.current = null;
        setLoadingImports(false);
      }
    }
  }, []);

  const loadAllReservations = useCallback(async (params: ReservationsLoadParams = {}) => {
    const controller = new AbortController();
    reservationsAbortRef.current?.abort();
    reservationsAbortRef.current = controller;
    setLoadingReservations(true);

    try {
      const pageSize = 1000;
      let offset = 0;
      let total = 0;
      let keepGoing = true;
      const allItems: ReconciliationReservation[] = [];

      while (keepGoing && allItems.length < MAX_RESERVATION_FETCH_ROWS) {
        const response = await api.get<ReconciliationReservationList>("/hospitality/reconciliations/reservations", {
          params: {
            contract_id: params.contractId || undefined,
            hotel_id: params.hotelId || undefined,
            source_system: params.sourceSystem || undefined,
            q: params.searchText || undefined,
            sort_by: "created_at",
            sort_order: "desc",
            limit: pageSize,
            offset,
          },
          signal: controller.signal,
        });

        const pageItems = response.data.items ?? [];
        total = response.data.total ?? 0;
        allItems.push(...pageItems);

        if (pageItems.length < pageSize || allItems.length >= total) {
          keepGoing = false;
        } else {
          offset += pageSize;
        }
      }

      setReservations(allItems);
      setReservationsTotal(total);
      return { total, items: allItems };
    } catch (error) {
      if (!isRequestCancelled(error)) {
        notifyError(error, "Could not load persisted reconciliation rows.");
      }
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

  const runValidationFromLines = useCallback(async (params: {
    contractId: string;
    lines: ValidationLineInput[];
    runLabel?: string;
    toleranceAmount?: number;
    tolerancePercent?: number;
  }) => {
    if (!params.lines.length) return null;

    setValidating(true);
    try {
      const response = await api.post<ValidationRun>("/hospitality/validate/batch", {
        contract_id: params.contractId,
        run_label: params.runLabel,
        tolerance_amount: params.toleranceAmount ?? 1.0,
        tolerance_percent: params.tolerancePercent ?? 1.0,
        lines: params.lines,
      });
      setLastValidationRun(response.data);
      notifySuccess(`Validation completed. ${response.data.mismatch_count} mismatch(es).`);
      return response.data;
    } catch (error) {
      notifyError(error, "Could not validate grouped reconciliation rows.");
      return null;
    } finally {
      setValidating(false);
    }
  }, []);

  const refreshScopeData = useCallback(async () => {
    await loadContracts();
  }, [loadContracts]);

  const runSheetImports = useCallback(async (task: () => Promise<void>) => {
    setImporting(true);
    try {
      await task();
    } finally {
      setImporting(false);
    }
  }, []);

  useEffect(() => {
    loadContracts().catch(() => null);
  }, [loadContracts]);

  useEffect(() => {
    return () => {
      contractsAbortRef.current?.abort();
      importsAbortRef.current?.abort();
      reservationsAbortRef.current?.abort();
    };
  }, []);

  return {
    contracts,
    selectedContractId,
    setSelectedContractId,
    loadingContracts,
    imports,
    loadingImports,
    reservations,
    reservationsTotal,
    loadingReservations,
    importing,
    validating,
    lastValidationRun,
    refreshScopeData,
    previewWorkbook,
    mapSheetWithAi,
    previewSheetExtraction,
    persistImportV2,
    loadImports,
    loadAllReservations,
    runValidationFromLines,
    runSheetImports,
  };
}
