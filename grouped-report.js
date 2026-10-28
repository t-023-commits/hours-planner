(function(root){
 'use strict';
 const M=root.Planner;
 const areas={사회:['역사','일반사회','지리','윤리'],과학:['물리학','화학','생명과학','지구과학']};
 const categories={사회:'사회 공통',과학:'과학 공통·융합'};
 const rawWidths=[72,44,270,...Array(9).fill(40),42,52,52,52,66];
 function reportWidths(hoursMode='detail'){
  const selected=hoursMode==='total'?rawWidths.filter((_,i)=>i!==13&&i!==14):rawWidths;
  return selected.map(w=>w/selected.reduce((n,v)=>n+v,0)*277);
 }
 const widths=reportWidths();
 const fmt=n=>n===null||n===undefined?'미정':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const kind=r=>({'공통':'공통','공통 과목':'공통','일반':'일반','일반선택':'일반','일반 선택':'일반',
  '진로':'진로','진로선택':'진로','진로 선택':'진로','융합':'융합','융합선택':'융합','융합 선택':'융합'}[r.type]||'확인');
 const label=d=>d==='생명과학'?'생명\n과학':d==='지구과학'?'지구\n과학':d==='일반사회'?'일반\n사회':d;
 function lineCount(text,width){
  return Math.max(1,...String(text).split('\n').map(line=>Math.ceil([...line].reduce((n,c)=>n+(/[ -~]/.test(c)?.55:1),0)/((width-1.7)*2.83465/11))));
 }
 function tripleCells(t){return t?[fmt(t.unit),fmt(t.sections),fmt(t.hours)]:['','',''];}
 function entryCells(e){return [e.kind,e.name,...e.triples.flatMap(tripleCells)];}
 function statCells(d,hoursMode='detail'){
  const cells=d?[fmt(d.teachers),fmt(d.own),fmt(d.received),fmt(d.total),d.average===null?'미산정':fmt(d.average)+(d.partial?'*':'')]:['—','—','—','—','—'];
  return hoursMode==='total'?[cells[0],cells[3],cells[4]]:cells;
 }
 function printGroups(departments,groupAreas,area){
  if(!Array.isArray(departments))return Object.keys(areas).filter(a=>area==='all'||a===area).map(name=>({name,depts:areas[name],category:categories[name]}));
  const selected=M.TEACHING_DEPTS.filter(d=>departments.includes(d)),groups=[],seen=new Set();
  for(const dept of selected){
   const areaName=Object.keys(areas).find(a=>areas[a].includes(dept));
   if(groupAreas&&areaName){
    if(seen.has(areaName))continue;seen.add(areaName);
    const depts=areas[areaName].filter(d=>selected.includes(d));
    groups.push({name:depts.length===1?depts[0]:areaName,depts,category:depts.length===areas[areaName].length?categories[areaName]:null});
   }else groups.push({name:dept,depts:[dept],category:null});
  }
  return groups;
 }
 function build(state,{year=0,term=0,area='all',departments=null,groupAreas=true,pageLayout='continuous',hoursMode='detail',createdAt=new Date().toISOString()}={}){
  hoursMode=hoursMode==='total'?'total':'detail';
  pageLayout=pageLayout==='separate'?'separate':'continuous';
  const widths=reportWidths(hoursMode);
  let groups=printGroups(departments,pageLayout==='continuous'||groupAreas,area);
  if(pageLayout==='continuous'&&groups.length>1)groups=[{name:'선택 교과',depts:groups.flatMap(g=>g.depts),categories:groups.map(g=>g.category).filter(Boolean)}];
  const pages=[];
  for(const y of M.YEARS.filter(y=>!year||y===Number(year)))for(const t of [1,2].filter(t=>!term||t===Number(term)))for(const {name,depts,category,categories:originCategories=category?[category]:[]} of groups){
   const all=state.rows.filter(r=>r.year===y&&r.term===t);
   const relevant=all.filter(r=>depts.includes(r.dept)||originCategories.includes(M.sharedCategory(r))||
    M.sharedCategory(r)&&(r.allocations||[]).some(a=>depts.includes(a.dept)));
   const shared=relevant.filter(r=>M.sharedCategory(r)),outstanding=shared.some(r=>{const a=M.assignmentStatus(r);return a.remaining===null||a.remaining>0||a.over;});
   const stats=M.teacherSummary(state,y).filter(d=>depts.includes(d.dept)).map(d=>{const v=d.terms[t-1];return {dept:d.dept,teachers:v.teachers,own:v.own,received:v.received,total:v.total,average:v.perTeacher,partial:!!(v.missing||v.pendingTransfers||outstanding)};});
   const buckets=new Map([...depts,'미배정'].map(d=>[d,new Map()]));
   function add(r,dept,hours,allocated=false,held=false){
    if(hours===0)return;
    const key=[r.name,kind(r),held?'held':''].join('|'),map=buckets.get(dept);
    if(!map.has(key))map.set(key,{key,kind:kind(r),name:r.name+(held?' †':''),triples:[null,null,null],sources:[],order:r.sourceRow??999});
    const entry=map.get(key),sections=allocated?(hours===null||!r.hours?null:hours/r.hours):r.sections;
    entry.triples[r.grade-1]={unit:r.hours,sections,hours,sourceSections:r.sections,allocated};
    entry.sources.push({id:r.id,dept,grade:r.grade,hours,sections,allocated});
   }
   for(const r of relevant){
    const category=M.sharedCategory(r);
    if(!category){if(depts.includes(r.dept))add(r,r.dept,M.hours(r));continue;}
    const a=M.assignmentStatus(r);
    for(const v of a.allocations)if(depts.includes(v.dept))add(r,v.dept,v.hours,true);
    // Only the originating area lists unresolved hours; cross-area recipients do not duplicate them.
    if(originCategories.includes(category)&&(a.remaining===null||a.remaining>0))add(r,'미배정',a.remaining,true,a.over);
   }
   const blocks=[...buckets].map(([dept,map])=>({dept,stats:stats.find(d=>d.dept===dept)||null,entries:[...map.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ko'))})).filter(b=>b.entries.length||b.stats);
   for(const block of blocks){
    if(!block.entries.length)block.entries=[{key:'empty',kind:'—',name:'개설 과목 없음',triples:[null,null,null],sources:[]}];
    for(const e of block.entries){e.cells=entryCells(e);e.lines=Math.max(...e.cells.map((c,i)=>lineCount(c,widths[i+1])));e.height=4.5*e.lines+0.9;}
   }
   const remaining=M.round(shared.reduce((n,r)=>n+(M.assignmentStatus(r).remaining??0),0)),unknown=relevant.filter(r=>M.hours(r)===null).length;
   const fractional=shared.filter(M.needsWholeSections).length;
   const checks=M.groupChecks(state,y).filter(g=>g.term===t&&(g.actual!==g.target||g.unknown)&&relevant.some(r=>r.groupId===g.id));
   const held=shared.filter(r=>M.assignmentStatus(r).over);
   const note=`미배정 ${fmt(remaining)}시간 · 시수 미정 ${unknown}과목`+(held.length?` · 배정 보류 ${held.length}과목`:'')+(fractional?` · 반 단위 배정 확인 ${fractional}과목`:'')+(checks.length?` · 선택군 점검 ${checks.length}개`:'');
   const totals={teachers:stats.some(d=>d.teachers===null)?null:stats.reduce((n,d)=>n+d.teachers,0),own:M.round(stats.reduce((n,d)=>n+d.own,0)),received:M.round(stats.reduce((n,d)=>n+d.received,0)),total:M.round(stats.reduce((n,d)=>n+d.total,0)),partial:stats.some(d=>d.partial)};
   totals.average=totals.teachers>0?M.round(totals.total/totals.teachers):null;
   const gradeTotals=[1,2,3].map(g=>M.round(blocks.filter(b=>b.stats).flatMap(b=>b.entries).reduce((n,e)=>n+(e.triples[g-1]?.hours??0),0)));
   const footnotes=[
    '담당 반 수 × 반당 시수 = 교과 시수입니다. 공통·융합·교양 과목은 담당 교과에 온전한 반 단위로 배정합니다.',
    '교사 평균 = 총시수 ÷ 교사 수. 미배정·배정 보류·창체는 제외합니다. *는 입력분 기준 잠정 평균입니다. 미개설·0반은 생략합니다.',
    ...held.map(r=>{const a=M.assignmentStatus(r);return `† ${r.name}: ${r.sections}반 × ${r.hours}시간 = ${a.total}시간 / 기존 배정 ${a.requested}시간 보존, 평균 반영 보류.`;})
   ];
   const chunks=[];let chunk=[],height=0;
   // Preserve department blocks whenever possible, and never shrink the 11 pt body text.
   // Leave room for the shared table header, totals, notes and page number on A4.
   const budget=pageLayout==='continuous'?Math.max(60,120-held.length*7):(held.length?123:130);
   for(const block of blocks){
    const blockHeight=Math.max(16,block.entries.reduce((n,e)=>n+e.height,0));
    if(height+blockHeight>budget&&chunk.length){chunks.push(chunk);chunk=[];height=0;}
    if(blockHeight<=budget){chunk.push(block);height+=blockHeight;continue;}
    let batch=[],batchHeight=0,continued=false;
    for(const entry of block.entries){if(batchHeight+entry.height>budget&&batch.length){chunks.push([{...block,entries:batch,continued}]);batch=[];batchHeight=0;continued=true;}batch.push(entry);batchHeight+=entry.height;}
    if(batch.length){chunk.push({...block,entries:batch,continued});height+=batchHeight;}
   }
   if(chunk.length)chunks.push(chunk);
   chunks.forEach((departments,i)=>pages.push({year:y,term:t,area:name,part:i+1,parts:chunks.length,title:`${y}학년도 ${name} 주간수업 배당표`,
    subtitle:`${t}학기 · ${state.name} · 현재 조율안 · 단위: 시간/주, 반, 명`,
    classes:[1,2,3].map(g=>state.classes[y-g+1]),departments,stats,totals,gradeTotals,note,footnotes,
    entries:departments.flatMap(b=>b.entries),hasWarnings:outstanding||unknown>0||held.length>0||fractional>0||checks.length>0}));
  }
  return {name:state.name,updatedAt:state.updatedAt||null,createdAt,pageLayout,hoursMode,widths,pages};
 }
 const text=s=>esc(s).replaceAll('\n','<br>');
 function tableHead(p,hoursMode){
  const labels=hoursMode==='total'?['교사<br>수','교과<br>총시수','교사 1인<br>평균']:['교사<br>수','자체<br>시수','배정<br>시수','교과<br>총시수','교사 1인<br>평균'];
  return `<thead><tr><th rowspan="2">담당<br>교과</th><th rowspan="2">구분</th><th rowspan="2">과목명</th>${p.classes.map((c,i)=>`<th colspan="3">${i+1}학년 (${c}학급)</th>`).join('')}${labels.map(s=>`<th rowspan="2">${s}</th>`).join('')}</tr><tr>${p.classes.map(()=>'<th>반당<br>시수</th><th>담당<br>반 수</th><th>교과<br>시수</th>').join('')}</tr></thead>`;
 }
 function editableCell(p,block,entry,col,value,editable){
  if(!editable||![3,6,9].includes(col))return text(value);
  const source=entry.sources.find(s=>s.grade===(col/3));
  if(!source)return text(value);
  const action=source.allocated?`data-assign="${esc(source.id)}" data-assign-dept="${esc(block.dept)}"`:`data-edit="${esc(source.id)}"`;
  const label=`${p.year}학년도 ${p.term}학기 ${source.grade}학년 ${block.dept} ${entry.name} 담당 반 수 수정`;
  return `<button class="report-edit-count" ${action} aria-label="${esc(label)}" title="담당 반 수 수정">${text(value)}</button><span class="report-print-count">${text(value)}</span>`;
 }
 function render(report,{editable=false}={}){
  return report.pages.map((p,index)=>`<article class="report-page grouped-page" aria-label="${esc(p.title)} ${p.term}학기 ${p.part}쪽">
   <div class="report-heading"><h2>${esc(p.title)}</h2><span>${p.term}학기 · ${p.part}/${p.parts}</span></div>
   <p class="report-subtitle">${esc(p.subtitle)}</p>
   <table class="report-grid"><colgroup>${report.widths.map(w=>`<col style="width:${w/277*100}%">`).join('')}</colgroup>${tableHead(p,report.hoursMode)}<tbody>
   ${p.departments.map(block=>block.entries.map((e,i)=>`<tr class="${i===0?'report-dept-start':''}" data-report-key="${esc(block.dept+'|'+e.key)}">
   ${i===0?`<th class="report-department" rowspan="${block.entries.length}">${text(label(block.dept))}${block.continued?'<br><small>계속</small>':''}</th>`:''}
   ${e.cells.map((c,col)=>`<td class="${col===0?'report-kind':col===1?'report-course':[3,6,9].includes(col)?'report-section-count':(col-4)%3===0?'report-grade-hours':''}">${editableCell(p,block,e,col,c,editable)}</td>`).join('')}
   ${i===0?statCells(block.stats,report.hoursMode).map((v,col,values)=>`<td class="report-dept-stat ${col===values.length-1?'report-dept-average':''}" rowspan="${block.entries.length}">${text(v)}</td>`).join(''):''}</tr>`).join('')).join('')}
   <tr class="report-total"><th colspan="3">${p.area} 전체 · 학기 합계</th>${p.gradeTotals.map(n=>`<td></td><td></td><td>${fmt(n)}</td>`).join('')}${statCells(p.totals,report.hoursMode).map(n=>`<td>${text(n)}</td>`).join('')}</tr></tbody></table>
   <p class="report-status">${esc(p.note)}${p.parts>1?' · 교과별 수치는 해당 교과 전체, 마지막 학기 합계는 모든 쪽을 합친 값입니다.':''}</p>
   <div class="report-footnotes">${p.footnotes.map(note=>`<p>${esc(note)}</p>`).join('')}</div>
   <div class="report-page-number"><span>시수 플래너 · ${esc(report.createdAt.slice(0,10))}</span><span>${index+1} / ${report.pages.length}</span></div></article>`).join('');
 }
 root.PrintReport={build,render,statCells,entryCells,tripleCells,widths,kind,printGroups};
})(globalThis);
