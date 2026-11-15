# Roadmap

## Design 1.0: the web console

The console was rebuilt from the FlyFleet design, screen for screen, and checked against it: all 96 console
artboards of the design render identically at the design's size, and the same structure and layout hold
across roughly 1,500 further states (every screen for every role, tab, record and dialog).

It runs on the Lone Star Freight workspace built into it. The table below is where each part of it stands
against the API: "API today" means the API already has the records the screen shows; the rest needs the API
built first.

| Console | API today |
| --- | --- |
| Sign-in, choosing an organization | Yes: sign-in, companies, switching |
| Dashboard, My tasks | Partly: dashboard and exceptions; no tasks |
| Dispatch board and assignment | Yes |
| Loads, the load's page, new load | Yes |
| Live fleet, Fleet alerts, Fleet alert policy | No: needs telematics |
| Messages | No |
| Customers, Drivers, Trucks, Trailers | Yes; no equipment owners or team drivers |
| Owners, owner record, owner settlements, owner portal | No |
| Compliance, Inspections, Documents and review | Yes; no reading of documents from photos |
| Maintenance | Yes |
| Invoices | Yes |
| Statements: driver pay | Yes |
| Fuel & IFTA | Partly: fuel purchases by state and truck; no IFTA miles, returns or rates |
| Reports | Partly: revenue, drivers, trucks, receivables aging |
| Team & access, Audit log | Yes; no dispatch teams |
| Integrations, Platform, Ask FlyFleet, customer portal | No |

Next for the console: connect it to the API a screen at a time, starting with the ones marked Yes; then the
driver mobile app and the website from the same design.

## The API and the first web application

Status against the build order in the engineering instructions. "Done" means built, tested and working in
this repository. The API column is the rules; the Web column is the first web application, which Design 1.0
replaces and which remains on the `main` branch.

| # | Step | API | Web |
| --- | --- | --- | --- |
| 1 | Audit and foundation | Done: [audit](implementation-audit.md), [decisions](decisions) | Done: mandated stack, generated API types, session layer, unit and browser tests |
| 2 | Design system and application shell | n/a | Done: theme (light and dark), components, sidebar, breadcrumbs, user menu, company switcher, terminal selector, global search (Ctrl/⌘ K), quick create, notifications (live alerts for the role, new ones counted since last opened), shared table and form standards |
| 3 | Sign-in and company switching | Done | Done: sign-up, sign-in, choose a company, switch, add with a copy, archive, restore |
| 4 | Customers | Done | Done: list, form, detail with contacts and addresses, archive and restore |
| 5 | Drivers and equipment | Done | Done: drivers with compliance, qualification file, documents and loads; trucks and trailers with their own pages, documents and loads; terminals |
| 6 | Loads | Done | Done: list, four-step booking wizard with drafts, load page with route, freight and charges, documents, activity, every lifecycle action, conflict-safe editing |
| 7 | Dispatch board and assignment | Done | Done: live board with counts, views and saved views, assignment panel with eligibility and reasons, reassign and unassign |
| 8 | Documents | Done | Done: documents center with filters, uploads on loads, drivers, equipment and customers, POD review through the load, compliance review |
| 9 | Safety and compliance | Done: status, expirations queue, blocking, inspections with defects | Done: safety page with summary, expirations queue and documents to review; inspections (list, record, detail) |
| 10 | Fleet and maintenance | Done: work orders with costs and lifecycle, out-of-service and return to service, summary, dashboard alerts, search, attachments | Done: maintenance page with summary, work orders and inspections, work order page with costs and documents, unit Maintenance tab, return to service |
| 11 | Finance | Done: invoices, payments, aging, expenses with fuel (by state and truck, miles per gallon), driver settlements (draft from loads and expenses, approve, pay, void) | Done: invoices (list with receivables, create from completed loads, draft editing with loads and adjustments, issue, void, print), payments (record with allocations, apply later, reverse), expenses with receipts, fuel report, driver pay (draft, hand-entered lines, approve, mark paid, void, print), customer invoices tab, driver pay tab, "invoice this load" |
| 12 | Reports and administration | Done: dashboard, exceptions, search, four reports, CSV, audit log, role matrix, company settings | Done: dashboard, global search, reports (revenue, drivers, trucks, receivables aging) with periods and CSV download, company settings, team, roles, terminals, companies, audit log |

## What "Done" covers in the API

- **Multi-company profile.** Up to ten active companies per account; create by copying setup; archive and
  restore; switch.
- **Load lifecycle.** Twelve states, one transition function, immutable history, version checks.
- **Dispatch.** Eligibility with reasons, overlap detection, concurrency-safe assignment, reassignment.
- **Finance.** Draft, issue, void; payments with allocations and reversal; receivables aging.
- **Maintenance.** Work orders with costs, start, complete and cancel; inspections with defects; units kept
  off the road until nothing that took them off is still open.
- **Costs and driver pay.** Expenses (fuel with gallons and state), reimbursements and deductions; driver
  settlements built from delivered loads, fixed by the database once approved.
- **Platform.** Row-level security on every table, role permissions, audit log, idempotency, error and
  list contracts, encrypted licence numbers.

## Next

Every step of the build order is built. What comes next:

1. **Notifications beyond the app**: email and push for the same alerts, once there is somewhere to send
   them from (with deployment).
2. **Driver mobile app and customer portal**, on the driver and customer endpoints the API already has.
3. **Deployment** (see below).

## Deferred by decision

Deployment (AWS, Terraform, Cognito, S3) comes after the product is built. The driver mobile app and the
customer portal follow the web application.
