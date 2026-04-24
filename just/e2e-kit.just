# Portable E2E recipes for repositories that consume @webpresso/agent-kit.
#
# Hosts are still responsible for starting their own services before invoking
# these commands.

set positional-arguments

ak_bin := env_var_or_default('AK_BIN', 'ak')

[group('test')]
[doc('Run E2E tests through ak e2e. Forward suite/file/config flags unchanged.')]
ak-e2e *args:
    @{{ak_bin}} e2e {{args}}
