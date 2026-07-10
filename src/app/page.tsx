import { auth0 } from '@/lib/auth0';
import { redirect } from 'next/navigation';
import { TrendingUp, Shield, BarChart3, Globe } from 'lucide-react';

export default async function LandingPage() {
  const session = await auth0.getSession();
  if (session) redirect('/dashboard');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>WealthVision</span>
        </div>
        <a
          href="/auth/login"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          ログイン
        </a>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm mb-8"
          style={{ background: 'rgba(153,33,254,0.15)', color: 'var(--accent)', border: '1px solid var(--border)' }}
        >
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
          リアルタイム資産管理
        </div>

        <h1 className="text-5xl font-bold mb-6 max-w-2xl leading-tight" style={{ color: 'var(--foreground)' }}>
          あなたの資産を
          <span style={{ color: 'var(--accent)' }}> 一つの場所 </span>
          で管理
        </h1>

        <p className="text-lg max-w-xl mb-12" style={{ color: 'var(--muted)' }}>
          株式・FX・仮想通貨をシームレスに管理。ポートフォリオの分析からリアルタイム取引まで、投資のすべてを一元化します。
        </p>

        <div className="flex gap-4 flex-wrap justify-center">
          <a
            href="/auth/login?screen_hint=signup"
            className="px-8 py-3 rounded-xl font-semibold text-lg transition-all hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            無料で始める
          </a>
          <a
            href="/auth/login"
            className="px-8 py-3 rounded-xl font-semibold text-lg transition-all hover:opacity-80"
            style={{ border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            ログイン
          </a>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-24 w-full max-w-5xl">
          {[
            { icon: BarChart3, title: 'ポートフォリオ分析', desc: '資産配分をリアルタイムで可視化。損益を一目で把握。' },
            { icon: TrendingUp, title: '株式・ETF', desc: '国内外の株式・ETFをシームレスに売買。' },
            { icon: Globe, title: 'FX取引', desc: '主要通貨ペアの外国為替取引に対応。' },
            { icon: Shield, title: 'セキュア認証', desc: 'Auth0による企業グレードのセキュリティ。' },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="p-6 rounded-2xl text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                style={{ background: 'rgba(153,33,254,0.2)' }}
              >
                <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>{title}</h3>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="py-6 text-center text-sm" style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
        © 2025 WealthVision — デモ用アプリケーション
      </footer>
    </div>
  );
}
