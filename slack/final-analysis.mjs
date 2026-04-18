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
    // Check canvas table differences
    console.log('\nE. CANVASES TABLE DIFFERENCES:\n');

    const localCanvasColsRes = await localPool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY ordinal_position`
    );

    const prodCanvasColsRes = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canvases' ORDER BY ordinal_position`;

    const localCols = new Set((localCanvasColsRes.rows || []).map(c => c.column_name));
    const prodCols = new Set((prodCanvasColsRes || []).map(c => c.column_name));

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

    // Check blocks table differences
    console.log('\n\nF. BLOCKS TABLE DIFFERENCES:\n');

    const localBlocksColsRes = await localPool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blocks' ORDER BY ordinal_position`
    );

    const prodBlocksColsRes = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blocks' ORDER BY ordinal_position`;

    const localBlockCols = new Set((localBlocksColsRes.rows || []).map(c => c.column_name));
    const prodBlockCols = new Set((prodBlocksColsRes || []).map(c => c.column_name));

    const missingBlocksInProd = [...localBlockCols].filter(c => !prodBlockCols.has(c));
    const extraBlocksInProd = [...prodBlockCols].filter(c => !localBlockCols.has(c));

    console.log('LOCAL blocks columns missing in PROD:');
    if (missingBlocksInProd.length === 0) {
      console.log('  None');
    } else {
      missingBlocksInProd.forEach(col => console.log(`  - ${col}`));
    }

    console.log('\nPROD blocks columns not in LOCAL:');
    if (extraBlocksInProd.length === 0) {
      console.log('  None');
    } else {
      extraBlocksInProd.forEach(col => console.log(`  - ${col}`));
    }

    // Check workflow count differences
    console.log('\n\nG. WORKFLOW MANAGEMENT:\n');

    const localWfRes = await localPool.query(`SELECT COUNT(*) as count FROM workflows`);
    const prodWfRes = await sql`SELECT COUNT(*) as count FROM workflows`;

    console.log(`LOCAL: ${localWfRes.rows[0].count} total workflows`);
    console.log(`PROD: ${prodWfRes[0].count} total workflows`);

    // Check for problematic agent configurations
    console.log('\n\nH. AGENT CONFIGURATION ISSUES THAT COULD CAUSE UNINTENDED RESPONSES:\n');

    console.log('ISSUE 1: Agents with both engagement_level=0 AND auto-response history');
    const problematicLocal = await localPool.query(`
      SELECT DISTINCT u.display_name, u.a2a_id, COUNT(DISTINCT cm.channel_id) as channel_count, 
             SUM(cm.auto_response_count) as total_auto_responses
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE u.is_agent = true AND cm.engagement_level = 0 AND cm.auto_response_count > 0
      GROUP BY u.id, u.display_name, u.a2a_id
    `);

    if (problematicLocal.rows.length === 0) {
      console.log('  LOCAL: None');
    } else {
      console.log('  LOCAL:');
      problematicLocal.rows.forEach(row => {
        console.log(`    - ${row.display_name} (${row.a2a_id}): in ${row.channel_count} channels, ${row.total_auto_responses} total auto-responses`);
      });
    }

    const problematicProd = await sql`SELECT DISTINCT u.display_name, u.a2a_id, COUNT(DISTINCT cm.channel_id) as channel_count, 
             SUM(cm.auto_response_count) as total_auto_responses
      FROM channel_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE u.is_agent = true AND cm.engagement_level = 0 AND cm.auto_response_count > 0
      GROUP BY u.id, u.display_name, u.a2a_id`;

    if (problematicProd.length === 0) {
      console.log('  PROD: None');
    } else {
      console.log('  PROD:');
      problematicProd.forEach(row => {
        console.log(`    - ${row.display_name} (${row.a2a_id}): in ${row.channel_count} channels, ${row.total_auto_responses} total auto-responses`);
      });
    }

    console.log('\nISSUE 2: Agents registered in prod but missing from local (potential deployments that local doesn\'t know about)');
    const localAgentRes = await localPool.query(`SELECT a2a_id FROM users WHERE is_agent = true AND a2a_id IS NOT NULL`);
    const prodAgentRes = await sql`SELECT a2a_id FROM users WHERE is_agent = true AND a2a_id IS NOT NULL`;

    const localIds = new Set(localAgentRes.rows.map(r => r.a2a_id));
    const prodIds = new Set(prodAgentRes.map(r => r.a2a_id));

    const unknownInProd = [...prodIds].filter(id => !localIds.has(id));
    const deployedButNotLocal = unknownInProd.slice(0, 10);

    if (deployedButNotLocal.length === 0) {
      console.log('  None (prod agents all exist in local)');
    } else {
      console.log(`  PROD has these agents not in LOCAL: ${deployedButNotLocal.join(', ')}`);
    }

  } catch (error) {
    console.error('Error during comparison:', error);
  } finally {
    await localPool.end();
  }
}

runComparison();
