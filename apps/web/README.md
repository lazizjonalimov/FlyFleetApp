# FlyFleet web application

The console at app.flyfleet.io. Next.js (App Router), React, TypeScript in strict mode. Setup and run
instructions are in the [repository README](../../README.md).

## Design 1.0

The console is built on the FlyFleet design: its design system (light and dark), its screens and their
layout. Everything on screen comes from the API for the signed-in company, and every form saves through it.
A new company starts empty. Screens of the design that have nothing behind them in the API yet (tasks, live
positions, messages, owners, dispatch teams, integrations, alert policies, IFTA returns, the assistant) show
an empty state that says so. The design's sample content is never shown.

## How it is put together

```
src/app/console.css            the design system: tokens (light and dark), status tones, components, screens
src/app/globals.css            Tailwind, the same palette as Tailwind tokens
src/app/(public)/              sign-in, sign-up
src/app/(workspace)/[orgSlug]/ one page per console address; the layout checks the session and draws the shell
src/app/api/                   the session routes and the pass-through to the API (see below)
src/features/console/          the console itself:
  console-provider.tsx           interface state, the address, and the shell's view for the session
  shell.ts                       navigation and Create for the role, overlays, the forbidden screen
  routes.ts                      which address is which screen and record, and back
src/features/lists/            the shared list screen: tabs, search, sort, selection, paging from API pages
src/features/<area>/           the screens of one area, each reading its records from the API
src/components/                parts several screens share: table cells, empty and error states, dialogs
tests/e2e/                     Playwright journeys against the real stack
```

### The address is where you are

Screen, record and open drawer are read from the address; everything else (overlays, tabs, selection,
sorting, search text) is interface state that survives moving between screens. Records are addressed by id:

| Address | Screen |
| --- | --- |
| `/login`, `/signup` | Sign in (then choose a company, when the account has several), create an account |
| `/<company>/dashboard`, `/tasks`, `/dispatch`, `/loads`, `/tracking`, `/alerts`, `/messages` | Overview and operations |
| `/<company>/loads?drawer=<id>`, `/loads/<id>`, `/loads/new` | A load in the drawer, on its page, the guided form |
| `/<company>/customers`, `/drivers`, `/drivers/<id>`, `/owners` | Directory |
| `/<company>/safety`, `/inspections`, `/documents`, `/documents/review?doc=<id>`, `/equipment/trucks/<id>`, `/equipment/trailers/<id>`, `/maintenance` | Safety and fleet |
| `/<company>/finance/invoices`, `/finance/statements`, `/finance/statements/<id>`, `/finance/fuel`, `/reports` | Finance and analytics |
| `/<company>/settings/team`, `/settings/dispatch-teams`, `/settings/integrations`, `/settings/alert-policy`, `/settings/audit-log` | Administration |

The company in the address must be the one the session is in: a link into another of your companies asks you
to switch, and a company you don't belong to is not found.

### Who sees what

The session comes from the API (`getMe`), and the role's permissions decide what is offered: sections the role
can't open are locked in the sidebar and answer with the forbidden screen, Create lists only what the role may
add, and rates are hidden from roles without them. The API checks every request again; hiding a control is
never what protects the data.

### Data

Screens read with TanStack Query through the typed client (`src/lib/api`). Query keys start with the company's
id, and switching company is a full page load, so one company's records are never shown in another. A change
is sent to the API and shown once the API has answered; then everything loaded for the company is checked
again, since one change (an assignment, a payment) shows on several screens.

### Styles

`console.css` is the design system, scoped to the application root `.ff`. Colours are never written on an
element: tokens carry them, an element takes a tone with `data-k`, and dark mode is the same rules with the
tokens swapped. It is written against browser defaults, so `globals.css` undoes Tailwind's reset inside `.ff`.
Geist is bundled from the `geist` package (`src/app/fonts.ts`).

## The session and the API

The browser never calls the API directly and never holds the API token.

- `src/app/api/auth/*` signs in, signs up, switches company, changes the password and signs out, keeping the
  API's token in an `httpOnly` cookie.
- `src/app/api/v1/[...path]` forwards every other call to `FLYFLEET_API_URL/api/v1/...` with that token.
- `src/lib/api` is the typed client. `schema.d.ts` is generated from `backend/openapi.json` (`make types`),
  and CI fails if it is out of date.
- `src/proxy.ts` sends signed-out visitors to sign-in and sets the content security policy and frame
  protection on every page.

## Commands

```bash
npm run dev          # http://localhost:3000 (the API must be running)
npm run lint
npm run typecheck
npm test             # unit tests (Vitest)
npm run build && npm run start
npm run e2e          # browser journeys (Playwright) against the running app, API and database
npm run api:types    # regenerate API types after the contract changes
```
