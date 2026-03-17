"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 13h6a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1zm0 8h6a1 1 0 001-1v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v4a1 1 0 001 1zm10 0h6a1 1 0 001-1v-8a1 1 0 00-1-1h-6a1 1 0 00-1 1v8a1 1 0 001 1zm0-18v4a1 1 0 001 1h6a1 1 0 001-1V3a1 1 0 00-1-1h-6a1 1 0 00-1 1z" />
  </svg>
);

const ActivitiesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const PlanIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/activities", label: "Activities", icon: <ActivitiesIcon /> },
  { href: "/chat", label: "AI Chat", icon: <ChatIcon /> },
  { href: "/plan", label: "Training Plan", icon: <PlanIcon /> },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 h-screen bg-[#1A1A2A] border-r border-white/5 px-4 py-6 flex flex-col gap-1 sticky top-0 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-2 mb-6">
        <span className="w-2.5 h-2.5 rounded-full bg-[#C8FC03] flex-shrink-0" />
        <span className="text-xl font-extrabold text-white">RunCoach</span>
      </div>

      {/* Nav items */}
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-200 no-underline",
              isActive
                ? "bg-[#C8FC03]/10 text-[#C8FC03]"
                : "text-[#9CA3AF] hover:bg-white/5 hover:text-white",
            ].join(" ")}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <Link
        href="/profile"
        className={[
          "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-200 no-underline",
          pathname === "/profile" || pathname.startsWith("/profile/")
            ? "bg-[#C8FC03]/10 text-[#C8FC03]"
            : "text-[#9CA3AF] hover:bg-white/5 hover:text-white",
        ].join(" ")}
      >
        <SettingsIcon />
        Settings
      </Link>
    </aside>
  );
}
