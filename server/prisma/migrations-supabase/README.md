# Archived: the Supabase migration chain

**Do not run anything in this directory.** It is a historical record only.

The live migration path is [`../migrations`](../migrations), which contains a
single baseline. Prisma reads `../migrations` (configured in
`prisma.config.ts`) and does not look here, so nothing in this directory can be
applied by accident through a normal `migrate dev` or `migrate deploy`.

## Why it is archived rather than migrated

The chain was written against a Supabase project and cannot run on AWS RDS
PostgreSQL. Its dependencies are not stylistic — they are objects Supabase owns
that do not exist anywhere else:

| Dependency | Where | Why RDS cannot run it |
| --- | --- | --- |
| `FK profiles.id → auth.users(id)` | `20260821120000`, renamed `20260822090000` | The `auth` schema belongs to Supabase. |
| `TRIGGER on_auth_user_created ON auth.users` + `handle_new_auth_user()` | `20260822090000` | Triggers the identity provider's own table. |
| 19 `CREATE POLICY ... TO authenticated` + 12 `ENABLE ROW LEVEL SECURITY` | six migrations | `authenticated` is a Supabase-provisioned role. |
| 6 `GRANT`/`REVOKE` on that role's column privileges | two migrations | Same. |
| 3 `INSERT INTO storage.buckets` | three migrations | Supabase Storage's bucket catalogue. Storage is now plain S3. |

Prisma cannot even introspect the result: with the foreign key present,
`prisma migrate diff` fails with `P4002` — *"Cross schema references are only
allowed when the target schema is listed in the schemas property of your
datasource"* — because `public.profiles` points at `auth.users`. So this chain is
not a starting point for a plain Postgres instance under Prisma; it has to be
replaced rather than repaired.

## What the chain still got right

Two things in here are not recoverable from `schema.prisma` and were carried
into the baseline by hand:

- **The services and skills catalogue** (10 services, 79 skills), including the
  slug corrections made by `20260831002000_fix_electrician_skills`. Prisma has
  no knowledge of these rows, so a squash drops them silently and the app
  starts with no services to offer.
- **The `skills (service_id, slug)` composite unique constraint**, which keeps
  skill slugs unique within a service.

## A defect worth knowing about

`20260830100000_customer_jobs` has never been applied in full. This statement is
a syntax error:

```sql
CREATE POLICY "jobs_insert_own" ON "jobs"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "customer_profiles" c
      WHERE c."id" = "jobs"."customer_id" AND c."user_id" = (SELECT auth.uid())
    )
  ) AND "status" = 'REQUESTED' AND "base_pay_paise" >= 0;
```

The closing parenthesis on the second-to-last line closes `WITH CHECK`, leaving
`AND "status" = ...` outside the policy grammar, so Postgres reports
`syntax error at or near "AND"`. This is a parenthesisation mistake, not a
newline problem — the same expression with the `AND` inside the `WITH CHECK`
parens parses fine.

That means the policy does not exist on the Supabase database either. Nothing
broke, because the mobile apps never query Supabase: they use `supabase.auth`
only, and every domain query goes through this API, which authorizes every
request itself. With `jobs_insert_own` missing, RLS default-denies `INSERT` on
`jobs` for the `authenticated` role — which nothing was using.

The files here are left byte-for-byte as they were applied, rather than corrected,
so this directory stays an honest record. It is also a reminder of why the chain
deserved squashing: the migrations and the database they were meant to produce
had drifted apart, and a chain nobody can replay is not much of an audit trail.

## What the baseline dropped on purpose

Everything structural in this chain that `schema.prisma` does not describe — the
RLS policies, the grants, the auth trigger, the bucket seeds and the auth
foreign key. `schema.prisma` is the source of truth for structure, and it never
declared any of those, so none of them were ever reflected in the datamodel.

Nothing structural is lost by the squash. Every table, column, enum, foreign
key and index the chain produced is reproduced by the baseline, which was
verified by diffing the two databases with the Supabase objects removed.

Two cosmetic differences remain, both documented in the baseline's header: the
`profiles.isActive` index is renamed to Prisma's derived spelling, and primary
keys lose the database-level `DEFAULT gen_random_uuid()` that the datamodel never
asked for.