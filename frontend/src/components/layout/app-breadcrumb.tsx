import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Crumb = {
  label: string;
  to: string;
};

const ROUTE_LABELS: Record<string, string> = {
  "/app": "kanika-demo",
  "/app/contracts": "Contracts",
  "/app/price-lists": "Price Lists",
  "/app/pricing-ingestion": "Pricing AI",
  "/app/reconciliations": "Reconciliations",
  "/app/demo-documentation": "Demo Documentation",
  "/app/demo-documentation/overview": "Overview",
  "/app/demo-documentation/business": "Business",
  "/app/demo-documentation/frontend": "Frontend",
  "/app/demo-documentation/backend": "Backend",
  "/app/users": "Users",
  "/app/invitations": "Invitations",
};

function toTitleCase(segment: string): string {
  const decoded = decodeURIComponent(segment);
  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: ROUTE_LABELS["/app"] ?? "Home", to: "/app" }];

  segments.forEach((segment, index) => {
    const to = `/${segments.slice(0, index + 1).join("/")}`;
    if (to === "/app") return;

    const isContractDetail = index > 0 && segments[index - 1] === "contracts" && /^[a-f0-9]{24}$/i.test(segment);

    crumbs.push({
      label: isContractDetail ? "Detail" : (ROUTE_LABELS[to] ?? toTitleCase(segment)),
      to,
    });
  });

  return crumbs;
}

export function AppBreadcrumb() {
  const location = useLocation();

  const crumbs = React.useMemo(() => buildCrumbs(location.pathname), [location.pathname]);

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <React.Fragment key={crumb.to}>
              <BreadcrumbItem className="max-w-[16rem] truncate">
                {isLast ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : (
                  <Link to={crumb.to} className="truncate transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator /> : null}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
