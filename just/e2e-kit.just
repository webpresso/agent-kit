# Portable E2E recipes for repositories that consume @webpresso/agent-kit.
#
# Hosts are still responsible for starting their own services before invoking
# these commands.

set positional-arguments

wp_bin := env_var_or_default('WP_BIN', 'wp')

[group('test')]
[doc('Run E2E tests through wp e2e. Forward suite/file/config flags unchanged.')]
wp-e2e *args:
    @{{wp_bin}} e2e {{args}}
