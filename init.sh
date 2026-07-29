#!/bin/bash
set -e

echo "=== Browser Agent (WebVoyager) — session init ==="
echo ""

if [ ! -f package.json ]; then
  echo "No package.json yet — project is still at the planning stage."
  echo "First feature is feat-001 (vision model availability gate)."
  echo ""
else
  echo "=== bun install ==="
  bun install

  echo "=== playwright browsers ==="
  bunx playwright install chromium || echo "FAILED: playwright install"

  echo "=== typecheck ==="
  bun run typecheck || echo "FAILED: typecheck"

  echo "=== tests ==="
  bun test || echo "FAILED: tests"
fi

echo ""
echo "=== Secrets check ==="
if [ -f .env ]; then
  echo ".env present"
else
  echo "WARNING: .env missing — the agent needs ZAI_API_KEY."
  echo "Copy it from ~/.pi/agent/auth.json. Never commit it."
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
echo "1. Read AGENTS.md, then feature_list.json and progress.md"
echo "2. Pick ONE feature whose dependencies are all 'done'"
echo "3. Implement only that feature"
echo "4. Run its done-criteria check and paste real output into evidence"
echo "5. Record any measurement in docs/DECISIONS.md before claiming done"
echo ""
echo "Reminder: no site-specific code, no evasion tooling, traces always on."
