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
    // Get channels
    const localChannelRes = await localPool.query(
      `SELECT id, name FROM channels WHERE name = 'unblockmedia-test-1'`
    );
    
    const prodChannelRes = await sql`SELECT id, name FROM channels WHERE name = 'unblockmedia'`;

    const localChannelId = localChannelRes.rows[0]?.id;
    const prodChannelId = prodChannelRes[0]?.id;

    console.log('\n\nWORKFLOW CHANNEL REFERENCES:');
    console.log(`LOCAL unblockmedia-test-1 channel ID: ${localChannelId}`);
    console.log(`PROD unblockmedia channel ID: ${prodChannelId}`);

    // Get workflows
    const localWfRes = await localPool.query(
      `SELECT id, name, enabled, trigger_config FROM workflows WHERE trigger_type = 'channel_message'`
    );

    const prodWfRes = await sql`SELECT id, name, enabled, trigger_config FROM workflows WHERE trigger_type = 'channel_message'`;

    if (localWfRes.rows.length > 0) {
      const localUnblockWf = localWfRes.rows[0];
      console.log(`\nLOCAL workflow trigger_config.channelId: ${localUnblockWf.trigger_config?.channelId}`);
      console.log(`  Points to correct channel (unblockmedia-test-1): ${localUnblockWf.trigger_config?.channelId === localChannelId}`);
    }

    if (prodWfRes.length > 0) {
      const prodUnblockWf = prodWfRes[0];
      console.log(`PROD workflow trigger_config.channelId: ${prodUnblockWf.trigger_config?.channelId}`);
      console.log(`  Points to correct channel (unblockmedia): ${prodUnblockWf.trigger_config?.channelId === prodChannelId}`);
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
    const localChannelAgents = await localPool.query(
      `SELECT DISTINCT u.display_name, u.a2a_id, cm.engagement_level 
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

    console.log('\n✓ Analysis complete');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await localPool.end();
  }
}

runComparison();
