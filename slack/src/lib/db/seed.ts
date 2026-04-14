import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

const UNBLOCKMEDIA_A2A_URL = "https://api.unblockmedia.com";

const AGENTS = [
  { name: "Techa", beat: "Technology", archetype: "Bill Gates" },
  { name: "Roy", beat: "Policy", archetype: "Warren Buffett" },
  { name: "April", beat: "Web3/Culture", archetype: "Cathie Wood" },
  { name: "Mark", beat: "Market", archetype: "Ray Dalio" },
  { name: "Max", beat: "Bitcoin", archetype: "Michael Saylor" },
  { name: "Victoria", beat: "Risk Assessment", archetype: "Janet Yellen" },
  { name: "Logan", beat: "Calibration", archetype: "Nate Silver" },
];

const DEFAULT_CHANNELS = [
  { name: "general", description: "General discussion for the team" },
  { name: "market-predictions", description: "Agent predictions and market analysis" },
  { name: "agent-chat", description: "Chat with AI agents directly" },
  { name: "random", description: "Off-topic conversations and fun" },
];

async function seed() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  console.log("Seeding database...\n");

  // Create agent users
  const agentUsers = [];
  for (const agent of AGENTS) {
    const ainAddress = `agent-${agent.name.toLowerCase()}-unblockmedia`;
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.ainAddress, ainAddress))
      .limit(1);

    if (existing) {
      console.log(`  Agent ${agent.name} already exists, skipping`);
      agentUsers.push(existing);
      continue;
    }

    const [user] = await db
      .insert(schema.users)
      .values({
        ainAddress,
        displayName: `${agent.name} (${agent.archetype})`,
        isAgent: true,
        a2aUrl: UNBLOCKMEDIA_A2A_URL,
        status: "online",
        agentCardJson: {
          name: `UnblockMedia ${agent.name}`,
          description: `${agent.beat} reporter - ${agent.archetype} archetype`,
          version: "1.0.0",
          url: UNBLOCKMEDIA_A2A_URL,
          capabilities: { streaming: false },
          defaultInputModes: ["text/plain"],
          defaultOutputModes: ["text/plain"],
          skills: [
            {
              id: "market-prediction",
              name: "Market Prediction",
              description: "Get crypto market predictions",
              tags: ["crypto", "prediction", "polymarket"],
            },
            {
              id: "knowledge-exploration",
              name: "Knowledge Exploration",
              description: "Explore the agent knowledge graph",
              tags: ["knowledge-graph", "memory", "patterns"],
            },
            {
              id: "lesson-recording",
              name: "Lesson Recording",
              description: "Record a market lesson to the knowledge graph",
              tags: ["lesson", "insight", "knowledge-graph"],
            },
          ],
        },
      })
      .returning();

    console.log(`  Created agent: ${agent.name} (${agent.beat})`);
    agentUsers.push(user);
  }

  // Create default channels
  const channelRecords = [];
  for (const ch of DEFAULT_CHANNELS) {
    const [existing] = await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.name, ch.name))
      .limit(1);

    if (existing) {
      console.log(`  Channel #${ch.name} already exists, skipping`);
      channelRecords.push(existing);
      continue;
    }

    const [channel] = await db
      .insert(schema.channels)
      .values({
        name: ch.name,
        description: ch.description,
      })
      .returning();

    console.log(`  Created channel: #${ch.name}`);
    channelRecords.push(channel);
  }

  // Add all agents to #market-predictions and #agent-chat channels
  const predictionsChannel = channelRecords.find((c) => c.name === "market-predictions");
  const agentChatChannel = channelRecords.find((c) => c.name === "agent-chat");
  const generalChannel = channelRecords.find((c) => c.name === "general");

  for (const agent of agentUsers) {
    for (const channel of [predictionsChannel, agentChatChannel]) {
      if (!channel) continue;
      try {
        await db
          .insert(schema.channelMembers)
          .values({
            channelId: channel.id,
            userId: agent.id,
            role: "member",
          })
          .onConflictDoNothing();
      } catch {
        // already exists
      }
    }
  }
  console.log("\n  Added agents to #market-predictions and #agent-chat");

  // Add welcome messages
  if (generalChannel && agentUsers.length > 0) {
    const techa = agentUsers.find((a) => a.displayName.includes("Techa"));
    if (techa) {
      try {
        await db.insert(schema.messages).values({
          channelId: generalChannel.id,
          userId: techa.id,
          content:
            "Welcome to Slack-A2A! I'm Techa, your Technology reporter. Ask me about crypto market predictions by mentioning me with @Techa. You can also invite more A2A agents using the + button in the Agents section.",
          contentType: "agent-response",
        });
        console.log("  Added welcome message from Techa");
      } catch {
        // message might already exist
      }
    }
  }

  console.log("\nSeed complete!");
}

seed().catch(console.error);
