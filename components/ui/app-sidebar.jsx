'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationBell } from '@/components/ui/notification-bell';

// Home pages must match exactly, otherwise "Dashboard" / "Employees" would stay lit on every sub page.
const EXACT_ONLY = ['/dashboard', '/admin'];

function isActivePath(pathname, href) {
    if (pathname === href) return true;
    if (EXACT_ONLY.includes(href)) return false;
    return pathname.startsWith(`${href}/`);
}

/**
 * Shared Aurora sidebar used by both the staff portal and the HR dashboard.
 *   items        [{ name, href, icon }]
 *   portalLabel  "STAFF PORTAL" | "HR DASHBOARD"
 *   profileHref  where the profile card links to
 *   footerLink   optional { name, href, icon } shown above the profile card
 */
export function AppSidebar({ items, portalLabel, profileHref, footerLink }) {
    const { data: session } = useSession();
    const pathname = usePathname() || '';

    return (
        <aside className="k-sidebar fixed left-0 top-0 h-screen w-64 flex flex-col z-50 text-white">
            {/* Brand */}
            <div className="px-5 pt-6 pb-5">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white shadow-glow flex items-center justify-center shrink-0">
                        <img src="/logo.png" alt="Keystone" className="w-7 h-7 object-contain" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold tracking-tight leading-none">Keystone</h1>
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.16em] text-white/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary-400" />
                            {portalLabel}
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-2">
                <ul className="space-y-1">
                    {items.map((item) => {
                        const active = isActivePath(pathname, item.href);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    aria-current={active ? 'page' : undefined}
                                    className={`group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all ${
                                        active ? 'bg-white/15 text-white shadow-glow' : 'text-white/70 hover:bg-white/10 hover:text-white'
                                    }`}
                                >
                                    {active && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-secondary-400" />}
                                    <span
                                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                            active ? 'bg-gradient-to-br from-primary-400 to-primary-600' : 'bg-white/5 group-hover:bg-white/20'
                                        }`}
                                    >
                                        <item.icon className="w-4 h-4" />
                                    </span>
                                    <span className="truncate">{item.name}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {footerLink && (
                <div className="px-3 pb-2">
                    <Link
                        href={footerLink.href}
                        className="flex items-center gap-2 rounded-2xl px-3 py-2 text-[12px] font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <footerLink.icon className="w-4 h-4" /> {footerLink.name}
                    </Link>
                </div>
            )}

            {/* Profile */}
            <div className="p-3">
                <div className="flex items-center gap-2 rounded-2xl bg-white/10 border border-white/10 p-2">
                    <Link href={profileHref} className="flex items-center gap-3 flex-1 min-w-0 rounded-xl p-1 hover:bg-white/10 transition-all">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center ring-2 ring-white/30 shrink-0">
                            {session?.user?.image ? (
                                <img src={session.user.image} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm font-bold">{session?.user?.name?.charAt(0) || 'U'}</span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] font-bold truncate">{session?.user?.name || 'Unknown'}</p>
                            <p className="text-[10px] font-semibold text-white/50 capitalize truncate">
                                {String(session?.user?.role || 'N/A').toLowerCase().replace(/_/g, ' ')}
                            </p>
                        </div>
                    </Link>
                    <NotificationBell />
                </div>
            </div>
        </aside>
    );
}
