# Security Policy

## What Meeter is

Meeter is a static, client-side page: `index.html`, `app.css`, `app.js`, and a
vendored stylesheet. It has no backend, makes no network requests of its own,
stores nothing, and sends nothing anywhere. Everything you type stays in the
tab until you close it. The only third-party resource it loads is a web font
from Google Fonts.

That shape limits what a vulnerability here can be: cross-site scripting
through participant names or another rendered field, a flaw in the pinned
GitHub Actions workflow, or a problem in the Docker/nginx configuration.

## Reporting a vulnerability

Please report privately rather than opening a public issue.

Use GitHub's private vulnerability reporting on this repository:
**Security → Report a vulnerability**
(<https://github.com/richardjza/meeter/security/advisories/new>). It opens a
private thread visible only to you and the maintainer.

Include what you need to make the problem reproducible: the affected file, the
input that triggers it, and what you expected to happen instead.

This is a personal project maintained in spare time, so there is no guaranteed
response time. Expect an acknowledgement within a couple of weeks, and a fix on
`main` once the report is confirmed.

## Supported versions

Only the current `main` branch is supported. There are no released versions to
back-port fixes to.
