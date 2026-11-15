# FlyFleet web application

The console at app.flyfleet.io. Next.js (App Router), React, TypeScript in strict mode. Setup and run
instructions are in the [repository README](../../README.md).

## Design 1.0

The console is built from the FlyFleet design, screen for screen: the same design system, the same 38
screens with their overlays, panels, drawer and add/import flows, the same roles and permissions, and the
same Lone Star Freight workspace behind them. In a 1440×900 window every artboard of the design renders
identically here.

It runs on the workspace built into it and needs no API to open. Screens are not connected to the API yet;
[what is kept for that](#what-is-kept-for-the-api) is described below.

## How it is put together

```
src/app/console.css            the design system: tokens (light and dark), status tones, components, screens
src/app/globals.css            Tailwind, the same palette as Tailwind tokens, and what adapts the console to a real window
src/app/(workspace)/[orgSlug]/ one page per console address; the layout puts the console shell around it
src/app/(public)/              sign-in, the customer portal, an equipment owner's portal, the states reference
src/features/console/          the console itself:
  model/console-model.js         the workspace's records, the role rules, and the builders that turn
                                 "this screen, this role, this state" into what is rendered
  view.ts                        the type of what they produce (ConsoleView)
  console-provider.tsx           holds interface state, reads the address, gives screens the view
  routes.ts                      which address is which screen, and back
  records.ts                     which records have a page of their own
  console-frame.tsx              the shell: sidebar, top bar, the screen, overlays
src/features/<area>/           the screens of one area
src/components/                parts several screens share: icon, table cells, dropdown
tests/e2e/                     Playwright journeys in a real browser
```

### One model, many screens

A screen never computes anything. `ConsoleLogic.renderVals()` produces a `ConsoleView` for the current
address, role and interface state, and each screen renders its part of it (`D` for the dashboard, `LT` for
the loads list, `OW` for an owner's record, and so on). Handlers come with the view: a button's `onClick` is
a function the model made, which asks for a change of state.

The model is the design's own logic, carried over as written so every value matches the design. It is plain
JavaScript with its types in `view.ts` and `console-model.d.ts`. Connecting a screen to the API means its
builder takes its records from the API instead of the constants at the top of the model.

### The address is where you are

Screen, record and open drawer are read from the address; everything else (overlays, tabs, selection,
sorting, form values) is state that survives moving between screens.

| Address | Screen |
| --- | --- |
| `/login` | Sign in, then choose an organization |
| `/lone-star-freight/dashboard`, `/tasks`, `/dispatch`, `/loads`, `/tracking`, `/alerts`, `/messages` | Overview and operations |
| `/loads?drawer=FF-24817`, `/loads/FF-24817`, `/loads/new` | A load in the drawer, on its page, the guided form |
| `/customers`, `/drivers`, `/drivers/marcus-bell`, `/owners`, `/owners/CT`, `/owners/new`, `/owners/CT/edit`, `/owners/CT/portal` | Directory |
| `/safety`, `/inspections`, `/documents`, `/documents/review`, `/equipment/trucks`, `/equipment/trucks/T-1102`, `/equipment/trailers`, `/maintenance` | Safety and fleet |
| `/finance/invoices`, `/finance/statements`, `/finance/statements/TR`, `/finance/fuel`, `/reports` | Finance and analytics |
| `/settings/team`, `/settings/dispatch-teams`, `/settings/integrations`, `/settings/alert-policy`, `/settings/audit-log`, `/platform` | Administration |
| `/portal`, `/owner-portal`, `/states` | Customer portal, an equipment owner's portal, interface states |

A state change that moves you is carried out as a navigation, so Back, reload and shared links work. An
address that names no screen or record is a 404. A unit's record is at `/equipment/trucks/<unit>` whether it is
a truck or a trailer, as in the design.

### Who is signed in, and how it looks

There is no session yet, so the address says who you are. These are kept as you move around:

| In the address | Meaning |
| --- | --- |
| `?role=owner` · `ops` · `dispatcher` · `safety` · `accounting` · `fleet` · `platform` | The signed-in role. Default: operations manager |
| `?team=A` or `B` (with `role=dispatcher`) | A dispatcher who sees one team's trucks only |
| `?financeAccess=false` | No finance access |
| `?theme=dark` | Dark theme |
| `?density=comfortable` | Taller table rows |
| `?sidebar=collapsed` | Sidebar as icons |

A link can also open a state of a screen directly, by the names the design uses: `overlay`, `panel`, `modal`
with `kind` and `modalStep`, `listTab`, `fuelTab`, `report`, `ownerTab`, `ownerRange`, `ownerUnit`,
`portalTab`, `ownerFormPreset`, `preselect`, `listSel`. For example
`/lone-star-freight/dispatch?panel=assign&role=dispatcher` or
`/lone-star-freight/finance/fuel?role=accounting&fuelTab=returns`.

### Styles

`console.css` is the design system, scoped to the application root `.ff`. Colours are never written on an
element: tokens carry them, an element takes a tone with `data-k`, and dark mode is the same rules with the
tokens swapped. It is written against browser defaults, so `globals.css` undoes Tailwind's reset inside
`.ff`; Tailwind utilities still work there and read the same palette.

Geist is bundled from the `geist` package (`src/app/fonts.ts`), declared with the ranges and weights of the
Geist the design loads, so text and the few symbols that fall back to the system font come out as designed.

The design is drawn at 1440×900. The console fills the window it has (down to 1024px wide); the live map is
scaled to cover its area and route pins keep their place on the route.

### Pages are prerendered

Every page is static, so moving between screens is instant. A prerender cannot know the query string, so the
server sends the console as it is without one and the browser renders it again with the real query (see
`ConsoleProvider`).

## What is kept for the API

The browser never calls the API directly and never holds the API token.

- `src/app/api/auth/*` signs in, signs up, switches company, changes the password and signs out, keeping the
  API's token in an `httpOnly` cookie.
- `src/app/api/v1/[...path]` forwards every other call to `FLYFLEET_API_URL/api/v1/...` with that token.
- `src/lib/api` is the typed client. `schema.d.ts` is generated from `backend/openapi.json` (`make types`),
  and CI fails if it is out of date.
- `src/lib/format`, `src/lib/validation.ts` and `src/lib/upload.ts` format money and dates in the company's
  time zone, validate forms and upload documents.
- `src/proxy.ts` sets the content security policy and frame protection on every page. The redirect of
  signed-out visitors to sign-in returns there when there is a session to check.
- The first application's interface libraries stay installed for that work: the shadcn/ui setup
  (`components.json`, `src/lib/utils.ts`), TanStack Query and Table, React Hook Form. The console uses none of
  them; its components are the design's own.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # unit tests (Vitest)
npm run build && npm run start
npm run e2e          # browser journeys (Playwright) against the running app
npm run api:types    # regenerate API types after the contract changes
```
