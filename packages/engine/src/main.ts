export {};

// `awp-engine` runs the JSON-RPC server; `awp-engine mcp` runs the AWP MCP proxy an agent spawns.
if (process.argv.includes('mcp')) {
  const { runMcpServer } = await import('./mcp');
  await runMcpServer();
} else {
  await import('./serve');
}
