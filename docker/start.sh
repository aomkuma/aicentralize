#!/bin/sh
set -e

echo "[BOOT] Running prisma migrations"
npx prisma migrate deploy

echo "[BOOT] Ensuring Prisma client is generated"
npx prisma generate

if [ "${WAIT_FOR_OLLAMA:-false}" = "true" ] && [ -n "${OLLAMA_BASE_URL:-}" ]; then
	echo "[BOOT] Waiting for Ollama at ${OLLAMA_BASE_URL}"
	node <<'NODE'
const baseUrl = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
const url = `${baseUrl}/api/tags`;
const timeoutAt = Date.now() + 120000;

async function waitForOllama() {
	while (Date.now() < timeoutAt) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				console.log(`[BOOT] Ollama is ready at ${url}`);
				return;
			}
		} catch (_error) {
			// retry until timeout
		}

		await new Promise((resolve) => setTimeout(resolve, 2000));
	}

	console.warn(`[BOOT] Ollama was not ready before timeout at ${url}`);
}

waitForOllama().catch((error) => {
	console.warn(`[BOOT] Ollama wait skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
});
NODE
else
	echo "[BOOT] Ollama wait skipped"
fi

echo "[BOOT] Starting API"
node dist/src/index.js
