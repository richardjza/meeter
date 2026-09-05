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
| `app.js`, `app.css`, `index.html`, `ds/modernist.css`, the icon files | Nothing — just refresh |
| `docker/nginx.conf` | `docker compose restart` |
| `compose.yaml` | `docker compose up -d` (recreates the container) |
| Added a **new file** the page links to | `docker compose up -d` after adding a mount for it |

That last row is the one real gotcha. Each file is mounted individually, so a
brand-new file needs a line in `compose.yaml`'s `volumes:` before nginx can see
it. Editing existing files never needs anything.

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

## The published image

You do not have to build that image yourself. `.github/workflows/publish.yml`
builds the `Dockerfile` on every push to `main` and pushes the result to the
GitHub Container Registry, so the current state of `main` is always available
as a pull:

```powershell
docker run -d --name meeter-ghcr -p 8081:80 ghcr.io/richardjza/meeter:latest
```

| Tag | What it points at |
| --- | --- |
| `latest` | The most recent push to `main` |
| `sha-<commit>` | One specific commit, by its full 40-character SHA |

### Publish the port, or nothing answers

The `Dockerfile` ends with `EXPOSE 80`. That line is documentation — it records
which port the app listens on *inside* the container. It publishes nothing. The
`-p 8080:80` in the command above is what actually maps the container's port 80
onto <http://localhost:8080>.

This bites hardest in the Docker Desktop UI. Pressing **Run** on an image
starts the container with **no published port** unless you expand **Optional
settings** and fill in **Host port** first. The container then shows as running
and healthy, nginx really is serving inside it, and every address on your
machine is dead. Set **Host port** to `8080` in that dialog and it works.

Check which one you got with `docker ps` and read the `PORTS` column:

| `PORTS` column | Meaning |
| --- | --- |
| `0.0.0.0:8080->80/tcp` | Published — <http://localhost:8080> works |
| `80/tcp` | Not published — nothing can reach it |

A port mapping is fixed when the container is created, so an unpublished
container cannot be corrected in place. Remove it and start another:

```powershell
docker rm -f meeter-ghcr
docker run -d --name meeter-ghcr -p 8080:80 ghcr.io/richardjza/meeter:latest
```

Also worth knowing: this image carries the app **inside** it, so a container
from it has no bind mounts. That is the intended difference from the compose
setup above, not a misconfiguration — and it is why a code change needs a new
image rather than just a browser refresh.

Pin to a `sha-` tag when you want a fixed version; `latest` moves under you on
the next merge. `docker pull ghcr.io/richardjza/meeter:latest` fetches a newer
`latest` for an image you already have.

Pull requests run the same workflow, but they stop after building and
smoke-testing — only pushes to `main` publish. So a Dockerfile or nginx change
that breaks the image is caught on the pull request rather than in the
registry.

### Package visibility

The package is **public**: the first publish inherited the visibility of this
repository, so `docker pull` works with no login and no token. Verified against
the registry — an anonymous request for both `latest` and the `sha-` tag
returns the manifest the workflow pushed.

If a pull ever comes back `denied` or `not found` for someone without
credentials, the package has been made private. Change it back, as the
repository owner:

**Your profile → Packages → `meeter` → Package settings → Danger Zone →
Change visibility → Public.**

The same page has **Manage Actions access**, where the `meeter` repository
should keep `Write` — that is what lets the workflow push. It is granted
automatically for a package first published by that repository's own workflow.

### If the push step fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| `denied: permission_denied` on push | The workflow token cannot write packages | Check `permissions: packages: write` is still in the workflow, and that **Settings → Actions → General → Workflow permissions** is not set to read-only |
| `denied: installation not allowed to Create ... package` | The package exists but is no longer linked to this repository | Package settings → Manage Actions access → add `meeter` with `Write` |
| The build step is red but nothing was pushed | The smoke test found a missing file | Read the step log: it prints one status code per URL, then the container's nginx log |

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
| Container runs but nothing answers on any port | Started from the Docker Desktop **Run** button without a **Host port**, so no port is published | `docker ps` shows `80/tcp` and not `0.0.0.0:8080->80/tcp`. Recreate it with `-p 8080:80` — see [Publish the port](#publish-the-port-or-nothing-answers) |
| `docker: error during connect` | Docker Desktop is not running | Start it, wait for the whale to settle |
| `Bind for 0.0.0.0:8080 failed: port is already allocated` | Something else has 8080 | Change the port (above), or stop the other process |
| Page loads but is unstyled | `ds/modernist.css` did not mount | `docker compose down` then `up -d`; check the folder was cloned intact |
| `404 Not Found` | nginx is running but the file is not mounted | New file? Add it to `volumes:` in `compose.yaml` |
| Tab shows a blank or default icon | `favicon.ico` / `favicon.svg` did not mount | `docker compose up -d` to recreate with the current `compose.yaml` |
| Edits do not appear | Browser cache, or editing a different clone | `Ctrl+F5`; confirm the folder in `docker compose config` is the one you are editing |
| Fonts look wrong | The Archivo web font needs internet | Harmless — it falls back to your system font offline |
| Container keeps restarting | Bad `nginx.conf` | `docker compose logs` shows the parse error and line number |

## How this was verified

The `Dockerfile` is built and exercised on every push and pull request by
`.github/workflows/publish.yml`: the workflow starts a container from the image
it just built and requests each file `index.html` links to, failing the run on
anything that is not a `200`. So the image path is covered by CI.

The **compose** path is not. Docker was not available in the environment where
these files were written, and the bind-mount setup is specific to Docker
Desktop on Windows, so it has not been run end-to-end — check that first if
something misbehaves there.

What *was* verified locally: a document root containing exactly the files these
mounts expose (`index.html`, `app.css`, `app.js`, `ds/modernist.css`, plus the
`favicon.ico`, `favicon.svg` and `apple-touch-icon.png` that `index.html` links
from its `<head>`) serves a fully working app, with all 47 end-to-end tests
passing against it. So the mount list and the `Dockerfile` COPY list are
complete and correct — no missing asset, no broken relative path.
