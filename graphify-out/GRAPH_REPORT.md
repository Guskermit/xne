# Graph Report - .  (2026-07-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 397 nodes · 604 edges · 33 communities (27 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c8cba0c7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- createClient
- devDependencies
- ClientMonthlyKpis.tsx
- ProjectMonthlyKpis.tsx
- ProjectKpisTable.tsx
- compilerOptions
- page.tsx
- route.ts
- route.ts
- ClientKpisTable.tsx
- ClientEngagementsTable.tsx
- load_forecast.py
- EmployeeWeekly.tsx
- AdminPanel.tsx
- GlobalClientExpensesChart.tsx
- GlobalQuarterlyTerChart.tsx
- GlobalTerForecastChart.tsx
- GlobalVendorExpensesChart.tsx
- load_time_expense.py
- createClient
- client.ts
- ClientAnsrChart.tsx
- ClientVendorExpenses.tsx
- ClientVendorExpensesChart.tsx
- GlobalTerBreakdownChart.tsx
- GlobalTerChart.tsx
- ClientWeeklyChart.tsx
- middleware.ts
- layout.tsx
- .eslintrc.json
- next.config.ts
- postcss.config.mjs
- tailwind.config.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 36 edges
2. `createClient()` - 35 edges
3. `compilerOptions` - 16 edges
4. `createDb()` - 9 edges
5. `POST()` - 8 edges
6. `POST()` - 8 edges
7. `ClientMonthlyKpis()` - 8 edges
8. `ProjectMonthlyKpis()` - 8 edges
9. `ClientEngagementsTable()` - 8 edges
10. `ProjectKpisTable()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `GlobalQuarterlyTerChart()` --calls--> `createClient()`  [EXTRACTED]
  app/dashboard/GlobalQuarterlyTerChart.tsx → lib/supabase/client.ts
- `GlobalTerBreakdownChart()` --calls--> `createClient()`  [EXTRACTED]
  app/dashboard/GlobalTerBreakdownChart.tsx → lib/supabase/client.ts
- `GlobalTerChart()` --calls--> `createClient()`  [EXTRACTED]
  app/dashboard/GlobalTerChart.tsx → lib/supabase/client.ts
- `GlobalTerForecastChart()` --calls--> `createClient()`  [EXTRACTED]
  app/dashboard/GlobalTerForecastChart.tsx → lib/supabase/client.ts
- `ClientWeeklyChart()` --calls--> `createClient()`  [EXTRACTED]
  app/dashboard/clients/ClientWeeklyChart.tsx → lib/supabase/client.ts

## Import Cycles
- None detected.

## Communities (33 total, 6 thin omitted)

### Community 0 - "createClient"
Cohesion: 0.11
Nodes (20): POST(), POST(), POST(), POST(), login(), logout(), signup(), GET() (+12 more)

### Community 1 - "devDependencies"
Cohesion: 0.07
Nodes (27): dependencies, next, postgres, react, react-dom, recharts, @supabase/ssr, @supabase/supabase-js (+19 more)

### Community 2 - "ClientMonthlyKpis.tsx"
Cohesion: 0.14
Nodes (21): buildForecast(), ClientMonthlyKpis(), ClientOption, dateToKey(), dateToMes(), easterDate(), EmployeeRow, eur (+13 more)

### Community 3 - "ProjectMonthlyKpis.tsx"
Cohesion: 0.14
Nodes (21): buildForecast(), dateToKey(), dateToMes(), easterDate(), EmployeeRow, EngagementOption, eur, eurDec (+13 more)

### Community 4 - "ProjectKpisTable.tsx"
Cohesion: 0.14
Nodes (17): eur, fetchKpis(), hrs, pct(), ProjectKpis(), terVal(), EngagementKpi, eur (+9 more)

### Community 5 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 6 - "page.tsx"
Cohesion: 0.12
Nodes (12): BusinessUnitSelector(), OPTIONS, State, ClearDatabaseButtonWithRefresh(), eur, FcTotals, GlobalForecastKpisBar(), hrs (+4 more)

### Community 7 - "route.ts"
Cohesion: 0.18
Nodes (12): ForecastUploadResult, ForecastUploadStats, NAME_STOP, nameSimilarity(), nameTokens(), num(), parseEmployee(), parseEngagement() (+4 more)

### Community 8 - "route.ts"
Cohesion: 0.18
Nodes (15): ConflictRow, IntraConflictGroup, IntraExpenseGroup, num(), POST(), Row, s(), splitNameId() (+7 more)

### Community 9 - "ClientKpisTable.tsx"
Cohesion: 0.18
Nodes (13): ClientKpis(), fetchClientKpis(), ClientKpi, ClientKpisTable(), eur, hrs, pct(), pctColor() (+5 more)

### Community 10 - "ClientEngagementsTable.tsx"
Cohesion: 0.17
Nodes (11): State, ClientOption, ClientEngagementsTable(), EngagementRow, eur, hrs, pct(), pctColor() (+3 more)

### Community 11 - "load_forecast.py"
Cohesion: 0.24
Nodes (12): Any, load(), num(), parse_employee(), parse_engagement(), date, Carga el forecast semanal de horas desde el export "Horas y % Utilización por Re, 'Nombre Proyecto – ENG123456' → ('Nombre Proyecto', 'ENG123456')     'Nombre Pro (+4 more)

### Community 12 - "EmployeeWeekly.tsx"
Cohesion: 0.20
Nodes (8): ActualRow, Employee, EmployeeWeekly(), FlatRow, fmtEur, fmtH, fmtWeek(), ForecastRow

### Community 13 - "AdminPanel.tsx"
Cohesion: 0.20
Nodes (4): ClientRow, EngagementRow, PALETTE, VendorRow

### Community 14 - "GlobalClientExpensesChart.tsx"
Cohesion: 0.28
Nodes (7): colourFor(), COLOURS, CustomTooltip(), eur, fmtMonth(), GlobalClientExpensesChart(), RawRow

### Community 15 - "GlobalQuarterlyTerChart.tsx"
Cohesion: 0.22
Nodes (5): COLOURS, eur, GlobalQuarterlyTerChart(), KeyMeta, RawRow

### Community 16 - "GlobalTerForecastChart.tsx"
Cohesion: 0.28
Nodes (7): CustomTooltip(), CustomXTick(), eur, fmtMonth(), GlobalTerForecastChart(), RawRow, TooltipPayloadEntry

### Community 17 - "GlobalVendorExpensesChart.tsx"
Cohesion: 0.28
Nodes (7): colourFor(), COLOURS, CustomTooltip(), eur, fmtMonth(), GlobalVendorExpensesChart(), RawRow

### Community 18 - "load_time_expense.py"
Cohesion: 0.33
Nodes (8): load(), num(), date, Carga el libro "Detail" del export Time & Expense en Supabase / Postgres.  Uso:, WINNING RESULTS S.A. - 400107939' -> ('WINNING RESULTS S.A.', '400107939')., s(), split_name_id(), to_date()

### Community 19 - "createClient"
Cohesion: 0.29
Nodes (7): AdminPanel(), ClientOption, EngagementExpensesByVendor(), eur, eurDec, VendorExpense, createClient()

### Community 21 - "ClientAnsrChart.tsx"
Cohesion: 0.32
Nodes (7): ClientAnsrChart(), colourFor(), COLOURS, CustomTooltip(), eur, fmtMonth(), RawRow

### Community 22 - "ClientVendorExpenses.tsx"
Cohesion: 0.32
Nodes (7): ClientVendorExpenses(), eur, eurInt, fmtDate(), InvoiceLine, rowKey(), VendorRow

### Community 23 - "ClientVendorExpensesChart.tsx"
Cohesion: 0.32
Nodes (7): ClientVendorExpensesChart(), colourFor(), COLOURS, CustomTooltip(), eur, fmtMonth(), RawRow

### Community 24 - "GlobalTerBreakdownChart.tsx"
Cohesion: 0.29
Nodes (6): CustomTooltip(), eur, fmtMonth(), GlobalTerBreakdownChart(), RawRow, SERIES

### Community 25 - "GlobalTerChart.tsx"
Cohesion: 0.29
Nodes (6): COLOURS, CustomTooltip(), eur, fmtMonth(), GlobalTerChart(), RawRow

### Community 26 - "ClientWeeklyChart.tsx"
Cohesion: 0.33
Nodes (6): ClientWeeklyChart(), CustomTooltip(), eur, fmtH, fmtWeek(), WeekRow

### Community 27 - "middleware.ts"
Cohesion: 0.47
Nodes (4): IMPORTANT: refreshes the auth token, updateSession(), config, middleware()

## Knowledge Gaps
- **143 isolated node(s):** `extends`, `Row`, `eur`, `OPTIONS`, `State` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `createClient` to `ProjectKpisTable.tsx`, `page.tsx`, `route.ts`, `route.ts`, `ClientKpisTable.tsx`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `ClientMonthlyKpis.tsx`, `ProjectMonthlyKpis.tsx`, `route.ts`, `ClientEngagementsTable.tsx`, `EmployeeWeekly.tsx`, `AdminPanel.tsx`, `GlobalClientExpensesChart.tsx`, `GlobalQuarterlyTerChart.tsx`, `GlobalTerForecastChart.tsx`, `GlobalVendorExpensesChart.tsx`, `client.ts`, `ClientAnsrChart.tsx`, `ClientVendorExpenses.tsx`, `ClientVendorExpensesChart.tsx`, `GlobalTerBreakdownChart.tsx`, `GlobalTerChart.tsx`, `ClientWeeklyChart.tsx`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `xlsx` connect `devDependencies` to `route.ts`, `route.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **What connects `extends`, `Row`, `eur` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `ClientMonthlyKpis.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13852813852813853 - nodes in this community are weakly interconnected._