-- Normalize any lowercase or stale plan values to valid uppercase enum values.
-- Covers records written by old code before enum was enforced in uppercase.
UPDATE "Subscription" SET plan = 'FREE'     WHERE plan IN ('free', 'STARTER', 'starter');
UPDATE "Subscription" SET plan = 'SILVER'   WHERE plan IN ('silver', 'GROWTH', 'growth');
UPDATE "Subscription" SET plan = 'GOLD'     WHERE plan IN ('gold', 'PREMIUM', 'premium');
UPDATE "Subscription" SET plan = 'PLATINUM' WHERE plan IN ('platinum');
-- Catch-all: any remaining unknown value falls back to FREE
UPDATE "Subscription" SET plan = 'FREE'
  WHERE plan NOT IN ('FREE', 'SILVER', 'GOLD', 'PLATINUM');
