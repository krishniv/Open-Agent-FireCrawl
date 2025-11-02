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

    // --- Step 1: Build prompt (ultra-optimized) ---
    const systemMessage = `Design workflows. JSON only.

NODES: start,end,agent,transform,if-else,while
REQ: id,type,position{x,y},data{nodeType,nodeName,label}

START: data{inputVariables:[{name:"var",type:"string",required:true,description:"desc",defaultValue:"opt"}]}
AGENT: data{instructions:"task. {{input.var}} or {{lastOutput}}",model:"anthropic/claude-sonnet-4-20250514",outputFormat:"Text",mcpTools:[{name:"Firecrawl",url:"https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp",accessToken:"$"+"{FIRECRAWL_API_KEY}"}]}
END: data{nodeType:"end"}
TRANSFORM: data{transformScript:"JS code"}
IF-ELSE: data{condition:"JS expr"}
WHILE: data{whileCondition:"iter<=5",maxIterations:10}
EDGES: [{id:"e1",source:"n1",target:"n2"}]

EX: {"nodes":[{"id":"start","type":"start","position":{"x":100,"y":200},"data":{"nodeType":"start","nodeName":"Start","label":"Start","inputVariables":[{"name":"q","type":"string","required":true,"description":"Query"}]}},{"id":"a1","type":"agent","position":{"x":350,"y":200},"data":{"nodeType":"agent","nodeName":"R","label":"R","instructions":"firecrawl_search {{input.q}} then firecrawl_scrape. Summary.","model":"anthropic/claude-sonnet-4-20250514","outputFormat":"Text","mcpTools":[{"name":"Firecrawl","url":"https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp","accessToken":"$"+"{FIRECRAWL_API_KEY}"}]}},{"id":"end","type":"end","position":{"x":600,"y":200},"data":{"nodeType":"end","nodeName":"End","label":"End"}}],"edges":[{"id":"e1","source":"start","target":"a1"},{"id":"e2","source":"a1","target":"end"}]}

R: 1) Start/end req 2) Start MUST inputVariables[{name,type,required,description,defaultValue?}] 3) Unique IDs 4) x:250-350 5) Web: Agent+mcpTools,"firecrawl_search then firecrawl_scrape" 6) Multi-agent:"{{lastOutput}} contains [struct]. Format..." 7) ONLY {{lastOutput}} or {{input.name}} 8) JSON only
    `;

    const userMessage = `Design a workflow for: "${prompt}"`;

    console.log('Calling Anthropic API with:', prompt);

    const msg = await anthropic.messages.create({
      model: getDefaultModel('anthropic'),
      max_tokens: 2000, // Reduced from 4000 to save tokens
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
