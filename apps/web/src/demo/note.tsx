'use client';

/** Small, fixed note so the hosted demo is never mistaken for a production deployment. */
export function DemoNote() {
  return (
    <div
      role="note"
      data-testid="demo-note"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 60,
        maxWidth: 'calc(100vw - 32px)',
        padding: '8px 12px',
        borderRadius: 999,
        border: '1px solid var(--line)',
        background: 'var(--bg-elev)',
        color: 'var(--muted)',
        boxShadow: 'var(--shadow)',
        font: '500 12px/1.3 var(--font-sans)',
        pointerEvents: 'none',
      }}
    >
      Demo mode · sample data, running in your browser
    </div>
  );
}
