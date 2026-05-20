.PHONY: setup dev build preview typecheck lint test lighthouse clean

# Boot-from-clone in one command.
setup:
	pnpm install --frozen-lockfile

dev:
	pnpm dev

build:
	pnpm build

preview: build
	pnpm preview

typecheck:
	pnpm typecheck

# Run Lighthouse CI locally against a fresh production build.
# Requires @lhci/cli (installed on demand via pnpm dlx so we don't pollute deps).
lighthouse: build
	pnpm dlx @lhci/cli@0.14.x autorun

clean:
	rm -rf dist node_modules .lighthouseci tsconfig.app.tsbuildinfo tsconfig.node.tsbuildinfo
