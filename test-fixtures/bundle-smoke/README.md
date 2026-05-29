# Bundle smoke fixture

This fixture models the planned detached-consumer shape for the agent bundle cutover.

- Public user-facing setup command: `webpresso agent setup`
- Public CLI host dependency: `@repo/cli`
- Agent bundle/provider dependency: `@webpresso/agent-kit`
- Current-state helper bins such as `wp-pretool-guard` remain internal generated-hook implementation details only

Until the host-mounted bundle lands, treat this fixture as Wave 0 documentation and package metadata for the future cutover shape.
