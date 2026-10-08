(function (root) {
  'use strict';
  const D = root.CURRICULUM_DATA;
  const YEARS = [2027, 2028, 2029];
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
  function defaultTeacherCounts(){
    return Object.fromEntries(YEARS.map(y=>[y,Object.fromEntries(D.departments.map(d=>{const n=D.teacherReference.find(x=>x.dept===d)?.count??null;return [d,[n,n]];}))]));
  }
  const SHARED_DEPTS=['사회 공통','과학 공통·융합','교양'];
  const TEACHING_DEPTS=D.departments.filter(d=>!SHARED_DEPTS.includes(d));
  const sourceDepts=new Map(D.curriculum.map(r=>[r.id,r.dept]));
  function sharedCategory(row){
    const original=sourceDepts.get(row.id.slice(String(row.year).length+1));
    return SHARED_DEPTS.includes(original)?original:SHARED_DEPTS.includes(row.dept)?row.dept:null;
  }
  function receivingDepartments(row){
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
      if(!num(a.hours)||a.hours<=0||a.hours>4000||Math.abs(a.hours-round(a.hours))>0.00001)throw new Error('배정 시수는 소수 둘째 자리까지의 양수여야 합니다.');
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
  function suggestAllocations(state,id){
    const row=state.rows.find(r=>r.id===id),total=row&&hours(row);if(!row||!sharedCategory(row)||total===null||total<=0)return [];
    const base=clone(state);base.rows.find(r=>r.id===id).allocations=[];
    const candidates=teacherSummary(base,row.year).filter(d=>receivingDepartments(row).includes(d.dept)).map(d=>({dept:d.dept,total:d.terms[row.term-1].total,teachers:d.terms[row.term-1].teachers,missing:d.terms[row.term-1].missing||d.terms[row.term-1].pendingTransfers,assigned:0})).filter(d=>d.teachers>0&&!d.missing);
    if(!candidates.length)return [];
    let remaining=round(total);
    while(remaining>0){const step=Math.min(0.5,remaining);candidates.sort((a,b)=>(a.total+a.assigned+step)/a.teachers-(b.total+b.assigned+step)/b.teachers||ranks[a.dept]-ranks[b.dept]);candidates[0].assigned=round(candidates[0].assigned+step);remaining=round(remaining-step);}
    return candidates.filter(d=>d.assigned>0).map(d=>({dept:d.dept,hours:d.assigned}));
  }

  function chooseReference(row) {
    const same = D.choices.filter(x => x.name === row.name);
    return same.sort((a,b) => ((b.grade === row.grade ? 4 : 0)+(b.term === row.term ? 2 : 0)) - ((a.grade === row.grade ? 4 : 0)+(a.term === row.term ? 2 : 0)) || b.cohort-a.cohort)[0] || null;
  }
  function defaultState() {
    const state = {schema:1, name:'기본 예상안', classes:{2025:13,2026:13,2027:12,2028:12,2029:12}, classSize:23, weeks:[17,17], teacherCounts:defaultTeacherCounts(), rows:[], updatedAt:null};
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
  function groupChecks(state,year) {
    const checks=[];
    for(const grade of [2,3]) {
      const cohort=year-grade+1;
      for(const g of D.groups.filter(g=>g.cohort===Math.min(cohort,2027)&&g.grade===grade)) {
        const rr=state.rows.filter(r=>r.year===year&&r.grade===grade&&r.groupId===g.id);
        if(!rr.length)continue;
        const unknown=rr.filter(r=>r.enabled&&r.sections===null).length;
        const actual=rr.reduce((s,r)=>s+(r.enabled?r.sections??0:0),0);
        const target=g.picks*state.classes[cohort];
        checks.push({grade,term:g.term,picks:g.picks,code:selectionGroup(rr[0]).code,actual,target,unknown,names:rr.map(r=>r.name),id:g.id});
      }
    }
    return checks;
  }
  function validateState(value) {
    if(!value || value.schema!==1 || !Array.isArray(value.rows) || value.rows.length>3000)throw new Error('이 사이트에서 저장한 예상안 JSON 파일을 선택해 주세요.');
    if(typeof value.name!=='string'||value.name.length>80)throw new Error('예상안 이름을 확인해 주세요.');
    for(const c of [2025,2026,2027,2028,2029])if(!Number.isInteger(value.classes?.[c])||value.classes[c]<1||value.classes[c]>50)throw new Error('입학 연도별 학급 수는 1~50이어야 합니다.');
    if(!num(value.classSize)||value.classSize<1||value.classSize>100)throw new Error('반당 기준 인원을 확인해 주세요.');
    if(!Array.isArray(value.weeks)||value.weeks.length!==2||value.weeks.some(n=>!num(n)||n<1||n>30))throw new Error('학기별 수업 주 수를 확인해 주세요.');
    // Upgrade old backups without replacing any existing course edits.
    value=clone(value);
    if(value.teacherCounts===undefined)value.teacherCounts=defaultTeacherCounts();
    for(const year of YEARS)for(const dept of D.departments){
      const counts=value.teacherCounts?.[year]?.[dept];
      if(!Array.isArray(counts)||counts.length!==2||counts.some(n=>n!==null&&(!Number.isInteger(n)||n<0||n>100)))throw new Error('교과별 교사 수는 학기별 0~100명 또는 미정이어야 합니다.');
    }
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
  root.Planner={YEARS,clone,round,sortRows,defaultState,hours,summarize,pivot,setCohortClasses,recommendSections,groupChecks,validateState,csv,requiredClasses,selectionGroup,selectionLabel,groupsForYear,matchesGroup,defaultTeacherCounts,teacherSummary,SHARED_DEPTS,TEACHING_DEPTS,sharedCategory,receivingDepartments,assignmentStatus,setAllocations,validateAllocations,effectiveRows,assignmentOverview,suggestAllocations};
})(globalThis);
