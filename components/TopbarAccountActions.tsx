"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./topbar-account-actions.module.css";

type TopbarAccountActionsProps = {
  className?: string;
  linkClassName?: string;
  activeClassName?: string;
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatCredits(value: number | null): string {
  if (value == null) return "";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function TopbarAccountActions({
  className,
  linkClassName = shellStyles.navLink,
  activeClassName = shellStyles.navLinkActive,
}: TopbarAccountActionsProps) {
  const pathname = usePathname();
  const meActive = pathname?.startsWith("/me");
  const creditsActive = pathname?.startsWith("/credits");
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/credits/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { account?: { availableCredits?: unknown } } | null) => {
        if (cancelled) return;
        const credits = Number(payload?.account?.availableCredits);
        setAvailableCredits(Number.isFinite(credits) ? credits : null);
      })
      .catch(() => {
        if (!cancelled) setAvailableCredits(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={classNames(styles.accountActions, className)} aria-label="账号入口">
      <Link href="/credits" className={classNames(linkClassName, creditsActive && activeClassName)}>
        <span className={styles.creditLinkContent}>
          {availableCredits != null ? <span className={styles.creditAmount}>{formatCredits(availableCredits)}</span> : null}
          <svg className={styles.creditIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7.2 8.1c2.1-2.4 6.1-3.4 8.8-1.7 2.8 1.7 3.9 5.9 2.2 8.9-1.6 2.8-5.6 4.4-8.8 3.2-3.4-1.2-4.9-4.7-4-7.4.3-1.1.9-2.1 1.8-3Z" />
            <path d="M14.7 6.2c.2-1.1.8-2 1.8-2.7" />
            <path d="M16.4 5.1c1-.2 1.9.1 2.6.9" />
            <path d="M9 11.1h.01" />
            <path d="M13.2 9.7h.01" />
            <path d="M14.8 14.2h.01" />
            <path d="M10.4 15.3h.01" />
          </svg>
        </span>
      </Link>
      <Link href="/me" className={classNames(linkClassName, meActive && activeClassName)}>
        我的
      </Link>
    </div>
  );
}
