#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { XeroMcpServer } from "./server/xero-mcp-server.js";
import { ToolFactory } from "./tools/tool-factory.js";
import { scrubSecrets } from "./helpers/format-error.js";

const main = async () => {
  // Create an MCP server
  const server = XeroMcpServer.GetServer();

  ToolFactory(server);

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  // Never log the raw error object — an Axios-style error carries the Bearer
  // token in its request config. Log a scrubbed message only.
  console.error("Error:", scrubSecrets(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
