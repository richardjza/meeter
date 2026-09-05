# A self-contained image: the app is copied in, so the container runs without
# the source tree. Rebuild after each change.
#
# For day-to-day work prefer `docker compose up -d`, which bind-mounts the
# source and needs no rebuild at all. See docs/DOCKER.md.

FROM nginx:stable-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.css app.js favicon.svg favicon.ico apple-touch-icon.png /usr/share/nginx/html/
COPY ds/ /usr/share/nginx/html/ds/

EXPOSE 80
