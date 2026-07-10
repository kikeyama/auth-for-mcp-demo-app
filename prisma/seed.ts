import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AssetType } from '../src/generated/prisma/enums';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const assets = [
    { symbol: '7203', name: 'トヨタ自動車', type: AssetType.STOCK, currency: 'JPY', currentPrice: 3250.0 },
    { symbol: '9984', name: 'ソフトバンクグループ', type: AssetType.STOCK, currency: 'JPY', currentPrice: 9840.0 },
    { symbol: '6758', name: 'ソニーグループ', type: AssetType.STOCK, currency: 'JPY', currentPrice: 13050.0 },
    { symbol: '8306', name: '三菱UFJフィナンシャル', type: AssetType.STOCK, currency: 'JPY', currentPrice: 1520.0 },
    { symbol: '6861', name: 'キーエンス', type: AssetType.STOCK, currency: 'JPY', currentPrice: 65800.0 },
    { symbol: 'AAPL', name: 'Apple Inc.', type: AssetType.STOCK, currency: 'USD', currentPrice: 218.24 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', type: AssetType.STOCK, currency: 'USD', currentPrice: 131.38 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', type: AssetType.STOCK, currency: 'USD', currentPrice: 470.16 },
    { symbol: 'USD/JPY', name: '米ドル/円', type: AssetType.FX, currency: 'JPY', currentPrice: 157.42 },
    { symbol: 'EUR/JPY', name: 'ユーロ/円', type: AssetType.FX, currency: 'JPY', currentPrice: 171.83 },
    { symbol: 'GBP/JPY', name: '英ポンド/円', type: AssetType.FX, currency: 'JPY', currentPrice: 203.15 },
    { symbol: 'AUD/JPY', name: '豪ドル/円', type: AssetType.FX, currency: 'JPY', currentPrice: 104.67 },
    { symbol: 'BTC/JPY', name: 'ビットコイン', type: AssetType.CRYPTO, currency: 'JPY', currentPrice: 15420000 },
    { symbol: 'ETH/JPY', name: 'イーサリアム', type: AssetType.CRYPTO, currency: 'JPY', currentPrice: 478000 },
    { symbol: 'SOL/JPY', name: 'ソラナ', type: AssetType.CRYPTO, currency: 'JPY', currentPrice: 24800 },
    { symbol: 'XRP/JPY', name: 'リップル', type: AssetType.CRYPTO, currency: 'JPY', currentPrice: 312 },
    { symbol: '1306', name: 'TOPIX連動型上場投資信託', type: AssetType.ETF, currency: 'JPY', currentPrice: 2890.0 },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: AssetType.ETF, currency: 'USD', currentPrice: 285.42 },
  ];

  for (const asset of assets) {
    await prisma.asset.upsert({
      where: { symbol: asset.symbol },
      update: { currentPrice: asset.currentPrice },
      create: asset,
    });
  }

  console.log('Seed data inserted successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
