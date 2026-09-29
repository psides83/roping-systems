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
- Email/password authentication and confirmation callback
- Multi-organization onboarding and switching
- Database-backed member and organization management
- Transactional roping creation from reusable division and fee templates
- In-person member and guest entry workflows with repeat-entry rules
- Public online entry requests with membership checks, repeat-entry quantities, and staff approval
- Draw generation, run timing, penalties, and result finalization
- Round-by-round draw generation with producer-controlled ordering
- Entry-count comeback schedules and aggregate-seeded short rounds
- Live public schedules and unofficial/official results
- Organization logo uploads for branded public schedules and results
- Organization color palettes shared across the workspace and public pages
- Tenant integrity constraints, role permissions, and audit history
- Classification-based incentive deductions applied automatically to live and public results
- Event-specific round counts with individual and apply-to-all controls
- Searchable contestant check-in ledger with fee breakdowns and cash payment status management

When Supabase variables are absent, the interface runs in a clearly labeled preview mode with representative data. Adding valid project variables enables authentication and the complete database-backed workflows.

## Local setup

Node.js 22 or newer is required.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Add the Supabase project URL, publishable key, and local site URL to `.env.local`. The admin application is available at `/dashboard`; an example public organization page is available at `/public/red-river-calf-ropers`.

## Supabase and Vercel setup

The repository includes Supabase CLI configuration and chronological migrations. For the intended hosted setup:

1. Push this repository to GitHub and import it into Vercel.
2. In the Vercel project, open **Integrations**, install the Supabase integration, and connect the existing Supabase project. This synchronizes the project URL and publishable key into Vercel.
3. Add `NEXT_PUBLIC_SITE_URL` manually in Vercel for Production, using the final `https://...` application URL. Redeploy after changing environment variables.
4. In Supabase Authentication URL Configuration, set the production Site URL and allow `http://localhost:3000/**`, the production domain, and the Vercel preview-domain pattern.
5. Connect the same GitHub repository in Supabase and enable its branching/deployment workflow so migrations under `supabase/migrations` are applied through the repository.
6. Pull Vercel's Development variables into `.env.local`, then create the first account and organization.

Never expose `SUPABASE_SECRET_KEY` or any database password through a variable whose name begins with `NEXT_PUBLIC_`.

## Database workflow

Database changes are stored in chronological order under `supabase/migrations`. The migrations are designed to be deployed by the Supabase GitHub integration.

1. Create a branch for schema work.
2. Add a new migration instead of editing a migration already deployed to production.
3. Open a pull request and review both application and schema changes.
4. Merge through GitHub so the connected Supabase workflow applies the migration.

The initial schema keeps global person/contact records separate from organization memberships. This allows one login to belong to multiple organizations with a different member number and classification in each.

Apply all migrations before enabling live sign-ups. In Supabase Authentication settings, allow these URL patterns:

```text
http://localhost:3000/**
https://your-vercel-domain.com/**
https://*-your-vercel-team.vercel.app/**
```

## Useful commands

```bash
npm run dev
npm run lint
npm run build
npx supabase db lint
```

## Project structure

```text
src/app/                 Next.js routes and layouts
src/components/          Shared interface and workflow components
src/data/                Temporary representative data
src/lib/supabase/        Browser and server Supabase clients
src/types/               Domain types
supabase/migrations/     Versioned database changes
supabase/config.toml     Local and hosted Supabase project configuration
```
