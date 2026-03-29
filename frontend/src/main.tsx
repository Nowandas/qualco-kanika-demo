import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import "./index.css";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth, AuthProvider } from "@/lib/auth";
import { ContractDetailPage } from "@/pages/contract-detail-page";
import { ContractsPage } from "@/pages/contracts-page";
import { DemoDocumentationPage } from "@/pages/demo-documentation-page";
import { InvitationsPage } from "@/pages/invitations-page";
import { LoginPage } from "@/pages/login-page";
import { PasswordResetPage } from "@/pages/password-reset-page";
import { PriceListsCalendarPage } from "@/pages/price-lists-calendar-page";
import { PricingIngestionPage } from "@/pages/pricing-ingestion-page";
import { ReconciliationsPage } from "@/pages/reconciliations-page";
import { UsersPage } from "@/pages/users-page";

function GenericErrorFallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-xl border border-border/80 bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Unexpected Error</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <a href="/" className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/70">
          Back to sign in
        </a>
      </div>
    </div>
  );
}

function RouteErrorFallback() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? "The requested page is unavailable."
    : "Something went wrong while rendering this page.";

  return <GenericErrorFallback message={message} />;
}

type RootBoundaryState = {
  hasError: boolean;
};

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, RootBoundaryState> {
  override state: RootBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RootBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Intentionally silent in UI; telemetry hooks can be attached here.
  }

  override render() {
    if (this.state.hasError) {
      return <GenericErrorFallback message="Something went wrong while rendering this application." />;
    }
    return this.props.children;
  }
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="p-6">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="p-6">Loading...</div>;
  }
  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <LoginPage />,
      errorElement: <RouteErrorFallback />,
    },
    {
      path: "/password-reset",
      element: <PasswordResetPage />,
      errorElement: <RouteErrorFallback />,
    },
    {
      path: "/app",
      element: (
        <RequireAuth>
          <RequireAdmin>
            <AppLayout />
          </RequireAdmin>
        </RequireAuth>
      ),
      errorElement: <RouteErrorFallback />,
      children: [
        { index: true, element: <Navigate to="/app/contracts" replace /> },
        { path: "contracts", element: <ContractsPage /> },
        { path: "contracts/:contractId", element: <ContractDetailPage /> },
        { path: "price-lists", element: <PriceListsCalendarPage /> },
        { path: "pricing-ingestion", element: <PricingIngestionPage /> },
        { path: "reconciliations", element: <ReconciliationsPage /> },
        { path: "demo-documentation", element: <Navigate to="/app/demo-documentation/overview" replace /> },
        { path: "demo-documentation/overview", element: <DemoDocumentationPage section="overview" /> },
        { path: "demo-documentation/business", element: <DemoDocumentationPage section="business" /> },
        { path: "demo-documentation/frontend", element: <DemoDocumentationPage section="frontend" /> },
        { path: "demo-documentation/backend", element: <DemoDocumentationPage section="backend" /> },
        { path: "users", element: <UsersPage /> },
        { path: "invitations", element: <InvitationsPage /> },
      ],
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
    },
  },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <AuthProvider>
        <RouterProvider
          router={router}
          future={{
            v7_startTransition: true,
          }}
        />
        <Toaster position="top-right" gutter={10} containerClassName="toaster-container" toastOptions={{ duration: 3500 }} />
      </AuthProvider>
    </RootErrorBoundary>
  </React.StrictMode>,
);
