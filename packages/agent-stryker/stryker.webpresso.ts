import { baseConfig } from './stryker.base.mjs'

export const webpressoConfig = {
  ...baseConfig,
  ignorePatterns: ['/.webpresso/**'],
}

export default webpressoConfig
