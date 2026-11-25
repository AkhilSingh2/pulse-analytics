import { z } from 'zod';
import {
  RATE_LIMIT,
  SAVED_VIEW_PATHS,
  funnelQuerySchema,
  presetSteps,
  rangeQuerySchema,
  segmentSchema,
} from '@pulse/shared';
import {
  createView,
  deleteView,
  getAcquisition,
  getFunnel,
  getOverview,
  getRetention,
  getSql,
  listEvents,
  listViews,
  pipelineStats,
  recentEvents,
} from '@pulse/db';
import { publicProcedure, read, requireProject, router } from './trpc';

export const appRouter = router({
  overview: publicProcedure.input(rangeQuerySchema).query(({ input }) =>
    read(async () => {
      const project = await requireProject();
      return getOverview(getSql(), project.id, input);
    }),
  ),
  funnel: publicProcedure.input(funnelQuerySchema).query(({ input }) =>
    read(async () => {
      const project = await requireProject();
      const steps = input.steps?.length ? input.steps : presetSteps('acquisition');
      return getFunnel(getSql(), project.id, input, steps);
    }),
  ),
  retention: publicProcedure.input(rangeQuerySchema).query(({ input }) =>
    read(async () => {
      const project = await requireProject();
      return getRetention(getSql(), project.id, input);
    }),
  ),
  acquisition: publicProcedure.input(rangeQuerySchema).query(({ input }) =>
    read(async () => {
      const project = await requireProject();
      return getAcquisition(getSql(), project.id, input);
    }),
  ),
  events: publicProcedure.input(rangeQuerySchema.extend({ search: z.string().max(40).optional() })).query(({ input }) =>
    read(async () => {
      const project = await requireProject();
      const events = await listEvents(getSql(), project.id, input, { limit: 80, search: input.search });
      return { events };
    }),
  ),
  stream: publicProcedure.input(segmentSchema).query(({ input }) =>
    read(async () => {
      const project = await requireProject();
      const events = await recentEvents(getSql(), project.id, input, 36);
      return { events, serverTime: new Date().toISOString() };
    }),
  ),
  views: router({
    list: publicProcedure.query(() =>
      read(async () => {
        const project = await requireProject();
        return listViews(getSql(), project.id);
      }),
    ),
    create: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(60),
          path: z.enum(SAVED_VIEW_PATHS),
          query: z.string().max(500),
        }),
      )
      .mutation(({ input }) =>
        read(async () => {
          const project = await requireProject();
          return createView(getSql(), project.id, input);
        }),
      ),
    delete: publicProcedure.input(z.object({ id: z.uuid() })).mutation(({ input }) =>
      read(async () => {
        const project = await requireProject();
        const removed = await deleteView(getSql(), project.id, input.id);
        return { removed };
      }),
    ),
  }),
  settings: publicProcedure.query(() =>
    read(async () => {
      const project = await requireProject();
      const stats = await pipelineStats(getSql(), project.id);
      return { project, stats, rateLimit: RATE_LIMIT, ingestPath: '/api/ingest' };
    }),
  ),
});

export type AppRouter = typeof appRouter;
