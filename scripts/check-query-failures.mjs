/**
 * Every query decides what the screen says when it fails (T-175, AC-167).
 *
 * `data?.results ?? []` turns a failed request into zero rows and `?? 0` into
 * a zero. From there an empty list and a dead call look the same, and the
 * screen words an absence it never observed: 「还没有记录」 beside a red toast,
 * a select with nothing to choose, a dashboard of zeroes (F-222). So every
 * `useQuery` has to be answered for, one query at a time.
 *
 * COUNTED BY QUERY, NOT BY FILE. The schedule-planning screen read
 * `plans.isError` and ignored the three queries beside it; a per-file grep
 * scored it as handled. Here each query is checked inside the component that
 * declares it (the top-level function), under its own name.
 *
 * A query counts as answered when that component:
 *
 *   - reads `X.isError`, `X.error`, `X.status` or `X.isLoadingError`;
 *   - hands it to something that shows the failure - `query={X}` (as
 *     `QueryBoundary`, `QueryFailedNote`, `QueryPanel` take it) or
 *     `queries={[…X…]}`;
 *   - destructures `isError` / `error` / `status` from it;
 *   - or returns it (`return X`) - a custom hook; then every place that calls
 *     that hook is held to the same rule, as if it were `useQuery` itself.
 *
 * The one escape is a comment on the line above the query:
 * `// query-failure: <why nothing needs to show>` - for a background refresh
 * whose failure changes nothing on screen. Each one is counted and printed so
 * the escape cannot quietly become the rule.
 *
 * The first counter for this task lived in a temporary directory and was
 * lost with it (F-455). This one lives here, and checks itself against known
 * samples before it reads the real tree: a counter that matches nothing
 * passes every file.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { walkFiles } from "./lib/walk.mjs";

const ROOT = path.join(process.cwd(), "src");
const BASE_HOOKS = ["useQuery", "useInfiniteQuery", "useSuspenseQuery", "useQueries"];

/** (name, start, end) per top-level function. */
function components(source) {
  const decl = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/gm;
  const bounds = [];
  let match = decl.exec(source);
  while (match) {
    bounds.push([match[1] ?? match[2], match.index]);
    match = decl.exec(source);
  }
  if (bounds.length === 0) return [["<file>", 0, source.length]];
  const out = bounds.map(([name, start], i) => [name, start, i + 1 < bounds.length ? bounds[i + 1][1] : source.length]);
  // Anything above the first function (a module-level query) belongs to the file.
  if (bounds[0][1] > 0) out.unshift(["<module>", 0, bounds[0][1]]);
  return out;
}

function escape(name) {
  return name.replace(/[$]/g, "\\$");
}

/** The queries one body declares that it never answers for. */
function unanswered(body, hooks) {
  const hookAlt = hooks.map(escape).join("|");
  const named = new RegExp(`const\\s+(\\w+)\\s*(?::[^=]+)?=\\s*(?:${hookAlt})\\s*(?:<[^()]*?>)?\\(`, "g");
  const destructured = new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*(?:${hookAlt})\\s*(?:<[^()]*?>)?\\(`, "g");
  const found = [];
  let escaped = 0;
  const excused = (index) => {
    const before = body.slice(0, index).split("\n");
    return /\/\/\s*query-failure:\s*\S/.test(before[before.length - 2] ?? "");
  };
  let match = named.exec(body);
  while (match) {
    const name = escape(match[1]);
    const answered = new RegExp(
      // Not inside a string: a message key such as `integrations.status.x`
      // spells the words without reading the query (found by the T-175 pass).
      `(?<![\\w.$"'\`/-])${name}\\.(?:isError|error|status|isLoadingError)\\b` +
        `|query=\\{\\s*${name}\\s*\\}` +
        `|queries=\\{\\[[^\\]]*\\b${name}\\b` +
        `|return\\s+${name}\\s*;`,
    ).test(body);
    if (!answered) {
      if (excused(match.index)) escaped += 1;
      else found.push([match[1], match.index]);
    }
    match = named.exec(body);
  }
  match = destructured.exec(body);
  while (match) {
    if (!/\b(?:isError|error|status)\b/.test(match[1])) {
      if (excused(match.index)) escaped += 1;
      else found.push([`{${match[1].trim()}}`, match.index]);
    }
    match = destructured.exec(body);
  }
  return { found, escaped };
}

/** Custom hooks that hand a query back to their caller. */
function returningHooks(source, hooks) {
  const out = [];
  for (const [name, start, end] of components(source)) {
    if (!/^use[A-Z]/.test(name)) continue;
    const body = source.slice(start, end);
    const hookAlt = hooks.map(escape).join("|");
    const declared = new RegExp(`const\\s+(\\w+)\\s*(?::[^=]+)?=\\s*(?:${hookAlt})\\s*(?:<[^()]*?>)?\\(`, "g");
    let match = declared.exec(body);
    while (match) {
      if (new RegExp(`return\\s+${escape(match[1])}\\s*;`).test(body)) out.push(name);
      match = declared.exec(body);
    }
    if (new RegExp(`return\\s+(?:${hookAlt})\\s*(?:<[^()]*?>)?\\(`).test(body)) out.push(name);
  }
  return out;
}

function scan(files) {
  // Hooks that return a query are found first, across every file, so their
  // callers are held to the rule wherever they live.
  let hooks = [...BASE_HOOKS];
  for (let round = 0; round < 3; round += 1) {
    const more = new Set(hooks);
    for (const [, source] of files) for (const hook of returningHooks(source, hooks)) more.add(hook);
    if (more.size === hooks.length) break;
    hooks = [...more];
  }
  const problems = [];
  let total = 0;
  let escaped = 0;
  const hookAlt = hooks.map(escape).join("|");
  const any = new RegExp(`const\\s+(?:\\w+|\\{[^}]*\\})\\s*(?::[^=]+)?=\\s*(?:${hookAlt})\\s*(?:<[^()]*?>)?\\(`, "g");
  for (const [relative, source] of files) {
    total += (source.match(any) ?? []).length;
    for (const [component, start, end] of components(source)) {
      const result = unanswered(source.slice(start, end), hooks);
      escaped += result.escaped;
      for (const [name, index] of result.found) {
        const line = source.slice(0, start + index).split("\n").length;
        problems.push(`${relative}:${line}: ${component} never says what happens when \`${name}\` fails`);
      }
    }
  }
  return { problems, total, escaped, hooks };
}

// Self-check: four shapes the counter must get right before it is trusted.
const SAMPLES = [
  ["ignored", "function A() { const rows = useQuery({}); return <p>{rows.data?.length ?? 0}</p>; }", 1],
  ["read", "function A() { const rows = useQuery({}); if (rows.isError) return null; return 1; }", 0],
  ["wrapped", "function A() { const rows = useQuery({}); return <QueryBoundary query={rows} what=\"x\" />; }", 0],
  [
    "neighbour's isError does not count",
    "function A() { const plans = useQuery({}); const tasks = useQuery({}); return plans.isError ? 1 : tasks.data; }",
    1,
  ],
  [
    "a hook that returns a query moves the rule to its caller",
    "function useRows() { const q = useQuery({}); return q; }\nfunction A() { const rows = useRows(); return rows.data; }",
    1,
  ],
  ["excused", "function A() {\n  // query-failure: background refresh only\n  const rows = useQuery({}); return 1; }", 0],
  [
    "a message key that spells the name is not a read",
    "function A() { const integrations = useQuery({}); return t(`integrations.status.${k}`); }",
    1,
  ],
];
for (const [label, source, expected] of SAMPLES) {
  const got = scan([["sample.tsx", source]]).problems.length;
  if (got !== expected) {
    console.error(`check-query-failures self-check failed on "${label}": expected ${expected}, got ${got}`);
    process.exit(2);
  }
}

const files = walkFiles(ROOT, /\.tsx?$/)
  .filter((relative) => !/\.test\.|^messages\//.test(relative))
  .map((relative) => [relative, readFileSync(path.join(ROOT, relative), "utf8")]);
const { problems, total, escaped } = scan(files);

if (total < 400) {
  console.error(`check-query-failures read only ${total} queries - the pattern has stopped matching.`);
  process.exit(2);
}

if (problems.length) {
  console.error("Queries with no failure state:\n");
  for (const line of problems) console.error(`  ${line}`);
  console.error(`\n${problems.length} of ${total} queries never say what the screen shows when they fail.`);
  process.exit(1);
}

console.log(
  `Query failures: all ${total} queries say what happens when they fail` +
    (escaped ? ` (${escaped} excused with a reason)` : "") +
    ".",
);
