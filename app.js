/* Meeter — meeting planner across time zones.
   Ported from the "Meeting planner across time zones" design canvas: the
   timezone maths, anchoring model and cell states follow the prototype. */

'use strict';

var CITIES = [
  ["Honolulu","United States","Pacific/Honolulu"],["Anchorage","United States","America/Anchorage"],
  ["San Francisco","United States","America/Los_Angeles"],["Los Angeles","United States","America/Los_Angeles"],
  ["Seattle","United States","America/Los_Angeles"],["Vancouver","Canada","America/Vancouver"],
  ["Denver","United States","America/Denver"],["Phoenix","United States","America/Phoenix"],
  ["Chicago","United States","America/Chicago"],["Austin","United States","America/Chicago"],
  ["Mexico City","Mexico","America/Mexico_City"],["New York","United States","America/New_York"],
  ["Boston","United States","America/New_York"],["Miami","United States","America/New_York"],
  ["Toronto","Canada","America/Toronto"],["Montreal","Canada","America/Toronto"],
  ["Bogotá","Colombia","America/Bogota"],["Lima","Peru","America/Lima"],
  ["Santiago","Chile","America/Santiago"],["São Paulo","Brazil","America/Sao_Paulo"],
  ["Buenos Aires","Argentina","America/Argentina/Buenos_Aires"],["Reykjavík","Iceland","Atlantic/Reykjavik"],
  ["London","United Kingdom","Europe/London"],["Dublin","Ireland","Europe/Dublin"],
  ["Lisbon","Portugal","Europe/Lisbon"],["Madrid","Spain","Europe/Madrid"],
  ["Barcelona","Spain","Europe/Madrid"],["Paris","France","Europe/Paris"],
  ["Amsterdam","Netherlands","Europe/Amsterdam"],["Brussels","Belgium","Europe/Brussels"],
  ["Berlin","Germany","Europe/Berlin"],["Munich","Germany","Europe/Berlin"],
  ["Zurich","Switzerland","Europe/Zurich"],["Milan","Italy","Europe/Rome"],
  ["Rome","Italy","Europe/Rome"],["Vienna","Austria","Europe/Vienna"],
  ["Prague","Czechia","Europe/Prague"],["Warsaw","Poland","Europe/Warsaw"],
  ["Stockholm","Sweden","Europe/Stockholm"],["Copenhagen","Denmark","Europe/Copenhagen"],
  ["Oslo","Norway","Europe/Oslo"],["Helsinki","Finland","Europe/Helsinki"],
  ["Athens","Greece","Europe/Athens"],["Istanbul","Türkiye","Europe/Istanbul"],
  ["Kyiv","Ukraine","Europe/Kyiv"],["Moscow","Russia","Europe/Moscow"],
  ["Casablanca","Morocco","Africa/Casablanca"],["Lagos","Nigeria","Africa/Lagos"],
  ["Cairo","Egypt","Africa/Cairo"],["Nairobi","Kenya","Africa/Nairobi"],
  ["Johannesburg","South Africa","Africa/Johannesburg"],["Tel Aviv","Israel","Asia/Jerusalem"],
  ["Dubai","United Arab Emirates","Asia/Dubai"],["Riyadh","Saudi Arabia","Asia/Riyadh"],
  ["Karachi","Pakistan","Asia/Karachi"],["Mumbai","India","Asia/Kolkata"],
  ["Delhi","India","Asia/Kolkata"],["Bengaluru","India","Asia/Kolkata"],
  ["Colombo","Sri Lanka","Asia/Colombo"],["Dhaka","Bangladesh","Asia/Dhaka"],
  ["Bangkok","Thailand","Asia/Bangkok"],["Ho Chi Minh City","Vietnam","Asia/Ho_Chi_Minh"],
  ["Jakarta","Indonesia","Asia/Jakarta"],["Singapore","Singapore","Asia/Singapore"],
  ["Kuala Lumpur","Malaysia","Asia/Kuala_Lumpur"],["Manila","Philippines","Asia/Manila"],
  ["Hong Kong","China","Asia/Hong_Kong"],["Shanghai","China","Asia/Shanghai"],
  ["Beijing","China","Asia/Shanghai"],["Taipei","Taiwan","Asia/Taipei"],
  ["Seoul","South Korea","Asia/Seoul"],["Tokyo","Japan","Asia/Tokyo"],
  ["Osaka","Japan","Asia/Tokyo"],["Perth","Australia","Australia/Perth"],
  ["Adelaide","Australia","Australia/Adelaide"],["Brisbane","Australia","Australia/Brisbane"],
  ["Sydney","Australia","Australia/Sydney"],["Melbourne","Australia","Australia/Melbourne"],
  ["Auckland","New Zealand","Pacific/Auckland"],["UTC","Coordinated Universal Time","UTC"]
];

/* Defaults the design exposed as canvas props. */
var settings = {
  workStart: 9,
  workEnd: 17,
  weekendsOff: true,
  timeFormat: '24-hour',
  hourRange: 'Full 24 hours'
};

var state;
var idSeq = 0;
var dtfCache = {};
var currentResults = [];

/* ── time helpers ──────────────────────────────────────────────────── */

function dtf(tz) {
  if (!dtfCache[tz]) {
    dtfCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
    });
  }
  return dtfCache[tz];
}

function parts(ts, tz) {
  var o = {};
  var list = dtf(tz).formatToParts(new Date(ts));
  for (var i = 0; i < list.length; i++) o[list[i].type] = list[i].value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: o.weekday };
}

/* Offset of `tz` at instant `ts`, in milliseconds. */
function offMs(ts, tz) {
  var p = parts(ts, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ts;
}

/* Wall-clock time in `tz` back to a timestamp. Two passes so a DST
   transition between the guess and the answer still resolves correctly. */
function wallToTs(y, mo, d, h, tz) {
  var target = Date.UTC(y, mo - 1, d, h);
  var ts = target - offMs(target, tz);
  return target - offMs(ts, tz);
}

function offsetLabel(tz, ts) {
  var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(ts)).find(function (p) { return p.type === 'timeZoneName'; });
  var abbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date(ts)).find(function (p) { return p.type === 'timeZoneName'; });
  var off = (f ? f.value : 'GMT').replace('GMT', 'UTC').replace('-', '−');
  var a = abbr ? abbr.value : '';
  return /^(GMT|UTC)/.test(a) ? off : a + ' · ' + off;
}

function fmt(h, mi) {
  var m = String(mi == null ? 0 : mi).padStart(2, '0');
  if (settings.timeFormat === '24-hour') return String(h).padStart(2, '0') + ':' + m;
  var ap = h < 12 ? 'am' : 'pm';
  var hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ':' + m + ' ' + ap;
}

function num(v) {
  if (v === '' || v === null || v === undefined || !Number.isFinite(+v)) return null;
  return +v;
}

/* Resolved working window for a participant: their own override, else the
   global default, clamped so the range is always at least one hour. */
function work(p) {
  var ws = p.ws != null ? p.ws : num(settings.workStart);
  var we = p.we != null ? p.we : num(settings.workEnd);
  ws = Math.max(0, Math.min(23, ws == null ? 9 : ws));
  we = Math.max(1, Math.min(24, we == null ? 17 : we));
  if (we <= ws) we = Math.min(24, ws + 1);
  return [ws, we];
}

function isWorking(p, hour, wd) {
  var w = work(p);
  if (hour < w[0] || hour >= w[1]) return false;
  if (settings.weekendsOff && (wd === 'Sat' || wd === 'Sun')) return false;
  return true;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ── state ─────────────────────────────────────────────────────────── */

function initState() {
  var localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  var guess = CITIES.find(function (c) { return c[2] === localTz; });
  var now = new Date();
  while (now.getDay() === 0 || now.getDay() === 6) now.setDate(now.getDate() + 1);
  var iso = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
             String(now.getDate()).padStart(2, '0')].join('-');

  var mk = function (name, place, tz) {
    return { id: 'p' + (++idSeq), name: name, place: place, tz: tz, ws: null, we: null };
  };
  var seed = [
    mk('You', guess ? guess[0] : localTz.split('/').pop().replace(/_/g, ' '), localTz),
    mk('Priya', 'Bengaluru', 'Asia/Kolkata'),
    mk('Kenji', 'Tokyo', 'Asia/Tokyo')
  ].filter(function (p, i) { return !(i > 0 && p.tz === localTz); });

  state = {
    date: iso, people: seed, anchorId: seed[0].id,
    nameDraft: '', query: '', listOpen: false, selected: []
  };
}

function addPerson(city) {
  var name = state.nameDraft.trim() || city[0];
  var p = { id: 'p' + (++idSeq), name: name, place: city[0], tz: city[2], ws: null, we: null };
  state.people = state.people.concat([p]);
  state.nameDraft = '';
  state.query = '';
  state.listOpen = false;
  if (!state.anchorId) state.anchorId = p.id;
  render();
}

function removePerson(id) {
  state.people = state.people.filter(function (p) { return p.id !== id; });
  if (state.anchorId === id) state.anchorId = state.people[0] ? state.people[0].id : null;
  render();
}

function setHours(id, key, val) {
  state.people = state.people.map(function (p) {
    if (p.id !== id) return p;
    var next = Object.assign({}, p);
    next[key] = val;
    return next;
  });
  render();
}

/* ── view model ────────────────────────────────────────────────────── */

function computeView() {
  var people = state.people;
  var anchor = people.find(function (p) { return p.id === state.anchorId; }) || people[0] || null;
  var parts3 = state.date.split('-').map(Number);
  var dy = parts3[0], dmo = parts3[1], dd = parts3[2];
  var noonTs = anchor ? wallToTs(dy, dmo, dd, 12, anchor.tz) : Date.UTC(dy, dmo - 1, dd, 12);

  var trim = settings.hourRange !== 'Full 24 hours';
  var hours = [];
  for (var h = 0; h < 24; h++) if (!trim || (h >= 6 && h <= 23)) hours.push(h);

  var q = state.query.trim().toLowerCase();
  var matches = (q
    ? CITIES.filter(function (c) {
        return (c[0] + ' ' + c[1] + ' ' + c[2].replace(/_/g, ' ')).toLowerCase().indexOf(q) !== -1;
      })
    : CITIES).slice(0, 40);

  var dayNote = function (delta) { return delta === 0 ? '' : (delta > 0 ? '+1' : '−1'); };

  var overlapCount = 0;
  var rows = hours.map(function (h) {
    var ts = anchor ? wallToTs(dy, dmo, dd, h, anchor.tz) : Date.UTC(dy, dmo - 1, dd, h);
    var aParts = anchor ? parts(ts, anchor.tz) : { y: dy, mo: dmo, d: dd, h: h, wd: '' };

    var cells = people.map(function (p) {
      var lp = parts(ts, p.tz);
      var working = isWorking(p, lp.h, lp.wd);
      var night = lp.h >= 22 || lp.h < 7;
      var delta = Date.UTC(lp.y, lp.mo - 1, lp.d) - Date.UTC(aParts.y, aParts.mo - 1, aParts.d);
      return {
        working: working, night: night, hour: lp.h, wd: lp.wd,
        time: fmt(lp.h, 0),
        note: [dayNote(delta === 0 ? 0 : (delta > 0 ? 1 : -1)),
               working ? '' : (night ? 'Night' : 'Off')].filter(Boolean).join(' '),
        state: working ? 'Working' : (night ? 'Night' : 'Off hours')
      };
    });

    var allWorking = cells.length > 0 && cells.every(function (c) { return c.working; });
    if (allWorking) overlapCount++;

    /* A picked row stays picked until it is clicked again, so several
       candidate slots can be compared side by side. The pick outranks every
       other cell state, so the orange always reads as the selection. */
    var isSel = state.selected.indexOf(h) !== -1;

    cells.forEach(function (c) {
      if (isSel) { c.bg = 'var(--color-accent-400)'; c.fg = 'var(--color-accent-900)'; c.weight = c.working ? 800 : 600; }
      else if (allWorking) { c.bg = 'var(--color-accent-200)'; c.fg = 'var(--color-accent-800)'; c.weight = 800; }
      else if (c.working) { c.bg = 'var(--color-neutral-100)'; c.fg = 'var(--color-text)'; c.weight = 600; }
      else if (c.night) { c.bg = 'var(--color-neutral-400)'; c.fg = 'var(--color-neutral-900)'; c.weight = 400; }
      else { c.bg = 'var(--color-neutral-200)'; c.fg = 'var(--color-neutral-700)'; c.weight = 400; }
    });

    return {
      key: h, label: fmt(h, 0), cells: cells, selected: isSel,
      workingCount: cells.filter(function (c) { return c.working; }).length,
      mark: allWorking ? 'ALL' : '',
      labelBg: isSel ? 'var(--color-accent-700)' : (allWorking ? 'var(--color-accent)' : 'var(--color-surface)'),
      labelFg: isSel || allWorking ? 'var(--color-bg)' : 'var(--color-neutral-700)',
      outline: isSel ? '2px solid var(--color-accent-700)' : 'none',
      z: isSel ? 2 : 1
    };
  });

  var selRows = rows.filter(function (r) { return r.selected; });
  var multi = selRows.length > 1;
  var slotTitle = function (r) { return r.label + '–' + fmt((r.key + 1) % 24, 0); };
  var longDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(dy, dmo - 1, dd, 12)));

  var dow = new Date(Date.UTC(dy, dmo - 1, dd, 12)).getUTCDay();
  var isWeekend = settings.weekendsOff && (dow === 0 || dow === 6);

  currentResults = matches;

  return {
    isWeekend: isWeekend,
    date: state.date,
    dateLong: longDate + (anchor ? ' · anchored to ' + anchor.name : ''),
    nameDraft: state.nameDraft,
    query: state.query,
    caret: state.listOpen ? '▲' : '▼',
    listOpen: state.listOpen,
    noResults: state.listOpen && matches.length === 0,
    results: matches.map(function (c) {
      return { name: c[0], country: c[1], offset: offsetLabel(c[2], noonTs) };
    }),
    people: people.map(function (p) {
      var w = work(p);
      var lp = parts(Date.now(), p.tz);
      return {
        id: p.id, name: p.name, place: p.place, offset: offsetLabel(p.tz, noonTs),
        isAnchor: anchor ? p.id === anchor.id : false,
        ws: w[0], we: w[1],
        localNow: 'now ' + fmt(lp.h, lp.mi)
      };
    }),
    noPeople: people.length === 0,
    countLabel: people.length + (people.length === 1 ? ' person' : ' people'),
    hourOptions: Array.from({ length: 25 }, function (_, i) {
      /* 24 is the exclusive end of the day; label it distinctly so it does
         not read identically to midnight at the other end of the range. */
      var t = i === 24
        ? (settings.timeFormat === '24-hour' ? '24:00' : '12:00 am (+1)')
        : fmt(i % 24, 0);
      return { v: i, t: t };
    }),
    heads: people.map(function (p) {
      return { id: p.id, name: p.name, place: p.place, offset: offsetLabel(p.tz, noonTs) };
    }),
    anchorRailLabel: anchor ? anchor.place : 'Local',
    gridMinWidth: (96 + people.length * 132) + 'px',
    rows: rows,
    overlapLabel: people.length === 0
      ? 'Add people'
      : (overlapCount === 0
          ? (isWeekend ? 'Weekend — no working hours' : 'No shared hours')
          : overlapCount + (overlapCount === 1 ? ' hour' : ' hours')),
    hasSelection: selRows.length > 0,
    selectionKicker: multi ? 'Proposed slots' : 'Proposed slot',
    clearLabel: multi ? 'Clear all' : 'Clear',
    selectionTitle: !selRows.length || !anchor
      ? ''
      : (multi
          ? selRows.length + ' hours · ' + anchor.place
          : slotTitle(selRows[0]) + ' ' + anchor.place),
    /* One picked slot reads per participant; several read per slot, so the
       picks stay comparable without the toolbar growing a row per person. */
    summary: !selRows.length ? [] : (multi
      ? selRows.map(function (r) {
          return {
            time: slotTitle(r),
            meta: r.workingCount + ' of ' + people.length + ' working',
            fg: r.workingCount === people.length
              ? 'var(--color-accent-800)' : 'var(--color-neutral-600)'
          };
        })
      : selRows[0].cells.map(function (c, i) {
          return {
            time: c.time,
            meta: people[i].name + ' · ' + c.state,
            fg: c.working ? 'var(--color-accent-800)' : 'var(--color-neutral-600)'
          };
        }))
  };
}

/* ── rendering ─────────────────────────────────────────────────────── */

var el = {};

function setValue(input, value) {
  if (input.value !== value) input.value = value;
}

/* Only touch the DOM when the markup actually changed. Rebuilding a region
   replaces the nodes inside it, so an unnecessary rebuild between mousedown
   and mouseup would swallow the user's click. */
function setHTML(node, html) {
  if (node.__html === html) return;
  node.__html = html;
  node.innerHTML = html;
}

function renderWeekend(v) {
  setHTML(el.weekendBanner, v.isWeekend
    ? '<div class="weekend-note">' +
        '<div class="weekend-note-text">Weekend — nobody is on working hours.</div>' +
        '<button class="btn btn-secondary weekend-btn" id="nextWeekdayBtn">Next weekday</button>' +
      '</div>'
    : '');
}

function renderDropdown(v) {
  if (!v.listOpen) { setHTML(el.tzDropdown, ''); return; }
  var rows = v.results.map(function (r, i) {
    return '<div class="tz-row" role="button" tabindex="0" data-pick="' + i + '">' +
             '<div class="tz-row-main">' +
               '<div class="tz-name">' + esc(r.name) + '</div>' +
               '<div class="tz-country">' + esc(r.country) + '</div>' +
             '</div>' +
             '<div class="tz-offset">' + esc(r.offset) + '</div>' +
           '</div>';
  }).join('');
  var empty = v.noResults ? '<div class="tz-empty">No city or zone matches that.</div>' : '';
  setHTML(el.tzDropdown, '<div class="tz-list">' + rows + empty + '</div>');
}

function renderPeople(v) {
  if (v.noPeople) {
    setHTML(el.peopleList,
      '<div class="people-empty">No participants yet — search a city above to add the first one.</div>');
    return;
  }
  var opts = function (sel) {
    return v.hourOptions.map(function (h) {
      return '<option value="' + h.v + '"' + (h.v === sel ? ' selected' : '') + '>' + esc(h.t) + '</option>';
    }).join('');
  };
  setHTML(el.peopleList, v.people.map(function (p) {
    return '<div class="person">' +
      '<div class="person-top">' +
        '<div class="person-id">' +
          '<div class="person-name-row">' +
            '<div class="person-name">' + esc(p.name) + '</div>' +
            (p.isAnchor ? '<div class="anchor-badge">Anchor</div>' : '') +
          '</div>' +
          '<div class="person-place">' + esc(p.place) + ' · ' + esc(p.offset) + '</div>' +
        '</div>' +
        '<button class="btn btn-secondary btn-icon person-remove" data-remove="' + esc(p.id) +
          '" title="Remove participant" aria-label="Remove ' + esc(p.name) + '">×</button>' +
      '</div>' +
      '<div class="person-hours">' +
        '<div class="works-lbl">Works</div>' +
        '<select class="hour-select" data-hours="ws" data-id="' + esc(p.id) +
          '" aria-label="Work start for ' + esc(p.name) + '">' + opts(p.ws) + '</select>' +
        '<div class="to-lbl">to</div>' +
        '<select class="hour-select" data-hours="we" data-id="' + esc(p.id) +
          '" aria-label="Work end for ' + esc(p.name) + '">' + opts(p.we) + '</select>' +
        '<div class="local-now">' + esc(p.localNow) + '</div>' +
      '</div>' +
    '</div>';
  }).join(''));
}

function renderToolbar(v) {
  if (!v.hasSelection) {
    setHTML(el.toolbar, '<div class="toolbar-hint">Click any hour row to propose a slot, ' +
      'and click it again to drop it. Picked rows stay orange; ' +
      'rows in red are working hours for everyone. ' +
      'Click a column head to anchor the left rail to that person’s day.</div>');
    return;
  }
  var items = v.summary.map(function (s) {
    return '<div class="sel-item">' +
             '<div class="sel-time">' + esc(s.time) + '</div>' +
             '<div class="sel-meta" style="color:' + s.fg + '">' + esc(s.meta) + '</div>' +
           '</div>';
  }).join('');
  setHTML(el.toolbar,
    '<div class="sel-wrap">' +
      '<div class="sel-block">' +
        '<div class="sel-kicker">' + esc(v.selectionKicker) + '</div>' +
        '<div class="sel-title">' + esc(v.selectionTitle) + '</div>' +
      '</div>' +
      '<div class="sel-summary">' + items + '</div>' +
      '<button class="btn btn-secondary clear-btn" id="clearSelBtn">' + esc(v.clearLabel) + '</button>' +
    '</div>');
}

function renderGrid(v) {
  if (v.noPeople) {
    setHTML(el.gridWrap, '<div class="grid" style="padding:0">' +
      '<div class="grid-empty">Add a participant to see the overlap grid.</div></div>');
    return;
  }
  var heads = v.heads.map(function (h) {
    return '<div class="col-head" role="button" tabindex="0" data-anchor="' + esc(h.id) + '">' +
             '<div class="col-head-name">' + esc(h.name) + '</div>' +
             '<div class="col-head-place">' + esc(h.place) + ' · ' + esc(h.offset) + '</div>' +
           '</div>';
  }).join('');

  var body = v.rows.map(function (row) {
    var cells = row.cells.map(function (c) {
      return '<div class="cell" style="background:' + c.bg + ';color:' + c.fg + '">' +
               '<span class="cell-time" style="font-weight:' + c.weight + '">' + esc(c.time) + '</span>' +
               '<span class="cell-note">' + esc(c.note) + '</span>' +
             '</div>';
    }).join('');
    return '<div class="grid-row" role="button" tabindex="0" data-row="' + row.key +
             '" aria-pressed="' + (row.selected ? 'true' : 'false') +
             '" style="outline:' + row.outline + ';z-index:' + row.z + '">' +
             '<div class="row-label" style="background:' + row.labelBg + ';color:' + row.labelFg + '">' +
               '<span>' + esc(row.label) + '</span>' +
               '<span class="row-mark">' + esc(row.mark) + '</span>' +
             '</div>' + cells +
           '</div>';
  }).join('');

  setHTML(el.gridWrap,
    '<div class="grid" style="min-width:' + v.gridMinWidth + '">' +
      '<div class="grid-head">' +
        '<div class="grid-rail-head">' + esc(v.anchorRailLabel) + '</div>' + heads +
      '</div>' + body +
    '</div>');
}

function render() {
  var v = computeView();
  el.overlapTag.textContent = v.overlapLabel;
  setValue(el.dateInput, v.date);
  el.dateLong.textContent = v.dateLong;
  setValue(el.nameInput, v.nameDraft);
  setValue(el.queryInput, v.query);
  el.caretBtn.textContent = v.caret;
  el.countLabel.textContent = v.countLabel;
  renderWeekend(v);
  renderDropdown(v);
  renderPeople(v);
  renderToolbar(v);
  renderGrid(v);
}

/* ── wiring ────────────────────────────────────────────────────────── */

function activate(node, fn) {
  node.addEventListener('click', fn);
  node.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
}

/* Enter / Space on a role=button descendant, delegated. */
function delegateActivate(container, selector, handler) {
  var run = function (e) {
    var target = e.target.closest(selector);
    if (!target || !container.contains(target)) return;
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    handler(target);
  };
  container.addEventListener('click', run);
  container.addEventListener('keydown', run);
}

/* Clicking a row picks it; clicking it again drops it, so any number of
   candidate hours can stay marked at once. */
function toggleRow(hour) {
  state.selected = state.selected.indexOf(hour) === -1
    ? state.selected.concat([hour])
    : state.selected.filter(function (h) { return h !== hour; });
  render();
}

function nextWeekday() {
  var p = state.date.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  state.date = d.toISOString().slice(0, 10);
  state.selected = [];
  render();
}

/* Commits while typing, so the field losing focus never triggers a render.
   The displayed value is normalised on blur, which fires no events. */
function bindHourSetting(input, key, lo, hi, dflt) {
  input.addEventListener('input', function (e) {
    var n = num(e.target.value);
    settings[key] = n == null ? dflt : Math.max(lo, Math.min(hi, Math.round(n)));
    render();
  });
  input.addEventListener('blur', function (e) { e.target.value = settings[key]; });
}

function init() {
  ['overlapTag', 'dateInput', 'dateLong', 'weekendBanner', 'nameInput', 'queryInput',
   'caretBtn', 'tzDropdown', 'countLabel', 'peopleList', 'toolbar', 'gridWrap',
   'setWorkStart', 'setWorkEnd', 'setWeekendsOff', 'setTimeFormat', 'setHourRange']
    .forEach(function (id) { el[id] = document.getElementById(id); });

  initState();

  el.dateInput.addEventListener('change', function (e) {
    state.date = e.target.value || state.date;
    state.selected = [];
    render();
  });
  el.nameInput.addEventListener('input', function (e) { state.nameDraft = e.target.value; });
  el.queryInput.addEventListener('input', function (e) {
    state.query = e.target.value;
    state.listOpen = true;
    render();
  });
  el.queryInput.addEventListener('focus', function () {
    if (!state.listOpen) { state.listOpen = true; render(); }
  });
  el.caretBtn.addEventListener('click', function () { state.listOpen = !state.listOpen; render(); });

  delegateActivate(el.tzDropdown, '[data-pick]', function (t) {
    var city = currentResults[+t.dataset.pick];
    if (city) addPerson(city);
  });

  el.peopleList.addEventListener('click', function (e) {
    var t = e.target.closest('[data-remove]');
    if (t) removePerson(t.dataset.remove);
  });
  el.peopleList.addEventListener('change', function (e) {
    var t = e.target.closest('[data-hours]');
    if (t) setHours(t.dataset.id, t.dataset.hours, +t.value);
  });

  el.weekendBanner.addEventListener('click', function (e) {
    if (e.target.closest('#nextWeekdayBtn')) nextWeekday();
  });
  el.toolbar.addEventListener('click', function (e) {
    if (e.target.closest('#clearSelBtn')) { state.selected = []; render(); }
  });

  delegateActivate(el.gridWrap, '[data-anchor]', function (t) {
    state.anchorId = t.dataset.anchor;
    render();
  });
  delegateActivate(el.gridWrap, '[data-row]', function (t) {
    toggleRow(+t.dataset.row);
  });

  el.setWorkStart.value = settings.workStart;
  el.setWorkEnd.value = settings.workEnd;
  el.setWeekendsOff.checked = settings.weekendsOff;
  el.setTimeFormat.value = settings.timeFormat;
  el.setHourRange.value = settings.hourRange;

  bindHourSetting(el.setWorkStart, 'workStart', 0, 23, 9);
  bindHourSetting(el.setWorkEnd, 'workEnd', 1, 24, 17);
  el.setWeekendsOff.addEventListener('change', function (e) {
    settings.weekendsOff = e.target.checked;
    render();
  });
  el.setTimeFormat.addEventListener('change', function (e) {
    settings.timeFormat = e.target.value;
    render();
  });
  el.setHourRange.addEventListener('change', function (e) {
    settings.hourRange = e.target.value;
    state.selected = [];
    render();
  });

  render();
  /* Keep each participant's "now HH:MM" honest without a full re-render storm. */
  setInterval(render, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
