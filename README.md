# MSE Trace — web client

Next.js 16 / React 19 front end for MSE Trace, a multi-tenant SaaS covering
weighbridge readings, delivery evidence, site operations and the money that
follows them. Six back offices — platform admin, contractor, consultant,
recycler, driver, field staff — share one design and one message catalogue.

The API, the database, the plan and the task list all live in the sibling
repository **`weight-verification-backend`**, which is the source of truth for
what is being built and what is finished:

| File (backend repo) | What it holds |
| --- | --- |
| `PLAN.md` | Phases, entry and exit criteria |
| `TODO.md` | Every task, its acceptance criteria and its evidence |
| `PROJECT_CONTEXT.md` | Findings (`F-###`), decisions (`D-###`), open questions (`U-###`) |
| `BUILD_LEDGER.md` | Every verification run, anchored to the git SHA it ran against |

Check both repositories out side by side. Several backend tests read this
tree — the reachability guard asserts that every write endpoint has a screen
that calls it — and they skip when it is not there. In CI they are reached by
a second checkout, which needs a read-only deploy key on the backend
repository; without it those twenty-five tests skip and the workflow says so
in a warning rather than leaving it inside `OK (skipped=25)`.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Point it at an API with `NEXT_PUBLIC_API_BASE_URL`. Every `NEXT_PUBLIC_*`
variable the code reads must also appear in `.env.example`; `npm run check:env`
fails when one does not.

## Checks

| Command | What it proves |
| --- | --- |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | The ten source probes below, then ESLint |
| `npm test` | Vitest — the API client, the offline queue, navigation |
| `npm run test:e2e` | Playwright — six roles in a real browser, desktop and 390 px |
| `npm run check:env` | `.env.example` documents every variable the code reads |

`npm run lint` runs the probes **first**, so a message that would render as a
key path fails the build before ESLint is reached.

### The ten probes

Each exists because something shipped broken in exactly that way. They scan
source rather than behaviour, which is what makes them cheap enough to run on
every lint.

| Probe | Catches |
| --- | --- |
| `check-messages` | A key English defines that another catalogue is missing |
| `check-message-keys` | A `t("…")` naming a message nothing defines, or missing an interpolation it asks for |
| `check-untranslated-ui` | Hard-coded English sitting where a translated string belongs |
| `check-list-params` | A list parameter the API silently ignores |
| `check-disabled-buttons` | A greyed-out button that never says why it is grey |
| `check-ui-consistency` | One back office drifting from the shared design |
| `check-required-stars` | A field the button will not submit without, not marked before they try |
| `check-category-kinds` | A category list that does not say which filing scheme it wants |
| `check-photo-watermarks` | A photograph leaving the system with no provenance burned in |
| `check-camera-previews` | A camera slot that reports "1 photo ready" instead of showing it |

A probe that has stopped catching things is worse than no probe, because it
reports the same green either way. Before trusting one, break what it guards
on purpose and confirm it goes red — the project calls this **拔牙**, pulling
the tooth. Two guards were found inert this way after months of passing.

## Conventions that are not optional

### Every response is an envelope

The API answers `{success, message, code, errors, values?}`. `resolveMessage`
turns `code` into wording from the catalogue, falling back to the server's own
sentence rather than printing an identifier at the reader.

**A refusal carries the number that caused it.** "Outside the site" is not the
message; "you are 143 m outside the nearest fence" is. The `values` field
exists to carry those.

### Four catalogues, one shape

`en`, `zh`, `zh-TW` and `ms` all carry every key, and English is the source of
truth. Adding a string means adding it four times; `check-messages` will not
let you forget.

### A failed request is not an empty answer

The most recently learned rule here, and the most expensive one to get wrong —
recorded as finding `F-222` in the backend's `PROJECT_CONTEXT.md`.

```tsx
// Wrong. A 500 becomes zero rows, and the list below then says
// "nothing here yet" — a claim about the customer's site, made on
// the strength of a call that never returned.
const rows = things.data?.results ?? [];
```

Every `useQuery` has to decide what the screen shows when it fails, and that
has to differ from what it shows when the answer is genuinely empty. Two
shared components in `components/shared/page-primitives.tsx` do it:

```tsx
<QueryBoundary query={history} what={t("nav.history")}>
  <HistoryList rows={history.data?.results ?? []} />
</QueryBoundary>

{rows.isError ? <LoadFailed onRetry={() => void rows.refetch()} /> : …}
```

Name the subject with `what` wherever it is known: "the reviewer list could
not be loaded" tells the reader something that "this did not load" does not.
The same rule covers counters — `?? 0` draws a dead request as a zero, and
nine zeroes on a dashboard read as a quiet day rather than a broken screen.

The rule is not yet universal in this tree. The audit behind `F-222` counted
the queries that still turn a failure into a worded absence, and the number
is in `TODO.md` under `T-175`; it may only go down.

### Branches

Work lands on `develop`. **`deploy` is only ever reached through a pull
request that a colleague merges** — never self-merged, in either repository.
A commit on `develop` is not in front of a customer, so a task marked done is
not the same as a behaviour that works for them. `TODO.md` lists which
completed tasks have not yet reached `deploy`.

## Browser tests

`e2e/` holds 23 Playwright tests across two projects: `desktop` (Chrome) and
`mobile` (iPhone 12, 390 px). They cover the six roles signing in, sidebar
navigation without a full reload, a recycler collecting a released load, and a
collection recorded offline syncing when the network returns.

They boot the real Django API and seed the fixed accounts with
`manage.py seed_e2e`, so a run needs the backend checkout and a browser:

```bash
npx playwright install chromium
E2E_BACKEND_DIR=../weight-verification-backend \
E2E_BACKEND_PYTHON=<path to the backend interpreter> \
npm run test:e2e
```

The config points at PostgreSQL by default (`E2E_POSTGRES_DB`, defaulting to
`weightverification_e2e`). On a machine with no database server, setting it
to the empty string makes the backend fall through to its SQLite path, which
is enough to run the whole suite:

```bash
E2E_POSTGRES_DB= npm run test:e2e
```

`failed-requests.spec.ts` is the one to copy when adding to this suite. It
breaks an endpoint with `page.route`, asserts the screen says so, and then
asserts the opposite when the endpoint works — a screen that always claimed
failure would pass the first half alone. Match routes with a **RegExp, not a
glob**: Playwright's `*` does not cross a `/`, so `get_unread_count*` matches
nothing against `/api/notifications/get_unread_count/` and the test then
passes without having tested anything.
