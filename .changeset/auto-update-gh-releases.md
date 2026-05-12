---
"@webpresso/agent-kit": patch
---

Fix auto-update: switch from public npm (only had 0.0.0-placeholder) to GitHub Releases API for version checks. Add git/source install detection so symlink dev installs self-update via git pull. Switch package-manager install commands to @webpresso/agent-kit on GitHub Packages. Remove update-notifier dependency.
