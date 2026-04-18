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

const localPool = new pg.Pool({
  connectionString: LOCAL_DB,
});

const sql = neon(PROD_DB);

async function runComparison() {
  try {
    // 3. CHANNEL MEMBERS COMPARISON
    console.log('\n\n3. CHANNEL MEMBERS COMPARISON');
    console.log('------------------------------');

    const localChannelRes = await localPool.query(
      `SELECT id, name FROM channels WHERE name = 'unblockmedia-test-1'`
    );

    const prodChannelRows = await sql`SELECT id, name FROM channels WHERE name = 'unblockmedia'`;

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
