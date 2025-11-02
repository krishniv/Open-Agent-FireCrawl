# Open Agent Builder

**Build, test, and deploy AI agent workflows with a visual no-code interface**

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Firecrawl](https://img.shields.io/badge/Powered%20by-Firecrawl-orange)](https://firecrawl.dev)

---

## What is Open Agent Builder?

Open Agent Builder is a visual workflow builder for creating AI agent pipelines powered by [Firecrawl](https://firecrawl.dev). Design complex agent workflows with a drag-and-drop interface or use AI to generate them from natural language prompts.

**Perfect for:**
- Web scraping and data extraction workflows
- Multi-step AI agent pipelines
- Automated research and content generation
- Data transformation and analysis

---

## Key Features

### Visual Workflow Builder
- **Drag-and-drop interface** for building agent workflows
- **Prompt-based workflow generation** - Describe what you want, AI builds it
- **Real-time execution** with streaming updates
- **Core node types**: Start, Agent, Transform, If/Else, While Loop, End
- **MCP protocol support** for Firecrawl and other tools

### Powered by Firecrawl
- **Native Firecrawl integration** for web scraping and searching
- Agents can intelligently use Firecrawl tools for web research

---

## Quick Start

### Prerequisites
1. **Node.js 18+**
2. **Firecrawl API key** - [Get one here](https://firecrawl.dev)
3. **Convex account** - [Sign up free](https://convex.dev)
4. **Clerk account** - [Sign up free](https://clerk.com)

### Installation

```bash
# Clone and install
git clone https://github.com/firecrawl/open-agent-builder.git
cd open-agent-builder
npm install

# Set up Convex
npm install -g convex
npx convex dev  # Follow prompts to create/link project

# Run the app
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Configuration

Create `.env.local`:

```bash
# Convex (from npx convex dev)
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-domain.clerk.accounts.dev

# Firecrawl (Required)
FIRECRAWL_API_KEY=fc-...

# Optional: Default LLM Provider (or add via UI Settings)
ANTHROPIC_API_KEY=sk-ant-...  # Recommended for MCP support
```

Update `convex/auth.config.ts` with your Clerk domain, then run `npx convex dev`.

---

## Creating Workflows

### Option 1: Prompt-Based Creation

1. Click **"New Workflow"** in the workflow builder
2. Use the **prompt console** at the bottom of the page
3. Describe your workflow in natural language:
   ```
   "Create a workflow that searches the web for crypto news, 
   scrapes the top 5 articles, and generates a formatted report"
   ```
4. Click **"Build Workflow"** - AI generates the workflow structure
5. Review and customize nodes as needed

**Example prompts:**
- "Build a workflow to research stock prices on Yahoo Finance"
- "Create a web scraper that extracts product data and summarizes it"
- "Make a workflow that searches Google, analyzes results, and formats a report"

### Option 2: Manual Builder

1. Click **"New Workflow"**
2. Drag nodes from the sidebar
3. Connect nodes to create your flow
4. Configure each node's settings

### Node Types

| Node | Purpose |
|------|---------|
| **Start** | Define input variables for the workflow |
| **Agent** | AI reasoning with LLMs. Can use Firecrawl tools for web research |
| **Transform** | JavaScript code for data manipulation |
| **If/Else** | Conditional branching based on conditions |
| **While** | Loop to iterate over data |
| **End** | Workflow completion and output |

---

## Using Firecrawl in Workflows

### Agent with Firecrawl Tools

1. Add an **Agent** node
2. In node settings, enable **MCP Tools**
3. Select **Firecrawl**
4. In instructions, tell the agent to use Firecrawl:
   ```
   "Use firecrawl_search to find information about {{input.topic}}, 
   then use firecrawl_scrape to get detailed content from the top results"
   ```

The agent will automatically use Firecrawl tools when needed based on your instructions.

---

## Running Workflows

1. Click **"Run"** in the workflow builder
2. Enter input values (if the workflow has inputs)
3. Watch real-time execution with streaming updates
4. View results in the execution panel

---

## API Keys

Add API keys via **Settings → API Keys**:
- **Anthropic Claude** (Recommended - Native MCP support)
- **OpenAI** (MCP support coming soon)
- **Groq** (MCP support coming soon)
- **Firecrawl** (Optional - falls back to environment variable)

---

## Tech Stack

- **Next.js 16** - React framework
- **LangGraph** - Workflow orchestration
- **Convex** - Real-time database
- **Clerk** - Authentication
- **React Flow** - Visual workflow builder
- **Anthropic Claude** - LLM with native MCP support
- **Firecrawl** - Web scraping and search

---

## Deployment

### Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables (see Configuration section)
4. Deploy Convex: `npx convex deploy`

### Required Environment Variables
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `FIRECRAWL_API_KEY`

### Optional
- `ANTHROPIC_API_KEY` (or add via UI)
- `E2B_API_KEY` (for sandboxed code execution)

---

## API Usage

Generate an API key in **Settings → API Keys**, then:

```bash
curl -X POST https://your-domain.com/api/workflows/workflow-id/execute-stream \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"input": "your input here"}'
```

Returns Server-Sent Events (SSE) stream with real-time updates.

---

## License

MIT License

**[Star us on GitHub](https://github.com/firecrawl/open-agent-builder)** | **[Try Firecrawl](https://firecrawl.dev)**
