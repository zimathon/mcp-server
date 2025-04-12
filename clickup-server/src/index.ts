#!/usr/bin/env node

import 'dotenv/config'; // Load .env file
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';

// Read ClickUp API key from environment variables
const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;
if (!CLICKUP_API_KEY) {
  throw new Error('CLICKUP_API_KEY environment variable is required');
}

// Create an axios instance for ClickUp API
const clickupApi = axios.create({
  baseURL: 'https://api.clickup.com/api/v2',
  headers: {
    'Authorization': CLICKUP_API_KEY,
    'Content-Type': 'application/json'
  }
});

/**
 * Create an MCP server with capabilities for tools to interact with ClickUp.
 */
const server = new Server(
  {
    name: "clickup-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      // Resources and Prompts are not used in this example
      resources: {},
      prompts: {},
      tools: {}, // Tool handlers will be defined below
    },
  }
);

/**
 * Handler that lists available ClickUp tools.
 * Example: Exposes a "list_tasks" tool.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_tasks",
        description: "List tasks from a ClickUp list",
        inputSchema: {
          type: "object",
          properties: {
            list_id: {
              type: "string",
              description: "The ID of the ClickUp list"
            },
            // Add other potential parameters like archived, page, order_by, etc.
          },
          required: ["list_id"]
        }
      },
      // Add other tools like create_task, get_task, etc. here
      // {
      //   name: "create_task",
      //   description: "Create a new task in a ClickUp list",
      //   inputSchema: { ... }
      // }
    ]
  };
});

/**
 * Handler for executing ClickUp tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "list_tasks": {
      const listId = request.params.arguments?.list_id;
      if (typeof listId !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, 'list_id (string) is required');
      }

      try {
        // Example: Fetch tasks from ClickUp API
        const response = await clickupApi.get(`/list/${listId}/task`);
        // TODO: Handle pagination if necessary

        return {
          content: [{
            type: "text",
            // Return tasks as JSON string, or format as needed
            text: JSON.stringify(response.data.tasks, null, 2)
          }]
        };
      } catch (error) {
        console.error("ClickUp API Error:", error);
        const errorMessage = axios.isAxiosError(error)
          ? error.response?.data?.err || error.message
          : String(error);
        // Return error information to the client
        return {
          content: [{ type: "text", text: `Error listing tasks: ${errorMessage}` }],
          isError: true,
        };
      }
    }

    // Add cases for other tools like create_task here
    // case "create_task": {
    //   // ... implementation ...
    // }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
