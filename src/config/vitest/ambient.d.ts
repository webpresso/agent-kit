declare module 'vite-plus/test/config' {
  export type UserWorkspaceConfig = Record<string, unknown>
  export type ViteUserConfigExport = Record<string, unknown>
  export function defineConfig<T>(config: T): T
}

declare module '@vitejs/plugin-react' {
  const react: () => unknown
  export default react
}
