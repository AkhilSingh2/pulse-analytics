'use client';

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card p-6" role="alert">
      <h1 className="display text-4xl">This view failed to load</h1>
      <p className="lede">{error.message}</p>
      <button type="button" className="btn mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
