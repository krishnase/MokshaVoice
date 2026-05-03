-- Normalize any lowercase or stale plan values to valid uppercase enum values.
-- Cast to text for comparison since invalid enum values cannot be compared directly.
UPDATE "Subscription" SET plan = 'FREE'::"Plan"     WHERE plan::text IN ('free', 'STARTER', 'starter');
UPDATE "Subscription" SET plan = 'SILVER'::"Plan"   WHERE plan::text IN ('silver', 'GROWTH', 'growth');
UPDATE "Subscription" SET plan = 'GOLD'::"Plan"     WHERE plan::text IN ('gold', 'PREMIUM', 'premium');
UPDATE "Subscription" SET plan = 'PLATINUM'::"Plan" WHERE plan::text IN ('platinum');
-- Catch-all: any remaining unknown value falls back to FREE
UPDATE "Subscription" SET plan = 'FREE'::"Plan"
  WHERE plan::text NOT IN ('FREE', 'SILVER', 'GOLD', 'PLATINUM');
