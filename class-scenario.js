(function(root){
 'use strict';
 // 반편성 시뮬레이션: 선택군 목표 반 수(학급 수 × 택N)를 바꿨을 때의 반당 인원·반 수·시수를 계산합니다.
 const M=root.Planner;
 const EPS=1e-9;
 const SOURCE_TEXT={actual:'선택자료',forecast:'참고 추정',reference:'과거 선택 환산',demand:'보충 수요',estimate:'반 수 기준 추정',manual:'직접 추가',missing:'자료 없음',required:'학교 지정',cross:'학교 지정'};

 function cohortStudents(state,cohort){const n=state.cohortStudents?.[cohort];return Number.isInteger(n)&&n>0?n:null;}
 function rowsOf(state,year,groupId){
  return state.rows.filter(r=>r.year===year&&r.groupId===groupId)
   .sort((a,b)=>(a.sourceRow??1e9)-(b.sourceRow??1e9));
 }
 function teachingLabel(r){
  const rule=r.relatedPlanning&&root.PLANNING_DATA?.rules.find(x=>x.name===r.name);
  return rule?rule.allowed.join(' · '):r.dept;
 }
 // Same conversion as a forecast row: past applicants × this cohort's classes ÷ that cohort's classes.
 function reference(state,r){
  const ref=r.ref;
  if(!ref||!Number.isFinite(ref.students))return null;
  return Math.round(ref.students*state.classes[r.cohort]/(ref.cohort<=2026?13:12));
 }
 // Expected applicants per subject. Real choice data first, then the existing forecast or the
 // supplementary demand. A subject without data is estimated from its sections × the group's
 // average section size. With a grade size entered, demand is scaled to students × picks.
 function context(state,year,groupId){
  const g=M.groupsForYear(year).find(x=>x.id===groupId);
  if(!g)return null;
  const rows=rowsOf(state,year,groupId);
  if(!rows.length)return null;
  const cohort=year-g.grade+1,U=root.PlanningUpdates;
  const items=rows.map((r,index)=>{
   const extra=U?.demandFor?.(r)||null,past=Number.isFinite(r.students)?null:reference(state,r);
   const raw=extra?extra.students:Number.isFinite(r.students)?r.students:past;
   const sections=r.enabled?r.sections:0,known=Number.isFinite(raw)&&raw>0;
   const status=!r.enabled||sections===0?'closed':sections===null?(known?'open':'unknown'):'open';
   return {id:r.id,index,name:r.name,dept:r.dept,teaching:teachingLabel(r),hours:r.hours,enabled:r.enabled,sections,status,
    raw:Number.isFinite(raw)?raw:null,known,source:extra?'demand':past!==null?'reference':r.basis,shared:!!M.sharedCategory(r),edited:r.edited};
  });
  const open=items.filter(i=>i.status==='open');
  const sample=open.filter(i=>i.known&&i.sections>0);
  const sampleSections=sample.reduce((s,i)=>s+i.sections,0);
  const students=cohortStudents(state,cohort),applications=students?students*g.picks:null;
  let perSection=sampleSections>0?sample.reduce((s,i)=>s+i.raw,0)/sampleSections:null;
  if(perSection===null&&applications){const n=open.reduce((s,i)=>s+(i.sections||0),0);if(n>0)perSection=applications/n;}
  for(const i of open){
   if(i.known)i.estimate=i.raw;
   else if(i.sections>0&&perSection!==null){i.estimate=i.sections*perSection;i.source='estimate';}
   else i.estimate=null;
  }
  const rawTotal=open.reduce((s,i)=>s+(i.estimate??0),0);
  const factor=applications&&rawTotal>0?applications/rawTotal:1;
  for(const i of items)i.demand=i.status==='open'&&i.estimate!=null?i.estimate*factor:null;
  return {year,grade:g.grade,term:g.term,code:g.code,picks:g.picks,groupId:g.id,cohort,classes:state.classes[cohort],
   students,applications:applications??(rawTotal>0?rawTotal:null),scaled:Math.abs(factor-1)>1e-6,
   base:M.baseGroupTarget(state,year,g),target:M.groupTarget(state,year,g),items,
   current:Object.fromEntries(items.map(i=>[i.id,i.sections])),firstId:rows[0].id};
 }
 function sum(values){return values.reduce((s,n)=>s+(Number.isFinite(n)?n:0),0);}
 // balance: 개설 과목마다 1반을 두고, 남은 반을 '현재 반당 인원이 가장 많은 과목'에 하나씩 더합니다.
 //          가장 큰 반의 인원을 최소로 만드는 배분(Adams 방식)입니다.
 // keep:    현재 반 수 비율을 유지하며 정수로 나눕니다(최대 나머지 방식, 개설 과목 최소 1반).
 function allocate(ctx,total,method='balance',pinned={}){
  const sections={},notes=[];let fixed=0;
  for(const i of ctx.items){
   if(!i.enabled){sections[i.id]=0;continue;}
   if(Object.hasOwn(pinned,i.id)){sections[i.id]=pinned[i.id];fixed+=pinned[i.id]??0;continue;}
   sections[i.id]=i.status==='closed'?0:null;
  }
  const free=ctx.items.filter(i=>i.enabled&&i.status==='open'&&!Object.hasOwn(pinned,i.id));
  const remaining=total-fixed;
  const unknown=ctx.items.filter(i=>i.enabled&&i.status==='unknown'&&!Object.hasOwn(pinned,i.id)).length;
  if(unknown)notes.push(`반 수와 신청 인원이 모두 미정인 과목 ${unknown}개는 자동 배분에서 제외했습니다. 직접 입력해 주세요.`);
  if(!free.length){
   if(remaining!==0&&!unknown)notes.push(`직접 입력한 반 수 합계가 목표와 ${Math.abs(remaining)}반 차이 납니다.`);
   return {sections,notes,method,feasible:remaining===0||unknown>0};
  }
  if(remaining<free.length){
   for(const i of free)sections[i.id]=1;
   notes.push(`목표 ${total}반으로는 자동 배분 과목 ${free.length}개에 1반씩도 둘 수 없습니다. 일부 과목을 0반(미개설)으로 직접 입력하거나 목표를 늘려 주세요.`);
   return {sections,notes,method,feasible:false};
  }
  let use=method;
  if(use==='balance'&&free.some(i=>i.demand==null)){use='keep';notes.push('신청 인원을 추정할 수 없는 과목이 있어 현재 반 수 비율로 배분했습니다.');}
  if(use==='balance'){
   const n=new Map(free.map(i=>[i.id,1]));
   for(let left=remaining-free.length;left>0;left--){
    let best=null;
    for(const i of free){
     if(n.get(i.id)>=100)continue;
     if(!best){best=i;continue;}
     const a=i.demand/n.get(i.id),b=best.demand/n.get(best.id);
     if(a>b+EPS||Math.abs(a-b)<=EPS&&(i.demand>best.demand+EPS||Math.abs(i.demand-best.demand)<=EPS&&i.index<best.index))best=i;
    }
    if(!best){notes.push('한 과목은 100반을 넘을 수 없습니다.');break;}
    n.set(best.id,n.get(best.id)+1);
   }
   for(const i of free)sections[i.id]=n.get(i.id);
  }else{
   const known=sum(free.map(i=>i.sections>0?i.sections:null)),demandKnown=sum(free.map(i=>i.sections>0?i.demand:null));
   const weights=free.map(i=>i.sections>0?i.sections:i.demand!=null&&demandKnown>0?i.demand*known/demandKnown:1);
   const W=sum(weights);
   const quotas=free.map((i,k)=>({i,q:remaining*weights[k]/W}));
   for(const x of quotas)x.n=Math.min(100,Math.max(1,Math.floor(x.q+EPS)));
   let diff=remaining-sum(quotas.map(x=>x.n));
   while(diff>0){
    const c=quotas.filter(x=>x.n<100).sort((a,b)=>(b.q-b.n)-(a.q-a.n)||a.i.index-b.i.index)[0];
    if(!c){notes.push('한 과목은 100반을 넘을 수 없습니다.');break;}
    c.n++;diff--;
   }
   while(diff<0){
    const c=quotas.filter(x=>x.n>1).sort((a,b)=>(b.n-b.q)-(a.n-a.q)||b.i.index-a.i.index)[0];
    if(!c)break;
    c.n--;diff++;
   }
   for(const x of quotas)sections[x.i.id]=x.n;
  }
  const actual=sum(Object.values(sections));
  return {sections,notes,method:use,feasible:actual===total||unknown>0&&actual<=total};
 }
 function blockSplit(total,picks){
  if(!(picks>0)||!(total>0))return [];
  const base=Math.floor(total/picks),extra=total%picks;
  return Array.from({length:picks},(_,k)=>base+(k<extra?1:0));
 }
 function evaluate(ctx,sections,capacity=null){
  let total=0,unknown=0,weekly=0,weeklyUnknown=0,maxSize=null,demandSum=0,demandSections=0,unplaced=0;const over=[];
  const rows=ctx.items.map(i=>{
   const n=i.enabled?sections[i.id]??null:0;
   if(n===null){if(i.enabled)unknown++;return {...i,n:null,avg:null,max:null,weekly:null};}
   total+=n;
   const hours=i.hours==null?null:M.round(n*i.hours);
   if(hours===null)weeklyUnknown++;else weekly+=hours;
   let avg=null,max=null;
   if(n>0&&i.demand!=null){avg=i.demand/n;max=Math.ceil(avg-EPS);demandSum+=i.demand;demandSections+=n;}
   if(n===0&&i.demand>0)unplaced+=i.demand;
   if(max!==null){maxSize=Math.max(maxSize??0,max);if(capacity&&max>capacity)over.push(i.name);}
   return {...i,n,avg,max,weekly:hours};
  });
  return {rows,total,unknown,weekly:M.round(weekly),weeklyUnknown,maxSize,over,unplaced,
   average:demandSections>0?demandSum/demandSections:null,blocks:blockSplit(total,ctx.picks),
   homeroom:ctx.students&&ctx.classes?ctx.students/ctx.classes:null};
 }
 function candidates(ctx,extra=[]){
  const lo=Math.max(1,ctx.base-Math.max(3,2*ctx.picks)),hi=ctx.base+Math.max(1,ctx.picks),set=new Set();
  for(let t=hi;t>=lo;t--)set.add(t);
  for(const t of [ctx.target,...extra])if(Number.isInteger(t)&&t>0&&t<=300)set.add(t);
  return [...set].sort((a,b)=>b-a);
 }
 // Proportional whole-section rescale of a shared course's teaching allocations.
 function rescaleAllocations(row,before){
  const list=row.allocations||[];
  if(!list.length||!(row.hours>0)||!(before>0)||!(row.sections>0))return false;
  const per=list.map((a,k)=>({dept:a.dept,k,n:a.hours/row.hours}));
  if(per.some(p=>Math.abs(p.n-Math.round(p.n))>1e-8))return false;
  for(const p of per)p.n=Math.round(p.n);
  const assigned=sum(per.map(p=>p.n));
  if(!assigned)return false;
  const goal=assigned>=before?row.sections:Math.min(assigned,row.sections);
  for(const p of per){p.q=goal*p.n/assigned;p.m=Math.floor(p.q+EPS);}
  let extra=goal-sum(per.map(p=>p.m));
  for(const p of [...per].sort((a,b)=>(b.q-b.m)-(a.q-a.m)||b.n-a.n||a.k-b.k))if(extra>0){p.m++;extra--;}
  const old=row.allocations;
  try{row.allocations=M.validateAllocations(row,per.filter(p=>p.m>0).map(p=>({dept:p.dept,hours:M.round(p.m*row.hours)})));return true;}
  catch(e){row.allocations=old;return false;}
 }
 // plans: [{year, groupId, total, sections:{rowId:n}}]
 function applyScenario(state,plans,{rescale=true}={}){
  const next=M.clone(state),changes=[];
  for(const p of plans){
   if(!Number.isInteger(p.total)||p.total<1||p.total>300)throw new Error('목표 반 수는 1~300 사이의 정수로 입력해 주세요.');
   M.setGroupTarget(next,p.year,p.groupId,p.total);
   const rows=next.rows.filter(r=>r.year===p.year&&r.groupId===p.groupId);
   for(const r of rows){
    if(!r.enabled||!Object.hasOwn(p.sections,r.id))continue;
    const n=p.sections[r.id];
    if(n!==null&&(!Number.isInteger(n)||n<0||n>100))throw new Error('반 수는 0~100 사이의 정수로 입력해 주세요.');
    if(n===r.sections)continue;
    const before=r.sections,allocBefore=M.clone(r.allocations||[]);
    r.sections=n;r.edited=true;
    const rescaled=rescale&&M.sharedCategory(r)?rescaleAllocations(r,before):false;
    changes.push({id:r.id,year:r.year,grade:r.grade,term:r.term,name:r.name,unit:r.hours,before,after:n,shared:!!M.sharedCategory(r),rescaled,
     allocBefore,allocAfter:M.clone(r.allocations||[]),paused:M.assignmentStatus(r).paused});
   }
   const status=M.groupSectionStatus({target:p.total,rows});
   if(!status.canApply)throw new Error(status.valid?`선택군 반 수 합계(${status.actual}반)를 목표 ${p.total}반에 맞춰 주세요.`:'반 수는 0~100 사이의 정수로 입력해 주세요.');
  }
  return {state:M.validateState(next),changes};
 }
 function termImpact(before,after,year,term){
  const a=M.teacherSummary(before,year),b=M.teacherSummary(after,year);
  const rows=b.map(d=>{
   const x=a.find(y=>y.dept===d.dept).terms[term-1],y=d.terms[term-1];
   return {dept:d.dept,pool:M.SHARED_DEPTS.includes(d.dept),before:x.total,after:y.total,delta:M.round(y.total-x.total),teachers:y.teachers,avgBefore:x.perTeacher,avgAfter:y.perTeacher};
  });
  const total=s=>M.summarize(s.rows.filter(r=>r.year===year),s.weeks).terms[term-1].total;
  return {term,rows,changed:rows.filter(r=>Math.abs(r.delta)>EPS),totalBefore:total(before),totalAfter:total(after)};
 }
 // A grade's selection groups (both terms) on one moving-class basis, e.g. 12학급 기준 → 택3 36반, 택1 12반.
 function gradePlan(state,year,grade,units,method='balance',capacity=null){
  return M.groupsForYear(year,grade).map(g=>context(state,year,g.id)).filter(Boolean).map(ctx=>{
   const total=ctx.picks*units,alloc=allocate(ctx,total,method);
   return {ctx,total,alloc,now:evaluate(ctx,ctx.current,capacity),next:evaluate(ctx,alloc.sections,capacity)};
  });
 }
 // Timetable check: a 택N group runs in N blocks at the same time, so a department with S sections in the
 // group needs at least ceil(S ÷ N) of its teachers free in the busiest block.
 function blockLoad(state,year,groupId){
  const g=M.groupsForYear(year).find(x=>x.id===groupId);
  if(!g)return [];
  const map=new Map(),order=M.TEACHING_DEPTS.concat(M.SHARED_DEPTS);
  for(const r of rowsOf(state,year,groupId)){
   if(!r.enabled||!(r.sections>0))continue;
   const parts=[],category=M.sharedCategory(r);
   if(category){
    let assigned=0;
    for(const a of M.assignmentStatus(r).allocations){const n=r.hours>0?a.hours/r.hours:0;parts.push([a.dept,n]);assigned+=n;}
    if(r.sections-assigned>1e-9)parts.push([category,r.sections-assigned]);
   }else parts.push([r.dept,r.sections]);
   for(const [dept,n] of parts){const x=map.get(dept)||{dept,sections:0,subjects:[]};x.sections+=n;if(!x.subjects.includes(r.name))x.subjects.push(r.name);map.set(dept,x);}
  }
  return [...map.values()].map(x=>{
   const pool=M.SHARED_DEPTS.includes(x.dept),teachers=pool?null:state.teacherCounts?.[year]?.[x.dept]?.[g.term-1]??null;
   const need=x.sections>0?Math.ceil(x.sections/g.picks-EPS):0;
   return {...x,sections:M.round(x.sections),pool,teachers,need,short:teachers!==null&&need>teachers};
  }).sort((a,b)=>order.indexOf(a.dept)-order.indexOf(b.dept));
 }
 // Weekly hours of school-designated courses for one grade at a given class count.
 function requiredHours(state,year,grade,classes){
  return [1,2].map(term=>M.round(sum(state.rows.filter(r=>r.year===year&&r.grade===grade&&r.term===term&&r.required&&r.enabled&&r.hours!==null).map(r=>M.requiredClasses(r,classes)*r.hours))));
 }
 root.ClassScenario={SOURCE_TEXT,cohortStudents,context,allocate,evaluate,blockSplit,candidates,rescaleAllocations,applyScenario,termImpact,gradePlan,requiredHours,blockLoad};
})(globalThis);

(function(root){
 'use strict';
 root.createClassScenarioUI=function({M,esc,f,header,cohorts,getState,getYear,transact,render,toast,download}){
  const CS=root.ClassScenario,PREF='curriculum-hours-planner-classplan-v1';
  const prefs={capacity:28,method:'balance',rescale:true};
  try{
   const saved=JSON.parse(localStorage.getItem(PREF)||'null');
   if(saved){
    if(Number.isInteger(saved.capacity)&&saved.capacity>=5&&saved.capacity<=60)prefs.capacity=saved.capacity;
    if(['balance','keep'].includes(saved.method))prefs.method=saved.method;
    if(typeof saved.rescale==='boolean')prefs.rescale=saved.rescale;
   }
  }catch(e){}
  function savePrefs(){try{localStorage.setItem(PREF,JSON.stringify(prefs));}catch(e){}}
  const ui={year:null,term:1,groupId:null,total:null,pinned:{},batchGrade:null,batchUnits:null};
  const METHOD={balance:'반당 인원 고르게',keep:'현재 반 수 비율 유지'};
  const n1=x=>x===null||x===undefined||!Number.isFinite(x)?'—':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(Math.round(x*10)/10);
  const people=x=>x===null||x===undefined||!Number.isFinite(x)?'—':`${n1(x)}명`;
  const r1=x=>x===null||x===undefined||!Number.isFinite(x)?'':Math.round(x*10)/10;
  const signed=(x,unit='')=>!Number.isFinite(x)||Math.abs(x)<1e-9?`0${unit}`:`${x>0?'+':'−'}${f(Math.abs(x))}${unit}`;
  const tone=x=>x<-1e-9?'delta-down':x>1e-9?'delta-up':'';
  const peak=blocks=>blocks.length?Math.max(...blocks):null;
  const equivalent=(total,picks)=>{const k=Math.floor(total/picks),r=total%picks;return r?`${k}학급 + ${r}반`:`${k}학급`;};
  function blocksCell(blocks){
   if(!blocks.length)return '—';
   const uneven=blocks.some(n=>n!==blocks[0]);
   return `${peak(blocks)}반<div class="subject-meta">${blocks.length}블록${uneven?` · ${blocks.join('·')}`:''}</div>`;
  }
  function sync(){
   const y=getYear();
   if(ui.year!==y){ui.year=y;ui.groupId=null;ui.total=null;ui.pinned={};ui.batchGrade=null;ui.batchUnits=null;}
   const list=M.groupsForYear(y,null,ui.term);
   if(!list.some(g=>g.id===ui.groupId)){
    const pick=list.find(g=>g.picks>=3)||list.find(g=>g.picks>=2)||list[0];
    ui.groupId=pick?pick.id:null;ui.total=null;ui.pinned={};
   }
   const ctx=ui.groupId?CS.context(getState(),y,ui.groupId):null;
   if(ctx&&!Number.isInteger(ui.total))ui.total=ctx.target;
   return ctx;
  }
  function gradeCards(s,y){
   return `<section class="cs-grades" aria-label="학년별 학급 수와 학생 수">${[1,2,3].map(g=>{
    const c=y-g+1,n=s.classes[c],N=CS.cohortStudents(s,c),groups=M.groupsForYear(y,g);
    const alt=[n-1,n+1].filter(k=>k>=1).map(k=>`${k}학급이면 ${people(N?N/k:null)}`).join(' · ');
    let fewer='';
    if(n>1){
     const now=CS.requiredHours(s,y,g,n),less=CS.requiredHours(s,y,g,n-1);
     const picks=[1,2].map(t=>groups.filter(x=>x.term===t).reduce((a,x)=>a+x.picks,0));
     fewer=`학급 1개 감소(${n}→${n-1}) 시 학교 지정 과목 주당 ${signed(less[0]-now[0])}·${signed(less[1]-now[1])}시간(1·2학기)${picks.some(Boolean)?` · 선택군 기준 ${picks.map((p,i)=>p?`${i+1}학기 −${p}반`:'').filter(Boolean).join(', ')}`:''}`;
    }
    return `<article class="cs-grade"><div class="cs-grade-head"><span class="grade-dot">${g}</span><div><strong>${g}학년</strong><span>${c} 입학생</span></div><b>${n}학급</b></div>
     <label class="cs-students"><span>학생 수</span><span><input type="number" min="1" max="2000" step="1" placeholder="미정" value="${N??''}" data-cs-students="${c}" data-cs-focus="students-${c}" aria-label="${c}학년도 입학생 학생 수"> 명</span></label>
     <div class="cs-grade-size"><span>학급당 평균</span><b>${N?people(N/n):'학생 수 입력 필요'}</b></div>
     <p>${N?alt:'학생 수를 넣으면 학급 수별 학급당 인원과 이동반 인원을 계산합니다.'}</p>${fewer?`<p>${fewer}</p>`:''}</article>`;
   }).join('')}</section>`;
  }
  function toolbar(){
   return `<div class="cs-toolbar"><div class="year-switch" role="group" aria-label="시뮬레이션 학기">${[1,2].map(t=>`<button data-cs-term="${t}" class="${ui.term===t?'active':''}" aria-pressed="${ui.term===t}">${t}학기</button>`).join('')}</div>
    <label>배분 방식 <select id="cs-method" data-cs-focus="method">${Object.entries(METHOD).map(([k,v])=>`<option value="${k}" ${prefs.method===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label>이동수업 검토 기준 <span><input id="cs-capacity" data-cs-focus="capacity" type="number" min="5" max="60" step="1" required value="${prefs.capacity}"> 명 초과 표시</span></label></div>`;
  }
  function overview(s,y){
   const list=M.groupsForYear(y,null,ui.term);
   if(!list.length)return '';
   return `<section class="surface cs-overview"><div class="surface-head"><div><h2>${y}학년도 ${ui.term}학기 선택군 현황</h2><div class="sub">기준 목표 = 학급 수 × 택N · 블록당 동시 개설 = 편성 반 수 ÷ 택N · 이동반 인원은 과목별 예상 신청 인원 기준</div></div></div>
    <div class="table-scroll"><table class="cs-table cs-overview-table"><thead><tr><th>선택군</th><th class="num">학급 · 학생</th><th class="num">기준 목표</th><th class="num">현재 목표</th><th class="num">편성 합계</th><th class="num">블록당 동시 개설</th><th class="num">이동반 평균</th><th class="num">가장 큰 반</th><th class="num">주당 시수</th><th class="center">시뮬레이션</th></tr></thead><tbody>${list.map(g=>{
     const c=CS.context(s,y,g.id);if(!c)return '';
     const e=CS.evaluate(c,c.current,prefs.capacity),sel=g.id===ui.groupId,open=c.items.filter(i=>i.status==='open').length;
     return `<tr class="${sel?'cs-selected':''}"><td><b>${c.grade}학년 · 선택군 ${esc(c.code)} · 택${c.picks}</b><div class="subject-meta">${open}과목 개설 / 전체 ${c.items.length}과목</div></td>
      <td class="num">${c.classes}학급<div class="subject-meta">${c.students?`${c.students}명`:'학생 수 미정'}</div></td>
      <td class="num">${c.base}반</td>
      <td class="num">${c.target}반${c.target!==c.base?'<div class="subject-meta cs-adjusted">조정됨</div>':''}</td>
      <td class="num ${e.total!==c.target||e.unknown?'cs-warn':''}">${e.total}반${e.unknown?`<div class="subject-meta">미정 ${e.unknown}과목</div>`:e.total!==c.target?`<div class="subject-meta">목표와 ${signed(e.total-c.target,'반')}</div>`:''}</td>
      <td class="num">${blocksCell(e.blocks)}</td>
      <td class="num">${people(e.average)}</td>
      <td class="num ${e.over.length?'cs-warn':''}">${people(e.maxSize)}${e.over.length?`<div class="subject-meta">${prefs.capacity}명 초과 ${e.over.length}과목</div>`:''}</td>
      <td class="num">${f(e.weekly)}시간</td>
      <td class="center"><button class="button small${sel?' primary':''}" data-cs-pick="${esc(g.id)}" aria-pressed="${sel}">${sel?'보는 중':'시뮬레이션'}</button></td></tr>`;
    }).join('')}</tbody></table></div></section>`;
  }
  function allocationText(list,unit){
   if(!list.length)return '배정 없음';
   return list.map(a=>`${esc(a.dept)} ${unit>0?`${f(M.round(a.hours/unit))}반`:`${f(a.hours)}시간`}`).join(', ');
  }
  function impactTable(impacts){
   const depts=[...new Set(impacts.flatMap(i=>i.changed.map(r=>r.dept)))];
   if(!depts.length)return '<p class="cs-quiet">교과별 시수 변화가 없습니다.</p>';
   const two=impacts.length>1;
   return `<div class="table-scroll"><table class="cs-table cs-impact"><thead><tr><th>교과</th>${impacts.map(i=>`<th class="num">${two?`${i.term}학기 `:''}교사 수</th><th class="num">${two?`${i.term}학기 `:''}주당 시수</th><th class="num">증감</th><th class="num">1인당 평균</th>`).join('')}</tr></thead><tbody>${depts.map(dept=>`<tr><td><b>${esc(dept)}</b>${M.SHARED_DEPTS.includes(dept)?'<div class="subject-meta">미배정 시수</div>':''}</td>${impacts.map(i=>{
     const r=i.rows.find(x=>x.dept===dept);
     return `<td class="num">${r.pool?'—':r.teachers??'미정'}${r.pool||r.teachers===null?'':'명'}</td><td class="num">${f(r.before)} → <b>${f(r.after)}</b></td><td class="num ${tone(r.delta)}">${signed(r.delta)}</td><td class="num">${r.pool?'—':`${r.avgBefore===null?'미산정':f(r.avgBefore)} → <b>${r.avgAfter===null?'미산정':f(r.avgAfter)}</b>`}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function blockTable(s,next,ctx){
   const before=CS.blockLoad(s,ctx.year,ctx.groupId),after=next?CS.blockLoad(next,ctx.year,ctx.groupId):null;
   const depts=[...new Set(before.map(x=>x.dept).concat(after?after.map(x=>x.dept):[]))];
   if(!depts.length)return '';
   if(ctx.picks<2)return `<div class="cs-block"><h3>시간표 블록 점검</h3><p class="cs-quiet">택1 선택군은 학급(반군)별로 시간을 나눠 운영하는 경우가 많아 교과별 동시 수업 점검을 생략합니다.</p></div>`;
   const empty={sections:0,need:0,short:false,subjects:[]};
   const short=(after||before).filter(x=>x.short);
   return `<div class="cs-block"><h3>시간표 블록 점검 <small>· 학년 전체가 택${ctx.picks} 블록 ${ctx.picks}개로 이동할 때, 같은 시간에 필요한 교과별 최소 교사 수</small></h3>
    <div class="table-scroll"><table class="cs-table cs-blocks"><thead><tr><th>담당 교과</th><th>과목</th><th class="num">${ctx.term}학기 교사 수</th><th class="num">이 선택군 반 수</th><th class="num">블록당 최소 동시 수업</th><th>판정</th></tr></thead><tbody>${depts.map(dept=>{
     const a=before.find(x=>x.dept===dept)||empty,b=after?after.find(x=>x.dept===dept)||empty:null,cur=b||a,pool=M.SHARED_DEPTS.includes(dept);
     return `<tr><td><b>${esc(dept)}</b>${pool?'<div class="subject-meta">교과 배정 전</div>':''}</td><td class="cs-subject-list">${esc([...new Set(a.subjects.concat(b?b.subjects:[]))].join(', '))}</td><td class="num">${pool?'—':cur.teachers??'미정'}${pool||cur.teachers===null||cur.teachers===undefined?'':'명'}</td><td class="num">${f(a.sections)}${b?` → <b>${f(b.sections)}</b>`:''}반</td><td class="num">${a.need}${b?` → <b>${b.need}</b>`:''}명</td><td class="${cur.short?'cs-warn':''}">${pool?'담당 교과를 정하면 점검':cur.short?`교사 ${cur.need-cur.teachers}명 부족 · 블록 배치 검토`:cur.teachers===null||cur.teachers===undefined?'교사 수 미정':'배치 가능'}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="cs-quiet">${short.length?`<b class="cs-warn">${short.map(x=>esc(x.dept)).join(', ')}</b>은(는) 한 블록에 필요한 교사가 교과 교사 수보다 많습니다. 반 수 조정, 다른 교과 배정, 반군을 나눈 블록 운영 등을 검토해 주세요.`:'다른 학년 수업과 겹치는지는 실제 시간표에서 확인해야 합니다. 이 표는 같은 선택군 안에서 필요한 최소 인원만 봅니다.'}</p></div>`;
  }
  function changeNotes(changes){
   const shared=changes.filter(c=>c.shared);
   if(!shared.length)return '';
   return `<ul class="cs-allocations">${shared.map(c=>`<li><b>${esc(c.name)}</b> ${c.before}→${c.after}반 · ${c.rescaled?`배정 ${allocationText(c.allocBefore,c.unit)} → ${allocationText(c.allocAfter,c.unit)}`:c.paused?'<span class="cs-warn">기존 배정이 새 총시수를 넘어 반영 보류(공통·교양 시수 배정에서 다시 확인)</span>':c.allocAfter.length?'기존 배정 유지 · 늘어난 시수는 미배정':'배정 없음 · 시수는 미배정으로 집계'}</li>`).join('')}</ul>`;
  }
  function detail(s,ctx){
   const cap=prefs.capacity,alloc=CS.allocate(ctx,ui.total,prefs.method,ui.pinned);
   const now=CS.evaluate(ctx,ctx.current,cap),sim=CS.evaluate(ctx,alloc.sections,cap);
   const changed=ui.total!==ctx.target||ctx.items.some(i=>i.enabled&&alloc.sections[i.id]!==i.sections);
   let preview=null,error='';
   try{preview=CS.applyScenario(s,[{year:ctx.year,groupId:ctx.groupId,total:ui.total,sections:alloc.sections}],{rescale:prefs.rescale});}catch(e){error=e.message;}
   const impact=preview?CS.termImpact(s,preview.state,ctx.year,ctx.term):null;
   const pins=Object.keys(ui.pinned).length;
   const notes=[...alloc.notes];
   if(sim.over.length)notes.push(`반당 ${cap}명을 넘는 과목: ${sim.over.map(esc).join(', ')}`);
   if(sim.unplaced>0)notes.push(`0반으로 바꾼 과목의 예상 신청 ${n1(sim.unplaced)}명은 다른 과목으로 다시 배정해야 합니다.`);
   if(pins)notes.push(`직접 입력한 ${pins}과목은 그대로 두고 나머지만 배분했습니다.`);
   if(error)notes.push(esc(error));
   const demandNote=ctx.applications?`예상 신청 ${n1(ctx.applications)}건(${ctx.students?`학생 ${ctx.students}명 × 택${ctx.picks}`:'과목별 신청자료 합계 · 학년 학생 수를 넣으면 환산'})${ctx.scaled?' · 학생 수에 맞춰 과목별 인원을 환산':''}`:'신청 인원 자료가 없어 반당 인원을 계산하지 않습니다. 위에서 학년 학생 수를 입력해 주세요.';
   const label=!changed?'변경 없음':preview?`이 안을 예상안에 적용 (${ui.total}반)`:'적용할 수 없음';
   return `<section class="surface cs-detail" id="cs-detail" aria-label="선택군 목표 반 수 시뮬레이션">
    <div class="cs-detail-head"><div><span class="selection-code">${ctx.year}학년도 · ${ctx.grade}학년 ${ctx.term}학기 · 선택군 ${esc(ctx.code)}</span><h2>택${ctx.picks} 목표 반 수 시뮬레이션</h2>
     <p>${ctx.cohort} 입학생 ${ctx.students?`${ctx.students}명`:'학생 수 미정'} · ${ctx.classes}학급 · 기준 ${ctx.classes}학급 × 택${ctx.picks} = ${ctx.base}반${ctx.target!==ctx.base?` · <b class="cs-adjusted">현재 조정 목표 ${ctx.target}반</b>`:''}</p><p class="subject-meta">${demandNote}</p></div>
     <div class="cs-total"><span>시뮬레이션 목표</span><div class="stepper"><button data-cs-total-step="-1" aria-label="목표 반 수 1 줄이기">−</button><input type="number" min="1" max="300" step="1" required value="${ui.total}" data-cs-total="1" data-cs-focus="total" aria-label="시뮬레이션 목표 반 수"><button data-cs-total-step="1" aria-label="목표 반 수 1 늘리기">＋</button></div><small>학급 환산 ${equivalent(ui.total,ctx.picks)} · 기준 대비 ${signed(ui.total-ctx.base,'반')}</small></div></div>
    <div class="cs-block"><h3>목표 반 수별 비교 <small>· ${METHOD[prefs.method]} 기준 · 숫자를 누르면 아래에 자세히 표시합니다</small></h3>
     <div class="table-scroll cs-compare-scroll"><table class="cs-table cs-compare"><thead><tr><th>목표 반 수</th><th class="num">학급 환산</th><th class="num">블록당 동시 개설</th><th class="num">이동반 평균</th><th class="num">가장 큰 반</th><th class="num">${cap}명 초과</th><th class="num">주당 시수</th><th class="num">현재 대비</th></tr></thead><tbody>
      <tr class="cs-current-row"><td><b>현재 예상안</b><div class="subject-meta">편성 합계 ${now.total}반${now.unknown?` · 미정 ${now.unknown}과목`:''}</div></td><td class="num">${equivalent(now.total,ctx.picks)}</td><td class="num">${blocksCell(now.blocks)}</td><td class="num">${people(now.average)}</td><td class="num">${people(now.maxSize)}</td><td class="num">${now.over.length}과목</td><td class="num">${f(now.weekly)}시간</td><td class="num">—</td></tr>
      ${CS.candidates(ctx,[ui.total]).map(T=>{
       const a=CS.allocate(ctx,T,prefs.method),e=CS.evaluate(ctx,a.sections,cap),sel=T===ui.total;
       const tags=[T===ctx.base?'<span class="cs-tag">기준</span>':'',T===ctx.target&&T!==ctx.base?'<span class="cs-tag adjusted">현재 목표</span>':''].join('');
       return `<tr class="${sel?'cs-selected':''}${a.feasible?'':' cs-infeasible'}"><td><button class="cs-option" data-cs-total-option="${T}" aria-pressed="${sel}"><b>${T}반</b>${tags}</button></td><td class="num">${equivalent(T,ctx.picks)}</td><td class="num">${blocksCell(e.blocks)}</td><td class="num">${people(e.average)}</td><td class="num ${e.maxSize>cap?'cs-warn':''}">${people(e.maxSize)}</td><td class="num ${e.over.length?'cs-warn':''}">${e.over.length}과목</td><td class="num">${f(e.weekly)}시간</td><td class="num ${tone(e.weekly-now.weekly)}">${signed(e.weekly-now.weekly,'시간')}</td></tr>`;
      }).join('')}</tbody></table></div></div>
    <div class="summary cs-metrics">
     <div class="metric"><div class="label">목표 반 수</div><div class="value">${ui.total}<span class="unit">반</span></div><div class="foot">현재 편성 ${now.total}반 대비 ${signed(sim.total-now.total,'반')} · 학급 환산 ${equivalent(ui.total,ctx.picks)}</div></div>
     <div class="metric"><div class="label">블록당 동시 개설</div><div class="value">${peak(sim.blocks)??'—'}<span class="unit">반</span></div><div class="foot">택${ctx.picks} → ${sim.blocks.length}개 블록${sim.blocks.some(n=>n!==sim.blocks[0])?` (${sim.blocks.join('·')}반)`:''} · 담임 ${ctx.classes}학급 · 학년 전체가 함께 이동할 때 동시에 필요한 교실·교사 수</div></div>
     <div class="metric featured"><div class="label">이동반 평균 인원</div><div class="value">${n1(sim.average)}<span class="unit">명</span></div><div class="foot">가장 큰 반 ${people(sim.maxSize)} · 현재 평균 ${people(now.average)}${sim.homeroom?` · 담임반 평균 ${people(sim.homeroom)}`:''}</div></div>
     <div class="metric ${sim.weekly<now.weekly?'':'warn'}"><div class="label">이 선택군 주당 시수</div><div class="value">${f(sim.weekly)}<span class="unit">시간</span></div><div class="foot">현재 ${f(now.weekly)}시간 대비 ${signed(sim.weekly-now.weekly,'시간')}</div></div>
    </div>
    ${notes.length?`<div class="notice ${sim.over.length||error||!alloc.feasible?'':'neutral'} cs-notice"><span>${notes.join('<br>')}</span></div>`:''}
    <div class="table-scroll cs-subject-scroll"><table class="cs-table cs-subjects"><thead><tr><th>과목 · 담당 교과</th><th class="num">예상 신청</th><th class="num">현재 반 수</th><th class="center">시뮬레이션 반 수</th><th class="num">이동반 인원</th><th class="num">주당 시수</th></tr></thead><tbody>${ctx.items.map((i,k)=>{
     const a=now.rows[k],b=sim.rows[k],pinned=Object.hasOwn(ui.pinned,i.id),over=b.max!==null&&b.max>cap;
     const delta=i.enabled&&b.n!==null&&a.n!==null?b.n-a.n:0;
     return `<tr class="${!i.enabled||b.n===0?'not-offered':''}${delta?' cs-changed':''}"><td><strong>${esc(i.name)}</strong><div class="subject-meta">${esc(i.teaching)} · 반당 ${f(i.hours)}시간${i.shared?' · 공통·융합 배정':''}</div></td>
      <td class="num">${i.demand!=null?people(i.demand):'—'}<div class="subject-meta">${i.status==='closed'?`미개설${i.raw>0?` · 과거 ${i.raw}명`:''}`:i.status==='unknown'?'반 수·인원 미정':esc(CS.SOURCE_TEXT[i.source]||'')}</div></td>
      <td class="num">${i.enabled?a.n===null?'미정':`${a.n}반`:'미개설'}<div class="subject-meta">${a.avg!==null?people(a.avg):''}</div></td>
      <td class="center">${i.enabled?`<input class="editable${pinned?' cs-pinned':''}" type="number" min="0" max="100" step="1" placeholder="${i.status==='unknown'?'미정':'자동'}" value="${b.n??''}" data-cs-sections="${esc(i.id)}" data-cs-focus="sec-${esc(i.id)}" aria-label="${esc(i.name)} 시뮬레이션 반 수"><span class="cs-delta ${tone(delta)}">${delta?signed(delta):''}</span>${pinned?`<button class="text-button cs-unpin" data-cs-unpin="${esc(i.id)}">자동으로</button>`:''}`:'<span class="subject-meta">미개설</span>'}</td>
      <td class="num ${over?'cs-warn':''}"><b>${people(b.avg)}</b><div class="subject-meta">${b.max!==null?`최대 ${b.max}명`:''}</div></td>
      <td class="num">${f(a.weekly)} → <b>${f(b.weekly)}</b></td></tr>`;
    }).join('')}</tbody><tfoot><tr><th>합계</th><td class="num">${people(ctx.applications)}</td><td class="num">${now.total}반</td><td class="center"><b>${sim.total}반</b> <span class="subject-meta">/ 목표 ${ui.total}반</span></td><td class="num">${people(sim.average)}</td><td class="num">${f(now.weekly)} → <b>${f(sim.weekly)}</b></td></tr></tfoot></table></div>
    <div class="cs-block"><h3>교과별 시수 변화 <small>· ${ctx.year}학년도 ${ctx.term}학기 · 공통·융합 배정 반영 · 교사 1인당 평균은 해당 학기 교사 수 기준</small></h3>
     ${impact?impactTable([impact])+`<p class="cs-quiet">${ctx.year}학년도 ${ctx.term}학기 전체 주당시수 ${f(impact.totalBefore)} → <b>${f(impact.totalAfter)}</b>시간 (${signed(M.round(impact.totalAfter-impact.totalBefore),'시간')})</p>`+changeNotes(preview.changes):`<p class="cs-quiet">${esc(error)||'반 수 합계를 목표에 맞추면 교과별 변화를 계산합니다.'}</p>`}</div>
    ${blockTable(s,preview?.state||null,ctx)}
    <div class="cs-actions"><label class="inline-check"><input type="checkbox" id="cs-rescale" ${prefs.rescale?'checked':''}> 공통·융합 과목은 교과 배정도 반 수에 맞춰 비례 조정</label>
     <div class="actions">${ui.total!==ctx.base?`<button class="button small" data-cs-reset="1">기준 ${ctx.base}반으로 보기</button>`:''}${pins?'<button class="button small" data-cs-clear-pins="1">직접 입력 해제</button>':''}<button class="button small" data-cs-csv="1">CSV</button><button class="button primary" data-cs-apply="1" ${changed&&preview?'':'disabled'}>${label}</button></div></div>
   </section>`;
  }
  function batchState(s,y){
   const grades=[2,3].filter(g=>M.groupsForYear(y,g).length);
   if(!grades.length)return null;
   if(!grades.includes(ui.batchGrade)){ui.batchGrade=grades[0];ui.batchUnits=null;}
   const classes=s.classes[y-ui.batchGrade+1];
   if(!Number.isInteger(ui.batchUnits))ui.batchUnits=Math.max(1,classes-1);
   const plans=CS.gradePlan(s,y,ui.batchGrade,ui.batchUnits,prefs.method,prefs.capacity);
   let res=null,error='';
   if(plans.every(p=>p.alloc.feasible)){try{res=CS.applyScenario(s,plans.map(p=>({year:y,groupId:p.ctx.groupId,total:p.total,sections:p.alloc.sections})),{rescale:prefs.rescale});}catch(e){error=e.message;}}
   else error=[...new Set(plans.flatMap(p=>p.alloc.notes))].join(' ');
   const changed=plans.some(p=>p.total!==p.ctx.target||p.ctx.items.some(i=>i.enabled&&p.alloc.sections[i.id]!==i.sections));
   return {grades,classes,plans,res,error,changed};
  }
  function batch(s,y){
   const b=batchState(s,y);
   if(!b)return '';
   const impacts=b.res?[1,2].map(t=>CS.termImpact(s,b.res.state,y,t)):null;
   const weekly=k=>b.plans.reduce((n,p)=>n+p[k].weekly,0);
   return `<section class="surface cs-batch" id="cs-batch"><div class="surface-head"><div><h2>학년 단위 일괄 비교 · 이동수업 기준 학급 수</h2><div class="sub">한 학년의 모든 선택군(1·2학기)을 같은 기준으로 맞춰 봅니다. 예: 13학급 학년을 12학급 기준으로 운영하면 택3은 36반, 택1은 12반입니다.</div></div></div>
    <div class="cs-batch-controls"><label>학년 <select id="cs-batch-grade" data-cs-focus="batch-grade">${b.grades.map(g=>`<option value="${g}" ${ui.batchGrade===g?'selected':''}>${g}학년 · ${y-g+1} 입학생 · ${s.classes[y-g+1]}학급</option>`).join('')}</select></label>
     <label>이동수업 기준 <span class="stepper"><button data-cs-units-step="-1" aria-label="기준 학급 1 줄이기">−</button><input id="cs-batch-units" data-cs-focus="batch-units" type="number" min="1" max="50" step="1" required value="${ui.batchUnits}" aria-label="이동수업 기준 학급 수"><button data-cs-units-step="1" aria-label="기준 학급 1 늘리기">＋</button></span> 학급</label>
     <span class="cs-quiet">담임 학급 ${b.classes}개는 그대로 두고 선택군 목표만 바꿉니다 · ${METHOD[prefs.method]}</span></div>
    <div class="table-scroll"><table class="cs-table"><thead><tr><th>학기 · 선택군</th><th class="num">목표 반 수</th><th class="num">블록당 동시 개설</th><th class="num">이동반 평균</th><th class="num">가장 큰 반</th><th class="num">주당 시수</th></tr></thead><tbody>${b.plans.map(p=>`<tr><td><b>${p.ctx.term}학기 · 선택군 ${esc(p.ctx.code)} · 택${p.ctx.picks}</b><div class="subject-meta">${p.ctx.items.filter(i=>i.status==='open').length}과목 개설</div></td><td class="num">${p.ctx.target} → <b>${p.total}</b>반</td><td class="num">${peak(p.now.blocks)??'—'} → <b>${peak(p.next.blocks)??'—'}</b>반</td><td class="num">${people(p.now.average)} → <b>${people(p.next.average)}</b></td><td class="num ${p.next.maxSize>prefs.capacity?'cs-warn':''}">${people(p.now.maxSize)} → <b>${people(p.next.maxSize)}</b></td><td class="num">${f(p.now.weekly)} → <b>${f(p.next.weekly)}</b> <span class="${tone(p.next.weekly-p.now.weekly)}">(${signed(M.round(p.next.weekly-p.now.weekly))})</span></td></tr>`).join('')}</tbody><tfoot><tr><th>선택군 합계</th><td></td><td></td><td></td><td></td><td class="num">${f(M.round(weekly('now')))} → <b>${f(M.round(weekly('next')))}</b>시간</td></tr></tfoot></table></div>
    <div class="cs-block"><h3>교과별 시수 변화 <small>· ${y}학년도 1·2학기</small></h3>${impacts?impactTable(impacts)+changeNotes(b.res.changes):`<p class="cs-quiet cs-warn">${esc(b.error)}</p>`}</div>
    <div class="cs-actions"><span class="cs-quiet">적용하면 이 학년의 선택군 ${b.plans.length}개 목표와 반 수를 한 번에 바꿉니다. ‘되돌리기’로 복구할 수 있습니다.</span><div class="actions"><button class="button primary" data-cs-batch-apply="1" ${b.res&&b.changed?'':'disabled'}>${b.changed?`${ui.batchGrade}학년 일괄 적용 (${ui.batchUnits}학급 기준)`:'변경 없음'}</button></div></div>
   </section>`;
  }
  function notes(){
   return `<details class="subsection cs-notes"><summary>계산 방법 · 2027학년도 반편성과 함께 보는 법</summary><ul>
    <li><b>목표 반 수</b>: 기본은 학급 수 × 택N입니다(예: 13학급 × 택3 = 39반). 여기서 적용한 목표는 학년도·선택군별로 저장되어 선택군 조율, 과목별 예상 시수, 반 수 점검의 기준이 됩니다. 기준과 같은 값으로 적용하면 조정 표시가 사라집니다.</li>
    <li><b>블록당 동시 개설</b>: 택3 선택군은 시간표에서 보통 3개 블록으로 운영되므로 36반이면 블록마다 12반이 동시에 열리고, 교실과 담당 교사도 12개(명)가 동시에 필요합니다. 반 수가 택N으로 나누어떨어지지 않으면 블록별 반 수가 달라집니다.</li>
    <li><b>이동반 인원</b>: 과목별 예상 신청 인원 ÷ 반 수입니다. 선택자료가 있으면 그대로 쓰고, 없으면 참고 추정·과거 선택 환산·보충 수요를 씁니다. 그래도 없으면 현재 반 수 × 선택군 평균 반당 인원으로 추정합니다. 학년 학생 수를 입력하면 과목별 인원을 ‘학생 수 × 택N’ 합계에 맞춰 환산합니다.</li>
    <li><b>반당 인원 고르게</b>: 개설 과목마다 1반을 두고, 남은 반을 그 시점에 반당 인원이 가장 많은 과목에 하나씩 더합니다. 가장 큰 반의 인원이 가능한 한 작아집니다. <b>현재 반 수 비율 유지</b>는 지금 예상안의 반 수 비율대로 나눕니다.</li>
    <li><b>시간표 블록 점검</b>: 학년 전체가 택N개 블록으로 함께 이동한다고 보고, 교과별 반 수 ÷ 택N(올림)을 그 교과의 학기별 교사 수와 비교합니다. 반군을 나눠 운영하거나 다른 학년 수업과 겹치면 실제 필요 인원은 달라집니다.</li>
    <li>0반·미개설 과목은 자동으로 열지 않습니다. 반 수를 직접 입력한 과목은 그대로 두고 나머지만 다시 나눕니다.</li>
    <li><b>담임 학급 수</b> 자체를 바꾸는 시뮬레이션은 ‘계산 기준·자료’의 입학 연도별 학급 수에서 합니다. 학교 지정 과목 시수와 선택군 기준이 함께 바뀝니다. 위 학년 카드에서 학급 1개를 줄였을 때의 변화를 미리 볼 수 있습니다.</li>
   </ul></details>`;
  }
  function view(){
   const s=getState(),y=getYear(),ctx=sync();
   return header('반편성 시뮬레이션','선택군 목표 반 수(학급 수 × 택N)를 줄이거나 늘렸을 때 이동수업 반당 인원, 과목별 반 수, 교과별 시수와 시간표 블록이 어떻게 달라지는지 미리 보고 적용합니다.')+
    cohorts()+gradeCards(s,y)+toolbar()+overview(s,y)+
    (ctx?detail(s,ctx):'<section class="surface cs-detail"><p class="cs-quiet cs-empty">이 학기에는 학생 선택군이 없습니다.</p></section>')+batch(s,y)+notes();
  }
  function apply(){
   const s=getState(),ctx=sync();if(!ctx)return;
   const alloc=CS.allocate(ctx,ui.total,prefs.method,ui.pinned);
   try{
    const res=CS.applyScenario(s,[{year:ctx.year,groupId:ctx.groupId,total:ui.total,sections:alloc.sections}],{rescale:prefs.rescale});
    ui.pinned={};
    transact(()=>Object.assign(s,res.state),`${ctx.grade}학년 ${ctx.term}학기 선택군 ${ctx.code} 목표를 ${ui.total}반${ui.total===ctx.base?'(기준)':''}으로 적용했습니다.${res.changes.length?` 과목 ${res.changes.length}개의 반 수를 바꿨습니다.`:''}`);
   }catch(e){toast(e.message);}
  }
  function batchApply(){
   const s=getState(),b=batchState(s,getYear());
   if(!b?.res){toast(b?.error||'적용할 수 없습니다.');return;}
   transact(()=>Object.assign(s,b.res.state),`${ui.batchGrade}학년 선택군 ${b.plans.length}개를 ${ui.batchUnits}학급 기준으로 적용했습니다.`);
   ui.total=null;ui.pinned={};
  }
  function csv(){
   const ctx=sync();if(!ctx)return;
   const cap=prefs.capacity,alloc=CS.allocate(ctx,ui.total,prefs.method,ui.pinned),now=CS.evaluate(ctx,ctx.current,cap),sim=CS.evaluate(ctx,alloc.sections,cap);
   const rows=[['학년도','학년','학기','입학연도','선택군','택','기준반수','시뮬레이션 목표','과목','담당교과','반당시수','예상신청','인원근거','현재반수','시뮬레이션반수','현재 반당인원','시뮬레이션 반당인원','시뮬레이션 최대인원','현재 주당시수','시뮬레이션 주당시수']];
   ctx.items.forEach((i,k)=>{const a=now.rows[k],b=sim.rows[k];rows.push([ctx.year,ctx.grade,ctx.term,ctx.cohort,ctx.code,ctx.picks,ctx.base,ui.total,i.name,i.teaching,i.hours??'미정',r1(i.demand),CS.SOURCE_TEXT[i.source]||'',i.enabled?a.n??'미정':'미개설',i.enabled?b.n??'미정':'미개설',r1(a.avg),r1(b.avg),b.max??'',a.weekly??'',b.weekly??'']);});
   rows.push([]);
   rows.push(['목표반수','학급환산','블록당 동시개설','블록별 반 수','이동반 평균','가장 큰 반',`${cap}명 초과 과목 수`,'주당시수','배분 방식']);
   for(const T of CS.candidates(ctx,[ui.total])){const a=CS.allocate(ctx,T,prefs.method),e=CS.evaluate(ctx,a.sections,cap);rows.push([T,M.round(T/ctx.picks),peak(e.blocks)??'',e.blocks.join('·'),r1(e.average),e.maxSize??'',e.over.length,e.weekly,METHOD[prefs.method]]);}
   download(`${ctx.year}학년도_${ctx.grade}학년${ctx.term}학기_선택군${ctx.code}_반편성시뮬레이션.csv`,M.csv(rows),'text/csv;charset=utf-8');
  }
  // Re-render after the browser has moved focus, then return focus to the same control.
  function later(fn){
   setTimeout(()=>{
    const key=document.activeElement?.dataset?.csFocus;
    fn();
    if(key)document.querySelector(`[data-cs-focus="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
   },0);
  }
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   const d=b.dataset;
   if(d.csTerm){ui.term=Number(d.csTerm);ui.total=null;ui.pinned={};render();return;}
   if(d.csPick){
    if(d.csPickTerm)ui.term=Number(d.csPickTerm);
    ui.year=getYear();ui.groupId=d.csPick;ui.total=null;ui.pinned={};render();
    document.getElementById('cs-detail')?.scrollIntoView({behavior:'smooth',block:'start'});return;
   }
   if(d.csTotalOption){ui.total=Number(d.csTotalOption);render();return;}
   if(d.csTotalStep){ui.total=Math.min(300,Math.max(1,(ui.total||1)+Number(d.csTotalStep)));render();return;}
   if(d.csUnpin){delete ui.pinned[d.csUnpin];render();return;}
   if(d.csClearPins){ui.pinned={};render();return;}
   if(d.csReset){const ctx=sync();if(ctx){ui.total=ctx.base;ui.pinned={};render();}return;}
   if(d.csCsv){csv();return;}
   if(d.csApply){apply();return;}
   if(d.csUnitsStep){ui.batchUnits=Math.min(50,Math.max(1,(ui.batchUnits||1)+Number(d.csUnitsStep)));render();return;}
   if(d.csBatchApply)batchApply();
  });
  document.addEventListener('change',e=>{
   const el=e.target,d=el.dataset||{};
   if(d.csStudents){
    if(!el.reportValidity())return;
    const c=Number(d.csStudents),v=el.value===''?null:Number(el.value);
    later(()=>transact(()=>{getState().cohortStudents[c]=v;},v===null?`${c} 입학생 학생 수를 미정으로 바꿨습니다.`:`${c} 입학생 ${v}명을 반당 인원 계산에 반영했습니다.`));
    return;
   }
   if(d.csSections){
    if(!el.reportValidity()){toast('반 수는 0~100 사이의 정수로 입력해 주세요.');return;}
    if(el.value==='')delete ui.pinned[d.csSections];else ui.pinned[d.csSections]=Number(el.value);
    later(render);return;
   }
   if(d.csTotal){if(!el.reportValidity())return;ui.total=Number(el.value);later(render);return;}
   if(el.id==='cs-method'){prefs.method=el.value;savePrefs();ui.pinned={};later(render);return;}
   if(el.id==='cs-capacity'){if(!el.reportValidity())return;prefs.capacity=Number(el.value);savePrefs();later(render);return;}
   if(el.id==='cs-rescale'){prefs.rescale=el.checked;savePrefs();later(render);return;}
   if(el.id==='cs-batch-grade'){ui.batchGrade=Number(el.value);ui.batchUnits=null;later(render);return;}
   if(el.id==='cs-batch-units'){if(!el.reportValidity())return;ui.batchUnits=Number(el.value);later(render);}
  });
  return {view};
 };
})(globalThis);
