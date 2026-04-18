import pg from 'pg';
import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

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

const localPool = new pg.Pool({
  connectionString: LOCAL_DB,
});

const sql = neon(PROD_DB);

async function runComparison() {
  try {
    console.log('\n\n=== ADDITIONAL DEEP ANALYSIS ===\n');

    // Check for agents in the workflow that are missing from prod
    console.log('A. AGENTS REFERENCED IN WORKFLOWS:\n');

    const localWorkflowRes = await localPool.query(
      `SELECT id, name, steps FROM workflows WHERE id = '911f2928-c158-4421-b249-41dc12612819'`
    );

    if (localWorkflowRes.rows.length > 0) {
      const workflow = localWorkflowRes.rows[0];
      const agentRefs = new Set();
      
      function extractAgents(obj) {
        if (Array.isArray(obj)) {
          obj.forEach(extractAgents);
        } else if (typeof obj === 'object' && obj !== null) {
          if (obj.agent && typeof obj.agent === 'string' && !obj.agent.includes('{{')) {
            agentRefs.add(obj.agent);
          }
          Object.values(obj).forEach(extractAgents);
        }
      }
      
      extractAgents(workflow.steps);
      console.log('LOCAL workflow references agents:');
      [...agentRefs].forEach(agent => console.log(`  - ${agent}`));
    }

    // Check channel capabilities
    console.log('\n\nB. WORKFLOW STEP DIFFERENCES (write_canvas operations):\n');

    const localWorkflowRes2 = await localPool.query(
      `SELECT steps FROM workflows WHERE id = '911f2928-c158-4421-b249-41dc12612819'`
    );

    const prodWorkflowRes2 = await sql`SELECT steps FROM workflows WHERE id = '6330f1f1-46dd-4652-88d1-4b18a878eefe'`;

    if (localWorkflowRes2.rows.length > 0) {
      const localSteps = localWorkflowRes2.rows[0].steps;
      const writeCanvasSteps = localSteps.filter(s => s.type === 'write_canvas');
      
      console.log('LOCAL workflow write_canvas steps:');
      writeCanvasSteps.forEach((step, idx) => {
        console.log(`  Step ${idx}: channel="${step.channel}", title="${step.title}"`);
      });
    }

    if (prodWorkflowRes2.length > 0) {
      const prodSteps = prodWorkflowRes2[0].steps;
      const writeCanvasSteps = prodSteps.filter(s => s.type === 'write_canvas');
      
      console.log('\nPROD workflow write_canvas steps:');
      writeCanvasSteps.forEach((step, idx) => {
        console.log(`  Step ${idx}: channel="${step.channel}", title="${step.title}"`);
      });
    }

    // Check for agents with null or missing agent_card_json
    console.log('\n\nC. AGENT REGISTRATION ISSUES:\n');

    const localBadAgentsRes = await localPool.query(
      `SELECT id, display_name, a2a_id, a2a_url, agent_card_json FROM users WHERE is_agent = true AND (a2a_url IS NULL OR agent_card_json IS NULL OR agent_card_json = '{}')`
    );

    console.log(`LOCAL: ${localBadAgentsRes.rows.length} agents with missing/incomplete registration:`);
    localBadAgentsRes.rows.forEach(agent => {
      console.log(`  - ${agent.display_name} (a2a_id: ${agent.a2a_id})`);
      console.log(`    a2a_url: ${agent.a2a_url}`);
      console.log(`    agent_card_json: ${agent.agent_card_json ? JSON.stringify(agent.agent_card_json) : 'NULL'}`);
    });

    const prodBadAgentsRows = await sql`SELECT id, display_name, a2a_id, a2a_url, agent_card_json FROM users WHERE is_agent = true AND (a2a_url IS NULL OR agent_card_json IS NULL OR agent_card_json = '{}')`;

    console.log(`\nPROD: ${prodBadAgentsRows.length} agents with missing/incomplete registration:`);
    prodBadAgentsRows.forEach(agent => {
      console.log(`  - ${agent.display_name} (a2a_id: ${agent.a2a_id})`);
      console.log(`    a2a_url: ${agent.a2a_url}`);
      console.log(`    agent_card_json: ${agent.agent_card_json ? JSON.stringify(agent.agent_card_json) : 'NULL'}`);
    });

    // Check for automation/engagement that might cause unintended agent responses
    console.log('\n\nD. POTENTIAL AUTO-RESPONSE TRIGGERS:\n');

    const localAutoResponseRes = await localPool.query(
      `SELECT u.display_name, MAX(cm.auto_response_count) as max_count, MAX(cm.last_auto_response_at) as last_response 
       FROM channel_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE u.is_agent = true AND cm.auto_response_count > 0
       GROUP BY u.id, u.display_name`
    );

    console.log(`LOCAL: Agents with auto-response activity:`);
    if (localAutoResponseRes.rows.length === 0) {
      console.log('  None');
    } else {
      localAutoResponseRes.rows.forEach(row => {
        console.log(`  - ${row.display_name}: ${row.max_count} auto-responses, last: ${row.last_response}`);
      });
    }

    const prodAutoResponseRows = await sql`SELECT u.display_name, MAX(cm.auto_response_count) as max_count, MAX(cm.last_auto_response_at) as last_response 
       FROM channel_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE u.is_agent = true AND cm.auto_response_count > 0
       GROUP BY u.id, u.display_name`;

    console.log(`\nPROD: Agents with auto-response activity:`);
    if (prodAutoResponseRows.length === 0) {
      console.log('  None');
    } else {
      prodAutoResponseRows.forEach(row => {
        console.log(`  - ${row.display_name}: ${row.max_count} auto-responses, last: ${row.last_response}`);
      });
    }

    // Check canvas table differences
    console.log('\n\nE. CANVASES TABLE DIFFERENCES:\n');

    const localCanvasColsRes = await localPool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY ordinal_position`
    );

    const prodCanvasColsRes = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY ordinal_position`;

    const localCols = new Set(localCanvasColsRes.rows.map(c => c.column_name));
    const prodCols = new Set(prodCanvasColsRes.rows.map(c => c.column_name));

    const missingInProd = [...localCols].filter(c => !prodCols.has(c));
    const extraInProd = [...prodCols].filter(c => !localCols.has(c));

    console.log('LOCAL canvases columns missing in PROD:');
    if (missingInProd.length === 0) {
      console.log('  None');
    } else {
      missingInProd.forEach(col => console.log(`  - ${col}`));
    }

    console.log('\nPROD canvases columns not in LOCAL:');
    if (extraInProd.length === 0) {
      console.log('  None');
    } else {
      extraInProd.forEach(col => console.log(`  - ${col}`));
    }

  } catch (error) {
    console.error('Error during comparison:', error);
  } finally {
    await localPool.end();
  }
}

runComparison();
