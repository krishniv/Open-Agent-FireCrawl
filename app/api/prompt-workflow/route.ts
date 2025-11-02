// app/api/prompt-workflow/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { type Node, type Edge } from '@xyflow/react';
import Anthropic from '@anthropic-ai/sdk'; // Import Anthropic SDK

export const dynamic = 'force-dynamic';

// Initialize your Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Ensure this is set in your environment variables
});

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your environment variables.' },
        { status: 500 }
      );
    }

    // --- Step 1: Instruct the AI to generate workflow structure ---
    const systemMessage = `
      You are an AI assistant that designs workflow diagrams.
      Given a user's request, generate a list of workflow nodes and edges in a JSON format.
      The workflow should start with a "start" node and end with an "end" node.
      Available node types include: "start", "end", "agent", "mcp", "if-else", "while", "user-approval", "transform", "extract", "http", "set-state", "note".
      Each node must have an 'id' (unique string, e.g., "node_X"), 'type' (from the allowed types), 'position' (object with x, y numbers), and 'data' (object with 'nodeType' and 'nodeName').
      Edges must have 'id', 'source', 'target', and optionally 'label'.
      Assign reasonable default positions for nodes (e.g., incrementing x for layers, y for nodes within a layer).

      Example JSON structure for a simple workflow:
      {
        "nodes": [
          {"id": "node_0", "type": "start", "position": {"x": 250, "y": 250}, "data": {"nodeType": "start", "nodeName": "Start"}},
          {"id": "node_1", "type": "agent", "position": {"x": 500, "y": 250}, "data": {"nodeType": "agent", "nodeName": "Research Agent"}},
          {"id": "node_2", "type": "end", "position": {"x": 750, "y": 250}, "data": {"nodeType": "end", "nodeName": "End"}}
        ],
        "edges": [
          {"id": "edge_0-1", "source": "node_0", "target": "node_1"},
          {"id": "edge_1-2", "source": "node_1", "target": "node_2"}
        ]
      }
      Strictly output only the JSON object. Do not include any other text or formatting outside the JSON.
      Your response should begin with a JSON object.
    `;

    const userMessage = `Design a workflow for: "${prompt}"`;

    // Anthropic's messages API call
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620", // Or "claude-3-opus-20240229" for more complex tasks, or "claude-3-haiku-20240307" for faster/cheaper
      max_tokens: 2000, // Set an appropriate max_tokens for your expected output
      temperature: 0.7, // Adjust creativity
      system: systemMessage, // System instructions go here
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userMessage,
            },
          ],
        },
      ],
    });

    // Extract text content from Anthropic's response
    let content: string = "";
    for (const block of msg.content) {
      if (block.type === "text") {
        content += block.text;
      }
    }

    if (!content) {
      console.error("Anthropic API returned no text content:", msg);
      throw new Error("AI did not return any text content.");
    }

    console.log("Anthropic API response length:", content.length);

    // Anthropic doesn't have a direct `response_format: { type: "json_object" }`
    // like OpenAI. You need to enforce JSON output through prompt engineering
    // and then carefully parse the result. Sometimes, Claude might still
    // include conversational text or markdown.
    // We'll try to extract the JSON block if it's wrapped in markdown.
    let jsonString = content.trim();
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.substring(7, jsonString.lastIndexOf('```')).trim();
    } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.substring(3, jsonString.lastIndexOf('```')).trim();
    }


    // --- Step 2: Parse and validate the AI's output ---
    let workflowData: { nodes: Node[]; edges: Edge[] };
    try {
      workflowData = JSON.parse(jsonString);
      // Basic validation: ensure it has nodes and edges arrays
      if (!Array.isArray(workflowData.nodes) || !Array.isArray(workflowData.edges)) {
        throw new Error("AI output is not a valid workflow structure (missing nodes or edges array).");
      }
      console.log(`Successfully parsed workflow: ${workflowData.nodes.length} nodes, ${workflowData.edges.length} edges`);
    } catch (parseError) {
      console.error("Failed to parse AI response. Raw content:", content);
      console.error("Extracted JSON string:", jsonString);
      console.error("Parse error:", parseError);
      return NextResponse.json(
        { 
          error: 'Failed to parse AI workflow response. Please try again.',
          details: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
        },
        { status: 500 }
      );
    }

    // --- Step 3: Enhance/Correct AI generated data (optional but recommended) ---
    let currentNodeIdCounter = 1; // Start counter for new IDs
    const processedNodes: Node[] = workflowData.nodes.map((node) => {
      // Ensure unique IDs if AI duplicates them, or just standardize
      if (!node.id || !node.id.startsWith("node_")) {
        node.id = `node_${currentNodeIdCounter++}`;
      } else {
        const idNum = parseInt(node.id.split('_')[1], 10);
        if (!isNaN(idNum)) {
            currentNodeIdCounter = Math.max(currentNodeIdCounter, idNum + 1);
        }
      }

      // Ensure data.nodeType and data.nodeName are present
      node.data = {
        ...node.data,
        nodeType: node.type,
        nodeName: node.data?.nodeName || node.type, // Fallback
      };
      return node;
    });

    const processedEdges: Edge[] = workflowData.edges.map((edge) => {
      if (!edge.id) {
        edge.id = `${edge.source}-${edge.target}`; // Simple ID generation
      }
      return edge;
    });

    return NextResponse.json({
      nodes: processedNodes,
      edges: processedEdges,
    });

  } catch (error) {
    console.error('API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to generate workflow',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}