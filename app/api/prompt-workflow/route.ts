// app/api/prompt-workflow/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { Node, Edge } from '@xyflow/react';
import { getDefaultModel } from '@/lib/config/llm-config';

// Ensure Node.js runtime (Anthropic SDK not supported on Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize Anthropic client safely
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY missing');
      return NextResponse.json(
        { error: 'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in environment variables.' },
        { status: 500 }
      );
    }

    // --- Step 1: Build prompt ---
    const systemMessage = `
      You are an AI assistant that designs workflow diagrams based on user requests.
      
      IMPORTANT: Follow the patterns from the reference templates:
      - 01-simple-agent.ts: Basic Start -> Agent -> End flow
      - 02-agent-with-firecrawl.ts: Agent with Firecrawl MCP tools for web research
      - 03-scrape-summarize-docs.ts: Multi-agent workflows with data passing via {{lastOutput}}
      - 04-advanced-workflow.ts: Complex workflows with loops, conditions, and transformations
      
      Generate workflow nodes and edges in JSON format matching this exact structure:

      AVAILABLE NODE TYPES:
      - "start": Entry point (required at beginning)
      - "end": Exit point (required at end)
      - "agent": LLM agent node for processing/generation (can include MCP tools like Firecrawl for web scraping/searching)
      - "mcp": MCP (Model Context Protocol) tool node (for direct Firecrawl actions: scrape, search, crawl, map)
      - "if-else": Conditional branching node
      - "while": Loop/iteration node
      - "user-approval": Human approval gate
      - "transform": Data transformation using JavaScript
      - "extract": Extract structured data from input
      - "http": HTTP request node
      - "set-state": Store/update workflow state
      - "note": Documentation/annotation node

      WEB SCRAPING & SEARCHING OPTIONS:
      - For agent-based web research: Use "agent" node with mcpTools containing Firecrawl. The agent can use firecrawl_search and firecrawl_scrape tools.
      - For direct web operations: Use "mcp" node with Firecrawl configuration for scrape/search/crawl/map actions.

      NODE STRUCTURE (all nodes require):
      {
        "id": "unique_id" (e.g., "start", "agent-1", "node_0"),
        "type": "node_type",
        "position": {"x": number, "y": number},
        "data": {
          "nodeType": "same_as_type",
          "nodeName": "Display Name",
          "label": "Display Name",
          // Additional properties based on node type:
        }
      }

      NODE-SPECIFIC DATA PROPERTIES:

      1. START node:
        {
          "data": {
            "nodeType": "start",
            "nodeName": "Start",
            "label": "Start",
            "inputVariables": [
              {
                "name": "variable_name",
                "type": "string",
                "required": true,
                "description": "What this input is for"
              }
            ]
          }
        }

      2. AGENT node:
        {
          "data": {
            "nodeType": "agent",
            "nodeName": "Agent Name",
            "label": "Agent Name",
            "instructions": "What the agent should do. Use {{variableName}} for variable substitution.",
            "model": "anthropic/claude-sonnet-4-20250514",
            "outputFormat": "Text" or "JSON",
            "jsonOutputSchema": "optional JSON schema string if outputFormat is JSON",
            "mcpTools": [
              {
                "name": "Firecrawl",
                "url": "https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp",
                "accessToken": "$" + "{FIRECRAWL_API_KEY}"
              }
            ]
          }
        }
        NOTE: For web research, scraping, or searching, add mcpTools with Firecrawl.
        The agent can then use firecrawl_search and firecrawl_scrape tools in its instructions.
        
        REFERENCE PATTERN (from 02-agent-with-firecrawl.ts):
        - Instructions should explicitly tell the agent to use firecrawl_search first, then firecrawl_scrape for details
        - Format: "Use the firecrawl_search tool to search for: {{input.query}}. Then use firecrawl_scrape to get detailed content..."
        - Return structured summaries that are easy for the next agent to parse
        
        IMPORTANT - Passing data between agents (from 03-scrape-summarize-docs.ts pattern):
        - Always use {{lastOutput}} to reference the previous agent's complete output
        - When an agent receives {{lastOutput}}, explicitly describe what format the data is in
        - Example from template: "Analyze the following scraped content: {{lastOutput}}" - the formatting agent knows it's scraped content
        - For reports/formatting: Describe the structure: "The previous output ({{lastOutput}}) contains [detailed structure]. Format it into..."

      3. TRANSFORM node:
        {
          "data": {
            "nodeType": "transform",
            "nodeName": "Transform Name",
            "label": "Transform Name",
            "transformScript": "JavaScript code that processes input and returns result"
          }
        }

      4. IF-ELSE node:
        {
          "data": {
            "nodeType": "if-else",
            "nodeName": "Condition Name",
            "label": "Condition Name",
            "condition": "JavaScript expression that returns boolean",
            "trueLabel": "Yes",
            "falseLabel": "No"
          }
        }

      5. WHILE node:
        {
          "data": {
            "nodeType": "while",
            "nodeName": "Loop Name",
            "label": "Loop Name",
            "whileCondition": "JavaScript condition (e.g., 'iteration <= 5')",
            "maxIterations": 10
          }
        }

      6. NOTE node:
        {
          "data": {
            "nodeType": "note",
            "nodeName": "Note Title",
            "label": "Note Title",
            "noteText": "Documentation text explaining the workflow or section"
          }
        }

      7. END node:
        {
          "data": {
            "nodeType": "end",
            "nodeName": "End",
            "label": "End"
          }
        }

      8. MCP node (for Firecrawl web operations):
        {
          "data": {
            "nodeType": "mcp",
            "nodeName": "Web Scrape" or "Web Search",
            "label": "Web Scrape" or "Web Search",
            "mcpServers": [
              {
                "id": "firecrawl",
                "name": "Firecrawl",
                "label": "firecrawl",
                "url": "https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp",
                "authType": "Access token / API key"
              }
            ],
            "mcpAction": "scrape" or "search" or "crawl" or "map",
            "scrapeUrl": "URL to scrape (if action is scrape)",
            "searchQuery": "Query to search (if action is search)",
            "outputField": "first" or "full" or specific field path
          }
        }

      EDGE STRUCTURE:
      {
        "id": "edge_id",
        "source": "source_node_id",
        "target": "target_node_id"
      }

      COMPLETE EXAMPLES:

      Example 1 - Simple Agent:
      {
        "nodes": [
          {
            "id": "start",
            "type": "start",
            "position": {"x": 100, "y": 200},
            "data": {
              "nodeType": "start",
              "nodeName": "Start",
              "label": "Start",
              "inputVariables": [
                {
                  "name": "question",
                  "type": "string",
                  "required": true,
                  "description": "The question to answer"
                }
              ]
            }
          },
          {
            "id": "agent-1",
            "type": "agent",
            "position": {"x": 350, "y": 200},
            "data": {
              "nodeType": "agent",
              "nodeName": "Answer Question",
              "label": "Answer Question",
              "instructions": "Answer this question clearly and concisely: {{input.question}}",
              "model": "anthropic/claude-sonnet-4-20250514",
              "outputFormat": "Text"
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {"x": 600, "y": 200},
            "data": {
              "nodeType": "end",
              "nodeName": "End",
              "label": "End"
            }
          }
        ],
        "edges": [
          {"id": "e1", "source": "start", "target": "agent-1"},
          {"id": "e2", "source": "agent-1", "target": "end"}
        ]
      }

      Example 2 - Agent with Firecrawl (REFERENCE: 02-agent-with-firecrawl.ts template):
      {
        "nodes": [
          {
            "id": "start",
            "type": "start",
            "position": {"x": 100, "y": 200},
            "data": {
              "nodeType": "start",
              "nodeName": "Start",
              "label": "Start",
              "inputVariables": [
                {
                  "name": "search_query",
                  "type": "string",
                  "required": true,
                  "description": "What would you like to research on the web?",
                  "defaultValue": "latest AI developments in 2025"
                }
              ]
            }
          },
          {
            "id": "research-agent",
            "type": "agent",
            "position": {"x": 350, "y": 200},
            "data": {
              "nodeType": "agent",
              "nodeName": "Web Research Agent",
              "label": "Web Research Agent",
              "instructions": "You are a web research assistant with access to Firecrawl MCP tools. Your task:\n\n1. Use the firecrawl_search tool to search for: {{input.search_query}}\n2. Review the search results and identify the most relevant sources\n3. If needed, use firecrawl_scrape to get detailed content from specific URLs\n4. Synthesize the information into a clear, well-organized summary\n\nProvide a comprehensive summary with key findings, organized by topic or source.",
              "model": "anthropic/claude-sonnet-4-20250514",
              "outputFormat": "Text",
              "mcpTools": [
                {
                  "name": "Firecrawl",
                  "url": "https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp",
                  "accessToken": "$" + "{FIRECRAWL_API_KEY}"
                }
              ]
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {"x": 600, "y": 200},
            "data": {
              "nodeType": "end",
              "nodeName": "End",
              "label": "End"
            }
          }
        ],
        "edges": [
          {"id": "e1", "source": "start", "target": "research-agent"},
          {"id": "e2", "source": "research-agent", "target": "end"}
        ]
      }

      Example 3 - Multi-Agent with Data Passing (REFERENCE: 03-scrape-summarize-docs.ts template pattern):
      {
        "nodes": [
          {
            "id": "start",
            "type": "start",
            "position": {"x": 100, "y": 200},
            "data": {
              "nodeType": "start",
              "nodeName": "Start",
              "label": "Start",
              "inputVariables": [
                {
                  "name": "url",
                  "type": "string",
                  "required": true,
                  "description": "URL to scrape",
                  "defaultValue": "https://www.example.com/news"
                }
              ]
            }
          },
          {
            "id": "scrape-agent",
            "type": "agent",
            "position": {"x": 350, "y": 200},
            "data": {
              "nodeType": "agent",
              "nodeName": "Scrape Website",
              "label": "Scrape Website",
              "instructions": "Use Firecrawl MCP tools to scrape the content from this URL: {{input.url}}\n\nUse the firecrawl_scrape tool with markdown format.\n\nExtract the main content, focusing on:\n- Article titles\n- Key points\n- Important information\n\nReturn the scraped content in a clean, organized format.",
              "model": "anthropic/claude-sonnet-4-20250514",
              "outputFormat": "Text",
              "mcpTools": [
                {
                  "name": "Firecrawl",
                  "url": "https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp",
                  "accessToken": "$" + "{FIRECRAWL_API_KEY}"
                }
              ]
            }
          },
          {
            "id": "summarize-agent",
            "type": "agent",
            "position": {"x": 600, "y": 200},
            "data": {
              "nodeType": "agent",
              "nodeName": "Summarize Content",
              "label": "Summarize Content",
              "instructions": "Analyze the following scraped content and create a professional summary:\n\n{{lastOutput}}\n\nCreate a well-structured summary with:\n1. Executive Summary (2-3 sentences)\n2. Key Points (bullet points)\n3. Detailed Findings (organized by topic)\n4. Conclusion\n\nFormat it in a way that's suitable for presentation.",
              "model": "anthropic/claude-sonnet-4-20250514",
              "outputFormat": "Text"
            }
          },
          {
            "id": "end",
            "type": "end",
            "position": {"x": 850, "y": 200},
            "data": {
              "nodeType": "end",
              "nodeName": "End",
              "label": "End"
            }
          }
        ],
        "edges": [
          {"id": "e1", "source": "start", "target": "scrape-agent"},
          {"id": "e2", "source": "scrape-agent", "target": "summarize-agent"},
          {"id": "e3", "source": "summarize-agent", "target": "end"}
        ]
      }

      RULES:
      1. Workflow MUST start with a "start" node and end with an "end" node
      2. All node ids must be unique
      3. Edge source/target must reference existing node ids
      4. Use reasonable position coordinates (x increments of 250-350, y can vary for parallel flows)
      5. For agent nodes, provide clear, actionable instructions
      6. For web research/scraping: Prefer agent nodes with Firecrawl mcpTools for intelligent web operations
      7. For direct web scraping: Use MCP nodes with Firecrawl for specific URLs or search queries
      8. When user requests involve web scraping, searching, or internet research, include Firecrawl tools
      9. CRITICAL - Data flow between agents:
         - When agent A uses Firecrawl and agent B needs its output, use {{lastOutput}} in agent B's instructions
         - Agent B should explicitly be told to parse/format the data from {{lastOutput}}
         - Example: "Format the following data into a report: {{lastOutput}}. The data contains [describe what's in it]."
         - For reports/formatting: Tell the agent the EXACT structure of data in {{lastOutput}} (e.g., "articles array", "JSON object with fields X, Y, Z")
         - NEVER use variable references like {{nodeId.output.field}} - use {{lastOutput}} which contains the previous node's complete output
         - When a research agent returns structured text, explicitly tell the formatting agent: "The previous node output ({{lastOutput}}) contains [detailed description]. Format it into..."
      10. Output ONLY valid JSON - no markdown, code fences, or extra text

      EXAMPLES OF FIREZCRAWL USAGE:
      - Agent with web research: Agent node with mcpTools containing Firecrawl, instructions mention using firecrawl_search or firecrawl_scrape
      - Direct web scrape: MCP node with mcpAction="scrape", scrapeUrl set to target URL
      - Web search: MCP node with mcpAction="search", searchQuery set to search term
    `;

    const userMessage = `Design a workflow for: "${prompt}"`;

    console.log('Calling Anthropic API with:', prompt);

    const msg = await anthropic.messages.create({
      model: getDefaultModel('anthropic'),
      max_tokens: 4000,
      temperature: 0.3,
      system: systemMessage,
      messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
    });
    console.log(msg);

    console.log('✅ Anthropic API response received');

    // --- Step 2: Extract and parse text content ---
    const content = msg.content
      .filter(block => block.type === 'text') 
      .map(block => block.text)
      .join('\n')
      .trim();

    if (!content) {
      throw new Error('Empty response from Anthropic.');
    }

    // Extract raw JSON from potential wrapping or code fences
    let jsonString = content;
    const matchBlock = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (matchBlock) {
      jsonString = matchBlock[1];
    } else {
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonString = jsonString.slice(firstBrace, lastBrace + 1);
      }
    }

    // --- Step 3: Parse JSON safely ---
    let workflowData: { nodes: Node[]; edges: Edge[] };
    try {
      workflowData = JSON.parse(jsonString);
    } catch (err) {
      console.error('JSON parse error:', err);
      console.error('Raw content:', content);
      return NextResponse.json(
        { error: 'Failed to parse AI workflow JSON output.' },
        { status: 500 }
      );
    }

      if (!Array.isArray(workflowData.nodes) || !Array.isArray(workflowData.edges)) {
      return NextResponse.json(
        { error: 'Invalid workflow format: missing nodes or edges.' },
        { status: 500 }
      );
    }

    // --- Step 4: Normalize nodes and edges ---
    let currentNodeIdCounter = 1;
    const nodeIdMap = new Map<string, string>(); // Map original IDs to final IDs

    const processedNodes: Node[] = workflowData.nodes.map((node: any, index: number) => {
      const originalId = node.id;
      let finalId = originalId;

      // Ensure unique ID and track the mapping
      if (!originalId || !originalId.startsWith('node_')) {
        finalId = `node_${currentNodeIdCounter++}`;
        if (originalId) {
          nodeIdMap.set(originalId, finalId);
        }
      } else {
        const idNum = parseInt(originalId.split('_')[1], 10);
        if (!isNaN(idNum)) {
            currentNodeIdCounter = Math.max(currentNodeIdCounter, idNum + 1);
        }
      }

      // Ensure position
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        node.position = { x: 250 + index * 300, y: 250 };
      }

      // Ensure type and data
      node.type = node.type || node.data?.nodeType || 'agent';
      const defaultNodeName = node.type.charAt(0).toUpperCase() + node.type.slice(1);
      node.data = {
        // Preserve all existing data properties first
        ...(node.data || {}),
        // Ensure required fields (override if missing)
        nodeType: node.data?.nodeType || node.type,
        nodeName: node.data?.nodeName || node.data?.name || defaultNodeName,
        label: node.data?.label || node.data?.nodeName || node.data?.name || defaultNodeName,
      };

      return {
        ...node,
        id: finalId,
      };
    });

    // Create a set of valid processed node IDs for validation
    const validNodeIds = new Set(processedNodes.map(n => n.id));

    // Process edges and map source/target IDs to match processed node IDs
    const processedEdges: Edge[] = workflowData.edges
      .map((edge: any) => {
        if (!edge.source || !edge.target) {
          console.warn(`⚠️ Skipping invalid edge missing source/target: ${JSON.stringify(edge)}`);
          return null;
        }

        // Map source and target IDs if they were changed during processing
        const mappedSource = nodeIdMap.get(edge.source) || edge.source;
        const mappedTarget = nodeIdMap.get(edge.target) || edge.target;

        // Validate that both nodes exist
        if (!validNodeIds.has(mappedSource)) {
          console.warn(`⚠️ Skipping edge: source node '${mappedSource}' (original: '${edge.source}') does not exist`);
          return null;
        }
        if (!validNodeIds.has(mappedTarget)) {
          console.warn(`⚠️ Skipping edge: target node '${mappedTarget}' (original: '${edge.target}') does not exist`);
          return null;
        }

        return {
          id: edge.id || `edge-${mappedSource}-${mappedTarget}`,
          source: mappedSource,
          target: mappedTarget,
          ...(edge.label && { label: edge.label }),
          ...(edge.sourceHandle && { sourceHandle: edge.sourceHandle }),
          ...(edge.targetHandle && { targetHandle: edge.targetHandle }),
        };
      })
      .filter((edge): edge is Edge => edge !== null);

    console.log(`✅ Node ID mappings:`, Object.fromEntries(nodeIdMap));

    console.log(`✅ Workflow processed: ${processedNodes.length} nodes, ${processedEdges.length} edges`);

    // --- Step 5: Return final JSON ---
    return NextResponse.json({
      nodes: processedNodes,
      edges: processedEdges,
    });

  } catch (error) {
    console.error(' API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate workflow', details: message },
      { status: 500 }
    );
  }
}
