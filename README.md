# Roping Systems

Organization-based membership and event operations for calf roping producers. The application is built with Next.js, Tailwind CSS, and Supabase for deployment on Vercel.

## Current foundation

- Organization-aware administrative shell
- Member directory and membership statuses
- Roping schedule and event statuses
- Live event desk with time and penalty entry
- Organization-defined divisions and fee schedules
- Public schedule and live unofficial results page
- Versioned Supabase schema with row-level security

The interface currently uses representative data while authentication and data access are connected in the next milestone.

## Local setup

Node.js 22 or newer is required.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Add the Supabase project URL and publishable key to `.env.local`. The admin application is available at `/dashboard`; an example public organization page is available at `/public/red-river-calf-ropers`.

## Database workflow

Database changes are stored in chronological order under `supabase/migrations`. The migrations are designed to be deployed by the Supabase GitHub integration.

1. Create a branch for schema work.
2. Add a new migration instead of editing a migration already deployed to production.
3. Open a pull request and review both application and schema changes.
4. Merge through GitHub so the connected Supabase workflow applies the migration.

The initial schema keeps global person/contact records separate from organization memberships. This allows one login to belong to multiple organizations with a different member number and classification in each.

## Useful commands

```bash
npm run dev
npm run lint
npm run build
```

## Project structure

```text
src/app/                 Next.js routes and layouts
src/components/          Shared interface and workflow components
src/data/                Temporary representative data
src/lib/supabase/        Browser and server Supabase clients
src/types/               Domain types
supabase/migrations/     Versioned database changes
```
