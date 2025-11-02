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
      You are an AI assistant that designs workflow diagrams.
      Given a user's request, generate a list of workflow nodes and edges in JSON format.
      The workflow should start with a "start" node and end with an "end" node.
      Node types: "start", "end", "agent", "mcp", "if-else", "while", "user-approval", "transform", "extract", "http", "set-state", "note".
      Each node must have:
        - id (unique, like "node_X")
        - type (from above list)
        - position (x, y numbers)
        - data (with nodeType and nodeName)
      Each edge must have:
        - id
        - source
        - target
        - optional label

      Example:
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

      IMPORTANT: Output ONLY valid JSON. No markdown, code fences, or commentary.
    `;

    const userMessage = `Design a workflow for: "${prompt}"`;

    console.log('🧠 Calling Anthropic API with:', prompt);

    const msg = await anthropic.messages.create({
      model: getDefaultModel('anthropic'),
      max_tokens: 4000,
      temperature: 0.3,
      system: systemMessage,
      messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
    });

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
      console.error('❌ JSON parse error:', err);
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

    const processedNodes: Node[] = workflowData.nodes.map((node: any, index: number) => {
      // Ensure unique ID
      if (!node.id?.startsWith('node_')) {
        node.id = `node_${currentNodeIdCounter++}`;
      } else {
        const idNum = parseInt(node.id.split('_')[1], 10);
        if (!isNaN(idNum)) currentNodeIdCounter = Math.max(currentNodeIdCounter, idNum + 1);
      }

      // Ensure position
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        node.position = { x: 250 + index * 300, y: 250 };
      }

      // Ensure type and data
      node.type = node.type || node.data?.nodeType || 'agent';
      node.data = {
        nodeType: node.data?.nodeType || node.type,
        nodeName:
          node.data?.nodeName || node.data?.name || node.type.charAt(0).toUpperCase() + node.type.slice(1),
      };

      return node;
    });

    const processedEdges: Edge[] = workflowData.edges.map((edge: any) => {
      if (!edge.source || !edge.target) {
        throw new Error(`Invalid edge missing source/target: ${JSON.stringify(edge)}`);
      }
      edge.id = edge.id || `edge-${edge.source}-${edge.target}`;
      return edge;
    });

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
