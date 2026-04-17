/**
 * Shared tool descriptor shape consumed by the central MCP registry.
 *
 * Each descriptor couples the MCP-facing JSON Schema with the TS handler so
 * `ListTools` and `CallTool` stay in sync. Validation happens inside each
 * handler (via zod) so unknown input gets a clean 400-style error.
 */

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (input: unknown) => Promise<unknown>;
}
