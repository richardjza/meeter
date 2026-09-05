# Meeter

A simple, lightweight way to plan meetings across timezones.

Finding a time that works for people in San Francisco, Berlin, and Singapore
usually means a spreadsheet, some mental arithmetic, and at least one person
joining at 4am. Meeter exists to make that a ten-second job instead.

## Status

There is a working first version: a single-page app with no build step, no
dependencies, and no server. Everything below describes what it actually does.

## The idea

You give Meeter a set of participants and where they are. It shows you the
overlapping hours where everyone is reasonably awake, and lets you pick a slot
that reads correctly for every person in the meeting.

The guiding principles:

- **Lightweight.** No accounts to create, no calendar to connect before you get
  an answer, no heavyweight scheduling workflow.
- **Legible.** The output should be obvious at a glance — you should be able to
  see who is being asked to take the early call.
- **Correct about time.** Timezones are full of edge cases (daylight saving
  shifts, half-hour offsets, dates that differ between participants). Getting
  these right is the whole point of the tool, so they are handled explicitly
  rather than approximated.

## Features

- **Add participants by city or time zone.** Search across roughly eighty
  cities; the search matches city, country and IANA zone name, so "berlin"
  finds both Berlin and Munich.
- **A side-by-side overlap grid.** One column per participant, one row per
  hour. Cells are shaded working / off-hours / night, and rows where everyone
  is working are highlighted and marked `ALL`.
- **Working-hour defaults, adjustable per person.** Set the default day once;
  override it for anyone who keeps different hours.
- **Day-boundary markers.** A cell shows `+1` or `−1` when that participant is
  on a different calendar date from the anchor.
- **Anchoring.** The hour rail reads in one participant's local day. Click any
  column head to switch whose day the grid is expressed in.
- **A slot summary.** Click an hour row to see that time rendered in every
  participant's local time, each labelled working, off-hours or night.
- **Weekend handling.** Weekends count as non-working by default, with a
  one-click jump to the next weekday.

Time zone conversion goes through `Intl.DateTimeFormat`, so daylight-saving
shifts and half-hour offsets are handled by the platform's own zone database
rather than approximated. Converting a wall-clock time back to an instant runs
two passes, so an hour sitting on a DST transition still resolves correctly.

## Getting started

No install and no build. Open `index.html` in a browser, or serve the
directory if you prefer a real origin:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Running it in Docker

For hosting it locally under Docker Desktop, with an edit loop that needs no
rebuild, see [docs/DOCKER.md](docs/DOCKER.md):

```sh
docker compose up -d      # then open http://localhost:8080
```

Every push to `main` also builds the `Dockerfile` and publishes the result to
the GitHub Container Registry, so the app can be run without cloning anything:

```sh
docker run -d -p 8080:80 ghcr.io/richardjza/meeter:latest
```

`:latest` follows `main`. Each build is additionally tagged with the full
commit SHA it was built from — `ghcr.io/richardjza/meeter:sha-<commit>` — for
pinning to a known version. See
[docs/DOCKER.md](docs/DOCKER.md#the-published-image) for the details, including
the one-time step that makes the package publicly pullable.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Page shell — the static structure and its stable element IDs |
| `app.js` | State, time zone maths, view model and rendering |
| `app.css` | Layout and component styling |
| `ds/modernist.css` | Vendored Modernist design system: tokens and base classes |
| `favicon.svg` | The Meeter mark — source of truth for the icon artwork |
| `favicon.ico` | The same mark rasterised at 16/32/48 px for browser tabs |
| `apple-touch-icon.png` | The same mark at 180 px, for iOS home-screen bookmarks |
| `tests/` | End-to-end test suite and the static server it runs against |

The interface is an implementation of the "Meeting planner across time zones"
design canvas; `ds/modernist.css` is the design system that canvas was built
against, vendored here so the app carries its own styling.

### The mark

The favicon is drawn from the same system: flat colour, square corners, the
ink ground and the single accent red of `ds/modernist.css`. Three staggered
bars are three participants' working days, offset by time zone; the accent
band across them is the hour that falls inside all three — the app's own
answer, reduced to sixteen pixels.

`favicon.svg` is the artwork. The `.ico` and the touch icon are rasterisations
of it for the places that cannot take an SVG, so a change to the mark starts
in the SVG and is re-rendered out to the other two.

## Tests

The suite drives the real page in Chromium — no mocks, no test doubles. It
pins the browser's time zone to `America/Los_Angeles` and uses fixed dates,
so expected times and day boundaries are deterministic.

```sh
npm install
npx playwright install chromium   # once, if the browser is not already present
npm test
```

Playwright is the only dependency, and it is needed only for the tests — the
app itself has none. If Chromium lives somewhere the default resolution does
not find it, point at it with `CHROMIUM_PATH=/path/to/chrome npm test`.

The suite starts its own static server on an ephemeral port, so nothing needs
to be running beforehand.

A failing run writes diagnostics to `test-results/`: a screenshot of the page
as the run left it, and a Playwright trace carrying a screenshot and DOM
snapshot for every action. Replay the trace with:

```sh
npx playwright show-trace test-results/trace.zip
```

CI uploads the same folder as a downloadable artifact when a run goes red, so
a CI-only failure can be diagnosed without reproducing it locally.
### Screenshots and video

A plain `npm test` writes nothing. Pass a capture flag to have the run leave
behind a visual record — useful for seeing what the page actually looked like
when something failed, or for grabbing current screenshots of the interface:

```sh
npm test -- --screenshots        # one full-page screenshot per test group
npm test -- --video              # a recording of the whole run
npm test -- --capture            # both
npm run test:capture             # shorthand for --capture
```

Files land under `test-artifacts/` (git-ignored), as
`test-artifacts/screenshots/NN-group-name.png` and
`test-artifacts/video/run.webm`. Screenshots are taken as each group finishes,
so they show the state its interactions left the page in; a group with a
failing assertion is named `...-failed.png`, and a run that aborts gets a final
frame of wherever it stopped. Point the output somewhere else with
`--out-dir=some/dir`.

The same switches are readable from the environment — `MEETER_SCREENSHOTS`,
`MEETER_VIDEO`, `MEETER_CAPTURE` and `MEETER_OUT_DIR` — for CI or a shell
alias. Each directory is cleared at the start of a capturing run, so what you
find in it is always from the run that just happened.

## Contributing

Ideas and feedback are welcome while the shape of the project is still being
worked out — open an issue to start a discussion. Since there is no code yet,
conversations about scope and approach are more useful right now than pull
requests.

## License

Licensed under the [Apache License, Version 2.0](LICENSE). You may obtain a
copy of the license at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
