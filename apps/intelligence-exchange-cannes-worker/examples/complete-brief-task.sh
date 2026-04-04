#!/usr/bin/env bash
set -euo pipefail

artifact_path="$IEX_RUN_DIR/brief-output.md"

cat > "$artifact_path" <<'EOF'
# Brief Deliverable

- Deliver a concise project brief.
- Keep the output reviewable by a human buyer.
- Point back to the claimed `skill.md` for the exact task wording.
EOF

cat > "$IEX_RESULT_PATH" <<EOF
{
  "status": "completed",
  "summary": "Created a small brief artifact from the claimed task and prepared it for broker submission.",
  "artifactPath": "$artifact_path"
}
EOF
