"use client";

import Link from "next/link";

export function CreditWarningToast({ remaining }: { remaining: number }) {
  return (
    <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2">
      <span className="text-sm text-yellow-200">
        You have {remaining} credit{remaining !== 1 ? "s" : ""} remaining today.
      </span>
      <Link
        href="/profile"
        className="text-sm font-medium text-[#C8FC03] hover:underline"
      >
        Adjust limit →
      </Link>
    </div>
  );
}

export function CreditLimitBanner() {
  return (
    <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
      <span className="text-sm text-red-200">
        Daily credit limit reached. Resets daily.
      </span>
      <Link
        href="/profile"
        className="text-sm font-medium text-[#C8FC03] hover:underline"
      >
        Change limit →
      </Link>
    </div>
  );
}
