import Image from 'next/image';
import { LogOut } from 'lucide-react';

interface Props {
  user: { name?: string; email?: string; picture?: string };
}

export default function Header({ user }: Props) {
  return (
    <header
      className="h-14 px-6 flex items-center justify-between flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      <div />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          {user.picture ? (
            <Image
              src={user.picture}
              alt={user.name ?? ''}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {(user.name ?? user.email ?? 'U')[0].toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            {user.name ?? user.email}
          </span>
        </div>
        <a
          href="/auth/logout"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-opacity hover:opacity-80"
          style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          <LogOut className="w-3.5 h-3.5" />
          ログアウト
        </a>
      </div>
    </header>
  );
}
