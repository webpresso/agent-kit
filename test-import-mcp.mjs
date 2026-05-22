try {
  const m = await import('#mcp/tools/_shared/project-root.js')
  console.log('OK', Object.keys(m))
} catch (e) {
  console.error('ERR:', e.message, e.code)
}
