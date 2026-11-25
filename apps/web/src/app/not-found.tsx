import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-6 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="display h-page">That view is not on the map.</h1>
        <p className="lede mx-auto">The rest of Pulse is still listening.</p>
        <Link className="btn-primary mt-6" href="/">
          Back to overview
        </Link>
      </div>
    </main>
  );
}
