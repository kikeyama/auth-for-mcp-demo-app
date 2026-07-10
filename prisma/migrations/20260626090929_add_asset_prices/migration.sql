-- AlterTable
ALTER TABLE "users" ALTER COLUMN "cash_balance" SET DEFAULT 10000000;

-- CreateTable
CREATE TABLE "asset_prices" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_prices_asset_id_recorded_at_idx" ON "asset_prices"("asset_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "asset_prices" ADD CONSTRAINT "asset_prices_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
