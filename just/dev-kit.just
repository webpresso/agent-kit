# Consumer drop-in for the agent-kit development surface.
#
# Import from a consumer justfile with:
#   import 'node_modules/@webpresso/agent-kit/just/dev-kit.just'

[doc('Start a manifest-backed development target')]
[group('agent-kit')]
dev *targets:
    @ak dev {{ targets }}

[doc('Validate the dev manifest and print the resolved services')]
[group('agent-kit')]
dev-doctor *targets:
    @ak dev {{ targets }} --doctor

[doc('Clean supervisor-owned state for a manifest-backed development target')]
[group('agent-kit')]
dev-clean *targets:
    @ak dev {{ targets }} --clean

[doc('Restart a manifest-backed development target')]
[group('agent-kit')]
dev-restart *targets:
    @ak dev {{ targets }} --restart
