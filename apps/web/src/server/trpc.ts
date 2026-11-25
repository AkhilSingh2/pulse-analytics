import { initTRPC, TRPCError } from '@trpc/server';
import { getProject, getSql } from '@pulse/db';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

export async function requireProject() {
  try {
    const project = await getProject(getSql());
    if (!project) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No project yet. Run npm run db:setup.',
      });
    }
    return project;
  } catch (error) {
    throw asTrpcError(error);
  }
}

export async function read<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw asTrpcError(error);
  }
}

function asTrpcError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const message = error instanceof Error ? error.message : '';
  if (message === 'invalid_range' || message === 'range_too_large') {
    return new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a range of 180 days or less.' });
  }
  console.error(error);
  if (/ECONNREFUSED|ENOTFOUND|authentication|does not exist|DATABASE_URL|connect ECONN|timeout/i.test(message)) {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Database is not ready. Start Postgres and run npm run db:setup.',
    });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not load analytics.' });
}
