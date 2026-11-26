import { TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@/server/router';

/** Answers tRPC operations in the browser for the static demo. */
export const demoLink: TRPCLink<AppRouter> = () => ({ op }) =>
  observable((observer) => {
    import('./runtime')
      .then(({ callProcedure }) => callProcedure(op.path, op.input))
      .then((data) => {
        observer.next({ result: { type: 'data', data } });
        observer.complete();
      })
      .catch((error: unknown) => observer.error(TRPCClientError.from(error instanceof Error ? error : new Error(String(error)))));
  });
