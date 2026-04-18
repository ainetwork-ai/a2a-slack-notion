import pg from 'pg';
import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

// Load environment variables from .env.local
const envPath = '/mnt/newdata/git/slack-a2a/slack/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

const LOCAL_DB = 'postgresql://slack:slack@localhost:5433/slack_a2a';
const PROD_DB = envVars.DATABASE_URL;

console.log('LOCAL_DB:', LOCAL_DB);
console.log('PROD_DB (masked):', PROD_DB.substring(0, 50) + '...');

// Local DB connection
const localPool = new pg.Pool({
  connectionString: LOCAL_DB,
});

// Prod DB connection
const sql = neon(PROD_DB);

async function runComparison() {
  try {
    console.log('\n===========================================');
    console.log('DATABASE COMPARISON: LOCAL vs PROD (Neon)');
    console.log('===========================================\n');

    // 1. WORKFLOW STEPS COMPARISON
    console.log('1. WORKFLOW STEPS COMPARISON');
    console.log('----------------------------');
    
    const localWorkflowRes = await localPool.query(
      `SELECT id, name, trigger_config, steps FROM workflows WHERE id = '911f2928-c158-4421-b249-41dc12612819'`
    );
    
    const prodWorkflowRows = await sql`SELECT id, name, trigger_config, steps FROM workflows WHERE id = '6330f1f1-46dd-4652-88d1-4b18a878eefe'`;

    if (localWorkflowRes.rows.length === 0) {
      console.log('LOCAL: Workflow not found (id=911f2928-c158-4421-b249-41dc12612819)');
    } else {
      const lw = localWorkflowRes.rows[0];
      console.log('LOCAL Workflow:');
      console.log('  ID:', lw.id);
      console.log('  Name:', lw.name);
      console.log('  Trigger Config:', JSON.stringify(lw.trigger_config, null, 2));
      console.log('  Steps:', JSON.stringify(lw.steps, null, 2));
    }

    if (prodWorkflowRows.length === 0) {
      console.log('\nPROD: Workflow not found (id=6330f1f1-46dd-4652-88d1-4b18a878eefe)');
    } else {
      const pw = prodWorkflowRows[0];
      console.log('\nPROD Workflow:');
      console.log('  ID:', pw.id);
      console.log('  Name:', pw.name);
      console.log('  Trigger Config:', JSON.stringify(pw.trigger_config, null, 2));
      console.log('  Steps:', JSON.stringify(pw.steps, null, 2));
    }

    if (localWorkflowRes.rows.length > 0 && prodWorkflowRows.length > 0) {
      const lw = localWorkflowRes.rows[0];
      const pw = prodWorkflowRows[0];
      const stepsMatch = JSON.stringify(lw.steps) === JSON.stringify(pw.steps);
      const triggerMatch = JSON.stringify(lw.trigger_config) === JSON.stringify(pw.trigger_config);
      console.log('\nDIFFERENCES:');
      console.log('  Steps identical:', stepsMatch);
      console.log('  Trigger Config identical:', triggerMatch);
    }

    // 2. AGENT REGISTRATION COMPARISON
    console.log('\n\n2. AGENT REGISTRATION COMPARISON');
    console.log('-----------------------------------');

    const localAgentsRes = await localPool.query(
      `SELECT id, a2a_id, display_name, a2a_url, agent_card_json FROM users WHERE is_agent = true ORDER BY display_name`
    );

    const prodAgentsRows = await sql`SELECT id, a2a_id, display_name, a2a_url, agent_card_json FROM users WHERE is_agent = true ORDER BY display_name`;

    console.log(`LOCAL: ${localAgentsRes.rows.length} agents found`);
    localAgentsRes.rows.forEach(agent => {
      const agentUrl = agent.agent_card_json?.url || 'N/A';
      console.log(`  - ${agent.display_name} (a2a_id: ${agent.a2a_id})`);
      console.log(`    a2a_url: ${agent.a2a_url}`);
      console.log(`    agent_card_json.url: ${agentUrl}`);
      console.log(`    Uses a2a-agents.vercel.app: ${agentUrl.includes('a2a-agents.vercel.app')}`);
    });

    console.log(`\nPROD: ${prodAgentsRows.length} agents found`);
    prodAgentsRows.forEach(agent => {
      const agentUrl = agent.agent_card_json?.url || 'N/A';
      console.log(`  - ${agent.display_name} (a2a_id: ${agent.a2a_id})`);
      console.log(`    a2a_url: ${agent.a2a_url}`);
      console.log(`    agent_card_json.url: ${agentUrl}`);
      console.log(`    Uses a2a-agents.vercel.app: ${agentUrl.includes('a2a-agents.vercel.app')}`);
    });

    // Check differences
    console.log('\nDIFFERENCES:');
    const localAgentSet = new Set(localAgentsRes.rows.map(a => a.a2a_id));
    const prodAgentSet = new Set(prodAgentsRows.map(a => a.a2a_id));
    
    const missingInProd = [...localAgentSet].filter(id => !prodAgentSet.has(id));
    const extraInProd = [...prodAgentSet].filter(id => !localAgentSet.has(id));
    
    if (missingInProd.length > 0) {
      console.log(`  Missing in PROD: ${missingInProd.join(', ')}`);
    }
    if (extraInProd.length > 0) {
      console.log(`  Extra in PROD: ${extraInProd.join(', ')}`);
    }

    // Check agent_card_json URLs
    const localBadUrls = localAgentsRes.rows.filter(a => !a.agent_card_json?.url?.includes('a2a-agents.vercel.app'));
    const prodBadUrls = prodAgentsRows.filter(a => !a.agent_card_json?.url?.includes('a2a-agents.vercel.app'));
    
    if (localBadUrls.length > 0) {
      console.log(`  LOCAL agents with non-vercel URLs: ${localBadUrls.map(a => a.display_name).join(', ')}`);
    }
    if (prodBadUrls.length > 0) {
      console.log(`  PROD agents with non-vercel URLs: ${prodBadUrls.map(a => a.display_name).join(', ')}`);
    }

    // 3. CHANNEL MEMBERS COMPARISON
    console.log('\n\n3. CHANNEL MEMBERS COMPARISON');
    console.log('------------------------------');

    const localChannelRes = await localPool.query(
      `SELECT c.id, c.name FROM channels WHERE name = 'unblockmedia-test-1'`
    );

    const prodChannelRows = await sql`SELECT c.id, c.name FROM channels WHERE name = 'unblockmedia'`;

    let localChannelId = null;
    let prodChannelId = null;

    if (localChannelRes.rows.length > 0) {
      localChannelId = localChannelRes.rows[0].id;
      console.log(`LOCAL: Channel "unblockmedia-test-1" found (id: ${localChannelId})`);

      const localMembersRes = await localPool.query(
        `SELECT u.display_name, u.is_agent, cm.engagement_level FROM channel_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.channel_id = $1
         ORDER BY u.display_name`,
        [localChannelId]
      );

      console.log(`  Members (${localMembersRes.rows.length}):`);
      localMembersRes.rows.forEach(member => {
        console.log(`    - ${member.display_name} (is_agent: ${member.is_agent}, engagement_level: ${member.engagement_level})`);
      });
    } else {
      console.log('LOCAL: Channel "unblockmedia-test-1" NOT found');
    }

    if (prodChannelRows.length > 0) {
      prodChannelId = prodChannelRows[0].id;
      console.log(`\nPROD: Channel "unblockmedia" found (id: ${prodChannelId})`);

      const prodMembersRows = await sql`SELECT u.display_name, u.is_agent, cm.engagement_level FROM channel_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.channel_id = ${prodChannelId}
         ORDER BY u.display_name`;

      console.log(`  Members (${prodMembersRows.length}):`);
      prodMembersRows.forEach(member => {
        console.log(`    - ${member.display_name} (is_agent: ${member.is_agent}, engagement_level: ${member.engagement_level})`);
      });
    } else {
      console.log('PROD: Channel "unblockmedia" NOT found');
    }

    // 4. AUTO-ENGAGE SETTINGS COMPARISON
    console.log('\n\n4. AUTO-ENGAGE SETTINGS COMPARISON');
    console.log('------------------------------------');

    if (localChannelId) {
      const localEngageRes = await localPool.query(
        `SELECT u.display_name, u.is_agent, cm.engagement_level FROM channel_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.channel_id = $1 AND u.is_agent = true AND cm.engagement_level > 0
         ORDER BY cm.engagement_level DESC`,
        [localChannelId]
      );

      console.log(`LOCAL: Agents with auto-engagement (engagement_level > 0):`);
      if (localEngageRes.rows.length === 0) {
        console.log('  None');
      } else {
        localEngageRes.rows.forEach(agent => {
          console.log(`  - ${agent.display_name} (engagement_level: ${agent.engagement_level})`);
        });
      }
    }

    if (prodChannelId) {
      const prodEngageRows = await sql`SELECT u.display_name, u.is_agent, cm.engagement_level FROM channel_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.channel_id = ${prodChannelId} AND u.is_agent = true AND cm.engagement_level > 0
         ORDER BY cm.engagement_level DESC`;

      console.log(`\nPROD: Agents with auto-engagement (engagement_level > 0):`);
      if (prodEngageRows.length === 0) {
        console.log('  None');
      } else {
        prodEngageRows.forEach(agent => {
          console.log(`  - ${agent.display_name} (engagement_level: ${agent.engagement_level})`);
        });
      }
    }

    // 5. CANVAS/BLOCKS TABLES EXISTENCE
    console.log('\n\n5. CANVAS/BLOCKS TABLES STRUCTURE');
    console.log('-----------------------------------');

    const localCanvasColsRes = await localPool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY column_name`
    );

    const prodCanvasCols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY column_name`;

    console.log('LOCAL canvases table columns:');
    if (localCanvasColsRes.rows.length === 0) {
      console.log('  TABLE NOT FOUND');
    } else {
      localCanvasColsRes.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    console.log('\nPROD canvases table columns:');
    if (prodCanvasCols.length === 0) {
      console.log('  TABLE NOT FOUND');
    } else {
      prodCanvasCols.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    const localBlocksColsRes = await localPool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blocks' ORDER BY column_name`
    );

    const prodBlocksCols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blocks' ORDER BY column_name`;

    console.log('\nLOCAL blocks table columns:');
    if (localBlocksColsRes.rows.length === 0) {
      console.log('  TABLE NOT FOUND');
    } else {
      localBlocksColsRes.rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    console.log('\nPROD blocks table columns:');
    if (prodBlocksCols.length === 0) {
      console.log('  TABLE NOT FOUND');
    } else {
      prodBlocksCols.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
    }

    // Check for page_id in canvases
    const localHasPageId = localCanvasColsRes.rows.some(col => col.column_name === 'page_id');
    const prodHasPageId = prodCanvasCols.some(col => col.column_name === 'page_id');

    console.log(`\nDIFFERENCES:`);
    console.log(`  LOCAL has page_id column: ${localHasPageId}`);
    console.log(`  PROD has page_id column: ${prodHasPageId}`);

    // 6. WORKFLOW TRIGGER CONFIG
    console.log('\n\n6. WORKFLOW TRIGGER CONFIG COMPARISON');
    console.log('---------------------------------------');

    const localWorkflowsRes = await localPool.query(
      `SELECT id, name, trigger_config FROM workflows WHERE trigger_type = 'channel_message' LIMIT 5`
    );

    const prodWorkflowsRows = await sql`SELECT id, name, trigger_config FROM workflows WHERE trigger_type = 'channel_message' LIMIT 5`;

    console.log(`LOCAL: ${localWorkflowsRes.rows.length} channel_message workflows`);
    localWorkflowsRes.rows.forEach(wf => {
      const channelId = wf.trigger_config?.channelId;
      console.log(`  - ${wf.name}`);
      console.log(`    trigger_config.channelId: ${channelId}`);
      if (localChannelId && channelId === localChannelId) {
        console.log(`    ^ Targets local unblockmedia-test-1 channel`);
      }
    });

    console.log(`\nPROD: ${prodWorkflowsRows.length} channel_message workflows`);
    prodWorkflowsRows.forEach(wf => {
      const channelId = wf.trigger_config?.channelId;
      console.log(`  - ${wf.name}`);
      console.log(`    trigger_config.channelId: ${channelId}`);
      if (prodChannelId && channelId === prodChannelId) {
        console.log(`    ^ Targets prod unblockmedia channel`);
      }
    });

    console.log('\n\n===========================================');
    console.log('COMPARISON COMPLETE');
    console.log('===========================================');

  } catch (error) {
    console.error('Error during comparison:', error);
  } finally {
    await localPool.end();
  }
}

runComparison();
