(function(root){
 'use strict';
 const M=root.Planner;
 const areas={사회:['역사','일반사회','지리','윤리'],과학:['물리학','화학','생명과학','지구과학']};
 const categories={사회:'사회 공통',과학:'과학 공통·융합'};
 const widths=[25,58,13,25,18,18,20,100];
 const headings=['원 교과','개설 과목','학년','선택군','반당\n시수','개설\n반 수','과목\n시수','현재 담당 교과 · 배정 시수'];
 const fmt=n=>n===null||n===undefined?'미정':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function origin(r){
  if(!M.sharedCategory(r))return r.dept;
  if(r.name.startsWith('통합사회'))return '통합사회';
  if(r.name.startsWith('통합과학'))return '통합과학';
  if(r.name.includes('과학탐구실험'))return '과학탐구실험';
  return M.sharedCategory(r)==='교양'?'교양':'융합';
 }
 function lineCount(text,width){
  const units=[...String(text)].reduce((n,c)=>n+(/[ -~]/.test(c)?0.55:1),0);
  return Math.max(1,Math.ceil(units/((width-3)*2.83465/11)));
 }
 function course(r){
  const cat=M.sharedCategory(r),a=M.assignmentStatus(r),g=M.selectionGroup(r);
  let allocation;
  if(!r.enabled||r.sections===0)allocation='미개설';
  else if(!cat)allocation=`${r.dept} 자체 ${fmt(M.hours(r))}`;
  else if(a.over)allocation=`배정 보류 (총시수 초과) · 미배정 ${fmt(a.remaining)}`;
  else{
   allocation=a.allocations.map(x=>`${x.dept} ${fmt(x.hours)}`).join(' / ');
   if(a.remaining===null)allocation+=(allocation?' / ':'')+'미배정 미정';
   else if(a.remaining>0)allocation+=(allocation?' / ':'')+`미배정 ${fmt(a.remaining)}`;
   if(!allocation)allocation='배정 없음';
  }
  const cells=[origin(r),r.name,String(r.grade),g?`${g.code} · 택${g.picks}`:r.required?'학교 지정':'미지정',
   fmt(r.hours),fmt(r.enabled?r.sections:0),fmt(M.hours(r)),allocation];
  return {id:r.id,cells,lines:Math.max(...cells.map((c,i)=>lineCount(c,widths[i]))),total:M.hours(r),sections:r.enabled?r.sections:0};
 }
 function build(state,{year=0,term=0,area='all',createdAt=new Date().toISOString()}={}){
  const pages=[];
  for(const y of M.YEARS.filter(y=>!year||y===Number(year)))for(const t of [1,2].filter(t=>!term||t===Number(term)))for(const name of Object.keys(areas).filter(a=>area==='all'||a===area)){
   const depts=areas[name],all=state.rows.filter(r=>r.year===y&&r.term===t);
   const rows=all.filter(r=>depts.includes(r.dept)||M.sharedCategory(r)===categories[name]||
    M.sharedCategory(r)&&(r.allocations||[]).some(a=>depts.includes(a.dept)));
   rows.sort((a,b)=>a.grade-b.grade||(a.sourceRow??999)-(b.sourceRow??999)||a.name.localeCompare(b.name,'ko'));
   const shared=rows.filter(r=>M.sharedCategory(r));
   const outstanding=shared.some(r=>{const a=M.assignmentStatus(r);return a.remaining===null||a.remaining>0||a.over;});
   const stats=M.teacherSummary(state,y).filter(d=>depts.includes(d.dept)).map(d=>{
    const v=d.terms[t-1];
    return {dept:d.dept,teachers:v.teachers,own:v.own,received:v.received,total:v.total,average:v.perTeacher,
     partial:!!(v.missing||v.pendingTransfers||outstanding)};
   });
   const remaining=M.round(shared.reduce((n,r)=>n+(M.assignmentStatus(r).remaining??0),0));
   const unknown=rows.filter(r=>M.hours(r)===null).length,over=shared.filter(r=>M.assignmentStatus(r).over).length;
   const checks=M.groupChecks(state,y).filter(g=>g.term===t&&(g.actual!==g.target||g.unknown)&&rows.some(r=>r.groupId===g.id));
   const note=`미배정 ${fmt(remaining)}시간 · 시수 미정 ${unknown}과목 · 초과 배정 보류 ${over}과목`+
    (checks.length?` · 관련 선택군 합계/미정 점검 ${checks.length}개`:'');
   const totals={teachers:stats.some(d=>d.teachers===null)?null:stats.reduce((n,d)=>n+d.teachers,0),
    own:M.round(stats.reduce((n,d)=>n+d.own,0)),received:M.round(stats.reduce((n,d)=>n+d.received,0)),
    total:M.round(stats.reduce((n,d)=>n+d.total,0)),partial:stats.some(d=>d.partial)};
   totals.average=totals.teachers>0?M.round(totals.total/totals.teachers):null;
   const entries=rows.map(course),chunks=[];let chunk=[],height=0;
   // Keep 11 pt text; move whole course rows onto another A4 sheet instead of shrinking.
   for(const entry of entries){const h=entry.lines*5+2.8;if(chunk.length&&height+h>90){chunks.push(chunk);chunk=[];height=0;}chunk.push(entry);height+=h;}
   chunks.push(chunk);
   chunks.forEach((entries,i)=>pages.push({year:y,term:t,area:name,part:i+1,parts:chunks.length,
    title:`${y}학년도 ${t}학기 · ${name} 시수 배당표`,
    subtitle:`${state.name} · ${[1,2,3].map(g=>`${g}학년 ${state.classes[y-g+1]}학급`).join(' / ')} · 단위: 시간/주`,
    stats,totals,entries,note,hasWarnings:outstanding||unknown>0||over>0||checks.length>0}));
  }
  return {name:state.name,updatedAt:state.updatedAt||null,createdAt,widths,headings,pages};
 }
 function statCells(d,label){
  const avg=d.average===null?'미산정':fmt(d.average)+(d.partial?'*':'');
  return [label??d.dept,fmt(d.teachers),fmt(d.own),fmt(d.received),fmt(d.total),avg];
 }
 function render(report){
  return report.pages.map((p,i)=>`<article class="report-page" aria-label="${escape(p.title)} ${p.part}쪽">
   <div class="report-heading"><h2>${escape(p.title)}</h2><span>현재 예상안 · ${p.part}/${p.parts}</span></div>
   <p class="report-subtitle">${escape(p.subtitle)}</p>
   <table class="report-summary"><thead><tr>${['담당 교과','교사 수','자체 시수','배정받은 시수','교과 총시수','교사 1인 평균'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>
   ${p.stats.map(d=>`<tr>${statCells(d).map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}
   <tr class="report-total">${statCells(p.totals,p.area+' 합계').map(c=>`<td>${escape(c)}</td>`).join('')}</tr></tbody></table>
   <p class="report-status">${escape(p.note)} · 위 합계는 해당 학기 전체 기준이며 이어지는 쪽에도 반복됩니다.</p>
   <table class="report-courses"><colgroup>${widths.map(w=>`<col style="width:${w/277*100}%">`).join('')}</colgroup><thead><tr>${headings.map(h=>`<th>${h.replaceAll('\n','<br>')}</th>`).join('')}</tr></thead><tbody>
   ${p.entries.map(r=>`<tr data-report-row="${escape(r.id)}">${r.cells.map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
   <div class="report-footnotes"><p>교사 평균 = (자체 + 배정받은 시수) ÷ 교사 수. 미배정·보류 시수와 창체는 평균에서 제외합니다. *는 미정·미배정이 남은 입력분 기준 평균입니다.</p><p>개설 반·과목 시수는 원과목 전체 편성, 오른쪽은 담당 교과별 배정입니다. ‘자체’는 해당 교과에 직접 집계한 시수입니다. 0반은 미개설, 미정은 미입력입니다.</p></div>
   <div class="report-page-number"><span>시수 플래너 · ${escape(report.createdAt.slice(0,10))}</span><span>${i+1} / ${report.pages.length}</span></div>
  </article>`).join('');
 }
 root.PrintReport={build,render,statCells,widths,headings};
 root.createPrintReportUI=function({getState,header}){
  let year=0,term=0,area='all';
  const observer=new ResizeObserver(()=>{
   const preview=document.querySelector('.report-preview');
   if(preview)preview.style.setProperty('--report-zoom',Math.min(1,(preview.clientWidth-4)/(297*96/25.4)));
  });
  observer.observe(document.querySelector('#main'));
  function view(){
   const report=build(getState(),{year,term,area});
   return header('A4 인쇄 · PDF','현재 예상안의 반 수·교사 수·시수 배정을 그대로 반영합니다.',false)+
    `<section class="surface report-controls"><label>학년도 <select id="report-year"><option value="0">2027~2029 전체</option>${M.YEARS.map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}학년도</option>`).join('')}</select></label>
    <label>학기 <select id="report-term">${[[0,'두 학기'],[1,'1학기'],[2,'2학기']].map(([n,s])=>`<option value="${n}" ${term===n?'selected':''}>${s}</option>`).join('')}</select></label>
    <label>교과 <select id="report-area">${['all','사회','과학'].map(a=>`<option value="${a}" ${area===a?'selected':''}>${a==='all'?'사회·과학':a}</option>`).join('')}</select></label>
    <button class="button primary" data-action="print">현재 값으로 인쇄 / PDF 저장</button>
    <p>미리보기 ${report.pages.length}쪽 · 인쇄 창에서 <b>PDF로 저장 → A4 → 가로 → 배율 100%</b>를 선택하세요. 머리글·바닥글은 끄세요. 웹에서 다시 수정하면 이 미리보기도 갱신됩니다.</p></section>
    ${report.pages.some(p=>p.hasWarnings)?'<div class="notice report-warning">미정·미배정 또는 선택군 점검 항목이 있습니다. 현재 입력된 값으로 출력하며, 확인이 필요한 평균에는 *가 표시됩니다.</div>':''}
    <div class="report-preview">${render(report)}</div>
    <div class="report-links"><a class="button" href="downloads/adjusted-plan-print.pdf" target="_blank" rel="noopener">첨부 조율안 PDF (2026.10.20 고정본)</a><a href="downloads/adjusted-plan.json" download>첨부 조율안 JSON</a><span>고정본은 첨부 파일 기준입니다. 이후 수정값은 위 ‘현재 값으로 인쇄 / PDF 저장’을 사용하세요.</span></div>`;
  }
  function change(e){if(e.target.id==='report-year')year=Number(e.target.value);else if(e.target.id==='report-term')term=Number(e.target.value);else if(e.target.id==='report-area')area=e.target.value;else return;
   document.querySelector('#main').innerHTML=view();
  }
  document.addEventListener('change',change);
  return {view};
 };
})(globalThis);
