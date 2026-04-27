-- Migrate old plan names to new ones
UPDATE "Subscription" SET plan = 'FREE'    WHERE plan = 'STARTER';
UPDATE "Subscription" SET plan = 'SILVER'  WHERE plan = 'GROWTH';
UPDATE "Subscription" SET plan = 'GOLD'    WHERE plan = 'PREMIUM';
