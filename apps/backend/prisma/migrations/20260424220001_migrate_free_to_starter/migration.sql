-- Migrate existing FREE plans to STARTER
-- Must be in a separate transaction from the ALTER TYPE that added 'STARTER'
UPDATE "Subscription" SET plan = 'STARTER' WHERE plan = 'FREE';
