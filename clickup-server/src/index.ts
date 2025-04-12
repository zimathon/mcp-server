#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Explicitly load .env file from the project root relative to the build output
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
      {
        name: "create_task",
        description: "Create a new task in a ClickUp list",
        inputSchema: {
          type: "object",
          properties: {
            list_id: {
              type: "string",
              description: "The ID of the ClickUp list to add the task to"
            },
            name: {
              type: "string",
              description: "The name of the new task"
            },
            description: {
              type: "string",
              description: "Optional description for the task"
            },
            assignees: {
              type: "array",
              items: { type: "integer" },
              description: "Optional array of user IDs to assign the task to"
            },
            // Add other potential parameters like priority, due_date, etc.
          },
          required: ["list_id", "name"]
        }
      }
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

    case "create_task": {
      const listId = request.params.arguments?.list_id;
      const taskName = request.params.arguments?.name;
      const description = request.params.arguments?.description;
      const assignees = request.params.arguments?.assignees;

      if (typeof listId !== 'string' || !listId) {
        throw new McpError(ErrorCode.InvalidParams, 'list_id (string) is required');
      }
      if (typeof taskName !== 'string' || !taskName) {
        throw new McpError(ErrorCode.InvalidParams, 'name (string) is required');
      }
      if (description !== undefined && typeof description !== 'string') {
         throw new McpError(ErrorCode.InvalidParams, 'description must be a string if provided');
      }
       if (assignees !== undefined && (!Array.isArray(assignees) || !assignees.every(id => typeof id === 'number'))) {
         throw new McpError(ErrorCode.InvalidParams, 'assignees must be an array of numbers if provided');
      }

      try {
        const payload: { name: string; description?: string; assignees?: number[] } = { name: taskName };
        if (description) {
          payload.description = description;
        }
         if (assignees) {
          payload.assignees = assignees;
        }

        const response = await clickupApi.post(`/list/${listId}/task`, payload);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response.data, null, 2) // Return the created task details
          }]
        };
      } catch (error) {
        console.error("ClickUp API Error (create_task):", error);
        const errorMessage = axios.isAxiosError(error)
          ? error.response?.data?.err || error.message
          : String(error);
        return {
          content: [{ type: "text", text: `Error creating task: ${errorMessage}` }],
          isError: true,
        };
      }
    }

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
