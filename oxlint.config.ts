import { defineConfig } from 'oxlint'
import * as agentKitOxlint from '@webpresso/agent-kit/oxlint'

const baseConfig =
  'default' in agentKitOxlint && agentKitOxlint.default
    ? agentKitOxlint.default
    : agentKitOxlint.config

export default defineConfig({
  extends: [baseConfig],
})
