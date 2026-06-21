"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function TopbarAccountActions({
  className,
  linkClassName = shellStyles.navLink,
  activeClassName = shellStyles.navLinkActive,
}: TopbarAccountActionsProps) {
  const pathname = usePathname();
  const settingsActive = pathname?.startsWith("/settings");
  const meActive = pathname?.startsWith("/me");

  return (
    <div className={classNames(styles.accountActions, className)} aria-label="账号与 API 设置入口">
      <Link href="/settings" className={classNames(linkClassName, settingsActive && activeClassName)}>
        API 设置
      </Link>
      <Link href="/me" className={classNames(linkClassName, meActive && activeClassName)}>
        我的
      </Link>
    </div>
  );
}
