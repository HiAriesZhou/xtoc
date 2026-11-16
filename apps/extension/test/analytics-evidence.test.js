import test from 'node:test';
import assert from 'node:assert/strict';
import { summary, postList, postStats, contentPerformance } from '../src/analytics/metrics.js';
import { digest, inboundLedger, interactionLedger, interpretationInput } from '../src/analytics/insights.js';
const today = Date.parse('2026-11-16T12:00:00Z');
const DAY = 86400000;
const p = (id, at, metrics = { Impressions: 100 }) => ({ id, createdAt: at, kind: 'post', text: '', metrics });
test('partial periods cannot be compared and absent metrics are not zero', () => {
 const s = summary({daily:{'2026-11-15':{Impressions:100},'2026-11-08':{Impressions:50}}},{days:7,today});
 assert.equal(s.kpis[0].value,100);
 assert.equal(s.kpis[0].change,null);
 assert.equal(s.kpis[1].value,null);
 assert.equal(s.kpis[2].value,null);
 assert.equal(s.kpis[3].value,null);
 assert.equal(postStats(p('a',today)).engagementRate,null);
});
test('post and interaction windows use the same complete UTC days as daily totals', () => {
 const start=Date.parse('2026-11-09T00:00:00Z');
 const posts={a:p('a',start), b:p('b',Date.parse('2026-11-16T00:00:00Z')), c:p('c',start-1)};
 assert.deepEqual(postList({posts},{days:7,today}).map(p=>p.id),['a']);
 const replies=Object.fromEntries(Object.entries(posts).map(([id,p])=>[id,{...p,kind:'reply',replyTo:{handle:'reader'}}]));
 assert.equal(interactionLedger({posts:replies},{days:7,today})[0].replies,1);
 const inbound=Object.fromEntries(Object.entries(posts).map(([id,p])=>[id,{...p,handle:'reader',kind:'reply'}]));
 assert.equal(inboundLedger({posts:replies,inbound},{days:7,today})[0].inbound,1);
});
test('lifetime totals without matched-age snapshots do not produce a usual multiple', () => {
 const posts=Object.fromEntries(Array.from({length:8},(_,i)=>[i,p(String(i),today-(i+2)*DAY)]));
 assert.ok(postList({posts},{days:28,today}).every(p=>p.multiple===null));
});
test('digest and AI payload do not imply a tracked conversion path', () => {
 const account={daily:{'2026-11-15':{Impressions:100,ProfileVisits:10,Follows:2}},posts:{}};
 const d=digest(account,{days:7,today});
 assert.doesNotMatch(d.lines.join(' '),/turned into follows/);
 const input=interpretationInput(account,{days:7,today});
 assert.equal(input.comparable,false);
 assert.equal(input.coverageDays,1);
 assert.equal(input.previousTotals,null);
 assert.equal(input.followConversion,undefined);
});

test('known zero stays zero and a partially reported metric stays unknown', () => {
 const s=summary({daily:{'2026-11-14':{Impressions:100,Follows:0,Unfollows:0},'2026-11-15':{Impressions:0}}},{days:7,today});
 assert.equal(s.kpis[0].value,100);
 assert.equal(s.kpis[2].value,null);
 const zero=summary({daily:{'2026-11-15':{Impressions:0,Follows:0,Unfollows:0,ProfileVisits:0}}},{days:1,today});
 assert.equal(zero.kpis[2].value,0);
 assert.equal(zero.kpis[3].value,0);
});

test('matched-age baselines require five earlier same-kind observations', () => {
 const posts={};
 for(let i=0;i<7;i++){const at=today-(12-i)*DAY;posts[i]={...p(String(i),at),snapshots:[[at+49*3600000,i===6?500:100]]};}
 const result=postList({posts},{days:28,today});
 assert.equal(result.find(p=>p.id==='6').multiple,5);
 posts['6'].kind='reply';
 assert.equal(postList({posts},{days:28,today}).find(p=>p.id==='6').multiple,null);
 posts['6'].kind='post';posts['6'].dayOnly=true;
 assert.equal(postList({posts},{days:28,today}).find(p=>p.id==='6').multiple,null);
});

test('reply totals do not fill absent follower observations with zero', () => {
 const posts={a:{...p('a',today-DAY,{Impressions:100}),kind:'reply',replyTo:{handle:'reader'}}};
 const row=interactionLedger({posts},{days:7,today})[0];
 assert.equal(row.impressionsPerReply,100);
 assert.equal(row.follows,null);
 assert.equal(row.followsPerReply,null);
});

test('AI previous-period totals preserve missing metric coverage just like the current period', () => {
 const daily={'2026-11-15':{Impressions:100,ProfileVisits:4},'2026-11-14':{Impressions:100,ProfileVisits:3},'2026-11-13':{Impressions:50,ProfileVisits:2},'2026-11-12':{Impressions:50}};
 const input=interpretationInput({daily,posts:{}},{days:2,today});
 assert.equal(input.totals.ProfileVisits,7);
 assert.equal(input.previousTotals.ProfileVisits,null);
 assert.equal(input.previousTotals.Impressions,100);
});

test('Markdown renders an unobserved follower metric as unavailable', async () => {
 const {digestMarkdown}=await import('../src/analytics/insights.js');
 const posts={a:{...p('a',today-DAY,{Impressions:100}),kind:'reply',replyTo:{handle:'reader'}}};
 assert.match(digestMarkdown({posts},{days:7,today}),/\| @reader \| 1 \| 100 \| n\/a \|/);
});


test('content distribution separates missing observations from zero and exposes concentration', () => {
 const rows = [900, 100, 0, null].map(impressions => ({stats:{impressions}}));
 const result = contentPerformance(rows);
 assert.deepEqual(result, {count:4, measured:3, total:1000, median:100, topShare:0.9, topFiveShare:1, withoutTop:50});
 assert.equal(contentPerformance([{stats:{impressions:0}}]).topShare,null);
 assert.equal(contentPerformance([{stats:{impressions:900}}]).withoutTop,null);
 const missing = contentPerformance([{stats:{impressions:null}}]);
 assert.equal(missing.measured,0);
 assert.equal(missing.median,null);
 assert.equal(missing.topShare,null);
});
