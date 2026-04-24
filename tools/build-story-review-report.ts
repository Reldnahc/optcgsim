import fs from "node:fs";
import path from "node:path";
import {
  buildSectionLookup,
  loadSectionIndex,
  listStoryFiles,
  loadStory,
  parseArgs,
  writeUtf8
} from "./spec_story_lib.ts";
import { buildReview } from "./review-generated-stories.ts";
import { createTranchePlan } from "./plan-approved-tranche.ts";

interface StoryReview {
  id: string;
  title: string;
  path: string;
  recommendation: "keep" | "merge_or_replace" | "reject" | "needs_edit";
  reasons: string[];
}

interface ReviewReport {
  ok: true;
  totals: {
    reviewed: number;
    keep: number;
    merge_or_replace: number;
    reject: number;
    needs_edit: number;
  };
  storyReviews: StoryReview[];
}

interface PlannedStory {
  id: string;
  title: string;
  path: string;
  area: string;
  type: string;
  priority: string;
  score: number;
  unmet_story_dependencies: string[];
  story_dependencies: string[];
  reverse_dependency_count: number;
  reasons: string[];
}

interface TranchePlan {
  ok: true;
  source_review: string;
  limit: number;
  summary: {
    generated_stories: number;
    approved_or_done_stories: number;
    candidate_keep_stories: number;
    selected: number;
    ready_now_remaining: number;
    ready_after: number;
    ambiguities: number;
    merge_or_replace: number;
    reject_or_needs_edit: number;
  };
  selected: PlannedStory[];
  ready_now_remaining: PlannedStory[];
  ready_after: PlannedStory[];
  ambiguities: PlannedStory[];
  merge_or_replace: PlannedStory[];
  reject_or_needs_edit: PlannedStory[];
}

const DEFAULT_REVIEW_PATH = "stories/generated-review.json";
const DEFAULT_PLAN_PATH = "stories/tranches/tranche-001.json";
const DEFAULT_OUTPUT_PATH = "stories/review/index.html";

function loadStories(
  relativeDir: string
): Array<{ path: string; story: ReturnType<typeof loadStory> }> {
  return listStoryFiles(relativeDir)
    .map((filePath) => ({ path: filePath, story: loadStory(filePath) }))
    .sort((left, right) => left.story.id.localeCompare(right.story.id));
}

function safeAuditFiles(): Array<{
  path: string;
  name: string;
  audit: unknown;
}> {
  const auditsDir = "stories/audits";
  const resolvedRoot = path.resolve(process.cwd(), auditsDir);
  if (!fs.existsSync(resolvedRoot)) {
    return [];
  }
  const results: Array<{ path: string; name: string; audit: unknown }> = [];
  const walk = (absoluteDir: string, relativeDir: string): void => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const childRelative = `${relativeDir}/${entry.name}`
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
      const childAbsolute = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(childAbsolute, childRelative);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".audit.json")) {
        results.push({
          path: childRelative,
          name: entry.name,
          audit: JSON.parse(fs.readFileSync(childAbsolute, "utf8"))
        });
      }
    }
  };
  walk(resolvedRoot, auditsDir);
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function escapeForInlineJsonScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function buildPage(data: unknown): string {
  const serialized = escapeForInlineJsonScript(data);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Story Review Report</title>
    <style>
      :root{color-scheme:dark;--bg:#0d1117;--panel:#111827;--panel2:#161f2d;--border:#273245;--text:#e5edf6;--muted:#9fb0c8;--accent:#4da3ff;--warn:#f59e0b;--danger:#ef4444;--success:#22c55e;--radius:8px;font-family:"Segoe UI",Inter,system-ui,sans-serif}
      *{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text)}body{min-height:100vh}
      .shell{display:grid;grid-template-rows:auto auto 1fr;min-height:100vh}
      .topbar,.toolbar{padding:16px 20px;border-bottom:1px solid var(--border);background:var(--panel)}
      .topbar h1,.panel h2{margin:0;font-size:18px}.topbar p{margin:8px 0 0;color:var(--muted);max-width:80ch}
      .toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:end}
      .field{display:grid;gap:6px;min-width:150px}.field span{font-size:12px;color:var(--muted);text-transform:uppercase}
      .field input,.field select{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px 12px}
      .bridge-status{margin-left:auto;display:inline-flex;align-items:center;min-height:42px;padding:0 12px;border:1px solid var(--border);border-radius:8px;color:var(--muted);background:var(--bg)}
      .bridge-status.online{border-color:rgba(34,197,94,.45);color:#b8f5c9}.bridge-status.offline{border-color:rgba(239,68,68,.35);color:#fecaca}
      .workspace{display:grid;grid-template-columns:360px minmax(0,1fr) 520px;min-height:0}
      .sidebar,.context{background:var(--panel)}.sidebar{border-right:1px solid var(--border);overflow:hidden}.context{border-left:1px solid var(--border);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);overflow:hidden}
      .content{overflow:auto;min-width:0}
      .panel{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}
      .context .panel + .panel{border-left:1px solid var(--border)}
      .panel__header{padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px}
      .story-list,.stack{overflow:auto;min-height:0}
      .item{padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer}.item:hover{background:rgba(159,176,200,.06)}.item.selected{background:rgba(77,163,255,.16)}
      .item h3{margin:0;font-size:14px;line-height:1.4}.meta{margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
      .subsection{padding:12px 16px;border-bottom:1px solid var(--border);background:rgba(159,176,200,.04)}
      .subsection h3{margin:0;font-size:12px;text-transform:uppercase;color:var(--muted);letter-spacing:.04em}
      .badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.badge{display:inline-flex;align-items:center;min-height:26px;padding:0 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--muted)}
      .badge.keep{border-color:rgba(34,197,94,.5);color:#b8f5c9}.badge.merge_or_replace,.badge.needs_edit{border-color:rgba(245,158,11,.5);color:#ffd68a}.badge.reject{border-color:rgba(239,68,68,.5);color:#fecaca}.badge.accent{border-color:rgba(77,163,255,.5);color:var(--text)}
      .summary{display:flex;gap:10px;flex-wrap:wrap;padding:14px 20px 0}.metric{padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);min-width:120px}.metric .label{font-size:11px;color:var(--muted);text-transform:uppercase}.metric .value{margin-top:4px;font-size:18px}
      .feedback{margin:14px 20px 0;padding:14px 16px;border:1px solid var(--border);border-radius:8px;background:var(--panel)}.feedback[hidden]{display:none}.feedback__title{font-size:13px;font-weight:600}.feedback__body{margin-top:8px;color:var(--muted);white-space:pre-wrap;word-break:break-word}
      .detail{padding:18px 20px 24px;display:grid;gap:18px}.detail.empty{display:grid;place-items:center;color:var(--muted);height:100%}
      .header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.header h2{margin:0;font-size:18px}.header p{margin:10px 0 0;color:var(--muted);line-height:1.55}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.block{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:16px;min-width:0}.block.full{grid-column:1/-1}.block h3{margin:0 0 10px;font-size:14px}
      ul{margin:0;padding-left:18px}li+li{margin-top:8px}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
      .callout{padding:12px 14px;border-radius:8px;background:var(--panel2);border:1px solid var(--border);line-height:1.5}.callout strong{display:block;margin-bottom:6px}
      .commands pre{margin:0;white-space:pre-wrap}
      .action-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.action-btn{appearance:none;border:1px solid var(--border);background:var(--bg);color:var(--text);padding:10px 12px;border-radius:8px;cursor:pointer;font:inherit;min-height:40px}.action-btn:hover{background:rgba(159,176,200,.08)}.action-btn:disabled{opacity:.6;cursor:progress}.action-btn.primary{border-color:rgba(77,163,255,.5)}.action-btn.success{border-color:rgba(34,197,94,.5);color:#b8f5c9}.action-btn.warn{border-color:rgba(245,158,11,.45);color:#ffd68a}
      @media (max-width:1600px){.workspace{grid-template-columns:320px minmax(0,1fr) 440px}}
      @media (max-width:1280px){.workspace{grid-template-columns:340px minmax(0,1fr)}.context{display:none}}
      @media (max-width:900px){.workspace{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid var(--border);max-height:40vh}.grid{grid-template-columns:1fr}.header{flex-direction:column}.bridge-status{margin-left:0}}
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <h1>Story Review Report</h1>
        <p>Static review surface for generated stories, review results, tranche planning, audits, and bridge-story candidates. Use the CLI commands shown in the report for mutations.</p>
      </header>
      <section class="toolbar">
        <label class="field"><span>View</span><select id="view"></select></label>
        <label class="field"><span>Search</span><input id="search" type="search" placeholder="ID, title, spec ref"></label>
        <label class="field"><span>Recommendation</span><select id="recommendation"></select></label>
        <label class="field"><span>Area</span><select id="area"></select></label>
        <label class="field"><span>Plan Bucket</span><select id="bucket"></select></label>
        <div id="bridgeStatus" class="bridge-status offline">Buttons offline</div>
      </section>
      <main class="workspace">
        <aside class="sidebar">
          <section class="panel">
            <div class="panel__header"><h2 id="listTitle">Stories</h2><span id="listCount" class="meta"></span></div>
            <div id="storyList" class="story-list"></div>
          </section>
        </aside>
        <section class="content">
          <section id="bridgeFeedback" class="feedback" hidden></section>
          <section id="summary" class="summary"></section>
          <section id="detail" class="detail empty"><p>Select a story to inspect review, plan, and audit context.</p></section>
        </section>
        <aside class="context">
          <section class="panel">
            <div class="panel__header"><h2>Current Tranche</h2></div>
            <div id="tranche" class="stack"></div>
          </section>
          <section class="panel">
            <div class="panel__header"><h2>Bridge Candidates</h2></div>
            <div id="bridges" class="stack"></div>
          </section>
        </aside>
      </main>
    </div>
    <script id="story-data" type="application/json">${serialized}</script>
    <script>
      const DATA = JSON.parse(document.getElementById("story-data").textContent);
      const state = { view: "generated", search: "", recommendation: "all", area: "all", bucket: "all", selectedStoryId: null };
      const AREA_OPTIONS = ["all","contracts","engine","cards","server","client","replay","database","infra","docs","security"];
      const RECOMMENDATION_OPTIONS = ["all","keep","merge_or_replace","needs_edit","reject","unreviewed"];
      const BUCKET_OPTIONS = ["all","selected","ready_now_remaining","ready_after","ambiguity","reject_or_needs_edit","none"];
      const viewEl = document.getElementById("view");
      const searchEl = document.getElementById("search");
      const recommendationEl = document.getElementById("recommendation");
      const areaEl = document.getElementById("area");
      const bucketEl = document.getElementById("bucket");
      const listTitleEl = document.getElementById("listTitle");
      const listCountEl = document.getElementById("listCount");
      const storyListEl = document.getElementById("storyList");
      const summaryEl = document.getElementById("summary");
      const detailEl = document.getElementById("detail");
      const trancheEl = document.getElementById("tranche");
      const bridgesEl = document.getElementById("bridges");
      const bridgeStatusEl = document.getElementById("bridgeStatus");
      const bridgeFeedbackEl = document.getElementById("bridgeFeedback");
      const BRIDGE_BASE_URL = "http://127.0.0.1:4311";
      function escapeHtml(value){return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
      function badge(text, tone){return '<span class="badge '+tone+'">'+escapeHtml(text)+'</span>'}
      function buttonMarkup(label, action, attrs, tone){const attrString=Object.entries(attrs||{}).map(([key,value])=>' data-'+key+'="'+escapeHtml(String(value))+'"').join(''); return '<button type="button" class="action-btn '+(tone||'')+'" data-run-action="'+escapeHtml(action)+'"'+attrString+'>'+escapeHtml(label)+'</button>'}
      function reviewMap(){return new Map((DATA.review.storyReviews||[]).map(entry=>[entry.id,entry]))}
      function selectedPlan(){return DATA.tranches?.[0]?.plan ?? null}
      function selectedAudit(){return DATA.audits?.[0]?.audit ?? null}
      function planMembership(){const membership=new Map(); const plan=selectedPlan(); if(!plan){return membership;} [["selected",plan.selected],["ready_now_remaining",plan.ready_now_remaining],["ready_after",plan.ready_after],["ambiguity",plan.ambiguities],["reject_or_needs_edit",plan.reject_or_needs_edit]].forEach(([bucket,items])=>{for(const item of items||[]){membership.set(item.id,{bucket,item})}}); return membership}
      function storiesForView(){if(state.view==="generated"){return DATA.generated||[]} if(state.view==="approved"){return DATA.approved||[]} return [...(DATA.generated||[]),...(DATA.approved||[]),...(DATA.blocked||[]),...(DATA.done||[])]}
      function tokenize(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().split(/\\s+/).filter(token=>token.length>=4)}
      function specRefSet(value){return new Set((value||[]).map(item=>String(item)))}
      function hasSpecOverlap(left,right){for(const item of left){if(right.has(item)){return true}} return false}
      function bridgeResolutionMap(){const storyPool=[...(DATA.generated||[]),...(DATA.approved||[]),...(DATA.done||[])]; const resolutions=new Map(); for(const entry of DATA.audits||[]){(entry.audit.bridge_story_candidates||[]).forEach((candidate,index)=>{const candidateTokens=new Set([...tokenize(candidate.title),...tokenize(candidate.summary)]); const candidateDeps=new Set((candidate.depends_on||[]).map(item=>String(item))); const candidateRefs=specRefSet(candidate.spec_refs||[]); let bestMatch=null; let bestScore=0; for(const record of storyPool){const story=record.story; let score=0; const storyTokens=new Set([...tokenize(story.title),...tokenize(story.summary)]); for(const dep of candidateDeps){if((story.dependencies||[]).includes(dep)){score+=3}} for(const token of candidateTokens){if(storyTokens.has(token)){score+=1}} if(hasSpecOverlap(candidateRefs,specRefSet(story.spec_refs||[]))){score+=2} if(/^BRIDGE:\\s*/i.test(story.title)){score+=1} if(score>bestScore){bestScore=score; bestMatch=record}} if(bestMatch && bestScore>=7){resolutions.set(entry.path+"::"+index,{storyId:bestMatch.story.id,title:bestMatch.story.title,path:bestMatch.path})}})} return resolutions}
      function auditMaps(){const byStory=new Map(); const bridgeByStory=new Map(); const resolvedBridges=bridgeResolutionMap(); for(const entry of DATA.audits||[]){for(const assessment of entry.audit.story_assessments||[]){if(!byStory.has(assessment.id)) byStory.set(assessment.id,[]); byStory.get(assessment.id).push({assessment,audit:entry})} for(const hole of entry.audit.cross_story_holes||[]){for(const storyId of hole.affected_story_ids||[]){if(!byStory.has(storyId)) byStory.set(storyId,[]); byStory.get(storyId).push({hole,audit:entry})}} for(const [index,candidate] of (entry.audit.bridge_story_candidates||[]).entries()){const key=entry.path+"::"+index; if(resolvedBridges.has(key)){const resolved=resolvedBridges.get(key); for(const dep of candidate.depends_on||[]){if(!bridgeByStory.has(dep)) bridgeByStory.set(dep,[]); bridgeByStory.get(dep).push({candidate,audit:entry,resolved})} continue} for(const dep of candidate.depends_on||[]){if(!bridgeByStory.has(dep)) bridgeByStory.set(dep,[]); bridgeByStory.get(dep).push({candidate,audit:entry,resolved:null})}} } return {byStory,bridgeByStory,resolvedBridges}}
      function filteredStories(){const review=reviewMap(); const membership=planMembership(); const search=state.search.trim().toLowerCase(); return storiesForView().filter(record=>{const story=record.story; const reviewEntry=review.get(story.id); const membershipEntry=membership.get(story.id); const haystack=[story.id,story.title,story.summary,...(story.spec_refs||[])].join(" ").toLowerCase(); if(search && !haystack.includes(search)) return false; if(state.recommendation!=="all" && (reviewEntry?.recommendation ?? "unreviewed")!==state.recommendation) return false; if(state.area!=="all" && story.area!==state.area) return false; if(state.bucket!=="all" && (membershipEntry?.bucket ?? "none")!==state.bucket) return false; return true;})}
      function ensureSelected(){const stories=filteredStories(); if(!stories.some(record=>record.story.id===state.selectedStoryId)){state.selectedStoryId=stories[0]?.story.id ?? null}}
      function listMarkup(items){if(!items||items.length===0){return '<p class="meta">None.</p>'} return '<ul>'+items.map(item=>'<li>'+escapeHtml(item)+'</li>').join("")+'</ul>'}
      function recommendationTone(value){if(value==="keep") return "keep"; if(value==="reject") return "reject"; return value==="merge_or_replace"||value==="needs_edit" ? value : "accent"}
      function assessmentTone(value){if(value==="complete_enough") return "keep"; if(value==="blocked") return "reject"; return "merge_or_replace"}
      function setBridgeStatus(online,message){bridgeStatusEl.textContent=message; bridgeStatusEl.className='bridge-status '+(online?'online':'offline')}
      function setBridgeFeedback(title,body){bridgeFeedbackEl.hidden=false; bridgeFeedbackEl.innerHTML='<div class="feedback__title">'+escapeHtml(title)+'</div><div class="feedback__body">'+escapeHtml(body)+'</div>'}
      async function probeBridge(){try{const response=await fetch(BRIDGE_BASE_URL+'/health'); if(!response.ok) throw new Error('bridge offline'); setBridgeStatus(true,'Buttons online');}catch(error){setBridgeStatus(false,'Buttons offline - start story command bridge')}}
      async function runBridgeAction(action,payload){const response=await fetch(BRIDGE_BASE_URL+'/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})}); const data=await response.json(); if(!response.ok||!data.ok){throw new Error(data.error||('Bridge action failed: '+action));} return data}
      function summarizeResult(action,response){if(response.summary){return response.summary} if(action==='approve_preview'){return 'Tranche preview complete.'} if(action==='approve_apply'){return 'Tranche approved.'} if(action==='promote_story_preview'){return 'Story preview complete.'} if(action==='promote_story_apply'){return 'Story approved.'} if(action==='start_story'){return 'Story moved to in_progress.'} if(action==='request_review'){return 'Story moved to in_review.'} if(action==='changes_requested'){return 'Story moved to changes_requested.'} if(action==='complete_story'){return 'Story completed.'} if(action==='block_story'){return 'Story blocked.'} if(action==='unblock_story'){return 'Story returned to approved backlog.'} if(action==='draft_bridge_preview'){return 'Bridge draft preview ready.'} if(action==='draft_bridge_write'){return 'Bridge draft saved.'} return 'Action complete.'}
      async function onActionClick(button){const action=button.dataset.runAction; if(!action){return} const payload={storyId:button.dataset.storyId,auditPath:button.dataset.auditPath,candidateIndex:button.dataset.candidateIndex?Number.parseInt(button.dataset.candidateIndex,10):undefined}; button.disabled=true; try{const response=await runBridgeAction(action,payload); const body=JSON.stringify(response.result,null,2); setBridgeFeedback(summarizeResult(action,response),body.length>2400?body.slice(0,2400)+'\\n...truncated...':body); if(['refresh_next','approve_apply','promote_story_apply','start_story','request_review','changes_requested','complete_story','block_story','unblock_story','draft_bridge_write'].includes(action)){setTimeout(()=>window.location.reload(),350)} }catch(error){setBridgeFeedback('Action failed', error instanceof Error ? error.message : String(error)); setBridgeStatus(false,'Buttons offline - start story command bridge')} finally{button.disabled=false}}
      function lifecycleButtons(story){if(story.status==='generated'){return buttonMarkup('Preview Approve Story','promote_story_preview',{'story-id':story.id},'warn')+buttonMarkup('Approve Story','promote_story_apply',{'story-id':story.id},'success')} if(story.status==='approved'){return buttonMarkup('Start Story','start_story',{'story-id':story.id},'primary')+buttonMarkup('Block Story','block_story',{'story-id':story.id},'warn')} if(story.status==='in_progress'){return buttonMarkup('Request Review','request_review',{'story-id':story.id},'primary')+buttonMarkup('Block Story','block_story',{'story-id':story.id},'warn')} if(story.status==='in_review'){return buttonMarkup('Complete Story','complete_story',{'story-id':story.id},'success')+buttonMarkup('Changes Requested','changes_requested',{'story-id':story.id},'warn')+buttonMarkup('Block Story','block_story',{'story-id':story.id},'warn')} if(story.status==='changes_requested'){return buttonMarkup('Resume Work','start_story',{'story-id':story.id},'primary')+buttonMarkup('Block Story','block_story',{'story-id':story.id},'warn')} if(story.status==='blocked'){return buttonMarkup('Unblock Story','unblock_story',{'story-id':story.id},'primary')} return '<p class="meta">No workflow actions available.</p>'}
      function renderSummary(){const review=DATA.review.totals; const plan=selectedPlan()?.summary; const metrics=[["Generated",DATA.totals.generated],["Keep",review.keep],["Reject",review.reject],["Selected",plan?.selected ?? 0],["Ready After",plan?.ready_after ?? 0],["Audits",(DATA.audits||[]).length]]; summaryEl.innerHTML=metrics.map(([label,value])=>'<div class="metric"><div class="label">'+escapeHtml(label)+'</div><div class="value">'+escapeHtml(value)+'</div></div>').join("")}
      function renderList(){const stories=filteredStories(); listTitleEl.textContent=state.view==="generated"?"Generated Stories":state.view==="approved"?"Approved Stories":"All Stories"; listCountEl.textContent=String(stories.length); const review=reviewMap(); const membership=planMembership(); storyListEl.innerHTML=stories.map(record=>{const story=record.story; const reviewEntry=review.get(story.id); const membershipEntry=membership.get(story.id); return '<article class="item '+(state.selectedStoryId===story.id?'selected':'')+'" data-id="'+escapeHtml(story.id)+'"><h3>'+escapeHtml(story.id)+' - '+escapeHtml(story.title)+'</h3><p class="meta">'+escapeHtml(story.area)+' - '+escapeHtml(story.type)+' - '+escapeHtml(story.priority)+' - '+escapeHtml(record.path)+'</p><div class="badges">'+(reviewEntry?badge(reviewEntry.recommendation,recommendationTone(reviewEntry.recommendation)):'')+(membershipEntry?badge(membershipEntry.bucket.replaceAll("_"," "),"accent"):'')+badge(story.status,'accent')+'</div></article>'}).join("") || '<div class="item"><p class="meta">No stories match the current filters.</p></div>'; for(const element of storyListEl.querySelectorAll("[data-id]")){element.addEventListener("click",()=>{state.selectedStoryId=element.getAttribute("data-id"); render()})}}
      function renderTranche(){const tranche=selectedPlan(); if(!tranche){trancheEl.innerHTML='<div class="item"><p class="meta">No tranche plan found.</p></div>'; return} trancheEl.innerHTML='<div class="item"><h3>'+escapeHtml(DATA.tranches[0].name)+'</h3><p class="meta">Selected '+tranche.summary.selected+' - Ready now '+tranche.summary.ready_now_remaining+' - Ready after '+tranche.summary.ready_after+' - Ambiguities '+tranche.summary.ambiguities+'</p><div class="action-row">'+buttonMarkup('Refresh Review + Tranche','refresh_next',{},'primary')+buttonMarkup('Preview Tranche Approval','approve_preview',{},'warn')+buttonMarkup('Approve Tranche','approve_apply',{},'success')+'</div></div>'+tranche.selected.slice(0,12).map(item=>'<div class="item" data-id="'+escapeHtml(item.id)+'"><h3>'+escapeHtml(item.id)+' - '+escapeHtml(item.title)+'</h3><p class="meta">score '+escapeHtml(item.score)+' - '+escapeHtml(item.area)+' - '+escapeHtml(item.priority)+'</p></div>').join(""); for(const element of trancheEl.querySelectorAll("[data-id]")){element.addEventListener("click",()=>{state.selectedStoryId=element.getAttribute("data-id"); render()})}}
      function renderBridges(){const audits=DATA.audits||[]; const auditState=auditMaps(); const items=audits.flatMap(entry=>(entry.audit.bridge_story_candidates||[]).map((candidate,index)=>({candidate,index,audit:entry,resolved:auditState.resolvedBridges.get(entry.path+"::"+index) || null}))); const unresolved=items.filter(item=>!item.resolved); const resolved=items.filter(item=>item.resolved); bridgesEl.innerHTML='<div class="subsection"><h3>Unresolved</h3></div>'+(unresolved.length?unresolved.map((item)=>'<div class="item"><h3>'+escapeHtml(item.candidate.title.replace(/^BRIDGE:\\s*/i,""))+'</h3><p class="meta">'+escapeHtml((item.candidate.depends_on||[]).join(", "))+'</p><div class="action-row">'+buttonMarkup('Preview LLM Draft','draft_bridge_preview',{'audit-path':item.audit.path,'candidate-index':item.index},'warn')+buttonMarkup('Save LLM Draft','draft_bridge_write',{'audit-path':item.audit.path,'candidate-index':item.index},'success')+'</div></div>').join(""):'<div class="item"><p class="meta">No unresolved bridge candidates.</p></div>')+'<div class="subsection"><h3>Resolved</h3></div>'+(resolved.length?resolved.map((item)=>'<div class="item"><h3>'+escapeHtml(item.candidate.title.replace(/^BRIDGE:\\s*/i,""))+'</h3><p class="meta">'+escapeHtml((item.candidate.depends_on||[]).join(", "))+'</p><div class="badges">'+badge('resolved by '+item.resolved.storyId,'keep')+'</div><p class="meta">'+escapeHtml(item.resolved.title)+'</p></div>').join(""):'<div class="item"><p class="meta">No resolved bridge candidates.</p></div>')}
      function renderDetail(){const record=storiesForView().find(entry=>entry.story.id===state.selectedStoryId); if(!record){detailEl.className='detail empty'; detailEl.innerHTML='<p>Select a story to inspect review, plan, and audit context.</p>'; return} detailEl.className='detail'; const story=record.story; const review=reviewMap().get(story.id); const membership=planMembership().get(story.id); const audits=auditMaps(); const auditEntries=audits.byStory.get(story.id)||[]; const bridgeEntries=audits.bridgeByStory.get(story.id)||[]; const unresolvedBridgeEntries=bridgeEntries.filter(entry=>!entry.resolved); const resolvedBridgeEntries=bridgeEntries.filter(entry=>entry.resolved); const bridgeMarkup=(unresolvedBridgeEntries.length?'<h4>Unresolved</h4>'+unresolvedBridgeEntries.map(entry=>'<article><h4>'+escapeHtml(entry.candidate.title.replace(/^BRIDGE:\\s*/i,""))+'</h4><p>'+escapeHtml(entry.candidate.summary)+'</p><p class="meta">Depends on '+escapeHtml((entry.candidate.depends_on||[]).join(", "))+'</p><div class="action-row">'+buttonMarkup('Preview LLM Draft','draft_bridge_preview',{'audit-path':entry.audit.path,'candidate-index':entry.audit.bridge_story_candidates.indexOf(entry.candidate)},'warn')+buttonMarkup('Save LLM Draft','draft_bridge_write',{'audit-path':entry.audit.path,'candidate-index':entry.audit.bridge_story_candidates.indexOf(entry.candidate)},'success')+'</div></article>').join('<hr>'):'<p class="meta">No unresolved bridge candidates target this story.</p>')+(resolvedBridgeEntries.length?'<h4>Resolved</h4>'+resolvedBridgeEntries.map(entry=>'<article><h4>'+escapeHtml(entry.candidate.title.replace(/^BRIDGE:\\s*/i,""))+'</h4><div class="badges">'+badge('resolved by '+entry.resolved.storyId,'keep')+'</div><p class="meta">'+escapeHtml(entry.resolved.title)+'</p></article>').join('<hr>'):'<p class="meta">No resolved bridge candidates target this story.</p>'); const blocks=[["Scope",listMarkup(story.scope),""],["Non-Scope",listMarkup(story.non_scope),""],["Dependencies",listMarkup(story.dependencies),""],["Required Tests",listMarkup(story.required_tests),""],["Acceptance Criteria",listMarkup(story.acceptance_criteria),"full"],["Spec Refs",listMarkup(story.spec_refs),"full"],["Review",review?'<div class="badges">'+badge(review.recommendation,recommendationTone(review.recommendation))+'</div>'+(review.reasons.length?listMarkup(review.reasons):'<p class="meta">No review concerns.</p>'):'<p class="meta">No review entry.</p>',""],["Tranche Placement",membership?'<div class="badges">'+badge(membership.bucket.replaceAll("_"," "),"accent")+'</div>'+(membership.item.reasons.length?listMarkup(membership.item.reasons):'<p class="meta">No tranche notes.</p>')+(membership.item.unmet_story_dependencies.length?'<p class="meta">Unmet: '+escapeHtml(membership.item.unmet_story_dependencies.join(", "))+'</p>':''):'<p class="meta">Not in the current tranche plan.</p>',""],["Audit",auditEntries.length?auditEntries.map(entry=>entry.assessment?'<div class="badges">'+badge(entry.assessment.verdict,assessmentTone(entry.assessment.verdict))+'</div><p>'+escapeHtml(entry.assessment.summary)+'</p>'+(entry.assessment.blocking_questions?.length?'<h4>Questions</h4>'+listMarkup(entry.assessment.blocking_questions):'')+(entry.assessment.missing_prerequisites?.length?'<h4>Missing prerequisites</h4>'+listMarkup(entry.assessment.missing_prerequisites):'')+(entry.assessment.missing_tests?.length?'<h4>Missing tests</h4>'+listMarkup(entry.assessment.missing_tests):''):'<div class="badges">'+badge('cross-story hole','merge_or_replace')+'</div><p>'+escapeHtml(entry.hole.title)+'</p><p class="meta">'+escapeHtml(entry.hole.reason)+'</p>'+listMarkup(entry.hole.suggested_spec_refs||[]) ).join('<hr>'):'<p class="meta">No audit findings attached to this story.</p>',"full"],["Bridge Candidates",bridgeMarkup,"full"]]; detailEl.innerHTML='<header class="header"><div><h2>'+escapeHtml(story.id)+' - '+escapeHtml(story.title)+'</h2><p>'+escapeHtml(story.summary)+'</p><div class="badges">'+badge(story.area,'accent')+badge(story.type,'accent')+badge(story.priority,'accent')+badge(story.status,'accent')+(review?badge(review.recommendation,recommendationTone(review.recommendation)):'')+(membership?badge(membership.bucket.replaceAll("_"," "),'accent'):'')+'</div></div><div class="callout"><strong>Actions</strong><div class="action-row">'+lifecycleButtons(story)+'</div></div></header><section class="grid">'+blocks.map(([title,content,klass])=>'<article class="block '+klass+'"><h3>'+escapeHtml(title)+'</h3>'+content+'</article>').join('')+'</section>'}
      function render(){ensureSelected(); renderSummary(); renderList(); renderTranche(); renderBridges(); renderDetail()}
      function optionMarkup(values){return values.map(value=>'<option value="'+value+'">'+escapeHtml(value)+'</option>').join("")}
      viewEl.innerHTML=optionMarkup(["generated","approved","all"]); recommendationEl.innerHTML=optionMarkup(RECOMMENDATION_OPTIONS); areaEl.innerHTML=optionMarkup(AREA_OPTIONS); bucketEl.innerHTML=optionMarkup(BUCKET_OPTIONS);
      document.addEventListener('click',event=>{const button=event.target.closest('[data-run-action]'); if(button){void onActionClick(button)}});
      viewEl.addEventListener("change",event=>{state.view=event.target.value; render()}); searchEl.addEventListener("input",event=>{state.search=event.target.value; render()}); recommendationEl.addEventListener("change",event=>{state.recommendation=event.target.value; render()}); areaEl.addEventListener("change",event=>{state.area=event.target.value; render()}); bucketEl.addEventListener("change",event=>{state.bucket=event.target.value; render()});
      void probeBridge();
      render();
    </script>
  </body>
</html>`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const sectionLookup = buildSectionLookup(loadSectionIndex());
  const review = buildReview(sectionLookup) as ReviewReport;
  writeUtf8(DEFAULT_REVIEW_PATH, `${JSON.stringify(review, null, 2)}\n`);
  const plan = createTranchePlan({
    reviewPath: DEFAULT_REVIEW_PATH,
    outputPath: DEFAULT_PLAN_PATH,
    limit: 15
  }) as TranchePlan;
  writeUtf8(DEFAULT_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

  const outputPath =
    typeof args.get("output") === "string"
      ? String(args.get("output"))
      : DEFAULT_OUTPUT_PATH;
  const data = {
    generated: loadStories("stories/generated"),
    approved: loadStories("stories/approved"),
    blocked: loadStories("stories/blocked"),
    done: loadStories("stories/done"),
    review,
    tranches: [{ path: DEFAULT_PLAN_PATH, name: "tranche-001.json", plan }],
    audits: safeAuditFiles(),
    totals: {
      generated: listStoryFiles("stories/generated").length,
      approved: listStoryFiles("stories/approved").length,
      blocked: listStoryFiles("stories/blocked").length,
      done: listStoryFiles("stories/done").length
    }
  };

  writeUtf8(outputPath, buildPage(data));
  process.stdout.write(`${outputPath}\n`);
}

main();
