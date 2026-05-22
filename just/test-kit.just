# Portable test recipes for repositories that consume @webpresso/agent-kit.

set positional-arguments

wp_bin := env_var_or_default('WP_BIN', 'wp')

[group('test')]
[doc('Run tests through wp test. Forward package/file flags and passthrough args unchanged.')]
wp-test *args:
    @{{wp_bin}} test {{args}}
