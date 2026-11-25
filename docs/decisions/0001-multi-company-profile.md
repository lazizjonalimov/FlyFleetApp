# 0001. One profile, up to ten companies

**Status:** accepted (owner request, 2026-11-12)

## Context

Carriers often run several legal entities, each with its own operating authority. When one entity stops
operating, work has to continue under another without re-entering everything.

## Decision

- An **account** is the owner's profile. It owns **companies** (organizations). A new sign-up creates an
  account with its first company.
- An account may have at most **10 active companies** (`accounts.max_companies`, enforced by the API).
  Archived companies stay readable and do not count.
- Only the account owner creates or archives companies, and is made owner of each one.
- Each company is a **separate tenant**: its own loads, invoices, payments, settlements, driver files,
  equipment, customers and team. Row-level security keeps them apart exactly as it does two unrelated
  carriers. This is deliberate: invoices, driver qualification files, insurance and registrations belong to a
  legal entity and must not blur across entities.
- **Switching** is one click for anyone who belongs to more than one company: the API re-verifies membership
  and issues a new session for the chosen company; the browser discards all cached data.
- **Speed without shared books:** when creating a company, the owner can copy the team, customers, drivers,
  trucks and trailers from an existing company in the same account. Loads and financial records are never
  copied.

## Consequences

- Master data copied to a second company is an independent copy. A later change in one company does not
  change the other. A re-sync tool can be added if that proves painful.
- Reports are per company. A consolidated view across an account's companies is a possible later addition.

## Alternative considered

Sharing drivers, equipment and customers across an account's companies, with only loads and invoices tagged
by company. Rejected for now: it weakens isolation between legal entities and makes per-entity compliance
records ambiguous.

## Addendum: working in one company or in all of them, and moving units between companies

**Scope comes from the address.** The company a request is about is taken from the URL by the web server
(`/<slug>/…` for one company, `/all/…` for every company the person can open) and sent to the API as `X-Company`.
The session token only says who the person is and where they last worked; `POST /auth/switch` just remembers that
(a company, or `all`). Membership is re-checked on every request, and a company the person cannot open is a 404.

**All companies is answered company by company.** `/api/v1/all/{resource}` makes the same request inside each active
company the person can open, with their own role and dispatch team there, and merges the rows (each tagged with
`organization {id, code, name, color, slug}`), with counts by company. Because every company is asked on its own
terms, a role is never widened by the combined view. Archived companies are left out (open them one at a time).
Settings, roles, the audit log and IFTA stay per company. A create in All must name `organization_id` or it is
refused with `COMPANY_REQUIRED`. The row-level-security policies also accept `app.org_ids` for reads (writes still
need the single `app.org_id`), kept as a second layer should a combined read ever run in one transaction.

**Each company has a short code and a colour** (Settings → Organization), unique per account, shown beside its
numbers wherever companies mix.

**Moving a truck or trailer** is previewed, then confirmed (`POST /vehicles/{id}/transfer-preview`, `…/transfer`,
and the same for trailers), by the account owner or a Main Admin in both companies. It is refused while the unit is
on a load or in an open driver or owner statement. The company it leaves keeps the unit as `transferred`
(read-only, history intact, seat and team membership ended, ownership shares ended); the other company gets a new
record with the same VIN, specs and current documents, optionally in one of its dispatch teams. Both audit logs
record it, nothing financial moves, and a VIN is active in only one company of an account at a time.

## Addendum: company management for every profile (2026-11)

These rules replace the earlier limit and archive rules above where they differ.

- **The limit is per profile, and archived companies count.** A person can open at most **10** companies, active and
  archived together (`/me/companies`, enforced by the API on create, join and accept). An archived company still
  counts until it is gone.
- **Anyone can add a company** under Settings › Account › Companies (or the switcher's Add a company). They become its
  Main Admin; it sits under their own account (made for them the first time); it starts empty. Copying setup from
  another company stays with the account owner (`POST /account/companies`), under the same limit.
- **One MC number, one company.** A unique index on the MC number's digits enforces it across FlyFleet. When
  `FLYFLEET_FMCSA_WEB_KEY` is set, the MC number is checked with FMCSA's QCMobile API and must be authorized to
  operate; without it, the app says it wasn't checked.
- **Archive and restore** are for the company's Main Admin (role `owner` in that company), not the account owner.
  Archiving is refused while loads are dispatched or on the road, while driver or owner statements are draft or
  approved and unpaid, or when it is the person's only active company; the name must be typed to confirm. An archived
  company is read-only and open to its **Main Admins only**: everyone else's access ends. The page shows it as
  restorable for 90 days; nothing is deleted or purged automatically yet.
- **Leave** ends the person's membership and removes their preferences and private saved views there. A company's
  only Main Admin can't leave. A former member can be invited again.
- **Invitations** carry an 8-character code (stored hashed, 7 days, single use) besides the link, so someone who
  already uses FlyFleet joins under Add a company › Join. Invitations to a person's email are also listed for them,
  but only those made after their sign-in existed, so nobody can claim invitations by signing up with another
  person's address. FlyFleet doesn't verify email addresses yet.
- **Default company**: the one that opens first at sign-in when the person has several (`users.default_organization_id`);
  it falls back to another active company when archived or left.
- Every create, join, accept, decline, make-default, archive, restore and leave is recorded in the affected company's
  audit log.
- **Company logos** are optional: a JPEG, PNG or WebP up to 5 MB, set under Settings › Organization (or when adding a
  company) by anyone who may change company settings. It is re-encoded as a 256 × 256 WebP, fitted (never cropped),
  and shown instead of the coloured initials wherever the company's mark appears; members of the company fetch it
  from `/me/companies/{id}/logo`. The colour stays, for places a picture doesn't fit.
