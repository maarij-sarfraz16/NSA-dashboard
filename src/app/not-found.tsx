import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[15px] font-semibold text-ink">Page not found</p>
        <Link href="/" className="mt-2 inline-block text-[13px] text-accent hover:underline">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
