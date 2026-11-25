# Learning Pulse

Pulse is a small product-analytics system you can read end to end: a browser SDK, an ingest API, Postgres, time-bucketed rollups, and a dashboard. This guide is the map. The exercises assume you can run the app (`npm run db:setup && npm run dev`).

## 1. The event path

A product event is a fact with a name, a time, an actor, and a few dimensions.

```text
browser / simulator
  → @pulse/sdk queues events and flushes a batch
  → POST /api/ingest
  → Zod checks the shape
  → token bucket charges one token per event
  → one INSERT … ON CONFLICT DO NOTHING
  → hourly and daily rollups increment for the inserted ids
```

The SDK lives in `packages/sdk/src/client.ts`. It keeps an anonymous id in local storage and a session id that expires after 30 idle minutes. `clientEventId` is the idempotency key: if a flush is retried, the unique `(project_id, client_event_id)` constraint drops the duplicate and the rollup only counts inserted rows.

Ingest validation is `packages/shared/src/events.ts`. Names are short identifiers. Properties are a flat map of scalars, at most 25 keys. Timestamps more than five minutes in the future or more than seven days in the past are clamped. That last rule is a product decision: it stops a bad client from rewriting history, and it also means a backfill must bypass ingest. The seed script does exactly that. It writes rows directly, then rebuilds rollups.

**Exercise.** Send a batch with a nested property (`{ plan: { tier: "pro" } }`) and with a duplicate `clientEventId`. Which status codes come back, and which table changes?

**Exercise.** In `TokenBucket` (`packages/shared/src/rate-limit.ts`), the capacity is 600 events and the refill is 10 per second. Write down how long a full bucket takes to recover after a 600-event burst. Then change the test in `rate-limit.test.ts` so a cost of 5 fails when only 4 tokens remain.

## 2. Identity

Every row has `anonymous_id`. `user_id` is optional and appears after `identify`. Funnels, retention, and “visitors” all group by `anonymous_id`.

Using `coalesce(user_id, anonymous_id)` looks tidy and is a classic bug. Events from before identify and events from after identify become two people, so the funnel drop-off is fiction. A production pipeline keeps an identity map (`anonymous_id → user_id`) and rewrites history or queries through that map. Pulse leaves the stitch explicit so the bug stays visible.

**Exercise.** Change `getFunnel` to group by `coalesce(user_id, anonymous_id)`. Seed a user who views a page, then identifies, then subscribes. Explain why step 1 and step 3 no longer share an actor.

## 3. Rollups

`events` is the source of truth. Three summary tables are maintained beside it:

| Table | Grain | What it can answer |
| --- | --- | --- |
| `rollup_hourly` | hour × event × device × channel | event volume |
| `rollup_page_daily` | day × path | top pages |
| `rollup_referrer_daily` | day × host | top referrers |

They are incremented in `packages/db/src/rollups.ts` from the ids `INSERT … RETURNING` actually wrote. The seed path deletes and rebuilds them with `INSERT … SELECT count(*)`. Both have to agree. `analytics.integration.test.ts` checks that the hourly sum equals the raw count.

Rollups are lossy on purpose.

- You can sum `event_count` across hours. You cannot sum unique visitors across hours, because the same person is in many buckets. The overview chart reads event counts from the rollup and visitors from `count(distinct anonymous_id)` on raw events. The caption in the UI says so.
- Country is not part of the hourly grain. Filtering by country falls back to raw events. Adding country to the primary key multiplies the number of rows by the number of countries, most of them empty. That tradeoff is the whole design.
- A daily page rollup cannot answer “views after 15:00”. Preset ranges that end “now” include a partial last day. The error is bounded by one bucket. At a billion events you either accept that, query raw for the open bucket and rollups for the closed ones, or store a finer grain.

Indexes on `events` are `(project_id, occurred_at)`, `(project_id, event_name, occurred_at)`, and `(project_id, anonymous_id, occurred_at)`. The first serves the time range. The second serves “only these funnel steps”. The third serves per-actor scans.

**Exercise.** In `psql`, run:

```sql
explain analyze
select date_trunc('day', occurred_at), count(*)
from events
where project_id = (select id from projects where slug = 'northstar')
  and occurred_at >= now() - interval '30 days'
group by 1;
```

Drop `events_project_time_idx`, run it again, then create the index. What changed in the plan? Put the index back before you forget.

**Exercise.** Add a `rollup_daily_actors (project_id, day, anonymous_id)` table with a primary key on those three columns. Rewrite the visitor series to `count(*)` from it. Why is this safe to sum across days only after you `count(distinct)` again at query time, or not safe at all?

## 4. Funnels

`computeFunnel` in `packages/shared/src/funnel.ts` is the spec. For each actor, walk their events in time order. A step counts only when that event name appears at or after the previous matched step. The same event cannot satisfy two steps. The SQL in `getFunnel` only fetches the candidate rows. The arithmetic stays in the tested function so a dashboard change cannot silently redefine conversion.

Two rates are on screen:

- from the first step: `users[i] / users[0]`
- from the previous step: `users[i] / users[i-1]`

The median between steps is the median of `(matched time − previous matched time)` over actors who reached both. It is not the median of every pair of events with those names.

**Exercise.** Require the next step within one hour. Add a `windowMs` argument, a test where a signup 2 hours later does not count, and a control where 30 minutes does. Which line in the pointer walk changes?

**Exercise.** The generator in `packages/db/src/generate.ts` builds personas (bounce, abandon, signup, activate, pay) so the funnel is monotonic by construction. Break that on purpose: emit `signup_completed` with no earlier `page_view`. Which test fails, and is the funnel function wrong or the data?

## 5. Retention

A cohort is the period of an actor’s first event. Period `n` retention is the share of that cohort with any event in the period `n` steps later. Week boundaries are Mondays at 00:00 UTC, which is what `date_trunc('week', …)` returns when the session `TimeZone` is UTC. The app sets that on the connection. If you forget, Postgres truncates in the server time zone and the heatmap shifts a day for anyone not in UTC.

`buildRetention` (`packages/shared/src/retention.ts`) returns `null` for periods that have not started and `partial: true` for the period that contains “now”. The grid prints a star on partial cells. Showing them as zero would claim people failed to return in a week that is not over.

The date picker chooses which cohorts to display, not which activity to delete. A visitor who starts in the range and comes back after the range still counts. The page says this. Segment filters are different: they apply before the first-event calculation, so “mobile retention” means “first mobile event”, not “people who are mobile and whose real first event was on desktop”.

**Exercise.** Cohort by `signup_completed` instead of the first event of any kind. How does week-0 size change, and what happens to people who bounce?

**Exercise.** Switch the 30-day view from weeks to days (`retentionGrain` in `packages/shared/src/time.ts`). How many columns do you need before the table is unreadable, and what would you sample?

## 6. Time and time zones

Buckets are UTC. `fillBuckets` inserts the zero hours and zero days a `GROUP BY` would otherwise omit, so the chart does not draw a line across a quiet Sunday and pretend it was busy. `floorUtc` must match `date_trunc` in a UTC session. The unit tests pin that for a known timestamp.

**Exercise.** Format a daily bucket in `America/Los_Angeles` instead of UTC and watch 25 November become 24 November for the early hours. Put the zone back. The product decision belongs in the axis label, not in a silent local conversion.

## 7. The dashboard as a query planner

`getOverview`, `getAcquisition`, and the chart caption are the planner:

- no country filter → event totals from `rollup_hourly`, visitors from raw
- country filter → both from raw
- any device, country, or channel filter on pages and referrers → raw, because those daily rollups have no such columns

That is more honest than summing a rollup that does not contain the predicate. It is also why the settings page shows rollup row counts: you should be able to see that the write path is alive even when a particular chart bypassed it.

**Exercise.** Pick a filter combination and name the table each widget reads. Then add `country` to `rollup_hourly` and delete the raw fallback. What does the seed’s `ANALYZE` output suggest about table size, and which query got simpler?

## 8. Seeing it

Charts are Recharts, with a visually hidden table of the same series so the numbers exist without the picture. The retention grid uses `color-mix` against the accent so light and dark stay on the same scale. Partial cells and empty future cells are different; zero and “not yet” are different. Those are the data-viz decisions worth arguing about.

**Exercise.** The Product Hunt spike is day index `floor(days * 0.62)` in the generator, forced onto the `producthunt` channel. Mark that day on the area chart with a reference line. Read the rollup for that hour range and check the channel mix matches the story.

**Exercise.** Turn on `prefers-reduced-motion` in the browser. The live dot and the row animation should stop. If a new animation does not, the rule in `apps/web/src/app/globals.css` was bypassed.

## 9. What you would replace

At this volume Postgres is the right warehouse. The shape of the system does not change when the volume does:

- The SDK, the validation, and the idempotency key stay.
- Rollups become a streaming job, or a ClickHouse `SummingMergeTree` partitioned by day, ordered by `(project_id, event_name, bucket)`.
- Unique visitors become `uniq` / HyperLogLog sketches instead of `count(distinct)`, because sketches merge and exact sets do not.
- The funnel walk becomes a window function over ordered events, still checked against `computeFunnel` on a fixture.
- The in-process token bucket becomes Redis. The math in `TokenBucket` does not change.

**Exercise.** Sketch the ClickHouse table for `events` and the query for the overview series. Which index in Postgres does the `ORDER BY` replace? Which Pulse query gets shorter, and which one (the ordered funnel) stays hard?

## 10. A short reading order

1. `packages/shared/src/events.ts` and `funnel.ts` and `retention.ts` — the rules, with tests.
2. `packages/sdk/src/client.ts` — batching, identity, retry.
3. `packages/db/migrations/001_init.sql` and `packages/db/src/rollups.ts` — storage and the write path.
4. `packages/db/src/queries.ts` — what the dashboard actually asks.
5. `packages/db/src/generate.ts` — why the demo funnel and the demo heatmap look like a product instead of noise.
6. `apps/web/src/server/router.ts` and `apps/web/src/app/api/ingest/route.ts` — the typed read API and the untyped write API, and why they are different.
