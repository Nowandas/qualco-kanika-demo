import axios, { AxiosError } from "axios";

const DEV_DEFAULT_API_BASE_URL = "http://localhost:8000/api/v1";
const CSRF_COOKIE_NAME = (import.meta.env.VITE_CSRF_COOKIE_NAME ?? "kanika_demo_csrf_token").trim();
const CSRF_HEADER_NAME = (import.meta.env.VITE_CSRF_HEADER_NAME ?? "X-CSRF-Token").trim();

function normalizeBaseUrl(value: string): string {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  const isDev = import.meta.env.DEV;

  if (!configured) {
    if (isDev) {
      return DEV_DEFAULT_API_BASE_URL;
    }
    throw new Error("Missing VITE_API_BASE_URL for non-development frontend build.");
  }

  if (configured.startsWith("/")) {
    return normalizeBaseUrl(configured);
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("VITE_API_BASE_URL must be an absolute URL or root-relative path.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!isDev && localHosts.has(parsed.hostname)) {
    throw new Error("VITE_API_BASE_URL must not target localhost in production.");
  }

  return normalizeBaseUrl(configured);
}

const API_BASE_URL = resolveApiBaseUrl();
let legacyBearerToken: string | null = null;
const CSRF_MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${name}=`;
  const parts = document.cookie.split(";");
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part.startsWith(prefix)) {
      continue;
    }
    return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const method = (config.method ?? "GET").toUpperCase();
  if (CSRF_MUTATING_METHODS.has(method)) {
    const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
    if (csrfToken && CSRF_HEADER_NAME) {
      config.headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  if (!config.headers.Authorization && legacyBearerToken) {
    config.headers.Authorization = `Bearer ${legacyBearerToken}`;
  }
  return config;
});

export function setLegacyBearerToken(token: string | null) {
  legacyBearerToken = token;
}

export function clearLegacyBearerToken() {
  legacyBearerToken = null;
}

export function isRequestCancelled(error: unknown): boolean {
  if (axios.isCancel(error)) {
    return true;
  }
  if (error instanceof AxiosError && error.code === "ERR_CANCELED") {
    return true;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code === "ERR_CANCELED";
  }
  return false;
}
