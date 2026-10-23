"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ClipboardList,
  Store,
  ClipboardCheck,
  FileText,
  FolderKanban,
  HandCoins,
  Home,
  LogOut,
  Menu,
  MessageSquarePlus,
  Plus,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  Shield,
  Tags,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { OrgSwitcher, type SwitcherOrg } from "./org-switcher";
import { NavigationProgress } from "./navigation-progress";
import { FeedbackButton } from "@/components/forms/feedback-forms";
import { PendingButton } from "@/components/ui/pending-button";

const ICONS = {
  home: Home,
  wallet: Wallet,
  receipt: Receipt,
  plus: Plus,
  bell: Bell,
  user: User,
  review: ClipboardCheck,
  allocations: ArrowLeftRight,
  users: Users,
  scale: Scale,
  chart: BarChart3,
  file: FileText,
  settings: Settings,
  tags: Tags,
  building: Building2,
  folder: FolderKanban,
  audit: ScrollText,
  shield: Shield,
  claims: HandCoins,
  book: BookOpen,
  feedback: MessageSquarePlus,
  requisition: ClipboardList,
  store: Store,
} as const;
export type IconName = keyof typeof ICONS;

export type NavItem = { href: string; label: string; icon: IconName; badge?: number };
export type NavSection = { title?: string; items: NavItem[] };

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const Icon = ICONS[item.icon];
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-800 text-white" : "text-brand-100 hover:bg-brand-800/60 hover:text-white",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {!!item.badge && (
        <span className="min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[11px] font-semibold leading-5 text-brand-950">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}

function SidebarContent({
  sections,
  user,
  pathname,
  onNavigate,
  logoutAction,
  org,
}: {
  sections: NavSection[];
  user: { name: string; role: string; email: string };
  pathname: string;
  onNavigate?: () => void;
  logoutAction: () => Promise<void>;
  org: OrgProps;
}) {
  return (
    <div className="flex h-full flex-col bg-brand-900">
      <div className="flex h-16 shrink-0 items-center px-3 pr-10 lg:pr-3">
        <OrgSwitcher orgs={org.orgs} activeId={org.activeId} manageHref={org.manageHref} variant="sidebar" />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2 scrollbar-none">
        {sections.map((section, i) => (
          <div key={i}>
            {section.title && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{section.title}</p>}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-brand-800 p-3">
        <Link href="/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-brand-800/60">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">
            {user.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user.name}</span>
            <span className="block truncate text-xs text-brand-300">{user.role}</span>
          </span>
        </Link>
        <form action={logoutAction}>
          <PendingButton className="mt-1 w-full !justify-start gap-3 rounded-lg px-3 py-2 text-sm text-brand-200 hover:bg-brand-800/60 hover:text-white">
            <LogOut className="h-[18px] w-[18px]" /> Sign out
          </PendingButton>
        </form>
      </div>
    </div>
  );
}

type OrgProps = { orgs: SwitcherOrg[]; activeId: string; manageHref: string | null };

export function AppShell({
  sections,
  bottomNav,
  user,
  unread,
  org,
  logoutAction,
  children,
}: {
  sections: NavSection[];
  bottomNav: NavItem[];
  user: { name: string; role: string; email: string };
  unread: number;
  org: OrgProps;
  logoutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  return (
    <div className="min-h-dvh">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block print:!hidden">
        <SidebarContent sections={sections} user={user} pathname={pathname} logoutAction={logoutAction} org={org} />
      </aside>

      {/* Mobile drawer */}
      <div className={cn("fixed inset-0 z-50 lg:hidden print:hidden", drawer ? "" : "pointer-events-none")} aria-hidden={!drawer}>
        <div className={cn("absolute inset-0 bg-gray-900/50 transition-opacity", drawer ? "opacity-100" : "opacity-0")} onClick={() => setDrawer(false)} />
        <div className={cn("absolute inset-y-0 left-0 w-[82%] max-w-xs shadow-xl transition-transform duration-200", drawer ? "translate-x-0" : "-translate-x-full")}>
          <button onClick={() => setDrawer(false)} className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-brand-200 hover:bg-brand-800" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
          <SidebarContent sections={sections} user={user} pathname={pathname} onNavigate={() => setDrawer(false)} logoutAction={logoutAction} org={org} />
        </div>
      </div>

      <div className="lg:pl-64 print:!pl-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 print:hidden border-b border-gray-200 bg-white/90 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <button onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0 lg:hidden">
              <OrgSwitcher orgs={org.orgs} activeId={org.activeId} manageHref={org.manageHref} variant="topbar" />
            </div>
            <p className="hidden truncate text-sm font-medium text-gray-500 lg:block">{org.orgs.find((o) => o.id === org.activeId)?.name}</p>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <FeedbackButton />
              <Link href="/notifications" className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/profile" className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-gray-100 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                  {user.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="text-sm font-medium text-gray-700">{user.name.split(" ")[0]}</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {bottomNav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            if (item.icon === "plus") {
              return (
                <Link key={item.href} href={item.href} className="flex flex-col items-center justify-center py-1.5" aria-label={item.label}>
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg ring-4 ring-white">
                    <Plus className="h-6 w-6" />
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium text-gray-600">{item.label}</span>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium", active ? "text-brand-700" : "text-gray-500")}
              >
                <Icon className="h-5 w-5" />
                {item.label}
                {!!item.badge && (
                  <span className="absolute right-[22%] top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-semibold leading-4 text-white">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
