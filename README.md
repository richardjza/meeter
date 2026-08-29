# Meeter

A simple, lightweight way to plan meetings across timezones.

Finding a time that works for people in San Francisco, Berlin, and Singapore
usually means a spreadsheet, some mental arithmetic, and at least one person
joining at 4am. Meeter exists to make that a ten-second job instead.

## Status

Early days — this repository is currently just this README. The sections below
describe what Meeter is meant to be, not what it does today. Treat anything
under "Planned features" as intent rather than documentation, and expect the
details to shift as the first version comes together.

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

## Planned features

- Add participants by city or timezone.
- A visual overlap view showing each participant's local hours side by side.
- Sensible working-hour defaults, adjustable per person.
- Highlighting of slots where a participant crosses into a different calendar
  day.
- A shareable summary of a chosen time, rendered in each participant's local
  time.

## Getting started

There is nothing to install or run yet. Once there is a first working version,
setup and usage instructions will live here.

## Contributing

Ideas and feedback are welcome while the shape of the project is still being
worked out — open an issue to start a discussion. Since there is no code yet,
conversations about scope and approach are more useful right now than pull
requests.

## License

Not yet chosen. Until a license is added, standard copyright applies and no
usage rights are granted.
