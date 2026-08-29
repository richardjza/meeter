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

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Page shell — the static structure and its stable element IDs |
| `app.js` | State, time zone maths, view model and rendering |
| `app.css` | Layout and component styling |
| `ds/modernist.css` | Vendored Modernist design system: tokens and base classes |

The interface is an implementation of the "Meeting planner across time zones"
design canvas; `ds/modernist.css` is the design system that canvas was built
against, vendored here so the app carries its own styling.

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
