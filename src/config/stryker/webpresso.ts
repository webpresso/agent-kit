import { baseConfig } from './index.js'

export const webpressoConfig = {
  ...baseConfig,
  ignorePatterns: ['/.webpresso/**'],
}

export default webpressoConfig
