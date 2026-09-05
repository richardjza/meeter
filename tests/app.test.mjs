/* End-to-end tests for the meeting planner.
   Drives the real page in Chromium: no mocks, no test doubles.

   The browser's time zone is pinned to America/Los_Angeles and every date
   is fixed, so the expected times and day boundaries are deterministic.

   Screenshots and video are off by default, so the usual run stays fast and
   writes nothing. Turn them on for a manual run:

     npm test -- --screenshots        one screenshot per test group
     npm test -- --video              a recording of the whole run
     npm test -- --capture            both
     npm test -- --out-dir=some/dir   where they land (default test-artifacts)

   MEETER_SCREENSHOTS, MEETER_VIDEO, MEETER_CAPTURE and MEETER_OUT_DIR do the
   same from the environment, for CI or a shell alias. */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- Capture options ---------------------------------------------------- */

const argv = process.argv.slice(2);

/* An environment variable counts as set unless it is explicitly empty, 0 or
   false, so MEETER_VIDEO=0 reads the way anyone would expect it to. */
const envOn = name => {
  const value = process.env['MEETER_' + name];
  return value !== undefined && !/^(|0|false)$/i.test(value.trim());
};
const enabled = (flag, name) => argv.includes('--' + flag) || envOn(name);

const readOption = (flag, fallback) => {
  const i = argv.findIndex(a => a === '--' + flag || a.startsWith('--' + flag + '='));
  if (i === -1) return fallback;
  const arg = argv[i];
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : (argv[i + 1] || fallback);
};

const captureAll = enabled('capture', 'CAPTURE');
const wantScreenshots = captureAll || enabled('screenshots', 'SCREENSHOTS');
const wantVideo = captureAll || enabled('video', 'VIDEO');

const outDir = path.resolve(
  ROOT, readOption('out-dir', process.env.MEETER_OUT_DIR || 'test-artifacts'));
const shotDir = path.join(outDir, 'screenshots');
const videoDir = path.join(outDir, 'video');

/* Clear only the two directories this run writes, never the parent: an
   --out-dir pointing somewhere unexpected should not take anything with it. */
if (wantScreenshots) {
  await rm(shotDir, { recursive: true, force: true });
  await mkdir(shotDir, { recursive: true });
}
if (wantVideo) {
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });
}

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

/* Each group leaves the page in a state worth looking at, so a screenshot is
   taken as the group closes — when the next one opens, or at the end of the
   run. A group with a failing assertion is marked in the file name. */
let shotIndex = 0;
let openGroup = null;
let failuresAtGroupStart = 0;

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Paths inside the repository read better relative; anywhere else, an
   --out-dir pointing outside it is clearer written out in full. */
const report = target => {
  const rel = path.relative(ROOT, target);
  return rel.startsWith('..') ? target : rel;
};

async function capture(name, { failed = false } = {}) {
  if (!wantScreenshots) return;
  const file = path.join(
    shotDir,
    String(++shotIndex).padStart(2, '0') + '-' + slug(name) + (failed ? '-failed' : '') + '.png');
  try {
    await page.screenshot({ path: file, fullPage: true });
  } catch (err) {
    console.log('  ! no screenshot for "' + name + '": ' + err.message.split('\n')[0]);
  }
}

async function closeGroup() {
  if (openGroup === null) return;
  const name = openGroup;
  openGroup = null;
  await capture(name, { failed: failures.length > failuresAtGroupStart });
}

async function group(name) {
  await closeGroup();
  openGroup = name;
  failuresAtGroupStart = failures.length;
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
  viewport: { width: 1440, height: 940 },
  ...(wantVideo
    ? { recordVideo: { dir: videoDir, size: { width: 1440, height: 940 } } }
    : {})
});
/* Actions should fail fast; navigation gets longer, since the page's web
   font request may have to time out first in a sandboxed environment. */
context.setDefaultTimeout(5000);
context.setDefaultNavigationTimeout(30000);
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

  await group('Seeding');
  ok(pageErrors.length === 0, 'loads with no page errors: ' + JSON.stringify(pageErrors));
  const names = await page.$$eval('.person-name', els => els.map(e => e.textContent));
  ok(JSON.stringify(names) === '["You","Priya","Kenji"]', 'seeds You / Priya / Kenji');
  ok((await page.textContent('.person-place')).includes('San Francisco'),
     'resolves the browser time zone to a known city');
  ok(await page.textContent('.anchor-badge') === 'Anchor', 'anchors the first participant');

  await group('Date handling');
  await setDate('2026-09-02');
  ok((await page.textContent('#dateLong')).startsWith('Wednesday, September 2, 2026'),
     'renders the long date');
  ok((await page.textContent('#dateLong')).includes('anchored to You'),
     'names the anchor in the date line');

  await group('Grid shape');
  ok((await page.$$('.grid-row')).length === 24, 'renders 24 hour rows');
  ok((await page.$$('.grid-head .col-head')).length === 3, 'renders one column head per person');
  ok((await page.$$('.grid-row:nth-child(2) .cell')).length === 3, 'renders one cell per person per row');

  await group('Overlap maths');
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

  await group('Selecting a slot');
  /* Child 1 of the grid is the header row, so hour 09 is child 11. */
  await page.click('.grid-row:nth-child(11)');
  ok(await page.textContent('.sel-kicker') === 'Proposed slot', 'clicking an hour proposes a slot');
  ok((await page.textContent('.sel-title')).includes('San Francisco'),
     'titles the slot in the anchor city');
  ok((await page.$$('.sel-item')).length === 3, 'summarises the slot for every participant');
  ok((await page.textContent('.sel-item .sel-time')) === '09:00', 'anchor sees their own local hour');

  group('Highlighting picked rows');
  /* The picked row paints its cells in the accent orange; comparing against
     the resolved token keeps the check honest if the palette moves. */
  const shade = async selector => page.evaluate(sel => {
    const probe = document.createElement('div');
    probe.style.background =
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent-400').trim();
    document.body.appendChild(probe);
    const orange = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [getComputedStyle(document.querySelector(sel)).backgroundColor, orange];
  }, selector);

  let [picked, orange] = await shade('.grid-row:nth-child(11) .cell');
  ok(picked === orange, 'a picked row paints its cells in the accent orange');
  let [unpicked] = await shade('.grid-row:nth-child(12) .cell');
  ok(unpicked !== orange, 'an unpicked row keeps its own cell colours');
  ok(await page.getAttribute('.grid-row:nth-child(11)', 'aria-pressed') === 'true',
     'the picked row reports itself pressed');

  await page.click('.grid-row:nth-child(12)');
  ok((await page.$$('.grid-row[aria-pressed="true"]')).length === 2,
     'a second click picks another row without dropping the first');
  [picked] = await shade('.grid-row:nth-child(12) .cell');
  ok(picked === orange, 'the second picked row is orange too');
  ok(await page.textContent('.sel-kicker') === 'Proposed slots', 'the toolbar reads several slots');
  ok((await page.$$('.sel-item')).length === 2, 'the toolbar summarises one item per picked slot');
  ok((await page.textContent('.sel-title')).startsWith('2 hours'), 'the toolbar counts the picks');

  await page.click('.grid-row:nth-child(12)');
  ok((await page.$$('.grid-row[aria-pressed="true"]')).length === 1,
     'clicking a picked row again drops just that row');
  [unpicked] = await shade('.grid-row:nth-child(12) .cell');
  ok(unpicked !== orange, 'the dropped row loses its highlight');
  ok(await page.textContent('.sel-kicker') === 'Proposed slot',
     'the toolbar returns to the single-slot summary');
  ok(await page.getAttribute('.grid-row:nth-child(11)', 'aria-pressed') === 'true',
     'the row that was not clicked stays picked');

  group('Re-anchoring');
  await page.click('.grid-head .col-head:nth-child(3)');   /* child 1 is the rail head */
  ok((await page.textContent('#dateLong')).includes('anchored to Priya'), 're-anchors to the clicked person');
  ok(await page.textContent('.grid-rail-head') === 'Bengaluru', 'the hour rail follows the anchor');
  await page.click('#clearSelBtn');
  ok((await page.textContent('.toolbar-hint')).includes('Click any hour row'),
     'clearing restores the instruction line');

  await group('Search and participants');
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

  await group('Per-person working hours');
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

  await group('Display settings');
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

  await group('Clicking straight after editing a setting');
  /* A settings field losing focus must not rebuild the grid, or the click
     that caused the blur lands on a replaced node and is swallowed. */
  await page.fill('#setWorkStart', '8');
  await page.click('.grid-row:nth-child(11)');
  ok(await page.textContent('.sel-kicker') === 'Proposed slot',
     'the first click on a row registers');
  await page.click('#clearSelBtn');
  await page.fill('#setWorkStart', '9');

  await group('Weekends');
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

  await group('Escaping');
  await setDate('2026-09-02');
  await page.fill('#nameInput', '<img src=x onerror=alert(1)>');
  await page.fill('#queryInput', 'oslo');
  await page.click('.tz-row');
  ok((await page.$$('.person img')).length === 0, 'a participant name is escaped, not parsed as HTML');
  await page.click('.person:nth-child(4) .person-remove');

  await group('Empty state');
  for (let i = 0; i < 3; i++) await page.click('.person:nth-child(1) .person-remove');
  ok((await page.textContent('.people-empty')).includes('No participants yet'),
     'prompts for a first participant');
  ok(await page.textContent('#overlapTag') === 'Add people', 'the header reflects the empty state');
  ok((await page.textContent('.grid-empty')).includes('Add a participant'), 'the grid shows an empty state');

  await page.fill('#queryInput', 'new york');
  await page.click('.tz-row');
  ok(await page.textContent('.anchor-badge') === 'Anchor',
     'the first participant added after emptying becomes the anchor');

  await group('Overall');
  ok(pageErrors.length === 0, 'no page errors across the whole run: ' + JSON.stringify(pageErrors));
  await closeGroup();
} catch (err) {
  /* Report the abort as a failure so the summary below is still printed;
     a timeout here means the page stopped responding as expected. */
  console.log('\n  ✗ the run aborted: ' + (err && err.message ? err.message.split('\n')[0] : err));
  failures.push('the run aborted before completing');
  /* The last thing the page did is the most useful frame there is. */
  await capture((openGroup || 'run') + ' aborted', { failed: true });
  openGroup = null;
} finally {
  /* The recording is only written out when the context closes, and its path
     has to be read while the page is still alive. */
  let videoPath = null;
  if (wantVideo) {
    try {
      videoPath = await page.video().path();
    } catch (err) {
      console.log('\n  ! no video for this run: ' + err.message.split('\n')[0]);
    }
  }
  await context.close();
  await browser.close();
  await server.close();

  if (videoPath) {
    /* Playwright names the file after an internal id; give it a name someone
       reading the directory can make sense of. */
    const named = path.join(videoDir, 'run.webm');
    try {
      if (path.resolve(videoPath) !== named) await rename(videoPath, named);
      videoPath = named;
    } catch { /* keep the generated name if the rename is not possible */ }
  }

  if (wantScreenshots && shotIndex) {
    console.log('\n' + shotIndex + ' screenshot' + (shotIndex === 1 ? '' : 's') +
                ' written to ' + report(shotDir));
  }
  if (videoPath) console.log('Video written to ' + report(videoPath));
}

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  failures.forEach(f => console.log('  FAILED: ' + f));
  process.exit(1);
}
