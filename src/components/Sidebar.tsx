'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, PieChart, ArrowLeftRight, History, TrendingUp, KeyRound } from 'lucide-react';

const links = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/dashboard/portfolio', label: 'ポートフォリオ', icon: PieChart },
  { href: '/dashboard/trade', label: '取引', icon: ArrowLeftRight },
  { href: '/dashboard/history', label: '取引履歴', icon: History },
];

const adminLinks = [
  { href: '/dashboard/mcp-debug', label: 'MCPトークン', icon: KeyRound },
];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
      style={{
        background: active ? 'rgba(153,33,254,0.2)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--muted)',
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col py-6" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-5 mb-8">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
          <TrendingUp className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-base" style={{ color: 'var(--foreground)' }}>WealthVision</span>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {links.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="px-3">
        <div className="mx-3 mb-3" style={{ borderTop: '1px solid var(--border)' }} />
        <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>管理</p>
        <div className="flex flex-col gap-1">
          {adminLinks.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>
      </div>
    </aside>
  );
}
