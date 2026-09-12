import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sky grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="text-6xl">🗺️</div>
        <h1 className="mt-5 text-3xl text-[#0d1d2e]">nothing here</h1>
        <p className="mt-2 text-sm font-medium text-[#17324d]">
          this page doesn't exist. the plan may have been cancelled, or the link is wrong.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/discover" className="btn btn-dark">
            see what's on near you
          </Link>
          <Link href="/" className="btn btn-light">
            back to the start
          </Link>
        </div>
      </div>
    </main>
  );
}
