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
    console.log('\n\nI. CRITICAL ISSUES SUMMARY\n');
    console.log('='.repeat(80));

    // Get the two workflows side by side
    const localWfRes = await localPool.query(
      `SELECT id, name, enabled, trigger_type, trigger_config FROM workflows ORDER BY created_at DESC LIMIT 5`
    );

    const prodWfRes = await sql`SELECT id, name, enabled, trigger_type, trigger_config FROM workflows ORDER BY created_at DESC LIMIT 5`;

    console.log('\nWORKFLOWS:');
    console.log('LOCAL workflows:');
    localWfRes.rows.forEach(wf => {
      console.log(`  - "${wf.name}" (enabled: ${wf.enabled}, trigger: ${wf.trigger_type})`);
    });

    console.log('\nPROD workflows:');
    prodWfRes.forEach(wf => {
      console.log(`  - "${wf.name}" (enabled: ${wf.enabled}, trigger: ${wf.trigger_type})`);
    });

    // Check if the two main workflows have correct references
    console.log('\n\nWORKFLOW CHANNEL REFERENCES:');
    
    const localChannelRes = await localPool.query(`
      SELECT c.id, c.name FROM channels WHERE name = 'unblockmedia-test-1'
    `);
    
    const prodChannelRes = await sql`SELECT c.id, c.name FROM channels WHERE name = 'unblockmedia'`;

    const localChannelId = localChannelRes.rows[0]?.id;
    const prodChannelId = prodChannelRes[0]?.id;

    console.log(`LOCAL unblockmedia-test-1 channel ID: ${localChannelId}`);
    console.log(`PROD unblockmedia channel ID: ${prodChannelId}`);

    const localUnblockWf = localWfRes.rows.find(w => w.name.includes('편집'));
    const prodUnblockWf = prodWfRes.find(w => w.name.includes('Editorial'));

    if (localUnblockWf) {
      console.log(`\nLOCAL "Unblock 편집" workflow's trigger_config.channelId: ${localUnblockWf.trigger_config?.channelId}`);
      console.log(`  Points to correct channel: ${localUnblockWf.trigger_config?.channelId === localChannelId}`);
    }

    if (prodUnblockWf) {
      console.log(`PROD "Unblock Editorial" workflow's trigger_config.channelId: ${prodUnblockWf.trigger_config?.channelId}`);
      console.log(`  Points to correct channel: ${prodUnblockWf.trigger_config?.channelId === prodChannelId}`);
    }

    // Check for agents in prod channel that might be interfering
    console.log('\n\nAGENTS IN PROD CHANNEL (unblockmedia):');
    const prodChannelAgents = await sql`SELECT DISTINCT u.display_name, u.a2a_id, cm.engagement_level 
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.channel_id = ${prodChannelId} AND u.is_agent = true
      ORDER BY u.display_name`;

    console.log(`Total: ${prodChannelAgents.length} agents`);
    prodChannelAgents.forEach(agent => {
      console.log(`  - ${agent.display_name} (a2a_id: ${agent.a2a_id}, engagement_level: ${agent.engagement_level})`);
    });

    // Check for agents in local channel
    console.log('\n\nAGENTS IN LOCAL CHANNEL (unblockmedia-test-1):');
    const localChannelAgents = await localPool.query(`SELECT DISTINCT u.display_name, u.a2a_id, cm.engagement_level 
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.channel_id = $1 AND u.is_agent = true
      ORDER BY u.display_name`, [localChannelId]);

    console.log(`Total: ${localChannelAgents.rows.length} agents`);
    if (localChannelAgents.rows.length === 0) {
      console.log('  (No agents in local test channel)');
    }
    localChannelAgents.rows.forEach(agent => {
      console.log(`  - ${agent.display_name} (a2a_id: ${agent.a2a_id}, engagement_level: ${agent.engagement_level})`);
    });

    // Summary of key differences
    console.log('\n\nKEY DIFFERENCES THAT COULD CAUSE ISSUES:');
    console.log('='.repeat(80));

    console.log('\n1. WORKFLOW STEPS: Different channel names in write_canvas operations');
    console.log('   LOCAL: writes to "unblockmedia-test-1"');
    console.log('   PROD: writes to "unblockmedia"');
    console.log('   IMPACT: Canvases will be created in different channels');

    console.log('\n2. AGENT REGISTRATION: Many local agents missing in PROD');
    console.log('   LOCAL: 25 agents total');
    console.log('   PROD: 14 agents total');
    console.log('   MISSING IN PROD: bitcoinnewsresearcher, cryptoarticlewriter, editor, factchecker, etc.');
    console.log('   IMPACT: If workflow references these agents in PROD, it will fail');

    console.log('\n3. CANVASES TABLE: LOCAL has extra columns PROD doesn\'t have');
    console.log('   LOCAL-only columns: pipeline_status, topic, pipeline_run_id');
    console.log('   IMPACT: Queries using these columns will fail in PROD');

    console.log('\n4. WORKFLOW COUNT: LOCAL has 3 workflows, PROD has only 1');
    console.log('   LOCAL: Unblock 편집 파이프라인, and 2 others');
    console.log('   PROD: Unblock Editorial Pipeline only');
    console.log('   IMPACT: Test workflows not deployed to PROD');

    console.log('\n5. AUTO-RESPONSE HISTORY: Different activity patterns');
    console.log('   LOCAL: FactChecker, Editor, Publisher, Reporter have active auto-response counts');
    console.log('   PROD: No agents have auto-response counts');
    console.log('   IMPACT: PROD may behave differently (fresh state) but LOCAL shows testing activity');

    console.log('\n6. AGENTS REGISTERED IN PROD BUT NOT IN LOCAL:');
    console.log('   - olive');
    console.log('   - sealed-witness (vs "Sealed Witness Agent" in local)');
    console.log('   - createarockcissorpaper');
    console.log('   IMPACT: These agents exist in PROD but local code may not know about them');

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await localPool.end();
  }
}

runComparison();
