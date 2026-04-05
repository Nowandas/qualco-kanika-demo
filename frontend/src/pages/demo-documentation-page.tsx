import {
  BookOpenText,
  Bot,
  Building2,
  CalendarDays,
  Database,
  FileSearch,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Link } from "react-router-dom";

import { PageShell, SectionCard } from "@/components/app/page-shell";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type DemoDocumentationSection = "overview" | "business" | "frontend" | "backend";

type DemoDocumentationPageProps = {
  section?: DemoDocumentationSection;
};

const sectionMeta: Record<DemoDocumentationSection, { title: string; description: string }> = {
  overview: {
    title: "Demo Documentation",
    description:
      "Full implementation map for kanika-demo, including business flows, modules, entities, and operational rules.",
  },
  frontend: {
    title: "Demo Documentation · Frontend",
    description:
      "Frontend implementation reference: routes, hooks, reusable UI architecture, and page responsibilities.",
  },
  business: {
    title: "Demo Documentation · Business",
    description:
      "Business reference: operating model, commercial rules, process flows, stakeholders, and expected outcomes.",
  },
  backend: {
    title: "Demo Documentation · Backend",
    description:
      "Backend implementation reference: FastAPI domains, endpoints, data persistence, AI pipeline, and reconciliation engine.",
  },
};

const documentationSections: Array<{
  key: DemoDocumentationSection;
  label: string;
  to: string;
  description: string;
}> = [
  {
    key: "overview",
    label: "Overview",
    to: "/app/demo-documentation/overview",
    description: "End-to-end product and implementation map.",
  },
  {
    key: "business",
    label: "Business",
    to: "/app/demo-documentation/business",
    description: "Business context, value drivers and operating rules.",
  },
  {
    key: "frontend",
    label: "Frontend",
    to: "/app/demo-documentation/frontend",
    description: "Pages, UI patterns, route ownership, and client-side architecture.",
  },
  {
    key: "backend",
    label: "Backend",
    to: "/app/demo-documentation/backend",
    description: "API contracts, domain services, Mongo collections, and AI logic.",
  },
];

const readmeIndexRows = [
  {
    path: "docs/README_INDEX.md",
    area: "Documentation Hub",
    purpose: "Single index linking all app README files.",
  },
  {
    path: "README.md",
    area: "Project Root",
    purpose: "Runbook, environment setup, architecture and API surface.",
  },
  {
    path: "backend/README.md",
    area: "Backend",
    purpose: "Domain overview, auth model, and backend endpoint summary.",
  },
  {
    path: "frontend/README.md",
    area: "Frontend",
    purpose: "UI architecture, security-relevant behavior, and run/build commands.",
  },
  {
    path: "backend/app/domains/hospitality/README.md",
    area: "Hospitality Domain",
    purpose: "Workflow endpoints, upload limits, ingestion guardrails, and AI behavior.",
  },
  {
    path: "README_SECURITY_HARDENING.md",
    area: "Security Hardening",
    purpose: "Cross-stack hardening status, residual risk, and release checklists.",
  },
  {
    path: "README_FRONTEND_SECURITY_HARDENING.md",
    area: "Frontend Hardening",
    purpose: "Frontend-specific hardening status and deployment/runtime checks.",
  },
];

const overviewImplementationRows = [
  {
    area: "Authentication & Access",
    ui: "Login, password reset, invitation acceptance",
    api: "auth, users, invitations domains",
    data: "users, invitations, password_resets collections",
    value: "Controlled admin-only operations in demo workspace.",
  },
  {
    area: "Hotel Scoping",
    ui: "Sidebar hotel selector + management modal",
    api: "hotels domain + hotel-aware hospitality queries",
    data: "hotels collection + hotel_id propagation",
    value: "Every operational flow can run per hotel or in all-hotels mode.",
  },
  {
    area: "Contract Lifecycle",
    ui: "Contracts list, filters, detail, term highlights",
    api: "hospitality contracts ingest/list/detail endpoints",
    data: "hospitality_contracts + hospitality_rules",
    value: "Searchable, reviewable contract baseline and pricing logic.",
  },
  {
    area: "Pricing AI Pipeline",
    ui: "Pricing AI page with recommendation, template generation, extraction, persist",
    api: "recommend-content, contract-templates, extract, persist endpoints",
    data: "hospitality_contract_templates + hospitality_ai_extractions + contracts + rules",
    value: "Reusable operator/hotel templates and rapid onboarding with review-before-persist.",
  },
  {
    area: "Price Matrix & Promotions",
    ui: "Contract detail matrix (room/board/period) + promo toggles + header quick actions",
    api: "price-matrix + promotions ingest/list/ai-ingest",
    data: "hospitality_promotions + generated promotion rules",
    value: "Contract-scoped control of base vs adjusted commercial pricing.",
  },
  {
    area: "Reconciliation",
    ui: "Multi-step Excel wizard + persisted reservations + result drill-down",
    api: "workbook preview, ai-map, imports, reconciliation validation",
    data: "hospitality_reconciliation_imports, hospitality_reconciliation_reservations, validation runs",
    value: "Automated expected-vs-actual checks tied to uploaded price lists and rules.",
  },
];

const businessRules = [
  {
    id: "hotel_scope",
    title: "Hotel Scoping",
    rules: [
      "Operational records persist with hotel context and can be filtered per selected hotel.",
      "All-hotel scope is available for cross-property reporting and browsing.",
      "Hotel activation status is managed without deleting historical records.",
    ],
  },
  {
    id: "review_first",
    title: "Review-First AI Workflow",
    rules: [
      "Recommendation output (suggested schema + mapping instructions) is generated before extraction persistence.",
      "AI extraction remains editable in UI before creating contracts/rules in MongoDB.",
      "Promotion ingestion can update multiple affected contracts by explicit selection.",
    ],
  },
  {
    id: "pricing_engine",
    title: "Pricing Engine Behavior",
    rules: [
      "Expected reservation totals are derived from contract price-list periods and nightly allocations.",
      "Board supplements, extra adults/children and promotion adjustments are applied through rule metadata.",
      "Mismatch detection uses tolerance thresholds and returns per-line calculation detail.",
    ],
  },
  {
    id: "governance",
    title: "Governance and Access",
    rules: [
      "Admin-only access is enforced for operational routes in both frontend and backend.",
      "Users/invitations are managed through dedicated admin flows with token lifecycle handling.",
      "Core entities include timestamps and traceability fields for demo transparency.",
    ],
  },
];

const businessChallenges = [
  {
    challenge: "Contract diversity and manual setup risk",
    legacy: "Teams ingest multiple operator formats and configure pricing manually in internal tooling/PMS.",
    demoApproach: "AI-assisted extraction + normalized rule generation + review-before-persist flow.",
    impact: "Faster setup and lower manual configuration error rate.",
  },
  {
    challenge: "Promotions arrive outside formal contracts",
    legacy: "Email/PDF offers are easy to miss or apply inconsistently.",
    demoApproach: "Promotion AI ingestion links external offers to selected contracts and updates pricing behavior.",
    impact: "Commercial consistency across contracts and reservation validation.",
  },
  {
    challenge: "Post-stay reconciliation workload",
    legacy: "Excel-heavy manual checks identify mismatches too late.",
    demoApproach: "Reservation imports + expected-price engine + color-coded reconciliation detail.",
    impact: "Earlier discrepancy visibility and structured exception handling.",
  },
];

const businessStakeholders = [
  {
    role: "Revenue Management",
    objectives: "Protect margin, enforce contracted pricing logic, monitor operator performance.",
    pages: "Contracts (detail matrix), Reconciliations, Business docs",
  },
  {
    role: "Contracting / Commercial",
    objectives: "Onboard new contracts quickly, encode supplements/discounts correctly, handle offer updates.",
    pages: "Pricing AI, Contracts (detail matrix + promo actions)",
  },
  {
    role: "Accounting / Finance",
    objectives: "Validate invoiced or posted rates against expected contracted outcomes.",
    pages: "Reconciliations, Contracts (detail matrix)",
  },
  {
    role: "Admin / Operations",
    objectives: "Control user access, invitations, and hotel-scoped governance across properties.",
    pages: "Users, Invitations, Sidebar hotel management",
  },
];

const businessLifecycle = [
  {
    title: "1. Contract Intake",
    detail: "Import operator contract/pricelist files per hotel and operator season.",
  },
  {
    title: "2. AI Understanding",
    detail: "Generate recommended data structure, mapping instructions and extraction model before committing.",
  },
  {
    title: "3. Commercial Rule Setup",
    detail: "Persist approved extraction as contract records, period rates and pricing rules.",
  },
  {
    title: "4. Promotion Alignment",
    detail: "Ingest out-of-contract offers and apply them to targeted contracts with clear traceability.",
  },
  {
    title: "5. Operational Validation",
    detail: "Run reservation reconciliation against expected rates derived from contract periods and rule logic.",
  },
  {
    title: "6. Exception Resolution",
    detail: "Investigate mismatches, view calculation detail and route issues to responsible teams.",
  },
];

const businessKpis = [
  {
    metric: "Configuration speed",
    definition: "Time from contract receipt to validated pricing availability in the system.",
    lever: "AI recommendation + extraction + persisted rule automation.",
  },
  {
    metric: "Pricing accuracy",
    definition: "Match rate between expected contract-based totals and imported actual reservation totals.",
    lever: "Nightly period allocation, board adjustments, occupancy rules and promotion application.",
  },
  {
    metric: "Discrepancy response time",
    definition: "Time from mismatch detection to documented resolution.",
    lever: "Persisted validation results and detailed per-record explanation UI.",
  },
  {
    metric: "Commercial coverage",
    definition: "Share of active operator contracts with usable structured data and mapped rules.",
    lever: "Hotel-scoped contract ingestion and AI-assisted model recommendation.",
  },
];

const entityRows = [
  {
    entity: "Hotel",
    owner: "hotels domain",
    storage: "hotels",
    usedBy: "Sidebar scope, contract/promo/reconciliation filters",
  },
  {
    entity: "ContractDocument",
    owner: "hospitality contracts",
    storage: "hospitality_contracts",
    usedBy: "Contracts page, detail view, price matrix, reconciliation base",
  },
  {
    entity: "AIPricingExtractionRun",
    owner: "hospitality ai",
    storage: "hospitality_ai_extractions",
    usedBy: "Pricing AI review, persist workflow, audit of AI run metadata",
  },
  {
    entity: "PromotionOffer",
    owner: "hospitality promotions",
    storage: "hospitality_promotions",
    usedBy: "Price-list override layer, promotion-aware calculations",
  },
  {
    entity: "PricingRule",
    owner: "hospitality rules",
    storage: "hospitality_rules",
    usedBy: "Price matrix generation and reconciliation expected-price engine",
  },
  {
    entity: "ReconciliationImport",
    owner: "hospitality reconciliation",
    storage: "hospitality_reconciliation_imports",
    usedBy: "Import audit history and source-system traceability",
  },
  {
    entity: "ReconciliationReservation",
    owner: "hospitality reconciliation",
    storage: "hospitality_reconciliation_reservations",
    usedBy: "Searchable persisted reservation table and targeted validations",
  },
  {
    entity: "ValidationRun & Alert",
    owner: "hospitality validation",
    storage: "hospitality_validation_runs, hospitality_alerts",
    usedBy: "Mismatch reporting, discrepancy triage, operator analysis",
  },
];

const frontendPageRows = [
  {
    route: "/app/contracts",
    page: "ContractsPage",
    hook: "useContractsExplorer",
    calls: "GET /hospitality/contracts, GET /hospitality/rules",
    focus: "Search, sort, filter and rule coverage overview.",
  },
  {
    route: "/app/contracts/:contractId",
    page: "ContractDetailPage",
    hook: "detail state + direct API load",
    calls: "GET /hospitality/contracts/{id}, GET /hospitality/rules, GET /hospitality/contracts/{id}/price-matrix, POST /hospitality/promotions/ai-ingest",
    focus: "Contract terms, promotion impact, and price matrix in one place.",
  },
  {
    route: "/app/pricing-ingestion",
    page: "PricingIngestionPage",
    hook: "usePricingAiIngestion",
    calls: "POST /hospitality/ai/pricing/recommend-content, /extract, /persist, /contract-templates/generate",
    focus: "AI analysis, template creation, extraction and persistence.",
  },
  {
    route: "/app/reconciliations",
    page: "ReconciliationsPage",
    hook: "useReconciliations",
    calls: "Workbook preview, AI mapping, imports, reservations list/delete, validate",
    focus: "Excel import wizard, persisted rows, and discrepancy drill-down.",
  },
  {
    route: "/app/users",
    page: "UsersPage",
    hook: "useUsersManagement",
    calls: "GET/PATCH /users, POST /users/{id}/password-reset-link",
    focus: "Role/status administration and reset link workflow.",
  },
  {
    route: "/app/invitations",
    page: "InvitationsPage",
    hook: "useInvitationsManagement",
    calls: "GET/POST /invitations",
    focus: "Invite lifecycle and onboarding link/token distribution.",
  },
];

const frontendPatterns = [
  {
    title: "App Shell + Shared Layout",
    detail:
      "AppLayout centralizes sidebar, breadcrumb and header behaviors; PageShell/SectionCard abstract repeated visual structure across screens.",
  },
  {
    title: "Hotel Scope Context",
    detail:
      "HotelScopeProvider keeps selected hotel state in localStorage and injects scoped behavior into hospitality hooks and pages.",
  },
  {
    title: "Feature Hooks for UI Logic",
    detail:
      "Complex data and action orchestration lives in hooks (contracts, pricing AI, reconciliations, users, invitations) to keep pages focused on rendering.",
  },
  {
    title: "Reusable UI System",
    detail:
      "Shared shadcn-based components (table, select, modal, badges, cards) keep behavior consistent while enabling fast feature extension.",
  },
  {
    title: "Review-First Operational UX",
    detail:
      "AI-heavy flows always surface recommendation/extraction previews before database persistence to reduce data quality risk.",
  },
];

const backendDomainRows = [
  {
    domain: "auth",
    scope: "/api/v1/auth/*",
    responsibilities: "Login/logout, invitation acceptance, password reset token validation/consumption.",
    layer: "router + service + dependencies",
  },
  {
    domain: "users",
    scope: "/api/v1/users/*",
    responsibilities: "List/update users, profile updates, password-reset link generation.",
    layer: "router + service + repository",
  },
  {
    domain: "invitations",
    scope: "/api/v1/invitations/*",
    responsibilities: "Create/list invitation tokens and onboarding metadata.",
    layer: "router + service + repository",
  },
  {
    domain: "hotels",
    scope: "/api/v1/hotels/*",
    responsibilities: "Hotel CRUD-lite operations used for global data scoping.",
    layer: "router + service + repository",
  },
  {
    domain: "hospitality",
    scope: "/api/v1/hospitality/*",
    responsibilities:
      "Contract ingestion, AI extraction, promotions, rules, matrix generation, imports, reconciliation validation, alerts, reports.",
    layer: "router + service + repository",
  },
];

const backendCollectionRows = [
  {
    collection: "users",
    purpose: "Authentication and admin identity records.",
    notes: "Unique email index and role/status governance.",
  },
  {
    collection: "invitations",
    purpose: "Invitation token lifecycle and acceptance state.",
    notes: "Token uniqueness + list-by-created_at workflow.",
  },
  {
    collection: "password_resets",
    purpose: "Password reset one-time token lifecycle.",
    notes: "Issued/revoked/consumed timestamps for security traceability.",
  },
  {
    collection: "hotels",
    purpose: "Master property records for scope control.",
    notes: "Unique hotel code with active/inactive status indexing.",
  },
  {
    collection: "hospitality_contracts",
    purpose: "Contract uploads + extraction baseline.",
    notes: "Indexed by hotel/operator/date for fast filtered listing.",
  },
  {
    collection: "hospitality_rules",
    purpose: "Executable pricing and promotion logic.",
    notes: "Indexed by contract and priority for calculation paths.",
  },
  {
    collection: "hospitality_promotions",
    purpose: "Offer documents and contract-targeted adjustments.",
    notes: "Affected contract links and hotel/operator indexes.",
  },
  {
    collection: "hospitality_ai_extractions",
    purpose: "AI run outputs, schema usage and token usage metadata.",
    notes: "Tracks persistence linkage to resulting contracts.",
  },
  {
    collection: "hospitality_reconciliation_imports",
    purpose: "Reservation import audit envelope.",
    notes: "Source-system and contract/hotel indexes for browseability.",
  },
  {
    collection: "hospitality_reconciliation_reservations",
    purpose: "Persisted reservation rows for filtering and validation runs.",
    notes: "Unique-key upsert strategy prevents duplicate reservation entries per contract key.",
  },
  {
    collection: "hospitality_validation_runs + hospitality_alerts",
    purpose: "Mismatch outcome records and exception workflow.",
    notes: "Supports reports and discrepancy history per contract/hotel.",
  },
];

const backendPipelines = [
  {
    title: "Contract AI Ingestion Pipeline",
    steps: [
      "Parse uploaded PDF/XLS/XLSX text and table signals.",
      "Generate recommendation payload (recommended data + schema + mapping instructions) using OpenAI.",
      "Run extraction with selected schema/mapping prompt and normalize pricing terms.",
      "Persist reviewed extraction as contract + pricing rules in MongoDB.",
    ],
  },
  {
    title: "Promotion Application Pipeline",
    steps: [
      "Ingest external offer files (including email-style content).",
      "Use AI extraction for booking/arrival windows, discount percentages, and combinability constraints.",
      "Attach promotion to selected contracts and generate/update promotion rules.",
      "Expose toggled price-matrix outputs with promotion-adjusted values.",
    ],
  },
  {
    title: "Reconciliation Pipeline",
    steps: [
      "Analyze workbook sheets and preview candidate reservation table.",
      "AI-map headers from a small sample, then map all rows programmatically.",
      "Persist imported rows with contract-aware unique key strategy.",
      "Calculate expected totals from nightly contract rates, occupancy rules, board adjustments and promotions.",
      "Store mismatch output in validation runs and show per-line detail drill-down.",
    ],
  },
];

function DocumentationSectionSwitch({
  activeSection,
}: {
  activeSection: DemoDocumentationSection;
}) {
  return (
    <SectionCard title="Documentation Sections" description="Navigate implementation documentation by technical layer.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {documentationSections.map((section) => (
          <Link
            key={section.key}
            to={section.to}
            className={cn(
              "rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/30",
              activeSection === section.key ? "bg-muted/40 ring-1 ring-border/90" : "bg-card",
            )}
          >
            <p className="text-sm font-semibold">{section.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function OverviewSection() {
  return (
    <>
      <SectionCard
        title="Platform Overview"
        description="kanika-demo combines contract ingestion, AI-assisted pricing modeling, matrix visualization, and reconciliation in one admin workspace."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileSearch className="size-4" />
              <p className="text-sm font-semibold">Contracts Explorer</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Search and filter parsed contracts with term summaries and direct detail drill-down.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="size-4" />
              <p className="text-sm font-semibold">Pricing AI</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Run AI recommendation and extraction workflows, then persist reviewed contract and rule outputs.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarDays className="size-4" />
              <p className="text-sm font-semibold">Price Matrix</p>
            </div>
            <p className="text-sm text-muted-foreground">
              View contract pricing by period, room type, board type and age bucket with promotion overlays.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileSpreadsheet className="size-4" />
              <p className="text-sm font-semibold">Reconciliations</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Import reservation spreadsheets, persist rows, run validation, and inspect expected-price calculations.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <UsersRound className="size-4" />
              <p className="text-sm font-semibold">Users & Invitations</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage roles, activation and invitation lifecycle through admin-only operational flows.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Database className="size-4" />
              <p className="text-sm font-semibold">Mongo-Backed Persistence</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Every major artifact is stored with hotel context, timestamps and retrieval indexes for operational traceability.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Whole App Implementation Map" description="How user-facing capabilities map to backend services and stored data.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Capability Area</TableHead>
              <TableHead>Frontend</TableHead>
              <TableHead>Backend</TableHead>
              <TableHead>Persistence</TableHead>
              <TableHead>Operational Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overviewImplementationRows.map((row) => (
              <TableRow key={row.area}>
                <TableCell>{row.area}</TableCell>
                <TableCell>{row.ui}</TableCell>
                <TableCell>{row.api}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.data}</TableCell>
                <TableCell>{row.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Operational Workflow" description="Typical user path from setup to commercial validation.">
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-border/70 p-3">
            <p className="font-semibold">1. Set Hotel Scope</p>
            <p className="text-muted-foreground">
              Select a hotel in the sidebar to scope contracts, promotions, AI extraction and reconciliation views.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="font-semibold">2. Ingest and Model Contract Data</p>
            <p className="text-muted-foreground">
              Use Pricing AI recommendation to propose schema and mapping, then extract and persist reviewed data.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="font-semibold">3. Review Price Matrix and Promotions</p>
            <p className="text-muted-foreground">
              Open the contract detail matrix to inspect room/board/period pricing and optionally ingest promotions for adjusted values.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="font-semibold">4. Import Reservation Data and Reconcile</p>
            <p className="text-muted-foreground">
              Upload reservation exports, persist imported rows, and run expected-vs-actual checks with record-level detail.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Core Entities" description="Primary entities and their implementation ownership in the current app.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entity</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead>Used By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entityRows.map((row) => (
              <TableRow key={row.entity}>
                <TableCell>
                  <Badge variant="outline">{row.entity}</Badge>
                </TableCell>
                <TableCell>{row.owner}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.storage}</TableCell>
                <TableCell>{row.usedBy}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Business Rules" description="Business and governance rules currently implemented in the demo.">
        <div className="grid gap-3 xl:grid-cols-2">
          {businessRules.map((section) => (
            <div key={section.id} className="rounded-xl border border-border/70 p-3">
              <p className="mb-2 text-sm font-semibold">{section.title}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {section.rules.map((rule, index) => (
                  <li key={`${section.id}-${index}`}>- {rule}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function BusinessSection() {
  return (
    <>
      <SectionCard
        title="Business Context"
        description="kanika-demo addresses the commercial operations gap between contract intent, system configuration, and reservation billing outcomes."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="size-4" />
              <p className="text-sm font-semibold">Multi-Hotel Operation</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Commercial data and workflows are scoped per property while still supporting all-hotels visibility.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <BookOpenText className="size-4" />
              <p className="text-sm font-semibold">Contract-Driven Pricing</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Core pricing behavior is driven by ingested contract periods, room/board combinations and occupancy rules.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="size-4" />
              <p className="text-sm font-semibold">AI-Assisted Ops</p>
            </div>
            <p className="text-sm text-muted-foreground">
              AI reduces setup friction for complex operator formats and external promotion communications.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Business Problem to Outcome Map" description="What problems the business flow solves and how the demo addresses them.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business Challenge</TableHead>
              <TableHead>Legacy Process</TableHead>
              <TableHead>Demo Approach</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businessChallenges.map((row) => (
              <TableRow key={row.challenge}>
                <TableCell>{row.challenge}</TableCell>
                <TableCell>{row.legacy}</TableCell>
                <TableCell>{row.demoApproach}</TableCell>
                <TableCell>{row.impact}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Commercial Lifecycle" description="How teams move from contract intake to discrepancy resolution.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {businessLifecycle.map((step) => (
            <div key={step.title} className="rounded-xl border border-border/70 p-3">
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Stakeholders and Ownership" description="Who uses each capability and what business outcome they own.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Primary Objectives</TableHead>
              <TableHead>Main Screens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businessStakeholders.map((row) => (
              <TableRow key={row.role}>
                <TableCell>
                  <Badge variant="outline">{row.role}</Badge>
                </TableCell>
                <TableCell>{row.objectives}</TableCell>
                <TableCell>{row.pages}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Business KPIs" description="Suggested KPIs supported by the current implementation.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>KPI</TableHead>
              <TableHead>Definition</TableHead>
              <TableHead>System Lever</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businessKpis.map((row) => (
              <TableRow key={row.metric}>
                <TableCell>{row.metric}</TableCell>
                <TableCell>{row.definition}</TableCell>
                <TableCell>{row.lever}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}

function FrontendSection() {
  return (
    <>
      <SectionCard
        title="Frontend Architecture"
        description="The frontend is organized around route pages, feature hooks, and shared UI primitives for maintainable extension."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Workflow className="size-4" />
              <p className="text-sm font-semibold">App Shell</p>
            </div>
            <p className="text-sm text-muted-foreground">
              `AppLayout` manages sidebar, breadcrumb, session avatar and route outlet in one consistent shell.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <p className="text-sm font-semibold">Route Guards</p>
            </div>
            <p className="text-sm text-muted-foreground">
              `RequireAuth` + `RequireAdmin` gate all `/app/*` routes and align with backend admin requirements.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Database className="size-4" />
              <p className="text-sm font-semibold">API Layer</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Axios client uses cookie auth with CSRF header injection and timeout guardrails; hooks isolate API reads/writes from page rendering.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="size-4" />
              <p className="text-sm font-semibold">Hotel Scope Context</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Shared provider persists selected hotel and supplies scoped behavior across hospitality feature hooks.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="size-4" />
              <p className="text-sm font-semibold">AI Workflow UX</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Recommendation and extraction results are shown in review states before commit to database.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <BookOpenText className="size-4" />
              <p className="text-sm font-semibold">Reusable Page Structure</p>
            </div>
            <p className="text-sm text-muted-foreground">
              `PageShell` and `SectionCard` abstract styling and structure so new pages remain consistent and faster to build.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Route and Feature Map" description="How each route is implemented and which API calls it owns.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Page Component</TableHead>
              <TableHead>Primary Hook / State Layer</TableHead>
              <TableHead>Main Backend Calls</TableHead>
              <TableHead>Purpose</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {frontendPageRows.map((row) => (
              <TableRow key={row.route}>
                <TableCell className="text-xs text-muted-foreground">{row.route}</TableCell>
                <TableCell>{row.page}</TableCell>
                <TableCell>{row.hook}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.calls}</TableCell>
                <TableCell>{row.focus}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Reusable UI and Logic Patterns" description="Patterns intentionally extracted to keep future development fast and consistent.">
        <div className="grid gap-3 md:grid-cols-2">
          {frontendPatterns.map((item) => (
            <div key={item.title} className="rounded-xl border border-border/70 p-3">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Sidebar Structure" description="Frontend navigation now documents implementation layers directly.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-sm font-semibold">Contract Management</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Contracts, Pricing AI and Reconciliations run the commercial lifecycle, with matrix and promo actions in contract detail.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-sm font-semibold">Users</p>
            <p className="mt-1 text-sm text-muted-foreground">
              User and Invitation management flows handle admin access governance.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <p className="text-sm font-semibold">Reference</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Documentation now includes explicit Overview, Frontend and Backend reference entries.
            </p>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function BackendSection() {
  return (
    <>
      <SectionCard
        title="Backend Architecture"
        description="FastAPI domain modules orchestrate AI extraction, pricing logic, reconciliation and admin workflows on top of MongoDB."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Workflow className="size-4" />
              <p className="text-sm font-semibold">App Bootstrap</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Startup creates indexes and ensures master admin user before serving API traffic.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <p className="text-sm font-semibold">Admin Enforcement</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Protected routes use auth dependencies so operational actions are restricted to admins.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Database className="size-4" />
              <p className="text-sm font-semibold">Mongo Repository Layer</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Repository classes encapsulate collection access, indexes, search, sorting and upsert behavior.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Bot className="size-4" />
              <p className="text-sm font-semibold">OpenAI Integration</p>
            </div>
            <p className="text-sm text-muted-foreground">
              AI is used for content recommendation, contract extraction, promotion analysis and reconciliation header mapping.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Workflow className="size-4" />
              <p className="text-sm font-semibold">Pricing Calculation Engine</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Expected totals derive from nightly period rates plus board and guest adjustments from contract rules.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileSpreadsheet className="size-4" />
              <p className="text-sm font-semibold">Reconciliation Persistence</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Reservation imports are persisted and deduplicated via contract-scoped unique keys before validation runs.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Domain and API Surface" description="Backend is organized by domain modules with clear ownership boundaries.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>API Scope</TableHead>
              <TableHead>Responsibilities</TableHead>
              <TableHead>Implementation Layer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backendDomainRows.map((row) => (
              <TableRow key={row.domain}>
                <TableCell>
                  <Badge variant="outline">{row.domain}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.scope}</TableCell>
                <TableCell>{row.responsibilities}</TableCell>
                <TableCell>{row.layer}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="Mongo Collections and Persistence Strategy" description="Collections backing the current production demo behavior.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Collection</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backendCollectionRows.map((row) => (
              <TableRow key={row.collection}>
                <TableCell className="text-xs text-muted-foreground">{row.collection}</TableCell>
                <TableCell>{row.purpose}</TableCell>
                <TableCell>{row.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard title="AI and Validation Pipelines" description="Key execution flows implemented in hospitality service logic.">
        <div className="grid gap-3 xl:grid-cols-3">
          {backendPipelines.map((pipeline) => (
            <div key={pipeline.title} className="rounded-xl border border-border/70 p-3">
              <p className="mb-2 text-sm font-semibold">{pipeline.title}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {pipeline.steps.map((step, index) => (
                  <li key={`${pipeline.title}-${index}`}>- {step}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Backend Notes" description="Operational notes that are important for future development.">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>- CORS is enabled at application level for development/demo interoperability.</p>
          <p>- OpenAI usage depends on configured `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`.</p>
          <p>- Date normalization and Mongo-compatible serialization are important when persisting AI-derived payloads.</p>
          <p>- Reconciliation calculations are contract-aware and include promo toggles plus detailed expected calculation metadata.</p>
        </div>
      </SectionCard>
    </>
  );
}

export function DemoDocumentationPage({ section = "overview" }: DemoDocumentationPageProps) {
  const meta = sectionMeta[section];

  return (
    <PageShell title={meta.title} description={meta.description}>
      <DocumentationSectionSwitch activeSection={section} />

      {section === "overview" ? <OverviewSection /> : null}
      {section === "business" ? <BusinessSection /> : null}
      {section === "frontend" ? <FrontendSection /> : null}
      {section === "backend" ? <BackendSection /> : null}

      <SectionCard title="Repository README Index" description="Source-of-truth documentation files grouped by implementation area.">
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Purpose</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {readmeIndexRows.map((row) => (
                <TableRow key={row.path}>
                  <TableCell className="text-xs text-muted-foreground">{row.path}</TableCell>
                  <TableCell>{row.area}</TableCell>
                  <TableCell>{row.purpose}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Reference Navigation" description="Quick reminder of where implementation documentation lives in the sidebar.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpenText className="size-4" />
              Demo Documentation
            </div>
            <p className="mt-1 text-sm text-muted-foreground">End-to-end overview of functionality, entities and business rules.</p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4" />
              Business
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Business goals, stakeholders, lifecycle and KPI references for the demo.</p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" />
              Frontend
            </div>
            <p className="mt-1 text-sm text-muted-foreground">UI architecture, route-to-feature mapping, reusable components and interaction flows.</p>
          </div>
          <div className="rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4" />
              Backend
            </div>
            <p className="mt-1 text-sm text-muted-foreground">FastAPI domains, endpoint coverage, persistence strategy and AI/reconciliation pipelines.</p>
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
