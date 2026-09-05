/* End-to-end tests for the meeting planner.
   Drives the real page in Chromium: no mocks, no test doubles.

   The browser's time zone is pinned to America/Los_Angeles and every date
   is fixed, so the expected times and day boundaries are deterministic. */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Diagnostics for a failed run. Written only on failure, and picked up as a
   CI artifact — a red run should not need reproducing locally to understand. */
const RESULTS = path.join(ROOT, 'test-results');

let passed = 0;
const failures = [];

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + message);
  } else {
    failures.push(message);
    console.log('  ✗ ' + message);
  }
}

function group(name) {
  console.log('\n' + name);
}

/* Requests to the web font CDN are expected to fail in a sandbox, and a
   missing favicon is not a defect. Anything else is a real page error. */
const isNoise = text =>
  /favicon|fonts\.(googleapis|gstatic)|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|404/.test(text);

const server = await startServer(ROOT);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined
});
const context = await browser.newContext({
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 1440, height: 940 }
});
/* Actions should fail fast; navigation gets longer, since the page's web
   font request may have to time out first in a sandboxed environment. */
context.setDefaultTimeout(5000);
context.setDefaultNavigationTimeout(30000);
/* Recorded for the whole run but kept only when something fails. The trace
   carries a screenshot and a DOM snapshot per action, so the failing moment
   can be replayed rather than guessed at. */
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

const page = await context.newPage();

const pageErrors = [];
page.on('console', m => {
  if (m.type() === 'error' && !isNoise(m.text())) pageErrors.push(m.text());
});
page.on('pageerror', e => pageErrors.push(String(e)));

const setDate = async iso => {
  await page.fill('#dateInput', iso);
  await page.dispatchEvent('#dateInput', 'change');
};

try {
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.grid-row');

  group('Seeding');
  ok(pageErrors.length === 0, 'loads with no page errors: ' + JSON.stringify(pageErrors));
  const names = await page.$$eval('.person-name', els => els.map(e => e.textContent));
  ok(JSON.stringify(names) === '["You","Priya","Kenji"]', 'seeds You / Priya / Kenji');
  ok((await page.textContent('.person-place')).includes('San Francisco'),
     'resolves the browser time zone to a known city');
  ok(await page.textContent('.anchor-badge') === 'Anchor', 'anchors the first participant');

  group('Date handling');
  await setDate('2026-09-02');
  ok((await page.textContent('#dateLong')).startsWith('Wednesday, September 2, 2026'),
     'renders the long date');
  ok((await page.textContent('#dateLong')).includes('anchored to You'),
     'names the anchor in the date line');

  group('Grid shape');
  ok((await page.$$('.grid-row')).length === 24, 'renders 24 hour rows');
  ok((await page.$$('.grid-head .col-head')).length === 3, 'renders one column head per person');
  ok((await page.$$('.grid-row:nth-child(2) .cell')).length === 3, 'renders one cell per person per row');

  group('Overlap maths');
  ok(await page.textContent('#overlapTag') === 'No shared hours',
     'San Francisco / Bengaluru / Tokyo at 09-17 genuinely never overlap');
  const notes = await page.$$eval('.cell-note', els => els.map(e => e.textContent.trim()));
  ok(notes.some(n => n.includes('+1')), 'marks participants sitting on the next calendar day');

  await page.fill('#setWorkStart', '0');
  await page.fill('#setWorkEnd', '24');
  ok(await page.textContent('#overlapTag') === '24 hours', 'a full-day window overlaps for all 24 hours');
  ok((await page.$$('.row-mark')).length === 24, 'marks every overlapping row ALL');
  await page.fill('#setWorkStart', '9');
  await page.fill('#setWorkEnd', '17');

  group('Selecting a slot');
  /* Child 1 of the grid is the header row, so hour 09 is child 11. */
  await page.click('.grid-row:nth-child(11)');
  ok(await page.textContent('.sel-kicker') === 'Proposed slot', 'clicking an hour proposes a slot');
  ok((await page.textContent('.sel-title')).includes('San Francisco'),
     'titles the slot in the anchor city');
  ok((await page.$$('.sel-item')).length === 3, 'summarises the slot for every participant');
  ok((await page.textContent('.sel-item .sel-time')) === '09:00', 'anchor sees their own local hour');

  group('Re-anchoring');
  await page.click('.grid-head .col-head:nth-child(3)');   /* child 1 is the rail head */
  ok((await page.textContent('#dateLong')).includes('anchored to Priya'), 're-anchors to the clicked person');
  ok(await page.textContent('.grid-rail-head') === 'Bengaluru', 'the hour rail follows the anchor');
  await page.click('#clearSelBtn');
  ok((await page.textContent('.toolbar-hint')).includes('Click any hour row'),
     'clearing restores the instruction line');

  group('Search and participants');
  await page.fill('#queryInput', 'berlin');
  await page.waitForSelector('.tz-row');
  /* Munich sits in Europe/Berlin, so matching on zone name is correct. */
  ok((await page.$$('.tz-row')).length === 2, 'search matches city and zone name');
  ok(await page.textContent('.tz-row .tz-name') === 'Berlin', 'the exact city ranks first');

  await page.fill('#nameInput', 'Lena');
  await page.click('.tz-row');
  const names2 = await page.$$eval('.person-name', els => els.map(e => e.textContent));
  ok(names2.includes('Lena'), 'adds a participant under the typed name');
  ok(await page.textContent('#countLabel') === '4 people', 'updates the participant count');
  ok((await page.$$('.grid-head .col-head')).length === 4, 'the grid gains a column');

  await page.fill('#queryInput', 'kolkata');
  ok((await page.$$('.tz-row')).length >= 3, 'searching an IANA zone finds its cities');
  await page.fill('#queryInput', 'zzzz');
  ok((await page.textContent('.tz-empty')).includes('No city or zone'), 'shows an empty search state');
  await page.fill('#queryInput', '');
  await page.click('#caretBtn');

  group('Per-person working hours');
  await page.selectOption('.person:nth-child(4) [data-hours="ws"]', '0');
  await page.selectOption('.person:nth-child(4) [data-hours="we"]', '24');
  ok(await page.$eval('.person:nth-child(4) [data-hours="ws"]', e => e.value) === '0',
     'an override persists across re-render');
  ok(await page.$eval('.person:nth-child(4) [data-hours="we"]', e => e.value) === '24',
     'both ends of the override persist');
  ok(await page.$eval('.person:nth-child(1) [data-hours="ws"]', e => e.value) === '9',
     'other participants keep the default');
  await page.click('.person:nth-child(4) .person-remove');
  ok(await page.textContent('#countLabel') === '3 people', 'removing a participant updates the count');

  group('Display settings');
  await page.selectOption('#setTimeFormat', '12-hour');
  ok((await page.textContent('.grid-row:nth-child(2) .row-label span')).includes('am'),
     'switches to 12-hour labels');
  await page.selectOption('#setTimeFormat', '24-hour');
  ok(await page.textContent('.grid-row:nth-child(2) .row-label span') === '00:00',
     'switches back to 24-hour labels');
  await page.selectOption('#setHourRange', 'Waking hours (06–23)');
  ok((await page.$$('.grid-row')).length === 18, 'the waking-hours range trims to 18 rows');
  ok(await page.textContent('.grid-row:nth-child(2) .row-label span') === '06:00',
     'the trimmed range starts at 06:00');
  await page.selectOption('#setHourRange', 'Full 24 hours');

  group('Clicking straight after editing a setting');
  /* A settings field losing focus must not rebuild the grid, or the click
     that caused the blur lands on a replaced node and is swallowed. */
  await page.fill('#setWorkStart', '8');
  await page.click('.grid-row:nth-child(11)');
  ok(await page.textContent('.sel-kicker') === 'Proposed slot',
     'the first click on a row registers');
  await page.click('#clearSelBtn');
  await page.fill('#setWorkStart', '9');

  group('Weekends');
  await setDate('2026-09-05');                 /* Saturday */
  ok((await page.textContent('.weekend-note-text')).includes('Weekend'), 'flags a weekend date');
  ok(await page.textContent('#overlapTag') === 'Weekend — no working hours',
     'reports no working hours at the weekend');
  await page.click('#nextWeekdayBtn');
  ok(await page.inputValue('#dateInput') === '2026-09-07', 'jumps to the following Monday');
  ok(await page.$('.weekend-note') === null, 'clears the weekend notice');

  await setDate('2026-09-05');
  await page.uncheck('#setWeekendsOff');
  ok(await page.$('.weekend-note') === null, 'treating weekends as working hides the notice');
  await page.check('#setWeekendsOff');

  group('Escaping');
  await setDate('2026-09-02');
  await page.fill('#nameInput', '<img src=x onerror=alert(1)>');
  await page.fill('#queryInput', 'oslo');
  await page.click('.tz-row');
  ok((await page.$$('.person img')).length === 0, 'a participant name is escaped, not parsed as HTML');
  await page.click('.person:nth-child(4) .person-remove');

  group('Empty state');
  for (let i = 0; i < 3; i++) await page.click('.person:nth-child(1) .person-remove');
  ok((await page.textContent('.people-empty')).includes('No participants yet'),
     'prompts for a first participant');
  ok(await page.textContent('#overlapTag') === 'Add people', 'the header reflects the empty state');
  ok((await page.textContent('.grid-empty')).includes('Add a participant'), 'the grid shows an empty state');

  await page.fill('#queryInput', 'new york');
  await page.click('.tz-row');
  ok(await page.textContent('.anchor-badge') === 'Anchor',
     'the first participant added after emptying becomes the anchor');

  group('Overall');
  ok(pageErrors.length === 0, 'no page errors across the whole run: ' + JSON.stringify(pageErrors));
} catch (err) {
  /* Report the abort as a failure so the summary below is still printed;
     a timeout here means the page stopped responding as expected. */
  console.log('\n  ✗ the run aborted: ' + (err && err.message ? err.message.split('\n')[0] : err));
  failures.push('the run aborted before completing');
} finally {
  await saveDiagnostics(failures.length > 0);
  await browser.close();
  await server.close();
}

async function saveDiagnostics(failed) {
  /* Diagnostics must never mask the result they describe, so every step here
     is best-effort: a browser that died mid-run cannot be screenshotted. */
  try {
    if (!failed) {
      await context.tracing.stop();
      return;
    }
    await mkdir(RESULTS, { recursive: true });
    await page.screenshot({ path: path.join(RESULTS, 'final-state.png'), fullPage: true })
      .catch(e => console.log('  (could not capture a screenshot: ' + e.message.split('\n')[0] + ')'));
    await context.tracing.stop({ path: path.join(RESULTS, 'trace.zip') });
    console.log('\nDiagnostics written to test-results/');
    console.log('  final-state.png  the page as the run left it');
    console.log('  trace.zip        replay with: npx playwright show-trace test-results/trace.zip');
  } catch (e) {
    console.log('  (diagnostics unavailable: ' + String(e).split('\n')[0] + ')');
  }
}

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach(f => console.log('  FAILED: ' + f));
  process.exit(1);
}
