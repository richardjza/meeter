# Running Meeter locally with Docker Desktop on Windows

A step-by-step setup, ending with an edit loop where deploying a code change
means saving the file and pressing refresh.

## What you are setting up, in one paragraph

Meeter is static files — HTML, CSS and JavaScript, with no server-side code and
no build step. So the container does not contain the app: it runs **nginx**, and
your project folder is mounted into it. nginx serves whatever is in that folder
*right now*. Change `app.js` on your laptop and the container is already serving
the new version. There is nothing to rebuild, restart, or redeploy.

That is the whole trick, and it is why the edit loop below is one step.

## Before you start

| You need | How to check |
| --- | --- |
| Docker Desktop, running | The whale icon in the system tray is steady, not animating. `docker version` prints a **Server** section. |
| Git for Windows | `git --version` prints a version. |
| A free port 8080 | `netstat -ano \| findstr :8080` prints nothing. |

Docker Desktop's default WSL 2 backend shares your drives automatically. Only if
you have deliberately switched to the Hyper-V backend do you need to add the
drive under **Settings → Resources → File sharing**.

Commands below are PowerShell. Run them from the project folder unless noted.

---

## Step 1 — Get the code

```powershell
cd $HOME
git clone https://github.com/richardjza/meeter.git
cd meeter
```

Already cloned? Just `cd` into it and `git pull`.

## Step 2 — Start it

```powershell
docker compose up -d
```

First run pulls the `nginx:stable-alpine` image — a few seconds, once. `-d`
detaches, so the container keeps running after you close the terminal.

Confirm it is up:

```powershell
docker compose ps
```

`STATUS` should read `Up`.

## Step 3 — Open it

<http://localhost:8080>

You should get the planner, seeded with three participants in your own time
zone plus Bengaluru and Tokyo.

## Step 4 — The edit loop

This is the part you asked for, and it is genuinely this short:

1. Edit `app.js`, `app.css`, `index.html` or `ds/modernist.css` in your editor.
2. Save.
3. Refresh the browser.

No rebuild. No `docker compose restart`. No image to push. The container reads
the file from your folder every time the browser asks for it, and the nginx
config sends `Cache-Control: no-store`, so a refresh always fetches the current
bytes rather than a cached copy.

If you ever suspect the browser is being clever anyway, `Ctrl+F5` forces a hard
reload.

### When you *do* need to restart

Only when you change how the container itself is configured:

| You changed | What to run |
| --- | --- |
| `app.js`, `app.css`, `index.html`, `ds/modernist.css` | Nothing — just refresh |
| `docker/nginx.conf` | `docker compose restart` |
| `compose.yaml` | `docker compose up -d` (recreates the container) |
| Added a **new file** the page links to | `docker compose up -d` after adding a mount for it |
| Replaced a mounted file wholesale — a re-rendered `favicon.ico`, say | `docker compose up -d` — a single-file mount follows the file it started with, not a new one written in its place |

Those last two rows are the real gotcha, and both come from the same thing: each
file is mounted individually. A brand-new file needs a line in `compose.yaml`'s
`volumes:` before nginx can see it, and a file *replaced* rather than edited in
place — how a regenerated icon usually arrives — leaves the container serving the
one it started with. Editing existing files never needs anything.

## Everyday commands

| Goal | Command |
| --- | --- |
| Start | `docker compose up -d` |
| Stop and remove the container | `docker compose down` |
| Stop without removing | `docker compose stop` |
| Restart | `docker compose restart` |
| Is it running? | `docker compose ps` |
| Watch the access log | `docker compose logs -f` |
| Shell inside the container | `docker compose exec meeter sh` |

The container is set to `restart: unless-stopped`, so it comes back by itself
when Docker Desktop starts with Windows. Run `docker compose down` when you want
it to stay gone.

## Changing the port

Port 8080 already taken? Edit `compose.yaml`:

```yaml
    ports:
      - "9090:80"     # host:container — change only the number on the left
```

Then `docker compose up -d` and use <http://localhost:9090>.

## Optional — a standalone image

The bind-mount setup needs the source folder present. If you want an image that
carries the app inside it — to run on another machine, or to keep a fixed
snapshot — use the `Dockerfile`:

```powershell
docker build -t meeter:local .
docker run -d --name meeter-image -p 8081:80 meeter:local
```

This is the opposite trade: self-contained, but **every code change needs a
rebuild** (`docker build` again, then recreate the container). Use `compose` for
development and the image only when you need portability.

## Optional — open it from your phone

On the same Wi-Fi, find your laptop's IP:

```powershell
ipconfig | findstr IPv4
```

Then browse to `http://<that-address>:8080`. Windows Firewall may prompt the
first time — allow it on private networks only. Nothing here is authenticated,
so keep it to networks you trust.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `docker: error during connect` | Docker Desktop is not running | Start it, wait for the whale to settle |
| `Bind for 0.0.0.0:8080 failed: port is already allocated` | Something else has 8080 | Change the port (above), or stop the other process |
| Page loads but is unstyled | `ds/modernist.css` did not mount | `docker compose down` then `up -d`; check the folder was cloned intact |
| `404 Not Found` | nginx is running but the file is not mounted | New file? Add it to `volumes:` in `compose.yaml` |
| Tab icon missing, `404` for `favicon.ico` | The icon files are not mounted, or were replaced since the container started | `docker compose up -d`; `docker compose exec meeter ls /usr/share/nginx/html` shows what nginx can actually see |
| Edits do not appear | Browser cache, or editing a different clone | `Ctrl+F5`; confirm the folder in `docker compose config` is the one you are editing |
| Fonts look wrong | The Archivo web font needs internet | Harmless — it falls back to your system font offline |
| Container keeps restarting | Bad `nginx.conf` | `docker compose logs` shows the parse error and line number |

## How this was verified

Docker was not available in the environment where these files were written, so
the image has **not** been built and run end-to-end — check that first if
something misbehaves.

What *was* verified: a document root containing exactly the files these mounts
expose — `index.html`, `app.css`, `app.js`, `favicon.svg`, `favicon.ico`,
`apple-touch-icon.png` and `ds/modernist.css` — serves a fully working app, with
the whole end-to-end suite passing against it and every icon fetched by the page
answering 200. So the mount list and the `Dockerfile` COPY list are complete and
correct — no missing asset, no broken relative path.
