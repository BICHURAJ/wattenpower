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

Sign in with **david@wattenpower.co.uk** / **password123**.
(Also `sarah@` for a sales role and `mike@` for an engineer role, same password.)

Connection settings live in `server/.env`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/watten_power
PORT=4000
JWT_SECRET=change-me-in-production
```

> The web app runs on port **5273** rather than Vite's default 5173, because
> another project on this machine already uses that origin and its cached
> service worker will serve the wrong app.

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
