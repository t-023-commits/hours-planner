(function(root){
 'use strict';
 const M=root.Planner,D=root.CURRICULUM_DATA,P=root.PLANNING_DATA;
 const areas={사회:['역사','일반사회','지리','윤리'],과학:['물리학','화학','생명과학','지구과학']};
 function distribute(items,target){
  const sum=items.reduce((s,r)=>s+r.weight,0);
  if(!(sum>0)||!Number.isInteger(target)||target<0)throw new Error('선택군의 배분 기준과 목표 반 수를 확인해 주세요.');
  const result=items.map((r,i)=>({...r,index:i,quota:target*r.weight/sum}));
  for(const r of result)r.sections=Math.floor(r.quota);
  let remaining=target-result.reduce((s,r)=>s+r.sections,0);
  const order=[...result].sort((a,b)=>{const diff=(b.quota%1)-(a.quota%1);return Math.abs(diff)>1e-10?diff:a.index-b.index;});
  for(const r of order)if(remaining-->0)r.sections++;
  if(result.some(r=>r.sections>100))throw new Error('한 과목이 100반을 초과합니다. 학급 수를 확인해 주세요.');
  return result;
 }
 function groupDefinition(year,grade,term,code){return P.groups.find(g=>g.year===year&&g.grade===grade&&g.term===term&&g.code===code);}
 function latestState(kind='existing',teachers=null,classes=null){
  const s=M.defaultState();
  s.name=kind==='moved'?'수요 보정 · 세계 문화와 영어 이동안':'수요 보정 · 기존 교육과정';
  s.planningVersion=P.version;s.scenarioKind=kind;
  if(teachers)s.teacherCounts=M.clone(teachers);
  if(classes)s.classes=M.clone(classes);
  for(const r of s.rows){
   if(r.required)r.sections=M.requiredClasses(r,s.classes[r.cohort]);
   if(M.sharedCategory(r)||P.rules.some(x=>x.name===r.name))r.relatedPlanning=true;
  }
  if(kind==='moved'){
   const row=s.rows.find(r=>r.year===2029&&r.grade===3&&r.term===1&&r.name==='세계 문화와 영어');
   row.groupId=M.groupsForYear(2029,3,1).find(g=>g.picks===4).id;
  }
  for(const g of P.groups){
   const def=kind==='moved'&&g.year===2029&&g.grade===3&&g.term===1?P.movedGroups.find(x=>x.code===g.code)||g:g;
   const sections=distribute(def.rows,s.classes[g.year-g.grade+1]*g.picks);
   for(const item of sections){
    const r=s.rows.find(r=>r.year===g.year&&r.grade===g.grade&&r.term===g.term&&r.name===item.name);
    if(!r)throw new Error('보정 과목을 찾지 못했습니다: '+item.name);
    r.sections=item.sections;r.students=null;r.basis='forecast';
    r.projection={version:P.version,weight:item.weight,missing:g.missing.includes(item.name)};
   }
  }
  for(const c of P.allocations.filter(c=>c.plan==='공통'||c.plan===(kind==='moved'?'변경안':'기존안'))){
   for(const p of c.pools){
    const r=s.rows.find(r=>r.year===c.year&&r.grade===p.grade&&r.term===c.term&&r.name===p.name);
    r.allocations=M.clone(p.allocations);r.assignmentOrder=p.order;
   }
  }
  const standard=M.defaultState();
  if(JSON.stringify(s.classes)!==JSON.stringify(standard.classes)||JSON.stringify(s.teacherCounts)!==JSON.stringify(standard.teacherCounts)){
   for(const y of M.YEARS)for(const t of [1,2])allocateRelated(s,y,t);
  }
  return M.validateState(s);
 }
 function demandFor(row){
  if(row.year<2028)return null;
  if(row.name==='경제'&&row.grade===3&&row.term===1)return {students:57,share:57/(239*3),reason:'이전 학년에서 이미 이수하여 3학년 신청이 0명인 영향을 보정'};
  if(row.name==='윤리와 사상'&&row.grade===2&&row.term===2)return {students:99,share:99/(239*3),reason:'같은 택3 선택군의 신청 비율로 미래 수요를 보정'};
  return null;
 }
 function referenceText(row){
  const d=demandFor(row),ref=row.ref;
  if(d)return `보충 ${d.students}명 · 2026학년도 2학년 2학기 · 사용자 제공`;
  return ref?`${ref.students===null?'인원 미정':ref.students+'명'} · ${ref.sections===null?'반 수 미정':ref.sections+'반'} · ${ref.cohort} 입학생 ${ref.grade}학년 ${ref.term}학기`:row.projection?.missing?'같은 과목 선택자료 없음 · 선택군 평균 반 수 가정':'같은 과목 선택자료 없음';
 }
 function projectionText(row){
  if(!row.projection)return row.basis==='actual'?'2026.9.28. 최종 선택자료 반영':'기존 예상안의 값';
  const d=demandFor(row);
  return (row.edited?'직접 조율 · ':'')+(d?`${d.students} ÷ (239명 × 택3) = ${(d.share*100).toFixed(2)}% 수요를 반영` : row.projection.missing?'선택자료 없는 신설 과목은 같은 선택군 평균을 가정':'기존 반 수 비율을 유지')+' · 선택군 목표에 맞춰 정수 배분';
 }
 function allocateRelated(state,year,term){
  const result={courses:0,unassigned:[],areas:[]};
  for(const [area,depts] of Object.entries(areas)){
   const rows=state.rows.filter(r=>r.year===year&&r.term===term&&(depts.includes(r.dept)||r.dept===(area==='사회'?'사회 공통':'과학 공통·융합')));
   for(const r of rows)if(M.sharedCategory(r)||P.rules.some(x=>x.name===r.name))r.relatedPlanning=true;
   const pools=rows.filter(r=>M.sharedCategory(r));
   const counts=depts.map(d=>state.teacherCounts[year][d][term-1]);
   // An unknown own workload is not treated as spare capacity.
   const loads=depts.map(d=>rows.filter(r=>!M.sharedCategory(r)&&r.dept===d).reduce((s,r)=>s+(M.hours(r)??0),0));
   const unknown=depts.map(d=>rows.some(r=>!M.sharedCategory(r)&&r.dept===d&&M.hours(r)===null));
   const tokens=[];
   for(const r of pools){
    r.allocations=[];result.courses++;
    if(M.hours(r)===0)continue;
    const eligible=M.receivingDepartments(r).map(d=>depts.indexOf(d)).filter(i=>i>=0&&counts[i]>0&&!unknown[i]);
    if(M.hours(r)===null||!eligible.length){result.unassigned.push(r.name);continue;}
    const step=M.allocationSectionStep(r);
    if(!step){result.unassigned.push(r.name);continue;}
    const quantum=M.round(r.hours*step);
    for(let i=0;i<Math.floor(r.sections/step);i++)tokens.push({r,i,h:quantum,eligible,dept:-1});
    if(r.sections%step)result.unassigned.push(r.name);
   }
   tokens.sort((a,b)=>a.eligible.length-b.eligible.length||b.h-a.h||a.r.grade-b.r.grade||(a.r.assignmentOrder??a.r.sourceRow)-(b.r.assignmentOrder??b.r.sourceRow)||a.i-b.i);
   const cost=(v,d)=>v*v/counts[d];
   for(const t of tokens){let best=t.eligible[0],score=Infinity;for(const d of t.eligible){const delta=cost(loads[d]+t.h,d)-cost(loads[d],d);if(delta<score-1e-8){score=delta;best=d;}}t.dept=best;loads[best]+=t.h;}
   for(let cycle=0;cycle<500;cycle++){
    let best=-1e-8,action=null;
    for(let i=0;i<tokens.length;i++){
     const a=tokens[i],x=a.dept;
     for(const y of a.eligible)if(y!==x){const delta=cost(loads[x]-a.h,x)+cost(loads[y]+a.h,y)-cost(loads[x],x)-cost(loads[y],y);if(delta<best){best=delta;action={i,y};}}
     for(let j=i+1;j<tokens.length;j++){const b=tokens[j],y=b.dept;if(x===y||a.h===b.h||!a.eligible.includes(y)||!b.eligible.includes(x))continue;const delta=cost(loads[x]-a.h+b.h,x)+cost(loads[y]+a.h-b.h,y)-cost(loads[x],x)-cost(loads[y],y);if(delta<best){best=delta;action={i,j};}}
    }
    if(!action)break;
    const a=tokens[action.i],x=a.dept;
    if(action.j!==undefined){const b=tokens[action.j],y=b.dept;loads[x]+=b.h-a.h;loads[y]+=a.h-b.h;a.dept=y;b.dept=x;}
    else{loads[x]-=a.h;loads[action.y]+=a.h;a.dept=action.y;}
   }
   for(const r of pools)r.allocations=depts.flatMap((dept,d)=>{const sum=M.round(tokens.filter(t=>t.r===r&&t.dept===d).reduce((s,t)=>s+t.h,0));return sum?[{dept,hours:sum}]:[];});
   result.areas.push(area);
  }
  return result;
 }
 // When class counts change, rebalance an untouched future group as a whole.
 const originalClasses=M.setCohortClasses;
 M.setCohortClasses=function(s,cohort,n){
  if(!s.planningVersion)return originalClasses(s,cohort,n);
  const before=M.clone(s);originalClasses(s,cohort,n);
  for(const g of P.groups.filter(g=>g.year-g.grade+1===Number(cohort))){
   const rows=before.rows.filter(r=>r.year===g.year&&r.grade===g.grade&&r.term===g.term&&M.selectionGroup(r)?.code===g.code);
   if(rows.some(r=>r.edited)){for(const r of rows){const target=s.rows.find(x=>x.id===r.id);target.sections=r.sections;}continue;}
   const weights=rows.map(r=>({name:r.name,weight:r.projection?.weight??r.sections??1}));
   // A stored target from the class-scenario page (예: 39반 → 36반) is kept when class counts change.
   for(const item of distribute(weights,M.groupTarget(s,g.year,rows[0].groupId)))s.rows.find(r=>r.year===g.year&&r.grade===g.grade&&r.term===g.term&&r.name===item.name).sections=item.sections;
  }
 };
 root.PlanningUpdates={latestState,distribute,groupDefinition,demandFor,referenceText,projectionText,allocateRelated,areas};
})(globalThis);
