/**
 * Plain TS assertions — no test framework needed.
 * Run with: npx tsx src/lib/chat/detect-page-link.test.ts
 */

import { detectPageLink, detectPageLinks } from './detect-page-link';

const UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const UUID2 = 'ffffffff-0000-1111-2222-333333333333';

// 1. Absolute URL same-origin
{
  const r = detectPageLink(`Check this out http://localhost:3000/pages/${UUID}`, 'http://localhost:3000');
  console.assert(r !== null, 'Test 1: absolute URL should match');
  console.assert(r?.pageId === UUID, `Test 1: pageId should be ${UUID}, got ${r?.pageId}`);
  console.log('Test 1 passed: absolute URL');
}

// 2. Relative URL
{
  const r = detectPageLink(`See /pages/${UUID} for details`);
  console.assert(r !== null, 'Test 2: relative URL should match');
  console.assert(r?.pageId === UUID, `Test 2: pageId should be ${UUID}`);
  console.log('Test 2 passed: relative URL');
}

// 3. URL with query string
{
  const r = detectPageLink(`Link: /pages/${UUID}?ref=chat`);
  console.assert(r !== null, 'Test 3: URL with query should match');
  console.assert(r?.pageId === UUID, `Test 3: pageId should be ${UUID}`);
  console.log('Test 3 passed: URL with query string');
}

// 4. URL with trailing slash
{
  const r = detectPageLink(`/pages/${UUID}/`);
  console.assert(r !== null, 'Test 4: trailing slash should match');
  console.assert(r?.pageId === UUID, `Test 4: pageId should be ${UUID}`);
  console.log('Test 4 passed: URL with trailing slash');
}

// 5. Non-match: different path
{
  const r = detectPageLink(`Visit /docs/${UUID}`);
  console.assert(r === null, `Test 5: /docs/ path should NOT match, got ${r?.pageId}`);
  console.log('Test 5 passed: non-matching path returns null');
}

// 6. UUID shape validation — malformed UUID should not match
{
  const r = detectPageLink(`/pages/not-a-uuid-at-all`);
  console.assert(r === null, 'Test 6: malformed UUID should NOT match');
  console.log('Test 6 passed: malformed UUID rejected');
}

// 7. Multiple unique pageIds — up to 3
{
  const content = `/pages/${UUID} and /pages/${UUID2} and /pages/${UUID}`;
  const results = detectPageLinks(content);
  console.assert(results.length === 2, `Test 7: should return 2 unique IDs, got ${results.length}`);
  console.assert(results[0].pageId === UUID, 'Test 7: first pageId correct');
  console.assert(results[1].pageId === UUID2, 'Test 7: second pageId correct');
  console.log('Test 7 passed: deduplication + multiple matches');
}

// 8. Absolute URL different origin still matches (origin-agnostic)
{
  const r = detectPageLink(`https://other.example.com/pages/${UUID}`, 'http://localhost:3000');
  console.assert(r !== null, 'Test 8: different-origin absolute URL should still match');
  console.assert(r?.pageId === UUID, `Test 8: pageId should be ${UUID}`);
  console.log('Test 8 passed: different-origin absolute URL');
}

// 9. Max 3 results capped
{
  const ids = [
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    'cccccccc-dddd-eeee-ffff-000000000000',
    'dddddddd-eeee-ffff-0000-111111111111',
  ];
  const content = ids.map(id => `/pages/${id}`).join(' ');
  const results = detectPageLinks(content);
  console.assert(results.length === 3, `Test 9: should cap at 3, got ${results.length}`);
  console.log('Test 9 passed: max 3 cap');
}

console.log('\nAll tests passed.');
