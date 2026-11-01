-- Store the admin-configured suggested base price in paise.
ALTER TABLE "skills" ADD COLUMN "base_price_paise" INTEGER;
