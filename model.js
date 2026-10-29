(function (root) {
  'use strict';
  const D = root.CURRICULUM_DATA;
  const YEARS = [2027, 2028, 2029];
  const COHORTS = [2025, 2026, 2027, 2028, 2029];
  const clone = x => JSON.parse(JSON.stringify(x));
  const num = x => typeof x === 'number' && Number.isFinite(x);
  const round = x => Math.round(x * 100) / 100;
  const gradeClasses = c => c <= 2026 ? 13 : 12;
  const ranks = Object.fromEntries(D.departments.map((x, i) => [x, i]));
  const sortRows = (a,b) => a.grade-b.grade || (ranks[a.dept] ?? 99)-(ranks[b.dept] ?? 99) || a.name.localeCompare(b.name,'ko') || a.term-b.term;
  // Letters identify the source table's selection blocks, in source row order.
  // They are never shared identifiers across different admission cohorts.
  const labeledGroups=D.groups.map(g=>({...g,code:String.fromCharCode(65+D.groups.filter(x=>x.cohort===g.cohort).findIndex(x=>x.id===g.id))}));
  function selectionGroup(row){return labeledGroups.find(g=>g.id===row.groupId)||null;}
  function findGroup(group){return typeof group==='string'?labeledGroups.find(g=>g.id===group)||null:group||null;}
  function selectionLabel(row,full=false){
    if(row.required)return '학교 지정';
    const g=selectionGroup(row);
    if(!g)return '선택군 미지정';
    return `${full?`${row.grade}학년 ${row.term}학기 · `:''}선택군 ${g.code} · 택${g.picks}`;
  }
  function groupsForYear(year,grade=null,term=null){
    return [1,2,3].filter(g=>!grade||g===grade).flatMap(g=>labeledGroups.filter(x=>x.cohort===Math.min(year-g+1,2027)&&x.grade===g&&(!term||x.term===term))).sort((a,b)=>a.grade-b.grade||a.term-b.term||a.code.localeCompare(b.code));
  }
  function matchesGroup(row,key){return key==='all'||key==='required'&&row.required||key==='ungrouped'&&!row.required&&!row.groupId||row.groupId===key;}
  // A selection group's total sections. The default is classes × picks (예: 13학급 × 택3 = 39반).
  // The class-scenario page may store a different total per year and group (예: 36반) to test larger moving classes.
  const groupKey=(year,groupId)=>`${year}:${groupId}`;
  function baseGroupTarget(state,year,group){
    const g=findGroup(group);
    if(!g)return null;
    return g.picks*state.classes[year-g.grade+1];
  }
  function groupTarget(state,year,group){
    const g=findGroup(group);
    if(!g)return null;
    const stored=state.groupTargets?.[groupKey(year,g.id)];
    return Number.isInteger(stored)?stored:baseGroupTarget(state,year,g);
  }
  function setGroupTarget(state,year,groupId,total){
    const g=findGroup(groupId);
    if(!YEARS.includes(year)||!g||g.cohort!==Math.min(year-g.grade+1,2027))throw new Error('목표 반 수를 바꿀 학년도와 선택군을 확인해 주세요.');
    if(total!==null&&(!Number.isInteger(total)||total<1||total>300))throw new Error('선택군 목표 반 수는 1~300 사이의 정수여야 합니다.');
    if(!state.groupTargets)state.groupTargets={};
    const key=groupKey(year,g.id);
    if(total===null||total===baseGroupTarget(state,year,g))delete state.groupTargets[key];
    else state.groupTargets[key]=total;
  }
  // 2027학년도 반편성 기준 학생 수: 2025 입학생 243명, 2026 입학생 274명. 이후 입학생은 미정.
  // 2027학년도 선택인원(2026.10.28. 최종)은 합계가 이 학생 수와 같고, 다른 학년도의 과거 자료 추정은 이 학생 수에 맞춰 비례 환산합니다.
  const KNOWN_STUDENTS={2025:243,2026:274};
  const SURVEY_STUDENTS={2025:239,2026:267};
  function defaultCohortStudents(){return Object.fromEntries(COHORTS.map(c=>[c,KNOWN_STUDENTS[c]??null]));}
  // 2027학년도 2·3학년 선택과목은 과목별 선택인원(2026.10.28.) 최종 자료(choice-final.js)를 씁니다.
  // 인원은 항상 최종값으로, 반 수는 직접 수정하지 않은 과목만 최종 개설반으로 맞춥니다.
  const FINAL=root.CHOICE_FINAL||null;
  function finalChoice(row){
    if(!FINAL||row.year!==FINAL.year)return null;
    return FINAL.rows.find(x=>x.cohort===row.cohort&&x.grade===row.grade&&x.term===row.term&&x.name===row.name)||null;
  }
  function applyFinalChoices(state){
    if(!FINAL||state.choiceVersion===FINAL.version)return null;
    const result={students:0,sections:0,groups:0},touched=new Set();
    for(const r of state.rows){
      const x=finalChoice(r);if(!x)continue;
      if(r.students!==x.students){r.students=x.students;result.students++;}
      if(!r.edited&&r.enabled&&r.sections!==x.sections){r.sections=x.sections;result.sections++;}
      if(r.groupId)touched.add(r.groupId);
    }
    // A group untouched by the user follows the school's final total (예: 택1 제2외국어 12반).
    for(const id of touched){
      const rows=state.rows.filter(r=>r.year===FINAL.year&&r.groupId===id);
      if(rows.some(r=>r.edited||r.enabled&&r.sections===null))continue;
      const total=rows.reduce((n,r)=>n+(r.enabled?r.sections:0),0);
      if(total>=1&&total<=300&&total!==groupTarget(state,FINAL.year,id)){setGroupTarget(state,FINAL.year,id,total);result.groups++;}
    }
    state.choiceVersion=FINAL.version;
    return result;
  }
  function defaultTeacherCounts(){
    return Object.fromEntries(YEARS.map(y=>[y,Object.fromEntries(D.departments.map(d=>{const n=D.teacherReference.find(x=>x.dept===d)?.count??null;return [d,[n,n]];}))]));
  }
  function setTeacherCount(state,year,dept,count){
    if(!YEARS.includes(year)||!TEACHING_DEPTS.includes(dept))throw new Error('교사 수를 바꿀 학년도와 교과를 확인해 주세요.');
    if(count!==null&&(!Number.isInteger(count)||count<0||count>100))throw new Error('교사 수는 0~100 사이의 정수 또는 미정이어야 합니다.');
    for(const y of YEARS.filter(y=>y>=year))state.teacherCounts[y][dept]=[count,count];
  }
  const SHARED_DEPTS=['사회 공통','과학 공통·융합','교양'];
  const TEACHING_DEPTS=D.departments.filter(d=>!SHARED_DEPTS.includes(d));
  const sourceDepts=new Map(D.curriculum.map(r=>[r.id,r.dept]));
  function sharedCategory(row){
    if(row.relatedPlanning&&root.PLANNING_DATA?.rules.some(r=>r.name===row.name&&['역사','일반사회','지리','윤리'].includes(r.allowed[0])))return '사회 공통';
    const original=sourceDepts.get(row.id.slice(String(row.year).length+1));
    return SHARED_DEPTS.includes(original)?original:SHARED_DEPTS.includes(row.dept)?row.dept:null;
  }
  function receivingDepartments(row){
    const rule=row.relatedPlanning&&root.PLANNING_DATA?.rules.find(r=>r.name===row.name);
    if(rule)return rule.allowed.slice();
    const category=sharedCategory(row);
    return category==='사회 공통'?['역사','일반사회','지리','윤리']:category==='과학 공통·융합'?['물리학','화학','생명과학','지구과학']:category==='교양'?TEACHING_DEPTS:[];
  }
  function assignmentStatus(row){
    const total=hours(row),entries=row.allocations||[],requested=round(entries.reduce((s,a)=>s+a.hours,0));
    const over=total!==null&&total>0&&requested>total+0.001;
    // Preserve stored decisions when a course closes or changes size. Never silently
    // overcount, truncate, or move the user's allocation to another department.
    const active=total!==null&&total>0&&!over;
    const allocations=active?entries.filter(a=>a.hours>0):[];
    const assigned=round(allocations.reduce((s,a)=>s+a.hours,0));
    return {total,requested,assigned,remaining:total===null?null:round(total-assigned),allocations,over,paused:!active&&requested>0};
  }
  function validateAllocations(row,entries,checkTotal=true){
    if(!Array.isArray(entries)||entries.length>TEACHING_DEPTS.length)throw new Error('과목별 배정 내역을 확인해 주세요.');
    const allowed=receivingDepartments(row),seen=new Set();
    for(const a of entries){
      if(!a||!allowed.includes(a.dept)||seen.has(a.dept))throw new Error('배정 가능한 교과를 확인해 주세요. 사회·과학은 해당 교과 안에서 배정합니다.');
      if(!num(a.hours)||a.hours<=0||a.hours>4000||Math.abs(a.hours-round(a.hours))>0.00001)throw new Error('배정 시수는 1~4000 사이의 정수 양수여야 합니다.');
      // Old backups remain readable; new allocation edits must use whole hours.
      if(checkTotal&&!Number.isInteger(a.hours))throw new Error('배정 시수는 1시간 단위의 정수로 입력해 주세요.');
      seen.add(a.dept);
    }
    if(checkTotal&&entries.length){const total=hours(row),sum=round(entries.reduce((s,a)=>s+a.hours,0));if(total===null||total===0)throw new Error('개설 여부와 과목 총시수를 먼저 입력해 주세요.');if(sum>total+0.001)throw new Error('과목 총시수보다 많이 배정할 수 없습니다.');}
    return clone(entries);
  }
  function setAllocations(state,id,entries){const row=state.rows.find(r=>r.id===id);if(!row||!sharedCategory(row))throw new Error('배정할 공통·융합·교양 과목을 찾지 못했습니다.');row.allocations=validateAllocations(row,entries);}
  function effectiveRows(state){
    return state.rows.flatMap(r=>{
      const category=sharedCategory(r);if(!category)return [r];
      const a=assignmentStatus(r),parts=a.allocations.map(x=>({...r,dept:x.dept,hours:x.hours,sections:1,allocationRole:'배정',allocationOrigin:category}));
      if(a.remaining===null||a.remaining>0||a.total===0)parts.push({...r,dept:category,hours:a.remaining,sections:a.remaining===null?null:1,allocationRole:'미배정',allocationOrigin:category});
      return parts;
    });
  }
  function assignmentOverview(state,year,term=null){
    const rows=state.rows.filter(r=>r.year===year&&(!term||r.term===term)&&sharedCategory(r));
    return rows.reduce((s,r)=>{const a=assignmentStatus(r);s.total=round(s.total+(a.total??0));s.assigned=round(s.assigned+a.assigned);s.remaining=round(s.remaining+(a.remaining??0));s.missing+=a.total===null?1:0;s.review+=a.over?1:0;return s;},{total:0,assigned:0,remaining:0,missing:0,review:0});
  }
  function teacherSummary(state,year){
    const effective=effectiveRows(state).filter(r=>r.year===year);
    return D.departments.map(dept=>{
      const rows=effective.filter(r=>r.dept===dept),summary=summarize(rows);
      return {dept,rows,terms:summary.terms.map((term,i)=>{
        const teachers=state.teacherCounts[year][dept][i],received=round(rows.filter(r=>r.term===i+1&&r.allocationRole==='배정').reduce((n,r)=>n+(hours(r)??0),0));
        const pendingTransfers=state.rows.filter(r=>r.year===year&&r.term===i+1&&sharedCategory(r)&&assignmentStatus(r).paused&&(r.allocations||[]).some(a=>a.dept===dept)&&hours(r)!==0).length;
        return {...term,teachers,own:round(term.total-received),received,pendingTransfers,perTeacher:num(teachers)&&teachers>0?round(term.total/teachers):null};
      })};
    });
  }
  // All current suggestions use whole classes; the hour shape remains compatible with saved plans.
  function suggestAllocations(state,id){return suggestSectionAllocations(state,id);}
  function integerAllocationPlan(input){
    const state=clone(input),changes=[],skipped=[];
    const rows=state.rows.filter(r=>(r.allocations||[]).some(a=>!Number.isInteger(a.hours)))
      .sort((a,b)=>a.year-b.year||a.term-b.term||a.grade-b.grade||a.id.localeCompare(b.id));
    for(const row of rows){
      const before=clone(row.allocations),status=assignmentStatus(row);
      const skip=reason=>skipped.push({id:row.id,year:row.year,term:row.term,name:row.name,reason});
      // Do not round a partial total up, or turn a held allocation into an active one.
      if(status.paused){skip('보류된 기존 배정은 그대로 보관합니다.');continue;}
      if(!Number.isInteger(status.requested)){skip('배정 합계가 소수입니다. 과목별 배정 합계를 정수로 먼저 조정해 주세요.');continue;}
      const summaries=teacherSummary(state,row.year);
      const candidates=before.filter(a=>!Number.isInteger(a.hours)).map(a=>{
        const t=summaries.find(d=>d.dept===a.dept)?.terms[row.term-1];
        return {dept:a.dept,teachers:t?.teachers,total:t?.total,missing:t?.missing||t?.pendingTransfers,
          fraction:round(a.hours-Math.floor(a.hours))};
      });
      if(candidates.some(a=>!(a.teachers>0)||a.missing)){skip('교사 수 또는 시수가 미정이거나 보류된 배정이 있어 평균을 비교할 수 없습니다.');continue;}
      const after=before.map(a=>({...a,hours:Math.floor(a.hours)})),awards=[];
      let remaining=status.requested-after.reduce((s,a)=>s+a.hours,0);
      for(const a of candidates)a.total=round(a.total-a.fraction);
      while(remaining>0){
        candidates.sort((a,b)=>a.total/a.teachers-b.total/b.teachers||(a.total+1)/a.teachers-(b.total+1)/b.teachers||ranks[a.dept]-ranks[b.dept]);
        const chosen=candidates[0];
        awards.push({dept:chosen.dept,averageBefore:round(chosen.total/chosen.teachers)});
        after.find(a=>a.dept===chosen.dept).hours++;chosen.total++;remaining--;
      }
      row.allocations=validateAllocations(row,after.filter(a=>a.hours>0));
      changes.push({id:row.id,year:row.year,term:row.term,name:row.name,total:status.requested,before,after:clone(row.allocations),awards});
    }
    return {state,changes,skipped};
  }
  function allocationSectionStep(row){
    if(!num(row.hours)||row.hours<=0)return null;
    const cents=Math.round(row.hours*100);
    if(Math.abs(cents-row.hours*100)>0.00001)return null;
    let a=cents,b=100;while(b){const remainder=a%b;a=b;b=remainder;}
    return 100/a;
  }
  function assignedSections(row,hours){
    if(!(row.hours>0))return null;
    const n=hours/row.hours;
    return Math.abs(n-Math.round(n))<1e-8?Math.round(n):n;
  }
  function needsWholeSections(row){
    return (row.allocations||[]).some(a=>!Number.isInteger(a.hours)||!Number.isInteger(assignedSections(row,a.hours)));
  }
  function sectionEntries(row,entries){
    if(!Array.isArray(entries))throw new Error('담당 반 수를 확인해 주세요.');
    const step=allocationSectionStep(row);
    if(!step&&entries.some(a=>a.sections>0))throw new Error('반당 시수를 먼저 입력해 주세요.');
    for(const a of entries)if(!a||!Number.isInteger(a.sections)||a.sections<0||a.sections>100||a.sections%(step||1)!==0)throw new Error(`담당 반 수는 ${step||1}반 단위의 정수로 입력해 주세요.`);
    return validateAllocations(row,entries.filter(a=>a.sections>0).map(a=>({dept:a.dept,hours:round(a.sections*row.hours)})));
  }
  function setAllocationSections(state,id,entries){
    const row=state.rows.find(r=>r.id===id);
    if(!row||!sharedCategory(row))throw new Error('배정할 공통·융합·교양 과목을 찾지 못했습니다.');
    row.allocations=sectionEntries(row,entries);
  }
  function suggestSectionAllocations(state,id){
    const row=state.rows.find(r=>r.id===id),total=row&&hours(row),step=row&&allocationSectionStep(row);
    if(!row||!sharedCategory(row)||!(total>0)||!step)return [];
    const base=clone(state);base.rows.find(r=>r.id===id).allocations=[];
    const quantum=round(row.hours*step);
    const candidates=teacherSummary(base,row.year).filter(d=>receivingDepartments(row).includes(d.dept)).map(d=>{
      const t=d.terms[row.term-1];return {dept:d.dept,total:t.total,teachers:t.teachers,missing:t.missing||t.pendingTransfers,assigned:0};
    }).filter(d=>d.teachers>0&&!d.missing);
    if(!candidates.length)return [];
    for(let remaining=Math.floor(row.sections/step);remaining>0;remaining--){
      candidates.sort((a,b)=>(a.total+a.assigned)/a.teachers-(b.total+b.assigned)/b.teachers||(a.total+a.assigned+quantum)/a.teachers-(b.total+b.assigned+quantum)/b.teachers||ranks[a.dept]-ranks[b.dept]);
      candidates[0].assigned+=quantum;
    }
    return candidates.filter(a=>a.assigned>0).map(a=>({dept:a.dept,hours:a.assigned}));
  }
  function wholeSectionAllocationPlan(input,ids=null){
    const state=clone(input),changes=[],skipped=[];
    const rows=state.rows.filter(r=>(!ids||ids.includes(r.id))&&needsWholeSections(r)).sort((a,b)=>a.year-b.year||a.term-b.term||a.grade-b.grade||a.id.localeCompare(b.id));
    for(const row of rows){
      const before=clone(row.allocations),status=assignmentStatus(row),step=allocationSectionStep(row);
      const skip=reason=>skipped.push({id:row.id,year:row.year,term:row.term,name:row.name,reason});
      if(status.paused){skip('보류된 기존 배정은 그대로 보관합니다. 배정 수정에서 확인해 주세요.');continue;}
      if(!step){skip('반당 시수가 미정이거나 반 단위로 환산할 수 없습니다.');continue;}
      const quantum=round(row.hours*step),blocks=status.requested/quantum;
      if(Math.abs(blocks-Math.round(blocks))>1e-8){skip('기존 배정 합계가 온전한 반 단위가 아닙니다. 담당 반 수를 직접 조정해 주세요.');continue;}
      const summary=teacherSummary(state,row.year);
      const candidates=before.filter(a=>Math.abs(a.hours/quantum-Math.round(a.hours/quantum))>1e-8).map(a=>{
        const t=summary.find(d=>d.dept===a.dept)?.terms[row.term-1];
        const floor=Math.floor(a.hours/quantum+1e-8)*quantum;
        return {dept:a.dept,total:round(t.total-a.hours+floor),teachers:t.teachers,missing:t.missing||t.pendingTransfers};
      });
      if(candidates.some(a=>!(a.teachers>0)||a.missing)){skip('교사 수 또는 시수가 미정이거나 보류된 배정이 있어 평균을 비교할 수 없습니다.');continue;}
      const after=before.map(a=>({dept:a.dept,hours:Math.floor(a.hours/quantum+1e-8)*quantum}));
      let remaining=Math.round((status.requested-after.reduce((n,a)=>n+a.hours,0))/quantum);
      while(remaining>0){
        candidates.sort((a,b)=>a.total/a.teachers-b.total/b.teachers||(a.total+quantum)/a.teachers-(b.total+quantum)/b.teachers||ranks[a.dept]-ranks[b.dept]);
        const chosen=candidates[0];after.find(a=>a.dept===chosen.dept).hours+=quantum;chosen.total+=quantum;remaining--;
      }
      row.allocations=sectionEntries(row,after.map(a=>({dept:a.dept,sections:assignedSections(row,a.hours)})));
      changes.push({id:row.id,year:row.year,term:row.term,grade:row.grade,name:row.name,unit:row.hours,sections:row.sections,total:status.requested,before,after:clone(row.allocations)});
    }
    return {state,changes,skipped};
  }

  function chooseReference(row) {
    const same = D.choices.filter(x => x.name === row.name);
    return same.sort((a,b) => ((b.grade === row.grade ? 4 : 0)+(b.term === row.term ? 2 : 0)) - ((a.grade === row.grade ? 4 : 0)+(a.term === row.term ? 2 : 0)) || b.cohort-a.cohort)[0] || null;
  }
  function defaultState() {
    const state = {schema:1, name:'기본 예상안', classes:{2025:13,2026:13,2027:12,2028:12,2029:12}, classSize:23, weeks:[17,17], teacherCounts:defaultTeacherCounts(), groupTargets:{}, cohortStudents:defaultCohortStudents(), rows:[], updatedAt:null};
    for (const year of YEARS) {
      for (const grade of [1,2,3]) {
        const cohort = year-grade+1;
        for (const source of D.curriculum.filter(x => x.cohort === Math.min(cohort,2027) && x.grade === grade)) {
          const r = {...source, id:`${year}:${source.id}`, year, cohort, curriculumCohort:source.cohort, enabled:true, edited:false, notes:'', students:null, sections:null, ref:null, allocations:[]};
          if (source.required) {
            r.basis = source.cross ? 'cross' : 'required';
            r.sections = requiredClasses(r,state.classes[cohort]);
          } else {
            const exact = D.choices.find(x => x.cohort === cohort && x.grade === grade && x.term === r.term && x.name === r.name);
            const ref = exact || chooseReference(r);
            r.ref = ref ? clone(ref) : null;
            if (exact) {
              r.students=exact.students; r.sections=exact.sections; r.basis='actual';
            } else if (ref) {
              const ratio=state.classes[cohort]/gradeClasses(ref.cohort);
              r.students=ref.students===null ? null : Math.round(ref.students*ratio);
              r.sections=ref.sections===null ? null : ref.sections===0 ? 0 : Math.max(1,Math.round(ref.sections*ratio));
              r.basis='forecast';
            } else r.basis='missing';
          }
          state.rows.push(r);
        }
      }
    }
    applyFinalChoices(state);
    return state;
  }
  function requiredClasses(row, n) {
    if (!row.cross) return n;
    const first = ['음악','음악 연주와 창작','정보'].includes(row.name);
    return first === (row.term===1) ? Math.floor(n/2) : Math.ceil(n/2);
  }
  function hours(row) {
    if (!row.enabled || row.sections===0) return 0;
    return row.sections===null || row.hours===null ? null : round(row.sections*row.hours);
  }
  function summarize(rows, weeks=[17,17]) {
    const terms=[1,2].map(term => {
      const rr=rows.filter(r=>r.term===term);
      return {total:round(rr.reduce((s,r)=>s+(hours(r)??0),0)), missing:rr.filter(r=>hours(r)===null).length, open:rr.filter(r=>r.enabled&&r.sections>0).length};
    });
    return {terms, average:round((terms[0].total+terms[1].total)/2), annual:round(terms[0].total*weeks[0]+terms[1].total*weeks[1]), missing:terms[0].missing+terms[1].missing};
  }
  function pivot(rows, key='dept') {
    const map=new Map();
    for(const r of rows){
      const k=key==='name' ? `${r.dept}|${r.name}` : r.dept;
      if(!map.has(k))map.set(k,{key:k,dept:r.dept,name:key==='name'?r.name:r.dept,rows:[]});
      map.get(k).rows.push(r);
    }
    return [...map.values()].sort((a,b)=>(ranks[a.dept]??99)-(ranks[b.dept]??99)||a.name.localeCompare(b.name,'ko'));
  }
  function setCohortClasses(state,cohort,n) {
    state.classes[cohort]=n;
    for (const r of state.rows.filter(r=>r.cohort===Number(cohort))) {
      if(r.edited)continue;
      if(r.required)r.sections=requiredClasses(r,n);
      else if(r.basis==='forecast'&&r.ref){
        const ratio=n/gradeClasses(r.ref.cohort);
        r.sections=r.ref.sections===null?null:r.ref.sections===0?0:Math.max(1,Math.round(r.ref.sections*ratio));
        r.students=r.ref.students===null?null:Math.round(r.ref.students*ratio);
      }
    }
  }
  function recommendSections(students,size,method='ceil') {
    if(students===null)return null;
    if(students===0)return 0;
    return Math.max(1,(method==='round'?Math.round:Math.ceil)(students/size));
  }
  function groupRows(state,row){
    return state.rows.filter(r=>r.year===row.year&&r.cohort===row.cohort&&r.grade===row.grade&&r.term===row.term&&r.groupId===row.groupId);
  }
  const EDIT_FIELDS=['name','dept','enabled','hours','sections','students','notes'];
  function groupSectionPlan(state,id,patch={}){
    const row=state.rows.find(r=>r.id===id),group=row&&selectionGroup(row);
    if(!group)throw new Error('반 수를 함께 조정할 선택군이 없습니다.');
    const rows=clone(groupRows(state,row)),edited=rows.find(r=>r.id===id);
    for(const field of EDIT_FIELDS)if(Object.hasOwn(patch,field))edited[field]=patch[field];
    return balanceGroupSections({id,group:clone(group),classes:state.classes[row.cohort],base:baseGroupTarget(state,row.year,group),target:groupTarget(state,row.year,group),rows,weights:Object.fromEntries(rows.map(r=>[r.id,r.sections])),note:''});
  }
  function groupSectionStatus(plan){
    const active=plan.rows.filter(r=>r.enabled),unknown=active.filter(r=>r.sections===null).length;
    const valid=plan.rows.every(r=>r.sections===null||Number.isInteger(r.sections)&&r.sections>=0&&r.sections<=100);
    const actual=active.reduce((s,r)=>s+(num(r.sections)?r.sections:0),0);
    return {actual,unknown,valid,canApply:valid&&actual<=plan.target&&(unknown>0||actual===plan.target)};
  }
  function balanceGroupSections(input){
    const plan=clone(input),selected=plan.fixedId===null?null:plan.rows.find(r=>r.id===plan.id);
    plan.note='';
    const status=groupSectionStatus(plan);
    if(!status.valid){plan.note='반 수는 0~100 사이의 정수로 입력해 주세요.';return plan;}
    if(status.unknown){plan.note='미정 과목의 반 수는 임의로 정하지 않습니다. 모든 반 수를 입력한 뒤 자동 맞추기를 누르세요. 미정 상태로 저장할 수도 있습니다.';return plan;}
    const fixed=selected?.enabled?selected.sections:0;
    let remaining=plan.target-fixed;
    if(remaining<0){plan.note='입력한 과목의 반 수가 선택군 전체 목표보다 큽니다. 반 수를 줄여 주세요.';return plan;}
    // Closed and zero-section courses stay closed unless the user explicitly edits them.
    let candidates=plan.rows.filter(r=>r.id!==selected?.id&&r.enabled).map(r=>({row:r,weight:plan.weights?.[r.id]??r.sections})).filter(c=>c.weight>0);
    if(remaining>candidates.length*100){plan.note='나머지 개설 과목만으로 목표 반 수를 채울 수 없습니다. 아래에서 다른 과목의 반 수를 입력해 주세요.';return plan;}
    // Largest remainder apportionment keeps integer totals exact. Saturation handles
    // imported plans and large cohort settings while respecting the existing 100 cap.
    while(candidates.length){
      const weight=candidates.reduce((s,c)=>s+c.weight,0);
      const capped=candidates.filter(c=>remaining*c.weight/weight>=100);
      if(capped.length){for(const c of capped){c.row.sections=100;remaining-=100;}candidates=candidates.filter(c=>!capped.includes(c));continue;}
      const quotas=candidates.map(c=>({...c,quota:remaining*c.weight/weight}));
      for(const c of quotas)c.row.sections=Math.floor(c.quota);
      let extras=remaining-quotas.reduce((s,c)=>s+c.row.sections,0);
      quotas.sort((a,b)=>(b.quota-Math.floor(b.quota))-(a.quota-Math.floor(a.quota))||(a.row.id<b.row.id?-1:a.row.id>b.row.id?1:0));
      for(const c of quotas)if(extras>0){c.row.sections++;extras--;}
      break;
    }
    return plan;
  }
  function applyGroupSections(state,plan){
    const row=state.rows.find(r=>r.id===plan.id),group=row&&selectionGroup(row);
    if(!group||plan.target!==groupTarget(state,row.year,group))throw new Error('선택군 또는 학급 수·목표 반 수가 바뀌었습니다. 다시 조정해 주세요.');
    const expected=groupRows(state,row),ids=new Set(plan.rows.map(r=>r.id));
    if(ids.size!==plan.rows.length||expected.length!==plan.rows.length||expected.some(r=>!ids.has(r.id)))throw new Error('같은 학년도·학년·학기의 선택군만 함께 조정할 수 있습니다.');
    const status=groupSectionStatus(plan);
    if(!status.canApply)throw new Error(status.valid?'선택군의 반 수 합계를 목표에 맞춰 주세요.':'반 수는 0~100 사이의 정수로 입력해 주세요.');
    const next=clone(state),updates=[];
    for(const draft of plan.rows){
      const old=state.rows.find(r=>r.id===draft.id),target=next.rows.find(r=>r.id===draft.id);
      const fields=draft.id===plan.id?EDIT_FIELDS:['sections'];
      for(const field of fields)target[field]=draft[field];
      if(fields.some(field=>old[field]!==target[field])){target.edited=true;updates.push(target);}
    }
    if(!groupSectionStatus({...plan,rows:groupRows(next,row)}).canApply)throw new Error('선택군의 반 수 합계를 목표에 맞춰 주세요.');
    // Check the entire candidate before touching live state, including duplicate names.
    validateState(next);
    for(const update of updates)Object.assign(state.rows.find(r=>r.id===update.id),update);
    return updates.length;
  }
  function autoSectionPlan(state,ids,size,method='ceil'){
    const next=clone(state),groups=new Map(),selected=new Set(ids);
    if(!Number.isInteger(size)||size<1||size>100)throw new Error('반당 기준 인원은 1~100 사이의 정수여야 합니다.');
    for(const row of next.rows.filter(r=>selected.has(r.id)&&r.enabled&&!r.required&&r.students!==null)){
      row.sections=recommendSections(row.students,size,method);
      if(selectionGroup(row))groups.set(`${row.year}:${row.grade}:${row.term}:${row.groupId}`,row);
    }
    const plans=[];
    for(const row of groups.values()){
      const group=selectionGroup(row);
      const plan=balanceGroupSections({id:row.id,fixedId:null,group:clone(group),classes:next.classes[row.cohort],base:baseGroupTarget(next,row.year,group),target:groupTarget(next,row.year,group),rows:clone(groupRows(next,row)),note:''});
      plans.push(plan);
      for(const draft of plan.rows)next.rows.find(r=>r.id===draft.id).sections=draft.sections;
    }
    for(const row of next.rows){const old=state.rows.find(r=>r.id===row.id);if(old.sections!==row.sections)row.edited=true;}
    next.classSize=size;
    return {state:next,groups:plans,canApply:plans.every(p=>groupSectionStatus(p).canApply)};
  }
  function groupChecks(state,year) {
    const checks=[];
    for(const grade of [2,3]) {
      const cohort=year-grade+1;
      for(const g of D.groups.filter(g=>g.cohort===Math.min(cohort,2027)&&g.grade===grade)) {
        const rr=state.rows.filter(r=>r.year===year&&r.grade===grade&&r.groupId===g.id);
        if(!rr.length)continue;
        const unknown=rr.filter(r=>r.enabled&&r.sections===null).length;
        const actual=rr.reduce((s,r)=>s+(r.enabled?r.sections??0:0),0);
        const base=g.picks*state.classes[cohort],target=groupTarget(state,year,g.id);
        checks.push({grade,term:g.term,picks:g.picks,code:selectionGroup(rr[0]).code,actual,target,base,override:target!==base,unknown,names:rr.map(r=>r.name),id:g.id});
      }
    }
    return checks;
  }
  function validateState(value) {
    if(!value || value.schema!==1 || !Array.isArray(value.rows) || value.rows.length>3000)throw new Error('이 사이트에서 저장한 예상안 JSON 파일을 선택해 주세요.');
    if(typeof value.name!=='string'||value.name.length>80)throw new Error('예상안 이름을 확인해 주세요.');
    for(const c of COHORTS)if(!Number.isInteger(value.classes?.[c])||value.classes[c]<1||value.classes[c]>50)throw new Error('입학 연도별 학급 수는 1~50이어야 합니다.');
    if(!num(value.classSize)||value.classSize<1||value.classSize>100)throw new Error('반당 기준 인원을 확인해 주세요.');
    if(!Array.isArray(value.weeks)||value.weeks.length!==2||value.weeks.some(n=>!num(n)||n<1||n>30))throw new Error('학기별 수업 주 수를 확인해 주세요.');
    // Upgrade old backups without replacing any existing course edits.
    value=clone(value);
    if(value.teacherCounts===undefined)value.teacherCounts=defaultTeacherCounts();
    for(const year of YEARS)for(const dept of D.departments){
      const counts=value.teacherCounts?.[year]?.[dept];
      if(!Array.isArray(counts)||counts.length!==2||counts.some(n=>n!==null&&(!Number.isInteger(n)||n<0||n>100)))throw new Error('교과별 교사 수는 학기별 0~100명 또는 미정이어야 합니다.');
    }
    // Earlier plans have no adjusted selection-group totals or grade sizes.
    if(value.groupTargets===undefined||value.groupTargets===null)value.groupTargets={};
    if(typeof value.groupTargets!=='object'||Array.isArray(value.groupTargets))throw new Error('선택군 목표 반 수 자료를 확인해 주세요.');
    for(const [key,total] of Object.entries(value.groupTargets)){
      const [y,id]=key.split(':'),g=findGroup(id),year=Number(y);
      if(!YEARS.includes(year)||!g||g.cohort!==Math.min(year-g.grade+1,2027))throw new Error('선택군 목표 반 수의 학년도·선택군을 확인해 주세요.');
      if(!Number.isInteger(total)||total<1||total>300)throw new Error('선택군 목표 반 수는 1~300 사이의 정수여야 합니다.');
    }
    const students=defaultCohortStudents();
    if(value.cohortStudents===undefined||value.cohortStudents===null)value.cohortStudents=students;
    if(typeof value.cohortStudents!=='object'||Array.isArray(value.cohortStudents))throw new Error('학년별 학생 수 자료를 확인해 주세요.');
    for(const c of COHORTS){
      if(value.cohortStudents[c]===undefined)value.cohortStudents[c]=students[c];
      // The first release filled in the survey totals; replace those untouched defaults.
      if(value.cohortStudents[c]===SURVEY_STUDENTS[c])value.cohortStudents[c]=KNOWN_STUDENTS[c];
      const n=value.cohortStudents[c];
      if(n!==null&&(!Number.isInteger(n)||n<1||n>2000))throw new Error('학년별 학생 수는 1~2000명 또는 미정이어야 합니다.');
    }
    if(value.choiceVersion!==undefined&&(typeof value.choiceVersion!=='string'||value.choiceVersion.length>20))throw new Error('선택인원 자료 버전을 확인해 주세요.');
    applyFinalChoices(value);
    const ids=new Set(), courseKeys=new Set();
    for(const r of value.rows){
      if(typeof r.id!=='string'||r.id.length>150||ids.has(r.id))throw new Error('중복되거나 잘못된 과목 식별자가 있습니다.');
      ids.add(r.id);
      const courseKey=[r.year,r.grade,r.term,r.name].join('|');
      if(courseKeys.has(courseKey))throw new Error('같은 학년·학기에 중복된 과목이 있습니다.');
      courseKeys.add(courseKey);
      if(!YEARS.includes(r.year)||![1,2,3].includes(r.grade)||![1,2].includes(r.term)||r.cohort!==r.year-r.grade+1)throw new Error('과목의 학년도·입학 연도·학년·학기가 맞지 않습니다.');
      if(typeof r.name!=='string'||!r.name.trim()||r.name.length>100||!D.departments.includes(r.dept))throw new Error('과목명 또는 교과를 확인해 주세요.');
      for(const [k,max,int] of [['hours',40,false],['sections',100,true],['students',10000,true]]){
        if(r[k]!==null&&(!num(r[k])||r[k]<0||r[k]>max||(int&&!Number.isInteger(r[k]))))throw new Error('시수·반 수·인원은 범위 내의 숫자 또는 미정이어야 합니다.');
      }
      if(typeof r.enabled!=='boolean'||typeof r.required!=='boolean'||typeof r.cross!=='boolean'||typeof r.edited!=='boolean')throw new Error('과목 상태가 올바르지 않습니다.');
      if(typeof r.notes!=='string'||r.notes.length>1000||typeof r.type!=='string'||r.type.length>40)throw new Error('과목 설명을 확인해 주세요.');
      if(!['required','cross','actual','forecast','missing','manual'].includes(r.basis))throw new Error('산정 근거가 올바르지 않습니다.');
      if(r.ref!==null){
        const ref=D.choices.find(x=>x.cohort===r.ref?.cohort&&x.grade===r.ref?.grade&&x.term===r.ref?.term&&x.name===r.ref?.name);
        if(!ref)throw new Error('선택인원 참고 자료가 올바르지 않습니다.');
        r.ref=clone(ref);
      }
      if(r.groupId!==null&&!D.groups.some(g=>g.id===r.groupId))throw new Error('선택군 정보가 올바르지 않습니다.');
      if(r.groupId!==null){const g=selectionGroup(r);if(r.required||g.cohort!==Math.min(r.cohort,2027)||g.grade!==r.grade||g.term!==r.term)throw new Error('과목과 선택군의 입학 연도·학년·학기가 맞지 않습니다.');}
      if(r.allocations===undefined){
        // Earlier versions could move a common course wholly to one department.
        // Retain that decision when upgrading, while allowing splits thereafter.
        r.allocations=sharedCategory(r)&&receivingDepartments(r).includes(r.dept)&&hours(r)>0?[{dept:r.dept,hours:hours(r)}]:[];
      }
      validateAllocations(r,r.allocations,false);
    }
    if(!value.rows.length)throw new Error('과목이 없는 예상안은 불러올 수 없습니다.');
    return clone(value);
  }
  function csvCell(value) {
    let s=String(value??'');
    if(/^[=+@\-\t\r]/.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  }
  function csv(matrix) {return '\ufeff'+matrix.map(row=>row.map(csvCell).join(',')).join('\r\n');}
  root.Planner={YEARS,COHORTS,clone,round,sortRows,defaultState,hours,summarize,pivot,setCohortClasses,recommendSections,groupChecks,validateState,csv,requiredClasses,selectionGroup,selectionLabel,groupsForYear,matchesGroup,defaultTeacherCounts,setTeacherCount,teacherSummary,SHARED_DEPTS,TEACHING_DEPTS,sharedCategory,receivingDepartments,assignmentStatus,setAllocations,validateAllocations,effectiveRows,assignmentOverview,suggestAllocations,integerAllocationPlan,allocationSectionStep,assignedSections,needsWholeSections,sectionEntries,setAllocationSections,suggestSectionAllocations,wholeSectionAllocationPlan,groupRows,groupSectionPlan,groupSectionStatus,balanceGroupSections,applyGroupSections,autoSectionPlan,finalChoice,applyFinalChoices,groupKey,groupTarget,baseGroupTarget,setGroupTarget,defaultCohortStudents};
})(globalThis);
