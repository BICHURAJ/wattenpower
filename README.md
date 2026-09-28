# Watten Power Ltd — Sales CRM & Job Management Platform

A working web app prototype of the platform in the workflow diagram: a browser
front end talking to an Express REST API backed by MongoDB.

```
client/          React + Vite web app (the browser UI)
server/          Express REST API + Mongoose models
  src/models/    MongoDB collections
  src/routes/    API endpoints
  src/seed.js    Demo data matching the sample screens
```

## Running it

You need Node.js and a MongoDB server running locally.

```bash
npm run install:all     # install root, server and client dependencies
npm run seed            # load the demo data (safe to re-run; it resets everything)
npm run dev             # start both the API and the web app
```

- Web app: **http://localhost:5273**
- API: **http://localhost:4000/api**

`npm run seed` creates demo accounts (`david@` admin, `sarah@` sales, `mike@`
engineer, `fiona@` finance, all `@wattenpower.co.uk`) and prints their password
once at the end. It's random each run; set `SEED_PASSWORD` in `server/.env` to
choose one. The seed refuses to run when `NODE_ENV=production`.

On a fresh database with no seed, the first account created at `/signup`
becomes the admin.

Settings live in `server/.env` (git-ignored). Copy `server/.env.example` to
`server/.env`, then set `JWT_SECRET` to a random value of your own:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```
MONGODB_URI=mongodb://127.0.0.1:27017/watten_power
PORT=4000
JWT_SECRET=<paste the generated value>
CORS_ALLOWED_ORIGINS=http://localhost:5273
```

The API refuses to start if `JWT_SECRET` is missing, shorter than 32 bytes, or
a placeholder such as `dev-secret`. Run the server tests with `npm --prefix server test`.

> The web app runs on port **5273** rather than Vite's default 5173, because
> another project on this machine already uses that origin and its cached
> service worker will serve the wrong app.

## Run with Docker

Two containers from one `docker-compose.yml`:

- **web** — nginx serving the built React app on **http://localhost:8080**, and
  forwarding `/api` (including the live message stream) to the API.
- **api** — the Express server. It is not published on its own port; only
  `web` talks to it.

MongoDB is **not** in Docker: the API connects to your existing database.

```bash
cp docker.env.example docker.env   # then fill in JWT_SECRET (and MONGODB_URI if needed)
docker compose up -d --build       # build and start both containers
docker compose ps                  # api should say "healthy"
docker compose logs -f api         # look for "[db] connected to ..."
docker compose down                # stop and remove the containers (data stays in MongoDB)
```

`docker.env` holds secrets and is git-ignored. `docker.env.example` shows every
setting. `NODE_ENV=production`, `PORT` and `TRUST_PROXY=1` (so the API sees
visitors' real IPs behind nginx) are set in `docker-compose.yml`.

**Reaching MongoDB on this machine:** `MONGODB_URI` uses
`mongodb://host.docker.internal:27017/...`, which is this computer as seen from
a container. With Docker Desktop that works out of the box. On a Linux server,
MongoDB must also listen on the Docker bridge address (`net.bindIp` in
`mongod.conf`) — or use a hosted database such as MongoDB Atlas.

**Mock data:** `docker compose run --rm -e NODE_ENV=development api node src/seedMock.js`
(adds the 50 mock installations; `--clear` removes them). The full `seed.js`
wipes the database, so it refuses to run in production mode.

## Deploying

Set these environment variables on the server. Never reuse the development
values, and give each environment (staging, production) its own secret.

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | yes | `production` -- turns on the strict checks below. |
| `JWT_SECRET` | yes | At least 32 bytes of random data (see the command above). Changing it signs everyone out. |
| `CORS_ALLOWED_ORIGINS` | yes in production | Comma-separated exact origins that may call the API from a browser, e.g. `https://app.wattenpower.co.uk`. No `*`, no paths or trailing slashes. |
| `MONGODB_URI` | yes | The production database. |
| `PORT` | no | Defaults to 4000. |

The API checks `JWT_SECRET` and `CORS_ALLOWED_ORIGINS` before connecting to the
database and exits with a clear message if either is wrong. Login tokens are
HS256-signed, expire after 7 days, and tokens using any other algorithm
(including `none`) are rejected.

## The screens

Every screen from the sample design is built and wired to the database.

| # | Screen | Route |
|---|--------|-------|
| 1 | Login / Sign In | `/login` |
| 2 | Dashboard (Overview) | `/` |
| 3 | Clients | `/clients` |
| 4 | Client Details | `/clients/:id` |
| 5 | Website Lead Capture | `/lead-capture` (public) and `/leads` (staff) |
| 6 | Quotation List | `/quotations` |
| 7 | Create Quotation | `/quotations/new` |
| 8 | Quotation Details | `/quotations/:id` |
| 9 | Installations List | `/installations` |
| 10 | Installation Details | `/installations/:id` |
| 11 | Installation Certification | `/installations/:id/certification` |
| 12 | Post-Install Support / Warranty | `/support` |
| 13 | OLEV Grant Submission | `/grants` and `/grants/:id` |
| 14 | Compliance Hub | `/compliance` |
| 15 | Stock & Inventory | `/stock` |
| 16 | Vans & Tools Management | `/vans` |

Plus `/engineers`, `/documents`, `/reports` and `/settings` from the sidebar.

## How the workflow is enforced in code

The diagram is not just decoration — the arrows between boxes are real actions:

- **Website form → CRM.** `/lead-capture` posts to a public endpoint, so a
  prospective customer can submit without an account. Staff then convert the
  enquiry into a client record with one click.
- **Quote accepted → job created.** Accepting a quotation automatically creates
  the installation, links it back to the quote, and ticks off "survey completed"
  and "quotation accepted" on the progress panel. This is the hand-off from the
  sales side of the diagram to the technical side.
- **DNO notification.** A one-click action on the installation's Compliance tab,
  recording that the local electricity network operator was told.
- **Certification closes the job.** Saving the electrical certificate as complete
  sets the installation to Completed and ticks testing and handover.
- **Grant claims are guarded.** A claim will not submit without customer consent,
  the invoice, proof of payment and the EIC certificate — the API rejects it and
  says exactly what is missing, because an incomplete claim gets refused.
- **Compliance status is derived, never typed.** Certificates and calibrations
  are labelled Valid / Expiring Soon / Expired from their expiry date, so the
  Compliance Hub can never show a stale label.

## API reference

All endpoints are under `/api` and need a bearer token except where noted.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/login` | Sign in, returns a token (no auth) |
| GET | `/auth/me` | Current user |
| POST | `/public/leads` | Website enquiry (no auth) |
| GET | `/dashboard` | Stat tiles, recent activity, upcoming installs |
| GET | `/dashboard/reports` | Aggregates for the reports page |
| GET/POST/PUT/DELETE | `/clients`, `/leads`, `/quotations`, `/installations`, `/tickets`, `/grants`, `/engineers`, `/compliance`, `/documents`, `/stock`, `/vans`, `/tools` | Standard record handling |
| GET | `/clients/:id/summary` | A client's quotes, jobs and tickets |
| POST | `/leads/:id/convert` | Turn an enquiry into a client |
| POST | `/quotations/:id/send`, `/accept`, `/decline` | Move a quote along |
| POST | `/installations/:id/dno-notify` | Record the DNO notification |
| GET/POST | `/installations/:id/certification` | The electrical certificate |
| POST | `/grants/:id/submit` | Submit the OLEV claim |

Every list endpoint supports `?q=` search, status filters, and `?page=&limit=`.

## Prototype limits

Worth knowing before this goes any further:

- **File uploads are recorded, not stored.** The certificate and grant screens
  capture the filename only. Real storage needs S3 or similar.
- **No PDF generation yet.** The quotation Documents tab is a placeholder.
- **Roles are stored but not enforced.** Every signed-in user can currently do
  everything; the `role` field is ready for permission rules to be added.
- **Passwords are hashed, but there is no reset flow.**
