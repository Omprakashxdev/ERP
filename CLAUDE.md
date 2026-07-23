# SAEC ERP — Project Guide

@AGENTS.md

## Project overview

Secure, AI-powered ERP for SAEC built with Next.js 16 App Router, React 19, TypeScript, Prisma, PostgreSQL, NextAuth.js v5, Tailwind CSS v4, shadcn/ui, and Tremor.

Phase 1 modules:

1. SAEC Fund Flow (project financial tracking)
2. Due Bills Status (consultancy billing lifecycle)

## Architecture rules

- **Zero Trust:** every server action, API route, and page enforces authentication and RBAC.
- **RBAC roles:** `ADMIN`, `MANAGER`, `STAFF`, `AUDITOR`.
- **Validation:** every external input is parsed with Zod before touching the database.
- **AI guardrails:** never pass raw ERP data to an LLM without PII scrubbing; keep system prompts separate from user input; vector queries respect RBAC.
- **Secrets:** API keys and DB credentials live in `.env` only; never expose them to the client.
- **Sessions:** HTTP-only cookies via NextAuth.js JWT strategy.

## Conventions

- Use `@/` path alias for imports from `src/`.
- Server actions live in `src/lib/actions/`.
- Shared utilities live in `src/lib/`.
- UI components live in `src/components/ui/`.
- Feature components live in `src/components/`.
- Role and permission checks use `src/lib/authz.ts`.
- Audit logging uses `src/lib/audit.ts`.

## Styling

- Background: `bg-zinc-50`.
- Cards: `bg-white` with `shadow-sm` and `border-zinc-200`.
- Font: Inter (`font-sans`).
- Badges: low-saturation colors for status.
- Tables: compact, sticky headers, right-aligned numbers.
- Use shadcn/ui components from `src/components/ui/`.

## Module data references

- Fund Flow fields: `docs/saec fund flow - Format.xlsx`.
- Due Bills / Bill Status fields: `docs/Due Bills Status - Format.xlsx`.
- All module workflows: `docs/ERP - Work Flow Formats.xlsx`.
- Reports roadmap: `docs/ERP - Road Map Reports.pdf`.
- Priced feature specification: `docs/ERP System Feature Specification V2.pdf`.
