# Agent Newsroom Collaboration Test

## Phase 1: Agent Setup
- [ ] Researcher agent created and responding via A2A
- [ ] Writer agent created and responding via A2A
- [ ] Editor agent created and responding via A2A
- [ ] Each agent basic DM test passed

## Phase 2: Channel Setup
- [ ] #newsroom channel created
- [ ] Researcher invited as **Engaged** (auto-responds to news keywords)
- [ ] Writer invited as **Reactive** (mention + thread only)
- [ ] Editor invited as **Reactive** (mention + thread only)
- [ ] "🤖 3 agents active" shown in channel header

## Phase 3: Research Phase
- [ ] User posts news topic without mentioning any agent
- [ ] Researcher auto-engages (no @mention needed)
- [ ] `⚡ auto` badge shown on auto-engaged response
- [ ] Typing indicator shown during agent response
- [ ] Response contains meaningful news sources/facts

## Phase 4: Writing Phase
- [ ] User @mentions Writer to draft article
- [ ] Writer responds to @mention
- [ ] Writer uses Researcher's context from channel history
- [ ] Article renders properly (markdown, formatting)

## Phase 5: Editing Phase
- [ ] User @mentions Editor to review
- [ ] Editor provides feedback
- [ ] Thread conversation between Writer and Editor works
- [ ] Thread subscription auto-triggers for participants

## Phase 6: Auto-engage Behavior
- [ ] Engaged agent responds to relevant keywords only
- [ ] 3-minute cooldown prevents spam
- [ ] Silent agent never responds without @mention
- [ ] No infinite loop between agents (self-message skip)

## Phase 7: Multi-agent Collaboration
- [ ] 3+ agents active in one channel simultaneously
- [ ] Sequential workflow: Research → Write → Edit
- [ ] Clear visual distinction between auto and mention responses

## Phase 8: UI/UX Checks
- [ ] Bot badge visible on all agent messages
- [ ] Agent profile shows skills
- [ ] Engagement level dropdown works in channel detail
- [ ] Long responses render without breaking
- [ ] Bookmark/pin/reaction works on agent messages

## Phase 9: Error Handling
- [ ] "Currently unavailable" shown when agent is down
- [ ] Keyword fallback when intent/analyze not supported
- [ ] Daily limit stops auto-engagement
- [ ] Clear error message on agent failure

## Phase 10: Full Scenario
```
1. User: "오늘 비트코인 관련 주요 뉴스가 뭐야?"
2. Researcher(auto): Collects and summarizes top 3-5 news
3. User: "@Writer 2번 뉴스로 기사 작성해줘"
4. Writer: Drafts article
5. User: "@Editor 검수해줘"
6. Editor: Provides feedback (in thread)
7. Writer(thread): Submits revision (in thread)
8. User: Shares final article to #published channel
```

---

## Test Log

### Date: 2026-04-15

**Phase 1 Results:**
- Existing agents: Max-test (a2a-builder), AlphaBot, Builder, MarketBot, Bitcoin News Researcher
- Max-test responds but with "currently unavailable" (A2A URL works but agent server may be down)
- Need to verify each agent's A2A endpoint

**Phase 1-2 Results:**
- [x] Builder agent created (local, no A2A URL - handled server-side with Gemma4 LLM)
- [x] User said: "뉴스 리서처 에이전트랑 뉴스 라이터 에이전트 만들어줘. newsroom 채널도 만들어서 둘 다 초대해줘."
- [x] Builder understood Korean naturally via Gemma4 (no regex!)
- [x] NewsResearcher agent created
- [x] NewsWriter agent created  
- [x] #newsroom channel created
- [x] Both agents invited to #newsroom
- [x] Builder confirmation message in Korean

**Architecture:**
- Builder agent → local Gemma4 (vLLM at localhost:8100) → JSON action blocks → server executes
- No regex parsing, LLM handles all natural language understanding
- Fallback to keyword templates if LLM unavailable

**Phase 3-5 Results (2026-04-16):**
- [x] User: "@BitcoinNewsResearcher 오늘 비트코인 뉴스 3개 조사해줘"
- [x] BitcoinNewsResearcher responded with 3 structured news items (Tether BTC accumulation, strategic stacking, price rally to 75K)
- [x] Markdown rendering: headings, bold, bullet points, horizontal rules all working
- [x] User: "@CryptoArticleWriter 위 리서치 결과를 바탕으로 뉴스 기사를 작성해줘"
- [x] CryptoArticleWriter produced a full professional news article with headline, summary, body, and analysis
- [x] Writer used Researcher's context from channel history (vLLM slack:read_thread)

**Architecture that works:**
```
User @mentions agent in #newsroom
  → message-bridge.ts detects local agent (a2aUrl starts with localhost)
  → loads instruction from agentSkillConfigs table
  → runAgent() with vLLM (Gemma4 31B) + MCP tool-use loop
  → agent response posted to channel
```

**Remaining issues:**
- newsroom channel appears twice in sidebar (old + new)
- Agent shows "Away" status (presence fix needed for deployment)
- No typing indicator during agent response in channels (only DMs)
