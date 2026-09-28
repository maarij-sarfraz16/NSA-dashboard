# NSA Management Dashboard

A read-only management dashboard for NSA that sits outside ERPNext. It shows live data from the
NSA ERPNext system (`http://10.1.2.99:8080`), which stays the single source of truth.

```
ERPNext (10.1.2.99:8080)  ──REST, token auth──▶  Next.js server  ──HTML──▶  browser
     source of truth           read-only GETs        (no database)        (no secrets)
```

- **No data is copied or stored.** Every page is rendered on request from live ERPNext API calls
  (`cache: "no-store"`). No database is used and no records are cached between requests.
- **Secrets stay on the server.** The ERPNext API key and secret are read from environment
  variables in server-only modules and are never sent to the browser.
- **Failures are shown, never hidden.** If a call fails, that section shows the reason
  (bad credentials, permission, timeout, network, rate limit) instead of zeros or old figures.

## Sections

| Page | Source DocTypes | What it shows |
|---|---|---|
| Overview | all below | Headline figures per module, sales vs purchases trend, "needs attention" exceptions |
| Sales | Sales Invoice, Sales Order, Customer | Net invoiced (vs previous period), orders booked, receivables and overdue, 12-month trend, top customers, orders/invoices tables |
| Purchase | Purchase Order, Purchase Invoice, Supplier, Letter of Credit | POs placed, invoiced, payables and overdue, Local vs Import split (`purchase_type` from NSA Import), open LC balances, LCs expiring in 30 days, PO table |
| Manufacturing | Work Order | Work orders by status, overdue against planned end, completions per month, work order table |
| Attendance | Employee, Attendance | Present / absent / leave / not marked for a chosen day, department breakdown, 14-day trend, employee list |
| Payroll | Salary Slip | Net, gross and deductions for a payroll month (submitted slips only), department breakdown, 12-month trend, slip list |
| Connection | — | Live check of ERPNext reachability, service key, app versions, and read access per DocType |

Numbers follow ERPNext's own rules:
- Only submitted documents (`docstatus = 1`) are counted.
- Returns are netted in sales totals.
- Amounts are in the company currency (`base_*` fields).
- Outstanding balances are grouped by party account currency, so balances in different currencies
  are never added together.
- "Today" means today in the ERPNext system time zone.
- "Fiscal year to date" uses ERPNext's Fiscal Year records.

## Access control

Users sign in with their normal ERPNext username and password.

1. The dashboard checks the credentials against ERPNext.
2. It checks, using the user's own ERPNext session, which of Sales Invoice, Purchase Order,
   Work Order, Attendance and Salary Slip that user may read.
3. It ends that ERPNext session and issues its own signed, httpOnly session cookie (8 hours by default).

Users only see the sections their ERPNext role allows. After sign-in, data is fetched with the
dedicated service user's API key. The user's password and ERPNext session are never stored.

Accounts with ERPNext two-factor authentication cannot sign in yet.

## Setup

### 1. Create the read-only service user in ERPNext

1. Create a user, e.g. `dashboard-api@nsa.local`, as a **System User**.
2. Give it read-only access. The safest way is a custom role such as "Dashboard Reader":
   - In **Role Permission Manager**, give the role **Read** (no Write, Create, Submit, Cancel or
     Delete) on: Company, Fiscal Year, Customer, Supplier, Sales Order, Sales Invoice, Purchase Order,
     Purchase Invoice, Letter of Credit, Work Order, Employee, Attendance and Salary Slip.
   - Assign only that role to the service user.
3. Open the user → **Settings → API Access → Generate Keys**, and copy the API key and API secret.

The dashboard itself only ever sends GET requests with this key.

### 2. Configure and run

```bash
cp .env.example .env.local      # then fill in ERP_API_KEY, ERP_API_SECRET, SESSION_SECRET
openssl rand -base64 48         # use the output as SESSION_SECRET
npm install
npm run build
npm run start                   # http://localhost:3000
```

For development, run `npm run dev`. After starting, open **Connection** to confirm that every
DocType shows "Readable".

If the dashboard is served over plain HTTP on the LAN in production, set `COOKIE_SECURE=false`.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Project layout

```
src/
  proxy.ts                 sign-in guard (redirects to /login)
  lib/env.ts               server-only configuration
  lib/erp/                 ERPNext client: auth header, timeouts, error mapping, list/count/aggregate helpers
  lib/auth/                ERPNext sign-in, section permissions, signed session cookie
  lib/data/                one module per section (all queries live here)
  lib/period.ts            period presets (MTD, quarter, fiscal YTD, ...)
  components/charts/       SVG column chart, ranked bars, composition bar
  components/ui/           panels, KPI tiles, tables, filters, states
  components/shell/        navigation, page header, freshness/refresh, company switcher
  app/(dashboard)/         pages
```

## Design notes

- Colours are CSS tokens in `src/app/globals.css`, with light and dark themes.
- The navy accent comes from the NSA logo, and the charcoal navigation matches the ERPNext desk.
- Chart series use a colour-blind-checked categorical order, and every chart has a data-table view.
- Status colours (green, amber, red) are used only for states. They always appear with a text label.
# NSA-dashboard
