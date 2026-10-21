(function(root){
 'use strict';
 root.createAssignmentUI=function(api){
  const {M,esc,f,header,cohorts,options,transact,openDialog,closeDialog,toast,download,render,getState,getYear}=api;
  const $=s=>document.querySelector(s);
  let selectedTerm=1,category='all',draftId=null,sectionDraft=null;
  const state=()=>getState(),year=()=>getYear();
  const course=id=>state().rows.find(r=>r.id===id);
  const sharedRows=()=>state().rows.filter(r=>r.year===year()&&r.term===selectedTerm&&M.sharedCategory(r)&&(category==='all'||M.sharedCategory(r)===category)).sort(M.sortRows);
  function statusText(r){const a=M.assignmentStatus(r);return a.over?'시수 변경 · 재배정 필요':a.total===null?'총시수 미정':a.total===0?'미개설·0시수':a.assigned===0?'미배정':a.remaining>0?'일부 배정': '배정 완료';}
  function chips(r){const a=M.assignmentStatus(r);if(a.over)return '<span class="badge missing">기존 배정 초과 · 적용 보류</span>';if(a.total===0||a.total===null)return `<span class="muted">${statusText(r)}${a.requested?' · 기존 배정 보관':''}</span>`;return a.allocations.length?a.allocations.map(x=>`<span class="assigned-chip">${esc(x.dept)} <b>${f(M.assignedSections(r,x.hours))}반 · ${f(x.hours)}시간</b></span>`).join(' '):'<span class="muted">담당 교과를 배정해 주세요</span>';}
  function view(){
   const o=M.assignmentOverview(state(),year(),selectedTerm),rows=sharedRows();
   const fractional=state().rows.filter(M.needsWholeSections).length;
   const loads=M.teacherSummary(state(),year()).filter(d=>M.TEACHING_DEPTS.includes(d.dept));
   const relevant=category==='사회 공통'?['역사','일반사회','지리','윤리']:category==='과학 공통·융합'?['물리학','화학','생명과학','지구과학']:M.TEACHING_DEPTS;
   loads.sort((a,b)=>(a.terms[selectedTerm-1].perTeacher??Infinity)-(b.terms[selectedTerm-1].perTeacher??Infinity));
   return header('공통·교양 시수 배정','담당 반 수를 정수로 입력하면 배정 시수가 자동 계산됩니다. 교사 평균은 소수 둘째 자리까지 표시합니다.')+cohorts()+
   `<div class="assignment-toolbar"><div class="year-switch" role="group" aria-label="배정 학기">${[1,2].map(t=>`<button data-assign-term="${t}" class="${selectedTerm===t?'active':''}" aria-pressed="${selectedTerm===t}">${t}학기</button>`).join('')}</div><label>과목 구분 <select id="assignment-category">${options([['all','공통·융합·교양 전체'],...M.SHARED_DEPTS.map(d=>[d,d])],category)}</select></label><button class="button small" data-assignment-action="export">배정 내역 CSV</button></div>
   ${fractional?`<div class="notice"><span>2027~2029학년도 전체에 담당 반 수가 소수인 과목 ${fractional}개가 있습니다. 기존 담당 교과 중 평균이 낮은 곳에 남는 반을 배정해 정리할 수 있습니다.</span><button class="button small" data-assignment-action="section-preview">소수 담당 반 수 정리</button></div>`:''}
   <div class="assignment-stats"><div><span>${selectedTerm}학기 배정 대상 전체</span><strong>${f(o.total)}<small>시간/주</small></strong></div><div><span>담당 교과에 반영</span><strong>${f(o.assigned)}<small>시간/주</small></strong></div><div class="${o.remaining?'remaining':''}"><span>남은 미배정</span><strong>${f(o.remaining)}<small>시간/주</small></strong></div></div>
   ${o.review||o.missing?`<div class="notice"><span>${o.review?`과목 시수가 줄어 재배정이 필요한 과목 ${o.review}개. 초과한 기존 배정은 평균 반영을 보류했습니다. `:''}${o.missing?`총시수가 미정인 ${o.missing}개 과목은 배정할 수 없습니다.`:''}</span></div>`:''}
   <div class="assignment-workspace"><section class="surface"><div class="surface-head"><div><h2>배정할 과목 <span class="muted">${rows.length}</span></h2><div class="sub">사회 → 사회 교과 · 과학·융합 → 과학 교과 · 교양 → 전체 교과</div></div></div><div class="table-scroll assignment-scroll"><table class="assignment-courses"><thead><tr><th>과목 · 편성</th><th class="num">총시수</th><th>담당 교과 · 배정시수</th><th class="num">미배정</th><th>배정</th></tr></thead><tbody>${rows.map(r=>{const a=M.assignmentStatus(r);return `<tr data-assignment-course="${esc(r.id)}"><td><button class="subject-button" data-assign="${esc(r.id)}">${esc(r.name)}</button><div class="subject-meta">${r.grade}학년 · ${esc(M.sharedCategory(r))}</div>${!r.required?`<div class="subject-meta">${esc(M.selectionLabel(r))}</div>`:''}<div class="subject-meta">${f(r.hours)}시간 × ${f(r.sections)}반</div></td><td class="num"><strong>${f(a.total)}</strong></td><td>${chips(r)}</td><td class="num ${a.remaining?'partial':''}">${f(a.remaining)}</td><td><button class="button small ${a.remaining?'primary':''}" data-assign="${esc(r.id)}">${a.requested?'배정 수정':'배정하기'}</button></td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">해당 학기에 배정할 과목이 없습니다.</td></tr>'}</tbody></table></div><div class="table-footer">배정한 시수는 원래 공통·교양 합계에서 빠지고 담당 교과에 한 번만 더해집니다.</div></section>
   <aside class="surface workload-panel"><div class="surface-head"><div><h2>${selectedTerm}학기 교과별 여유 확인</h2><div class="sub">현재 평균이 낮은 순서 · 배정된 시수 포함</div></div></div><div class="table-scroll"><table><thead><tr><th>교과</th><th class="num">교사</th><th class="num">1인 평균</th></tr></thead><tbody>${loads.filter(d=>relevant.includes(d.dept)).map(d=>{const t=d.terms[selectedTerm-1];return `<tr><td>${esc(d.dept)}</td><td class="num">${t.teachers??'미정'}명</td><td class="num"><b>${t.perTeacher===null?'미산정':f(t.perTeacher)}</b>${t.missing||t.pendingTransfers?' *':''}</td></tr>`;}).join('')}</tbody></table></div><div class="table-footer">단위: 시간/주 · * 입력분 기준</div></aside></div>
   <p class="teacher-help subsection">각 과목의 ‘배정하기’에서 담당 반 수를 정수로 나눌 수 있습니다. 배정 시수 = 담당 반 수 × 반당 시수입니다. 배정안 제안은 교사 수와 현재 평균을 기준으로 하며, 담당 가능 여부를 확인한 뒤 적용하세요. 반 수가 바뀌어도 입력한 배정시수는 그대로 보관되므로 남은 시수 또는 초과 안내를 확인해 주세요.</p>`;
  }
  function draftSections(){return [...document.querySelectorAll('#assignment-form input[data-allocation-dept]')].map(el=>({dept:el.dataset.allocationDept,sections:Number(el.value||0)}));}
  function baseSummaries(r){const clone=M.clone(state());clone.rows.find(x=>x.id===r.id).allocations=[];return M.teacherSummary(clone,r.year);}
  function open(id,focusDept=null){
   const r=course(id);if(!r||!M.sharedCategory(r))return;
   draftId=id;const a=M.assignmentStatus(r),allowed=M.receivingDepartments(r),base=baseSummaries(r),step=M.allocationSectionStep(r);
   const targets=allowed.map(dept=>base.find(d=>d.dept===dept)).sort((a,b)=>(a.terms[r.term-1].perTeacher??Infinity)-(b.terms[r.term-1].perTeacher??Infinity));
   openDialog(`${esc(r.name)} · 담당 반 수 배정`,`${r.year}학년도 ${r.grade}학년 ${r.term}학기 · ${esc(M.sharedCategory(r))}`,
   `<div class="allocation-explanation"><b>${f(r.hours)}시간 × ${f(r.sections)}반 = 총 ${f(a.total)}시간/주</b><p>담당 반 수를 입력하세요. 예: 4시간 과목을 3반 맡으면 12시간이 자동 배정됩니다. ‘배정 적용’을 누르면 인쇄 미리보기와 교사 평균에 즉시 반영됩니다.</p></div>
   ${a.total===null||a.total===0?'<div class="notice">미개설 또는 총시수 미정입니다. 과목 편성에서 시수·반 수를 먼저 정해 주세요. 기존 배정은 보관되며 평균에는 반영되지 않습니다.</div>':''}
   ${a.over?'<div class="notice">과목 총시수보다 기존 배정이 많습니다. 담당 반 수 합계를 개설 반 수 이내로 조정해 주세요.</div>':''}
   <div class="draft-actions">${M.needsWholeSections(r)?'<button class="button small" data-assignment-action="align-sections">기존 배정을 반 단위로 맞추기</button>':''}<button class="button small" data-assignment-action="suggest" ${a.total===null||a.total===0?'disabled':''}>평균이 낮은 교과로 배정안 제안</button><button class="button small" data-assignment-action="clear">입력 비우기</button></div>
   <form id="assignment-form"><div class="table-scroll draft-scroll"><table class="draft-table"><thead><tr><th>담당 교과</th><th class="num">교사 수</th><th class="num">이 과목 제외 평균</th><th class="center">담당 반 수</th><th class="num">배정 시수</th><th class="num">배정 후 평균</th></tr></thead><tbody>${targets.map(d=>{const t=d.terms[r.term-1],saved=(r.allocations||[]).find(x=>x.dept===d.dept)?.hours??0,count=saved?M.assignedSections(r,saved):0;return `<tr data-draft-dept="${esc(d.dept)}"><td><strong>${esc(d.dept)}</strong></td><td class="num">${t.teachers??'미정'}명</td><td class="num">${t.perTeacher===null?'미산정':f(t.perTeacher)}${t.missing||t.pendingTransfers?' *':''}</td><td class="center"><input type="number" class="editable allocation-input" data-allocation-dept="${esc(d.dept)}" data-base-total="${t.total}" data-teachers="${t.teachers??''}" min="0" max="100" step="${step||1}" value="${count??''}" aria-label="${esc(d.dept)} 담당 반 수"></td><td class="num" data-draft-hours="${esc(d.dept)}"></td><td class="num draft-average" data-draft-average="${esc(d.dept)}"></td></tr>`;}).join('')}</tbody></table></div></form>
   <div id="assignment-preview" class="assignment-preview" role="status" aria-live="polite"></div><p class="field-help">담당 반 수는 ${step||1}반 단위 · 배정 시수는 자동 계산 · 교사 평균은 소수 표시. ${step>1?'반당 시수가 소수인 과목은 배정 시수도 정수가 되는 묶음 반 단위를 사용합니다. ':''}미배정분은 자동 배정되지 않습니다. 교사 수가 미정·0명이거나 기존 시수 미정 또는 보류된 배정이 있는 교과는 제안에서 제외합니다.</p>`,
   '<button class="button primary" data-assignment-action="apply" id="apply-assignment">배정 적용</button>');
   $('#dialog').classList.add('assignment-dialog');updatePreview();
   if(focusDept)[...document.querySelectorAll('#assignment-form input')].find(el=>el.dataset.allocationDept===focusDept)?.focus();
  }
  function updatePreview(){
   if(!$('#assignment-form'))return;
   const r=course(draftId),total=M.hours(r),entries=draftSections(),sumSections=entries.reduce((n,a)=>n+a.sections,0),sum=M.round(sumSections*(r.hours||0));
   const inputs=[...document.querySelectorAll('#assignment-form input')],valid=inputs.every(el=>el.validity.valid);
   const over=total!==null&&sum>total+0.001;
   for(const el of inputs){const n=Number(el.value||0),h=M.round(n*(r.hours||0)),teachers=Number(el.dataset.teachers),base=Number(el.dataset.baseTotal);const cell=[...document.querySelectorAll('[data-draft-average]')].find(x=>x.dataset.draftAverage===el.dataset.allocationDept);cell.textContent=teachers>0&&valid?f(M.round((base+h)/teachers)):'미산정';const hoursCell=[...document.querySelectorAll('[data-draft-hours]')].find(x=>x.dataset.draftHours===el.dataset.allocationDept);hoursCell.textContent=valid?f(h)+'시간':'—';}
   $('#assignment-preview').classList.toggle('over',over||!valid);
   $('#assignment-preview').innerHTML=`<span>담당 <b>${f(M.round(sumSections))}반</b> / ${f(r.sections)}반 · <b>${f(sum)}시간</b> / ${f(total)}시간</span><strong>${!valid?`${M.allocationSectionStep(r)||1}반 단위의 정수를 입력하세요.`:over?'개설 반 수 초과 · 줄여 주세요':total===null?'총시수 미정':`남은 미배정 ${f(M.round((r.sections||0)-sumSections))}반 · ${f(M.round(total-sum))}시간`}</strong>`;
   $('#apply-assignment').disabled=!valid||over||(sumSections>0&&(!M.allocationSectionStep(r)||total===null||total===0));
  }
  function fillDraft(entries){const r=course(draftId);for(const el of document.querySelectorAll('#assignment-form input'))el.value=M.assignedSections(r,entries.find(a=>a.dept===el.dataset.allocationDept)?.hours??0)??0;updatePreview();}
  function suggest(){const result=M.suggestSectionAllocations(state(),draftId);if(!result.length){toast('반당 시수·개설 반 수·교사 수와 기존 시수를 확인해 주세요.');return;}fillDraft(result);toast('온전한 반 단위로 제안했습니다. 확인 후 적용해 주세요.');}
  function alignSections(){const result=M.wholeSectionAllocationPlan(state(),[draftId]);if(!result.changes.length){toast(result.skipped[0]?.reason||'이미 반 단위로 배정되어 있습니다.');return;}fillDraft(result.changes[0].after);toast('배정 총시수를 유지하며 반 단위로 맞췄습니다. 확인 후 적용해 주세요.');}
  function sectionPreview(){
   sectionDraft=M.wholeSectionAllocationPlan(state());
   const describe=(entries,unit)=>entries.map(a=>`${esc(a.dept)} ${f(a.hours/unit)}반 (${f(a.hours)}시간)`).join(' · ');
   openDialog('소수 담당 반 수 정리','2027~2029학년도 전체 · 기존 담당 교과 안에서 조정',
    `<p>기존에 온전히 배정한 반은 유지하고, 나뉜 반을 모아 해당 학기 교사 평균이 낮은 기존 담당 교과에 온전한 반 단위로 더합니다. 과목별 전체 개설 반 수와 배정 총시수는 유지하며, 교과별 시수·평균은 바뀝니다.</p><div class="table-scroll"><table><thead><tr><th>학년도 · 학기 · 과목</th><th>현재 배정</th><th>반 단위 배정</th></tr></thead><tbody>${sectionDraft.changes.map(r=>`<tr><td>${r.year} · ${r.term}학기<br>${esc(r.name)}</td><td>${describe(r.before,r.unit)}</td><td>${describe(r.after,r.unit)}</td></tr>`).join('')||'<tr><td colspan="3">자동으로 정리할 수 있는 과목이 없습니다.</td></tr>'}</tbody></table></div>${sectionDraft.skipped.length?`<div class="notice">${sectionDraft.skipped.map(r=>`${r.year} ${r.term}학기 ${esc(r.name)}: ${esc(r.reason)}`).join('<br>')}</div>`:''}`,
    `<button class="button primary" data-assignment-action="section-apply" ${sectionDraft.changes.length?'':'disabled'}>${sectionDraft.changes.length}개 과목 반 단위 배정 적용</button>`);
   $('#dialog').classList.add('assignment-dialog');
  }
  function sectionApply(){
   if(!sectionDraft)return;
   const result=M.wholeSectionAllocationPlan(state());
   transact(()=>{for(const c of result.changes)M.setAllocationSections(state(),c.id,c.after.map(a=>({dept:a.dept,sections:a.hours/c.unit})));},`${result.changes.length}개 과목을 반 단위로 정리했습니다. 인쇄 미리보기도 갱신했습니다.`);
   sectionDraft=null;closeDialog();
  }
  function apply(){try{if(!$('#assignment-form').reportValidity())return;const entries=draftSections();M.sectionEntries(course(draftId),entries);transact(()=>M.setAllocationSections(state(),draftId,entries),'담당 반 수와 시수·교사 평균을 반영했습니다. 인쇄 미리보기도 갱신했습니다.');closeDialog();}catch(e){$('#dialog-error').textContent=e.message;}}
  function exportCSV(){
   const rows=[['학년도','학년','학기','과목','원래구분','과목총시수','담당교과','입력배정시수','실제반영시수','미배정시수','상태']];
   for(const r of state().rows.filter(r=>r.year===year()&&M.sharedCategory(r))){const a=M.assignmentStatus(r);for(const x of r.allocations?.length?r.allocations:[{dept:'미배정',hours:0}])rows.push([r.year,r.grade,r.term,r.name,M.sharedCategory(r),a.total??'미정',x.dept,x.hours,a.allocations.find(e=>e.dept===x.dept)?.hours??0,a.remaining??'미정',statusText(r)]);}
   rows.push(['안내','단위 시간/주. 미배정시수와 과목총시수는 과목마다 반복 표시되므로 담당교과 행을 단순 합산하지 마세요. 초과·미정·미개설 배정은 반영 보류.']);
   download(`${year()}학년도_공통교양_배정내역.csv`,M.csv(rows),'text/csv;charset=utf-8');
  }
  function dutyCSV(rows){
   download(`${year()}학년도_담당교과별_배당표.csv`,M.csv([['학년도','학년','학기','담당교과','과목','배정구분','주당시수'],...rows.map(r=>[r.year,r.grade,r.term,r.dept,r.name,r.allocationRole||'자체 교과',M.hours(r)??'미정']),['안내','단위 시간/주. 공통·융합·교양 과목의 담당교과 배정 반영. 미배정분은 원래 구분에 남겨 학교 합계를 유지합니다.']]),'text/csv;charset=utf-8');
  }
  function departmentDialog(dept){
   const rows=M.effectiveRows(state()).filter(r=>r.year===year()&&r.dept===dept).sort((a,b)=>a.term-b.term||M.sortRows(a,b));
   openDialog(`${esc(dept)} · 담당 과목`,`${year()}학년도 · 자체 과목과 배정받은 공통·교양 과목`,
   `<div class="table-scroll"><table><thead><tr><th>학기</th><th>학년 · 과목</th><th>구분</th><th class="num">시수</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.term}학기</td><td>${r.grade}학년 · <button class="subject-button" ${r.allocationRole?`data-assign="${esc(r.id)}"`:`data-edit="${esc(r.id)}"`}>${esc(r.name)}</button></td><td>${r.allocationRole?`<span class="assigned-chip">${esc(r.allocationOrigin)}에서 배정</span>`:'자체 과목'}</td><td class="num">${f(M.hours(r))}</td></tr>`).join('')}</tbody></table></div>`);
  }
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.assign){open(b.dataset.assign,b.dataset.assignDept);return;}
   if(b.dataset.assignTerm){selectedTerm=Number(b.dataset.assignTerm);render();return;}
   const action=b.dataset.assignmentAction;if(!action)return;
   if(action==='suggest')suggest();if(action==='apply')apply();if(action==='export')exportCSV();
   if(action==='section-preview')sectionPreview();if(action==='section-apply')sectionApply();if(action==='align-sections')alignSections();
   if(action==='clear'){for(const el of document.querySelectorAll('#assignment-form input'))el.value=0;updatePreview();}
  });
  document.addEventListener('input',e=>{if(e.target.dataset.allocationDept)updatePreview();});
  document.addEventListener('change',e=>{if(e.target.id==='assignment-category'){category=e.target.value;render();}});
  $('#dialog').addEventListener('close',()=>$('#dialog').classList.remove('assignment-dialog'));
  return {view,open,departmentDialog,dutyCSV,exportCSV};
 };
})(globalThis);
