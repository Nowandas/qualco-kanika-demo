import { useCallback, useState } from "react";

import { api } from "@/api/client";
import type {
  AIPricingContentRecommendation,
  AIPricingExtractionRun,
  AIPricingPersistResponse,
} from "@/api/types";
import { notifyError, notifySuccess } from "@/lib/notify";

const RECOMMEND_CONTENT_TIMEOUT_MS = 120_000;
const EXTRACT_PRICING_TIMEOUT_MS = 180_000;

type AIPricingExtractParams = {
  file: File;
  hotelId?: string;
  hotelCode?: string;
  operatorCode: string;
  seasonLabel?: string;
  model?: string;
  schemaJson?: string;
  mappingInstructions?: string;
};

type AIPricingPersistParams = {
  extractionRunId: string;
  hotelId?: string;
  hotelCode?: string;
  operatorCode: string;
  seasonLabel?: string;
  reviewedData?: Record<string, unknown>;
};

type AIPricingContentRecommendationParams = {
  file: File;
  hotelId?: string;
  hotelCode?: string;
  operatorCode: string;
  seasonLabel?: string;
  analysisMode?: "standard" | "faster";
};

export function usePricingAiIngestion() {
  const [recommendingModel, setRecommendingModel] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [lastRecommendation, setLastRecommendation] = useState<AIPricingContentRecommendation | null>(null);
  const [lastExtraction, setLastExtraction] = useState<AIPricingExtractionRun | null>(null);
  const [lastPersisted, setLastPersisted] = useState<AIPricingPersistResponse | null>(null);

  const recommendModel = useCallback(async (params: AIPricingContentRecommendationParams) => {
    if (recommendingModel) {
      return null;
    }

    setRecommendingModel(true);
    try {
      const formData = new FormData();
      formData.append("file", params.file);
      if (params.hotelId) {
        formData.append("hotel_id", params.hotelId);
      }
      if (params.hotelCode) {
        formData.append("hotel_code", params.hotelCode);
      }
      formData.append("operator_code", params.operatorCode);
      if (params.seasonLabel) {
        formData.append("season_label", params.seasonLabel);
      }
      if (params.analysisMode) {
        formData.append("analysis_mode", params.analysisMode);
      }

      const response = await api.post<AIPricingContentRecommendation>("/hospitality/ai/pricing/recommend-content", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: RECOMMEND_CONTENT_TIMEOUT_MS,
      });
      setLastRecommendation(response.data);
      notifySuccess("Content mapping feedback generated.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not generate content mapping feedback for this contract.");
      return null;
    } finally {
      setRecommendingModel(false);
    }
  }, [recommendingModel]);

  const extractPricing = useCallback(async (params: AIPricingExtractParams) => {
    if (extracting) {
      return null;
    }

    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", params.file);
      if (params.hotelId) {
        formData.append("hotel_id", params.hotelId);
      }
      if (params.hotelCode) {
        formData.append("hotel_code", params.hotelCode);
      }
      formData.append("operator_code", params.operatorCode);
      if (params.seasonLabel) {
        formData.append("season_label", params.seasonLabel);
      }
      if (params.model) {
        formData.append("model", params.model);
      }
      if (params.schemaJson) {
        formData.append("schema_json", params.schemaJson);
      }
      if (params.mappingInstructions) {
        formData.append("mapping_instructions", params.mappingInstructions);
      }

      const response = await api.post<AIPricingExtractionRun>("/hospitality/ai/pricing/extract", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: EXTRACT_PRICING_TIMEOUT_MS,
      });

      setLastExtraction(response.data);
      setLastPersisted(null);
      notifySuccess("AI extraction completed.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not run AI pricing extraction.");
      return null;
    } finally {
      setExtracting(false);
    }
  }, [extracting]);

  const persistExtraction = useCallback(async (params: AIPricingPersistParams) => {
    if (persisting) {
      return null;
    }

    setPersisting(true);
    try {
      const response = await api.post<AIPricingPersistResponse>("/hospitality/ai/pricing/persist", {
        extraction_run_id: params.extractionRunId,
        hotel_id: params.hotelId,
        hotel_code: params.hotelCode,
        operator_code: params.operatorCode,
        season_label: params.seasonLabel,
        reviewed_data: params.reviewedData,
      });
      setLastPersisted(response.data);
      notifySuccess("Contract and rules persisted to MongoDB.");
      return response.data;
    } catch (error) {
      notifyError(error, "Could not persist AI extraction.");
      return null;
    } finally {
      setPersisting(false);
    }
  }, [persisting]);

  return {
    recommendingModel,
    extracting,
    persisting,
    lastRecommendation,
    lastExtraction,
    lastPersisted,
    recommendModel,
    extractPricing,
    persistExtraction,
  };
}
