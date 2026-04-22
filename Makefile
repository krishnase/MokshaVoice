.PHONY: dev migrate studio build clean infra-up infra-down

# ── Local infrastructure ────────────────────────────────────────────────────
infra-up:
	docker compose up -d postgres redis
	@echo "Waiting for Postgres to be healthy..."
	@until docker compose exec postgres pg_isready -U mokshavoice -d mokshavoice > /dev/null 2>&1; do sleep 1; done
	@echo "Postgres ready."

infra-down:
	docker compose down

# ── Database ────────────────────────────────────────────────────────────────
migrate:
	cd apps/backend && pnpm prisma migrate dev

migrate-prod:
	cd apps/backend && pnpm prisma migrate deploy

studio:
	cd apps/backend && pnpm prisma studio

generate:
	cd apps/backend && pnpm prisma generate

seed:
	cd apps/backend && pnpm prisma db seed

# ── Development servers ─────────────────────────────────────────────────────
dev: infra-up
	pnpm --filter @mokshavoice/backend dev &
	pnpm --filter @mokshavoice/mobile start

dev-backend: infra-up
	pnpm --filter @mokshavoice/backend dev

dev-mobile:
	pnpm --filter @mokshavoice/mobile start

# ── Build ────────────────────────────────────────────────────────────────────
build:
	pnpm --filter @mokshavoice/shared-types build
	pnpm --filter @mokshavoice/backend build

# ── Utilities ────────────────────────────────────────────────────────────────
install:
	pnpm install

clean:
	find . -name 'node_modules' -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name 'dist' -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name '.turbo' -type d -prune -exec rm -rf {} + 2>/dev/null || true

typecheck:
	pnpm -r typecheck

lint:
	pnpm -r lint

test:
	pnpm -r test
