# Portable test recipes for repositories that consume @webpresso/agent-kit.

set positional-arguments

ak_bin := env_var_or_default('AK_BIN', 'ak')

[group('test')]
[doc('Run tests through ak test. Forward package/file flags and passthrough args unchanged.')]
ak-test *args:
    @{{ak_bin}} test {{args}}
