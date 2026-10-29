(function(root){
 'use strict';
 // 반 수 시뮬레이션: 선택군 목표 반 수나 과목별 담당 반 수를 바꿨을 때 반당 인원·교과 시수·교사 1인 평균을 다시 계산합니다.
 const M=root.Planner;
 const EPS=1e-9;
 const KIND={'공통':'공통','공통 과목':'공통','일반':'일반','일반선택':'일반','일반 선택':'일반','진로':'진로','진로선택':'진로','진로 선택':'진로','융합':'융합','융합선택':'융합','융합 선택':'융합'};
 const kind=r=>KIND[r.type]||'기타';
 function cohortStudents(state,cohort){const n=state.cohortStudents?.[cohort];return Number.isInteger(n)&&n>0?n:null;}
 function groupRows(state,year,groupId){
  return state.rows.filter(r=>r.year===year&&r.groupId===groupId).sort((a,b)=>(a.sourceRow??1e9)-(b.sourceRow??1e9));
 }
 // Same conversion as a forecast row: past applicants × this cohort's classes ÷ that cohort's classes.
 function reference(state,r){
  const ref=r.ref;
  if(!ref||!Number.isFinite(ref.students))return null;
  return Math.round(ref.students*state.classes[r.cohort]/(ref.cohort<=2026?13:12));
 }
 // Expected applicants per subject: choice data, then forecast, past choices or supplementary demand.
 // A subject without data is estimated from its sections × the group's average section size.
 // With a grade size entered, the group's demand is scaled to students × picks.
 function context(state,year,groupId){
  const g=M.groupsForYear(year).find(x=>x.id===groupId);
  if(!g)return null;
  const rows=groupRows(state,year,groupId);
  if(!rows.length)return null;
  const cohort=year-g.grade+1,U=root.PlanningUpdates;
  const items=rows.map(r=>{
   const extra=U?.demandFor?.(r)||null,past=Number.isFinite(r.students)?null:reference(state,r);
   const raw=extra?extra.students:Number.isFinite(r.students)?r.students:past;
   const sections=r.enabled?r.sections:0,known=Number.isFinite(raw)&&raw>0;
   const status=!r.enabled||sections===0?'closed':sections===null?(known?'open':'unknown'):'open';
   return {id:r.id,sections,status,raw:Number.isFinite(raw)?raw:null,known};
  });
  const open=items.filter(i=>i.status==='open');
  const sample=open.filter(i=>i.known&&i.sections>0),sampleSections=sample.reduce((s,i)=>s+i.sections,0);
  const students=cohortStudents(state,cohort),applications=students?students*g.picks:null;
  let perSection=sampleSections>0?sample.reduce((s,i)=>s+i.raw,0)/sampleSections:null;
  if(perSection===null&&applications){const n=open.reduce((s,i)=>s+(i.sections||0),0);if(n>0)perSection=applications/n;}
  for(const i of open)i.estimate=i.known?i.raw:i.sections>0&&perSection!==null?i.sections*perSection:null;
  const rawTotal=open.reduce((s,i)=>s+(i.estimate??0),0);
  const factor=applications&&rawTotal>0?applications/rawTotal:1;
  for(const i of items)i.demand=i.status==='open'&&i.estimate!=null?i.estimate*factor:null;
  return {group:g,cohort,students,items};
 }
 // rowId → expected applicants, from the plan as it was before the simulation.
 function demandMap(state,year){
  const map=new Map();
  for(const g of M.groupsForYear(year)){const c=context(state,year,g.id);if(c)for(const i of c.items)if(i.demand!=null)map.set(i.id,i.demand);}
  return map;
 }
 function perSection(state,row,demand){
  if(!row||!row.enabled)return null;
  if(row.required){const n=cohortStudents(state,row.cohort),c=state.classes[row.cohort];return n&&c?n/c:null;}
  const d=demand.get(row.id);
  return d!=null&&row.sections>0?d/row.sections:null;
 }
 const sectionsOf=(r,hours)=>hours===null||!(r.hours>0)?null:M.round(hours/r.hours);
 // One row per teaching portion, as on the A4 report: own courses under their department,
 // shared courses under each assigned department, and the unassigned remainder under its pool.
 function portions(state,year,term){
  const out=[];
  for(const r of state.rows.filter(r=>r.year===year&&r.term===term)){
   const category=M.sharedCategory(r);
   if(!category){out.push({row:r,dept:r.dept,sections:r.enabled?r.sections:0,hours:M.hours(r),allocated:false});continue;}
   const a=M.assignmentStatus(r);
   for(const v of a.allocations)out.push({row:r,dept:v.dept,sections:sectionsOf(r,v.hours),hours:v.hours,allocated:true});
   if(a.remaining===null||a.remaining>0)out.push({row:r,dept:category,sections:sectionsOf(r,a.remaining),hours:a.remaining,allocated:true,pool:true,held:a.over});
  }
  return out.filter(p=>p.hours!==0);
 }
 function table(draft,base,year,term,demand){
  const blocks=new Map(),order=M.TEACHING_DEPTS.concat(M.SHARED_DEPTS);
  function cell(p){
   if(!blocks.has(p.dept))blocks.set(p.dept,new Map());
   const map=blocks.get(p.dept),key=`${p.row.name}|${kind(p.row)}`;
   if(!map.has(key))map.set(key,{key,kind:kind(p.row),name:p.row.name,order:p.row.sourceRow??999,groups:new Set(),cells:[null,null,null]});
   const e=map.get(key);
   if(p.row.groupId)e.groups.add(p.row.groupId);
   const i=p.row.grade-1;
   if(!e.cells[i])e.cells[i]={rowId:p.row.id,dept:p.dept,unit:p.row.hours,pool:!!p.pool,held:!!p.held,required:p.row.required,now:null,old:null};
   return e.cells[i];
  }
  for(const p of portions(base,year,term))cell(p).old={sections:p.sections,hours:p.hours,per:perSection(base,p.row,demand)};
  for(const p of portions(draft,year,term)){const c=cell(p);c.now={sections:p.sections,hours:p.hours,per:perSection(draft,p.row,demand)};c.editable=!p.row.required&&p.row.enabled&&p.row.hours>0&&!p.held;}
  const zero={sections:0,hours:0,per:null};
  for(const map of blocks.values())for(const e of map.values())for(const c of e.cells)if(c){
   if(!c.now){c.now=zero;const r=draft.rows.find(x=>x.id===c.rowId);c.editable=!!r&&!r.required&&r.enabled&&r.hours>0;}
   if(!c.old)c.old=zero;
   c.changed=c.now.sections!==c.old.sections||c.now.hours!==c.old.hours;
   c.perChanged=c.now.per!==null&&c.old.per!==null?Math.abs(c.now.per-c.old.per)>0.05:c.now.per!==c.old.per;
  }
  const before=M.teacherSummary(base,year),after=M.teacherSummary(draft,year);
  const stat=(list,dept)=>{const d=list.find(x=>x.dept===dept)?.terms[term-1];return d?{teachers:d.teachers,own:d.own,received:d.received,total:d.total,average:d.perTeacher}:null;};
  const result=[...blocks].map(([dept,map])=>({dept,pool:M.SHARED_DEPTS.includes(dept),now:stat(after,dept),old:stat(before,dept),
   entries:[...map.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'ko'))}))
   .sort((a,b)=>order.indexOf(a.dept)-order.indexOf(b.dept));
  const sum=(state,grade)=>M.round(portions(state,year,term).filter(p=>!grade||p.row.grade===grade).reduce((n,p)=>n+(p.hours??0),0));
  return {blocks:result,grades:[1,2,3].map(g=>({grade:g,cohort:year-g+1,classes:draft.classes[year-g+1],students:cohortStudents(draft,year-g+1),now:sum(draft,g),old:sum(base,g)})),
   total:{now:sum(draft),old:sum(base)}};
 }
 function syncTarget(state,year,groupId){
  const rows=groupRows(state,year,groupId);
  if(rows.some(r=>r.enabled&&r.sections===null))return;
  const total=rows.reduce((n,r)=>n+(r.enabled?r.sections:0),0);
  if(total>=1&&total<=300)M.setGroupTarget(state,year,groupId,total);
 }
 function averageOf(state,year,term,dept){
  const t=M.teacherSummary(state,year).find(d=>d.dept===dept)?.terms[term-1];
  return t&&t.teachers>0?t.total/t.teachers:null;
 }
 // Change one course by ±1 section. For a shared course the change goes to the unassigned part first,
 // otherwise to the assigned department with the highest (−) or lowest (+) per-teacher average.
 function shiftCourse(state,row,delta){
  const category=M.sharedCategory(row);
  if(category&&row.allocations?.length){
   const a=M.assignmentStatus(row),unit=row.hours;
   if(!(delta<0&&(a.over||a.remaining>0))){
    const ranked=row.allocations.filter(x=>delta>0||x.hours>=unit-EPS).map(x=>({x,avg:averageOf(state,row.year,row.term,x.dept)??0}))
     .sort((p,q)=>delta<0?q.avg-p.avg:p.avg-q.avg);
    if(ranked.length){ranked[0].x.hours=M.round(ranked[0].x.hours+delta*unit);row.allocations=row.allocations.filter(x=>x.hours>EPS);}
   }
  }
  row.sections+=delta;row.edited=true;
 }
 // −1: take the section where the course's per-section students rise the least.
 // +1: add a section where per-section students are currently the highest.
 function stepGroup(state,year,groupId,delta,demand){
  const rows=groupRows(state,year,groupId).filter(r=>r.enabled&&Number.isInteger(r.sections));
  const known=rows.filter(r=>demand.get(r.id)!=null&&r.sections>0);
  const avg=known.length?known.reduce((n,r)=>n+demand.get(r.id),0)/known.reduce((n,r)=>n+r.sections,0):1;
  const need=r=>demand.get(r.id)??r.sections*avg;
  let done=0;
  for(;done<Math.abs(delta);done++){
   let pick=null,best=null;
   for(const r of rows){
    if(delta<0&&r.sections<2||delta>0&&(r.sections<1||r.sections>=100))continue;
    const v=delta<0?need(r)/(r.sections-1):need(r)/r.sections;
    if(pick===null||(delta<0?v<best-EPS:v>best+EPS)||Math.abs(v-best)<=EPS&&(delta<0?r.sections>pick.sections:need(r)>need(pick))){pick=r;best=v;}
   }
   if(!pick)break;
   shiftCourse(state,pick,delta<0?-1:1);
  }
  syncTarget(state,year,groupId);
  return done;
 }
 // Set the sections one department teaches in a course (or the unassigned part of a shared course).
 function setPortion(state,rowId,dept,count){
  const r=state.rows.find(x=>x.id===rowId);
  if(!r||r.required||!r.enabled)throw new Error('학교 지정 과목은 학급 수로 반 수가 정해집니다.');
  if(!Number.isInteger(count)||count<0||count>100)throw new Error('담당 반 수는 0~100 사이의 정수로 입력해 주세요.');
  const category=M.sharedCategory(r),unit=r.hours;
  if(!category)r.sections=count;
  else{
   if(!(unit>0))throw new Error('반당 시수를 먼저 입력해 주세요.');
   const a=M.assignmentStatus(r),assigned=M.round((r.allocations||[]).reduce((n,x)=>n+x.hours,0)/unit);
   let delta;
   if(dept===category)delta=count-(a.over?(r.sections??0):(r.sections??0)-assigned);
   else{
    const list=(r.allocations||[]).map(x=>({...x})),cur=list.find(x=>x.dept===dept);
    delta=count-(cur?M.round(cur.hours/unit):0);
    if(cur)cur.hours=M.round(count*unit);else list.push({dept,hours:M.round(count*unit)});
    r.allocations=list.filter(x=>x.hours>EPS);
   }
   r.sections=(r.sections??0)+delta;
   if(r.sections<0||r.sections>100)throw new Error('과목 전체 반 수는 0~100 사이여야 합니다.');
  }
  r.edited=true;
  if(r.groupId)syncTarget(state,r.year,r.groupId);
 }
 function portionCount(state,rowId,dept){
  const r=state.rows.find(x=>x.id===rowId);
  if(!r)return 0;
  const category=M.sharedCategory(r);
  if(!category)return r.enabled?r.sections??0:0;
  const a=M.assignmentStatus(r);
  if(dept===category)return a.remaining===null||!(r.hours>0)?0:M.round(a.remaining/r.hours);
  const x=a.allocations.find(v=>v.dept===dept);
  return x&&r.hours>0?M.round(x.hours/r.hours):0;
 }
 function changes(draft,base){
  const old=new Map(base.rows.map(r=>[r.id,r]));
  return draft.rows.filter(r=>{const o=old.get(r.id);return o&&(o.sections!==r.sections||JSON.stringify(o.allocations||[])!==JSON.stringify(r.allocations||[]));})
   .map(r=>({id:r.id,year:r.year,term:r.term,grade:r.grade,name:r.name,from:old.get(r.id).sections,to:r.sections}));
 }
 function groupSummary(state,year,groupId,demand){
  const rows=groupRows(state,year,groupId).filter(r=>r.enabled&&r.sections>0);
  let students=0,sections=0,max=null;
  for(const r of rows){const d=demand.get(r.id);if(d==null)continue;students+=d;sections+=r.sections;max=Math.max(max??0,Math.ceil(d/r.sections-EPS));}
  return {total:groupRows(state,year,groupId).reduce((n,r)=>n+(r.enabled?r.sections??0:0),0),average:sections?students/sections:null,max,
   hours:M.round(rows.reduce((n,r)=>n+(M.hours(r)??0),0))};
 }
 root.ClassScenario={kind,cohortStudents,context,demandMap,perSection,portions,table,stepGroup,setPortion,portionCount,syncTarget,changes,groupSummary};
})(globalThis);

(function(root){
 'use strict';
 root.createClassScenarioUI=function({M,esc,f,header,getState,getYear,transact,render,toast}){
  const CS=root.ClassScenario;
  const ui={term:1,groupId:null,focus:false};
  let draft=null,baseJSON='',dirty=false,rebase=null;
  const n1=x=>x===null||x===undefined||!Number.isFinite(x)?'—':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(Math.round(x*10)/10);
  const signed=x=>!Number.isFinite(x)||Math.abs(x)<1e-9?'±0':`${x>0?'+':'−'}${f(Math.abs(x))}`;
  const tone=x=>x<-1e-9?'delta-down':x>1e-9?'delta-up':'';
  const deptLabel=d=>({생명과학:'생명<br>과학',지구과학:'지구<br>과학',일반사회:'일반<br>사회','사회 공통':'사회<br>공통','과학 공통·융합':'과학<br>공통·융합'}[d]||esc(d));
  function sync(){
   const s=getState(),json=JSON.stringify(s);
   if(json!==baseJSON){
    if(rebase){draft=rebase;rebase=null;}
    else{if(draft&&dirty)toast('예상안이 바뀌어 시뮬레이션을 현재 예상안 기준으로 다시 시작했습니다.');draft=M.clone(s);dirty=false;}
    baseJSON=json;
   }
   const y=getYear(),list=M.groupsForYear(y,null,ui.term);
   if(ui.groupId&&!list.some(g=>g.id===ui.groupId))ui.groupId=null;
   return {s,y,list};
  }
  function was(show,text){return show?`<small class="cs-was">원래 ${text}</small>`:'';}
  function countCell(c){
   if(!c.editable)return `${f(c.now.sections)}${was(c.changed,f(c.old.sections))}`;
   const label=`${esc(c.dept)} 담당 반 수`;
   return `<div class="stepper cs-mini"><button data-cs-step="-1" data-cs-row="${esc(c.rowId)}" data-cs-dept="${esc(c.dept)}" data-cs-focus="m-${esc(c.rowId)}-${esc(c.dept)}" aria-label="${label} 1 줄이기" ${c.now.sections>0?'':'disabled'}>−</button><input type="number" min="0" max="100" step="1" value="${c.now.sections??''}" placeholder="미정" data-cs-count="1" data-cs-row="${esc(c.rowId)}" data-cs-dept="${esc(c.dept)}" data-cs-focus="n-${esc(c.rowId)}-${esc(c.dept)}" aria-label="${label}"><button data-cs-step="1" data-cs-row="${esc(c.rowId)}" data-cs-dept="${esc(c.dept)}" data-cs-focus="p-${esc(c.rowId)}-${esc(c.dept)}" aria-label="${label} 1 늘리기">＋</button></div>${was(c.changed,f(c.old.sections))}`;
  }
  function gradeCells(c){
   if(!c)return '<td class="cs-g"></td><td></td><td></td><td></td>';
   return `<td class="cs-g num">${f(c.unit)}</td><td class="center cs-count${c.changed?' cs-diff':''}">${countCell(c)}</td><td class="num cs-per${c.perChanged?' cs-diff':''}">${n1(c.now.per)}${was(c.perChanged,n1(c.old.per))}</td><td class="num${c.changed?' cs-diff':''}">${f(c.now.hours)}${was(c.changed,f(c.old.hours))}</td>`;
  }
  function statCells(b,rows){
   if(b.pool||!b.now)return `<td class="cs-stat" rowspan="${rows}" colspan="5">미배정 · 공통·교양 시수 배정에서 담당 교과 지정</td>`;
   const n=b.now,o=b.old,diff=k=>Math.abs((n[k]??0)-(o[k]??0))>1e-9;
   const cell=(k,text,oldText,extra='')=>`<td class="cs-stat num${diff(k)?' cs-diff':''}${extra}" rowspan="${rows}">${text}${was(diff(k),oldText)}</td>`;
   return `<td class="cs-stat num" rowspan="${rows}">${n.teachers??'미정'}</td>${cell('own',f(n.own),f(o.own))}${cell('received',f(n.received),f(o.received))}${cell('total',`<b>${f(n.total)}</b>`,f(o.total))}${cell('average',n.average===null?'미산정':`<b>${f(n.average)}</b>`,o.average===null?'미산정':f(o.average),' cs-avg')}`;
  }
  function sheet(t,y){
   const sel=ui.groupId;
   const blocks=ui.focus&&sel?t.blocks.filter(b=>b.entries.some(e=>e.groups.has(sel))):t.blocks;
   return `<div class="table-scroll cs-sheet-scroll"><table class="cs-sheet"><thead><tr><th rowspan="2">담당<br>교과</th><th rowspan="2">구분</th><th rowspan="2" class="cs-name">과목명</th>${t.grades.map(g=>`<th colspan="4" class="cs-g">${g.grade}학년 (${g.classes}학급${g.students?` · ${g.students}명`:''})</th>`).join('')}<th rowspan="2" class="cs-stat">교사<br>수</th><th rowspan="2">자체<br>시수</th><th rowspan="2">배정<br>시수</th><th rowspan="2">교과<br>총시수</th><th rowspan="2">교사 1인<br>평균</th></tr>
    <tr>${t.grades.map(()=>'<th class="cs-g">반당<br>시수</th><th>담당<br>반 수</th><th>반당<br>인원</th><th>교과<br>시수</th>').join('')}</tr></thead><tbody>
    ${blocks.map(b=>b.entries.map((e,i)=>`<tr class="${i===0?'cs-dept-start':''}${sel&&e.groups.has(sel)?' cs-in-group':''}">${i===0?`<th class="cs-dept" rowspan="${b.entries.length}">${deptLabel(b.dept)}${b.pool?'<small>미배정</small>':''}</th>`:''}<td class="cs-kind">${esc(e.kind)}</td><td class="cs-name">${esc(e.name)}</td>${e.cells.map(gradeCells).join('')}${i===0?statCells(b,b.entries.length):''}</tr>`).join('')).join('')||'<tr><td colspan="20" class="cs-empty">표시할 과목이 없습니다.</td></tr>'}
    <tr class="cs-total"><th colspan="3">${y}학년도 ${ui.term}학기 합계</th>${t.grades.map(g=>`<td class="cs-g" colspan="3"></td><td class="num${g.now!==g.old?' cs-diff':''}"><b>${f(g.now)}</b>${was(g.now!==g.old,f(g.old))}</td>`).join('')}<td colspan="3"></td><td class="num${t.total.now!==t.total.old?' cs-diff':''}"><b>${f(t.total.now)}</b>${was(t.total.now!==t.total.old,f(t.total.old))}</td><td></td></tr>
   </tbody></table></div>`;
  }
  function groupPanel(s,y,list,demand){
   const g=list.find(x=>x.id===ui.groupId);
   if(!g)return `<p class="cs-hint">선택군을 고르면 목표 반 수를 −/＋로 한 번에 줄이거나 늘릴 수 있습니다. 표의 담당 반 수를 직접 바꿀 수도 있습니다.</p>`;
   const now=CS.groupSummary(draft,y,g.id,demand),old=CS.groupSummary(s,y,g.id,demand),cohort=y-g.grade+1,base=M.baseGroupTarget(draft,y,g);
   const stat=(label,a,b,fmt,unit)=>`<div class="cs-gp-stat${a!==b?' cs-diff':''}"><span>${label}</span><b>${fmt(a)}${a===null?'':unit}</b>${a!==b?`<small>원래 ${fmt(b)}${b===null?'':unit}</small>`:'<small>&nbsp;</small>'}</div>`;
   return `<section class="cs-group-panel"><div class="cs-gp-title"><b>${g.grade}학년 ${g.term}학기 · 선택군 ${esc(g.code)} · 택${g.picks}</b><span>${cohort} 입학생${CS.cohortStudents(draft,cohort)?` ${CS.cohortStudents(draft,cohort)}명`:''} · ${draft.classes[cohort]}학급 · 기준 ${draft.classes[cohort]}학급 × 택${g.picks} = ${base}반</span></div>
    <div class="cs-gp-target"><span>목표 반 수</span><div class="stepper"><button data-cs-group-step="-1" data-cs-focus="group-minus" aria-label="목표 반 수 1 줄이기" ${now.total>1?'':'disabled'}>−</button><input type="number" min="1" max="300" step="1" value="${now.total}" data-cs-group-total="1" data-cs-focus="group-total" aria-label="선택군 목표 반 수"><button data-cs-group-step="1" data-cs-focus="group-plus" aria-label="목표 반 수 1 늘리기">＋</button></div><small>${now.total!==old.total?`원래 ${old.total}반 · `:''}블록당 ${n1(now.total/g.picks)}반</small></div>
    ${stat('반당 평균 인원',now.average,old.average,n1,'명')}${stat('가장 큰 반',now.max,old.max,n1,'명')}${stat('선택군 시수',now.hours,old.hours,f,'시간')}
    <p class="cs-gp-help">−는 줄여도 반당 인원이 가장 적게 늘어나는 과목에서, ＋는 반당 인원이 가장 많은 과목에 1반씩 바꿉니다. 0반·미개설 과목은 건드리지 않습니다.</p></section>`;
  }
  function view(){
   const {s,y,list}=sync(),demand=CS.demandMap(s,y),t=CS.table(draft,s,y,ui.term,demand);
   const all=CS.changes(draft,s),here=all.filter(c=>c.year===y&&c.term===ui.term).length,diff=M.round(t.total.now-t.total.old);
   const sum=g=>CS.groupSummary(draft,y,g.id,demand).total;
   return header('반 수 시뮬레이션','선택군 목표 반 수나 과목별 담당 반 수를 바꾸면 반당 인원, 교과 시수, 교사 1인 평균이 바로 다시 계산됩니다. ‘예상안에 적용’을 누르기 전에는 예상안이 바뀌지 않습니다.')+
    `<div class="cs-bar"><div class="year-switch" role="group" aria-label="학기">${[1,2].map(n=>`<button data-cs-term="${n}" class="${ui.term===n?'active':''}" aria-pressed="${ui.term===n}">${n}학기</button>`).join('')}</div>
     <label>선택군 <select id="cs-group" data-cs-focus="group"><option value="">선택 안 함 · 과목별로 직접 조정</option>${list.map(g=>`<option value="${esc(g.id)}" ${ui.groupId===g.id?'selected':''}>${g.grade}학년 · 선택군 ${esc(g.code)} · 택${g.picks} (${sum(g)}반)</option>`).join('')}</select></label>
     <label class="inline-check"><input type="checkbox" id="cs-focus" ${ui.focus?'checked':''} ${ui.groupId?'':'disabled'}> 선택군 과목이 있는 교과만 보기</label>
     <span class="cs-students">학생 수 ${t.grades.map(g=>`<label>${g.grade}학년 <input type="number" min="1" max="2000" step="1" placeholder="미정" value="${g.students??''}" data-cs-students="${g.cohort}" data-cs-focus="st-${g.cohort}" aria-label="${g.grade}학년(${g.cohort} 입학생) 학생 수">명</label>`).join('')}</span></div>`+
    groupPanel(s,y,list,demand)+
    `<div class="cs-applybar${all.length?' has-changes':''}" role="status"><span>${y}학년도 ${ui.term}학기 교과 시수 합계 <b>${f(t.total.old)} → ${f(t.total.now)}</b>시간 <b class="${tone(diff)}">(${signed(diff)})</b> · 바뀐 과목 ${here}개${all.length>here?` · 다른 학기·학년도 포함 ${all.length}개`:''}</span>
     <div class="actions"><button class="button small" data-cs-reset="1" ${all.length?'':'disabled'}>원래대로</button><button class="button primary small" data-cs-apply="1" ${all.length?'':'disabled'}>예상안에 적용</button></div></div>`+
    sheet(t,y)+
    `<p class="cs-foot">반당 인원 = 예상 신청 인원 ÷ 반 수(학교 지정 과목은 학생 수 ÷ 학급 수). 신청 인원은 선택자료, 없으면 참고 추정·과거 선택 환산을 쓰고, 학년 학생 수를 입력하면 ‘학생 수 × 택N’에 맞춰 환산합니다. 공통·융합 과목의 반을 줄이면 해당 교과의 배정이 함께 줄어듭니다. 학교 지정 과목은 학급 수로 정해지므로 ‘계산 기준·자료’에서 학급 수를 바꿉니다.</p>`;
  }
  function edit(fn){
   try{fn();dirty=true;}catch(e){toast(e.message);}
  }
  function apply(){
   const s=getState(),n=CS.changes(draft,s).length;
   if(!n)return;
   try{
    const next=M.validateState(draft);
    dirty=false;
    transact(()=>Object.assign(s,next),`반 수 변경 ${n}과목을 예상안에 적용했습니다. 다른 화면과 A4 인쇄에도 반영됩니다.`);
   }catch(e){toast(e.message);}
  }
  // Re-render after the browser has moved focus, then return focus to the same control.
  function later(fn){
   setTimeout(()=>{
    const key=document.activeElement?.dataset?.csFocus;
    fn();
    if(key)document.querySelector(`[data-cs-focus="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
   },0);
  }
  // Keep keyboard focus on the same control after a click redraws the table.
  function redraw(key){
   render();
   if(key)document.querySelector(`[data-cs-focus="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
  }
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   const d=b.dataset;
   if(d.csTerm){ui.term=Number(d.csTerm);ui.groupId=null;render();return;}
   if(d.csPick){if(d.csPickTerm)ui.term=Number(d.csPickTerm);ui.groupId=d.csPick;render();return;}
   if(d.csGroupStep){const y=getYear();edit(()=>{if(!CS.stepGroup(draft,y,ui.groupId,Number(d.csGroupStep),CS.demandMap(getState(),y)))toast(Number(d.csGroupStep)<0?'모든 과목이 1반이라 더 줄일 수 없습니다. 과목을 닫으려면 담당 반 수를 0으로 입력하세요.':'더 늘릴 수 있는 과목이 없습니다.');});redraw(d.csFocus);return;}
   if(d.csStep){
    const cur=CS.portionCount(draft,d.csRow,d.csDept);
    edit(()=>CS.setPortion(draft,d.csRow,d.csDept,Math.max(0,cur+Number(d.csStep))));redraw(d.csFocus);return;
   }
   if(d.csReset){draft=M.clone(getState());dirty=false;render();toast('시뮬레이션을 현재 예상안으로 되돌렸습니다.');return;}
   if(d.csApply)apply();
  });
  document.addEventListener('change',e=>{
   const el=e.target,d=el.dataset||{};
   if(d.csStudents){
    if(!el.reportValidity())return;
    const c=Number(d.csStudents),v=el.value===''?null:Number(el.value);
    later(()=>{
     if(draft){draft.cohortStudents[c]=v;rebase=draft;}
     transact(()=>{getState().cohortStudents[c]=v;},v===null?`${c} 입학생 학생 수를 미정으로 바꿨습니다.`:`${c} 입학생 ${v}명을 반당 인원 계산에 반영했습니다.`);
    });
    return;
   }
   if(d.csCount){
    if(el.value===''||!el.reportValidity()){toast('담당 반 수는 0~100 사이의 정수로 입력해 주세요.');render();return;}
    edit(()=>CS.setPortion(draft,d.csRow,d.csDept,Number(el.value)));later(render);return;
   }
   if(d.csGroupTotal){
    if(!el.reportValidity())return;
    const y=getYear(),now=CS.groupSummary(draft,y,ui.groupId,new Map()).total,delta=Number(el.value)-now;
    if(delta)edit(()=>{const moved=CS.stepGroup(draft,y,ui.groupId,delta,CS.demandMap(getState(),y));if(moved<Math.abs(delta))toast(`${moved}반만 바꿀 수 있었습니다. 남은 과목이 1반이거나 최대치입니다.`);});
    later(render);return;
   }
   if(el.id==='cs-group'){ui.groupId=el.value||null;if(!ui.groupId)ui.focus=false;later(render);return;}
   if(el.id==='cs-focus'){ui.focus=el.checked;later(render);}
  });
  return {view};
 };
})(globalThis);
