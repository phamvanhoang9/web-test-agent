// coverage.mjs — check that a test plan accounts for everything exploration found: every
// route in the site map and every field, button and link in the page outlines must appear in
// a TC row of the plan, or in its "không test (và lý do)" section. Pure: no browser, no disk.

const PARAM = "[^\\s/|;,)`'\"]+";
const SEGMENT_END = "(?=$|[\\s|;,)`'\"?#]|\\.(?:\\s|$))";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

function routeCore(route) {
  return route
    .toLowerCase()
    .split('/')
    .map((segment) => (segment.startsWith(':') ? PARAM : escapeRegex(segment)))
    .join('/');
}

/** Matches `route` written anywhere in prose: `/meetings/:id` matches `/meetings/<id>`, not `/meetings/<id>/live`. */
export function routePattern(route) {
  return new RegExp(`(?<![\\w\\-/.:])${routeCore(route)}${SEGMENT_END}`);
}

const SECTION = /^### (Fields|Buttons|Links) \(\d+\)$/;
const FIELD = /^- `([^`]*)` name=`[^`]*` — ?(.*)$/;
const LINK = /^- (.*) → (\S+)$/;
const unlabeled = (label) => (label === '(no text)' ? '' : label.trim());

/** Page path and control labels from an exploration.md outline. */
export function parseOutline(md) {
  const finalUrl = /\*\*Final URL:\*\* (\S+)/.exec(md)?.[1];
  const outline = { page: finalUrl ? new URL(finalUrl).pathname : null, fields: [], buttons: [], links: [] };
  let section = null;
  for (const line of md.split('\n')) {
    const heading = SECTION.exec(line);
    if (heading) {
      section = heading[1];
      continue;
    }
    if (line.startsWith('#')) section = null;
    if (!section || !line.startsWith('- ') || line.startsWith('- … and ')) continue;
    if (section === 'Fields') {
      const [, tag, label] = FIELD.exec(line) ?? [];
      if (tag === undefined) continue;
      // A <select>'s label is its options' text run together; keep the first option.
      outline.fields.push(tag.startsWith('select') ? label.split(/(?<=[a-z])(?=[A-Z])/)[0].trim() : label.trim());
    } else if (section === 'Buttons') {
      outline.buttons.push(unlabeled(line.slice(2)));
    } else {
      const [, label, href] = LINK.exec(line) ?? [];
      if (href) outline.links.push({ label: unlabeled(label), href });
    }
  }
  return outline;
}

const NOT_TESTED = /không test|not tested/i;

/** TC rows of the plan's table, and the text of its "không test" section. */
export function parsePlan(md) {
  const rows = [];
  const notTested = [];
  let notTestedLevel = 0;
  for (const line of md.split('\n')) {
    const heading = /^(#+)\s/.exec(line);
    if (heading) {
      if (notTestedLevel && heading[1].length <= notTestedLevel) notTestedLevel = 0;
      if (NOT_TESTED.test(line)) notTestedLevel = heading[1].length;
    }
    if (notTestedLevel) notTested.push(line);
    const tc = /^\|\s*(TC-\d+)\s*\|/.exec(line)?.[1];
    if (tc) rows.push({ tc, text: line });
  }
  return { rows, notTested: notTested.join('\n') };
}

/**
 * Every route and control, each with the TCs that mention it and whether the plan lists it
 * as not tested. `gaps` is what neither covers. A link is also covered when the route it
 * points to is. Controls without a label cannot be matched and are listed in `unlabeled`.
 */
export function checkCoverage({ routes, outlines, plan, origin }) {
  const stripOrigin = (text) => normalize(origin ? text.replaceAll(origin, '') : text);
  const rows = plan.rows.map((row) => ({ tc: row.tc, text: stripOrigin(row.text) }));
  const notTestedText = stripOrigin(plan.notTested);
  const verdict = (matches) => {
    const tcs = rows.filter((row) => matches(row.text)).map((row) => row.tc);
    const notTested = matches(notTestedText);
    return { tcs, notTested, covered: tcs.length > 0 || notTested };
  };

  const routeResults = [...new Set(routes)].map((route) => {
    const pattern = routePattern(route);
    return { route, ...verdict((text) => pattern.test(text)) };
  });
  const coveredRoutes = routeResults
    .filter((r) => r.covered)
    .map((r) => new RegExp(`^${routeCore(r.route)}/?$`));
  const targetCovered = (href) => {
    const path = href.startsWith('/') ? href : origin && href.startsWith(origin) ? href.slice(origin.length) || '/' : null;
    return path !== null && coveredRoutes.some((pattern) => pattern.test(path.toLowerCase().split(/[?#]/)[0]));
  };

  const controls = new Map();
  const unlabeledControls = [];
  const add = (kind, label, page, href) => {
    if (!label) {
      unlabeledControls.push({ kind, page });
      return;
    }
    const key = `${kind}\u0000${label}`;
    if (!controls.has(key)) controls.set(key, { kind, label, pages: [], hrefs: [] });
    const control = controls.get(key);
    if (!control.pages.includes(page)) control.pages.push(page);
    if (href) control.hrefs.push(href);
  };
  for (const outline of outlines) {
    for (const label of outline.fields) add('field', label, outline.page);
    for (const label of outline.buttons) add('button', label, outline.page);
    for (const { label, href } of outline.links) add('link', label, outline.page, href);
  }
  const controlResults = [...controls.values()].map(({ hrefs, ...control }) => {
    const needle = normalize(control.label);
    const result = { ...control, ...verdict((text) => text.includes(needle)) };
    if (!result.covered && hrefs.some(targetCovered)) result.covered = true;
    return result;
  });

  return {
    routes: routeResults,
    controls: controlResults,
    unlabeled: unlabeledControls,
    gaps: [...routeResults.filter((r) => !r.covered), ...controlResults.filter((c) => !c.covered)],
  };
}

const cell = (value) => String(value).replaceAll('|', '\\|');
const coveredBy = (item) => [...item.tcs, ...(item.notTested ? ['không test'] : [])].join(', ') || (item.covered ? 'link target' : '**—**');

/** The coverage.md report: gaps first, then every route and control with what covers it. */
export function renderCoverage(result, host) {
  const count = (items) => `${items.filter((i) => i.covered).length}/${items.length}`;
  const gapRows = result.gaps.map((gap) => (gap.route !== undefined
    ? `| route | ${cell(gap.route)} | — |`
    : `| ${gap.kind} | ${cell(gap.label)} | ${gap.pages.join(', ')} |`));
  return [
    `# Coverage — ${host}`,
    `- **Routes covered:** ${count(result.routes)}\n- **Controls covered:** ${count(result.controls)}\n- **Gaps:** ${result.gaps.length}`,
    '## Gaps',
    gapRows.length
      ? ['Add a TC that mentions each item, or list it with a reason under "không test".', '| Kind | Item | Pages |', '| --- | --- | --- |', ...gapRows].join('\n')
      : '_None — every route and control maps to a TC or a stated reason._',
    '## Routes',
    ['| Route | Covered by |', '| --- | --- |', ...result.routes.map((r) => `| ${cell(r.route)} | ${coveredBy(r)} |`)].join('\n'),
    '## Controls',
    ['| Kind | Label | Pages | Covered by |', '| --- | --- | --- | --- |',
      ...result.controls.map((c) => `| ${c.kind} | ${cell(c.label)} | ${c.pages.join(', ')} | ${coveredBy(c)} |`)].join('\n'),
    '## Unlabeled controls',
    result.unlabeled.length
      ? `Icon-only controls cannot be matched by name; check them on the page:\n${result.unlabeled.map((u) => `- ${u.kind} on ${u.page}`).join('\n')}`
      : '_None._',
  ].join('\n\n') + '\n';
}
