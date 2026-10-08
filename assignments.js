(function(root){
 'use strict';
 root.createAssignmentUI=function(api){
  const {M,esc,f,header,cohorts,options,transact,openDialog,closeDialog,toast,download,render,getState,getYear}=api;
  const $=s=>document.querySelector(s);
  let selectedTerm=1,category='all',draftId=null;
  const state=()=>getState(),year=()=>getYear();
  const course=id=>state().rows.find(r=>r.id===id);
  const sharedRows=()=>state().rows.filter(r=>r.year===year()&&r.term===selectedTerm&&M.sharedCategory(r)&&(category==='all'||M.sharedCategory(r)===category)).sort(M.sortRows);
  function statusText(r){const a=M.assignmentStatus(r);return a.over?'시수 변경 · 재배정 필요':a.total===null?'총시수 미정':a.total===0?'미개설·0시수':a.assigned===0?'미배정':a.remaining>0?'일부 배정': '배정 완료';}
  function chips(r){const a=M.assignmentStatus(r);if(a.over)return '<span class="badge missing">기존 배정 초과 · 적용 보류</span>';if(a.total===0||a.total===null)return `<span class="muted">${statusText(r)}${a.requested?' · 기존 배정 보관':''}</span>`;return a.allocations.length?a.allocations.map(x=>`<span class="assigned-chip">${esc(x.dept)} <b>${f(x.hours)}</b></span>`).join(' '):'<span class="muted">담당 교과를 배정해 주세요</span>';}
  function view(){
   const o=M.assignmentOverview(state(),year(),selectedTerm),rows=sharedRows();
   const loads=M.teacherSummary(state(),year()).filter(d=>M.TEACHING_DEPTS.includes(d.dept));
   const relevant=category==='사회 공통'?['역사','일반사회','지리','윤리']:category==='과학 공통·융합'?['물리학','화학','생명과학','지구과학']:M.TEACHING_DEPTS;
   loads.sort((a,b)=>(a.terms[selectedTerm-1].perTeacher??Infinity)-(b.terms[selectedTerm-1].perTeacher??Infinity));
   return header('공통·교양 시수 배정','과목 시수를 담당 교과에 나누어 배정하면 학기별 교사 평균에 반영됩니다.')+cohorts()+
   `<div class="assignment-toolbar"><div class="year-switch" role="group" aria-label="배정 학기">${[1,2].map(t=>`<button data-assign-term="${t}" class="${selectedTerm===t?'active':''}" aria-pressed="${selectedTerm===t}">${t}학기</button>`).join('')}</div><label>과목 구분 <select id="assignment-category">${options([['all','공통·융합·교양 전체'],...M.SHARED_DEPTS.map(d=>[d,d])],category)}</select></label><button class="button small" data-assignment-action="export">배정 내역 CSV</button></div>
   <div class="assignment-stats"><div><span>${selectedTerm}학기 배정 대상 전체</span><strong>${f(o.total)}<small>시간/주</small></strong></div><div><span>담당 교과에 반영</span><strong>${f(o.assigned)}<small>시간/주</small></strong></div><div class="${o.remaining?'remaining':''}"><span>남은 미배정</span><strong>${f(o.remaining)}<small>시간/주</small></strong></div></div>
   ${o.review||o.missing?`<div class="notice"><span>${o.review?`과목 시수가 줄어 재배정이 필요한 과목 ${o.review}개. 초과한 기존 배정은 평균 반영을 보류했습니다. `:''}${o.missing?`총시수가 미정인 ${o.missing}개 과목은 배정할 수 없습니다.`:''}</span></div>`:''}
   <div class="assignment-workspace"><section class="surface"><div class="surface-head"><div><h2>배정할 과목 <span class="muted">${rows.length}</span></h2><div class="sub">사회 → 사회 교과 · 과학·융합 → 과학 교과 · 교양 → 전체 교과</div></div></div><div class="table-scroll assignment-scroll"><table class="assignment-courses"><thead><tr><th>과목 · 편성</th><th class="num">총시수</th><th>담당 교과 · 배정시수</th><th class="num">미배정</th><th>배정</th></tr></thead><tbody>${rows.map(r=>{const a=M.assignmentStatus(r);return `<tr data-assignment-course="${esc(r.id)}"><td><button class="subject-button" data-assign="${esc(r.id)}">${esc(r.name)}</button><div class="subject-meta">${r.grade}학년 · ${esc(M.sharedCategory(r))}</div>${!r.required?`<div class="subject-meta">${esc(M.selectionLabel(r))}</div>`:''}<div class="subject-meta">${f(r.hours)}시간 × ${f(r.sections)}반</div></td><td class="num"><strong>${f(a.total)}</strong></td><td>${chips(r)}</td><td class="num ${a.remaining?'partial':''}">${f(a.remaining)}</td><td><button class="button small ${a.remaining?'primary':''}" data-assign="${esc(r.id)}">${a.requested?'배정 수정':'배정하기'}</button></td></tr>`;}).join('')||'<tr><td colspan="5" class="empty">해당 학기에 배정할 과목이 없습니다.</td></tr>'}</tbody></table></div><div class="table-footer">배정한 시수는 원래 공통·교양 합계에서 빠지고 담당 교과에 한 번만 더해집니다.</div></section>
   <aside class="surface workload-panel"><div class="surface-head"><div><h2>${selectedTerm}학기 교과별 여유 확인</h2><div class="sub">현재 평균이 낮은 순서 · 배정된 시수 포함</div></div></div><div class="table-scroll"><table><thead><tr><th>교과</th><th class="num">교사</th><th class="num">1인 평균</th></tr></thead><tbody>${loads.filter(d=>relevant.includes(d.dept)).map(d=>{const t=d.terms[selectedTerm-1];return `<tr><td>${esc(d.dept)}</td><td class="num">${t.teachers??'미정'}명</td><td class="num"><b>${t.perTeacher===null?'미산정':f(t.perTeacher)}</b>${t.missing||t.pendingTransfers?' *':''}</td></tr>`;}).join('')}</tbody></table></div><div class="table-footer">단위: 시간/주 · * 입력분 기준</div></aside></div>
   <p class="teacher-help subsection">각 과목의 ‘배정하기’에서 여러 교과로 나눌 수 있습니다. 배정안 제안은 교사 수와 현재 평균을 기준으로 하며, 담당 가능 여부를 확인한 뒤 적용하세요. 반 수가 바뀌어도 입력한 배정시수는 그대로 보관되므로 남은 시수 또는 초과 안내를 확인해 주세요.</p>`;
  }
  function draftEntries(){return [...document.querySelectorAll('#assignment-form input[data-allocation-dept]')].map(el=>({dept:el.dataset.allocationDept,hours:Number(el.value||0)})).filter(a=>a.hours>0);}
  function baseSummaries(r){const clone=M.clone(state());clone.rows.find(x=>x.id===r.id).allocations=[];return M.teacherSummary(clone,r.year);}
  function open(id){
   const r=course(id);if(!r||!M.sharedCategory(r))return;
   draftId=id;const a=M.assignmentStatus(r),allowed=M.receivingDepartments(r),base=baseSummaries(r);
   const targets=allowed.map(dept=>base.find(d=>d.dept===dept)).sort((a,b)=>(a.terms[r.term-1].perTeacher??Infinity)-(b.terms[r.term-1].perTeacher??Infinity));
   openDialog(`${esc(r.name)} · 담당 교과 배정`,`${r.year}학년도 ${r.grade}학년 ${r.term}학기 · ${esc(M.sharedCategory(r))}`,
   `<div class="allocation-explanation"><b>${f(r.hours)}시간 × ${f(r.sections)}반 = 총 ${f(a.total)}시간/주</b><p>예: 4시간 과목의 3개 반을 맡기면 12시간을 입력합니다. 한 과목의 시수를 여러 교과로 나눌 수 있습니다.</p></div>
   ${a.total===null||a.total===0?'<div class="notice">미개설 또는 총시수 미정입니다. 과목 편성에서 시수·반 수를 먼저 정해 주세요. 기존 배정은 보관되며 평균에는 반영되지 않습니다.</div>':''}
   ${a.over?'<div class="notice">과목 총시수가 줄어 기존 배정이 초과되었습니다. 아래 시수를 줄여 다시 적용해 주세요.</div>':''}
   <div class="draft-actions"><button class="button small" data-assignment-action="suggest" ${a.total===null||a.total===0?'disabled':''}>평균이 낮은 교과로 배정안 제안</button><button class="button small" data-assignment-action="clear">입력 비우기</button><span>제안 후 직접 조정 가능</span></div>
   <form id="assignment-form"><div class="table-scroll draft-scroll"><table class="draft-table"><thead><tr><th>담당 교과</th><th class="num">교사 수</th><th class="num">이 과목 제외 평균</th><th class="center">배정 시수</th><th class="num">배정 후 평균</th></tr></thead><tbody>${targets.map(d=>{const t=d.terms[r.term-1],saved=(r.allocations||[]).find(x=>x.dept===d.dept)?.hours??0;return `<tr data-draft-dept="${esc(d.dept)}"><td><strong>${esc(d.dept)}</strong></td><td class="num">${t.teachers??'미정'}명</td><td class="num">${t.perTeacher===null?'미산정':f(t.perTeacher)}${t.missing||t.pendingTransfers?' *':''}</td><td class="center"><input type="number" class="editable allocation-input" data-allocation-dept="${esc(d.dept)}" data-base-total="${t.total}" data-teachers="${t.teachers??''}" min="0" max="4000" step="0.01" value="${saved}" aria-label="${esc(d.dept)} 배정 시수"></td><td class="num draft-average" data-draft-average="${esc(d.dept)}"></td></tr>`;}).join('')}</tbody></table></div></form>
   <div id="assignment-preview" class="assignment-preview" role="status" aria-live="polite"></div><p class="field-help">단위: 시간/주 · 소수 둘째 자리까지 입력 가능 · 미배정분은 다른 교과에 자동으로 배정되지 않습니다. 교사 수가 미정·0명이거나 기존 과목 시수 미정 또는 보류된 배정이 있는 교과는 자동 제안에서 제외합니다.</p>`,
   '<button class="button primary" data-assignment-action="apply" id="apply-assignment">배정 적용</button>');
   $('#dialog').classList.add('assignment-dialog');updatePreview();
  }
  function updatePreview(){
   if(!$('#assignment-form'))return;
   const r=course(draftId),total=M.hours(r),entries=draftEntries(),sum=M.round(entries.reduce((n,a)=>n+a.hours,0));
   const inputs=[...document.querySelectorAll('#assignment-form input')],valid=inputs.every(el=>el.validity.valid);
   const over=total!==null&&sum>total+0.001;
   for(const el of inputs){const n=Number(el.value||0),teachers=Number(el.dataset.teachers),base=Number(el.dataset.baseTotal);const cell=[...document.querySelectorAll('[data-draft-average]')].find(x=>x.dataset.draftAverage===el.dataset.allocationDept);cell.textContent=teachers>0&&valid?f(M.round((base+n)/teachers)):'미산정';}
   $('#assignment-preview').classList.toggle('over',over||!valid);
   $('#assignment-preview').innerHTML=`<span>입력한 배정 <b>${f(sum)}시간</b> / 총 ${f(total)}시간</span><strong>${!valid?'0 이상의 숫자를 소수 둘째 자리까지 입력하세요.':over?`${f(M.round(sum-total))}시간 초과 · 줄여 주세요`:total===null?'총시수 미정':`남은 미배정 ${f(M.round(total-sum))}시간`}</strong>`;
   $('#apply-assignment').disabled=!valid||over||(sum>0&&(total===null||total===0));
  }
  function suggest(){const result=M.suggestAllocations(state(),draftId);if(!result.length){toast('교사 수와 기존 시수가 입력된 배정 가능 교과가 없습니다.');return;}for(const el of document.querySelectorAll('#assignment-form input'))el.value=result.find(a=>a.dept===el.dataset.allocationDept)?.hours??0;updatePreview();toast('0.5시간 단위로 평균이 낮은 교과부터 제안했습니다. 확인 후 적용해 주세요.');}
  function apply(){try{if(!$('#assignment-form').reportValidity())return;const entries=M.validateAllocations(course(draftId),draftEntries());transact(()=>M.setAllocations(state(),draftId,entries),'배정 시수를 교과별 평균에 반영했습니다.');closeDialog();}catch(e){$('#dialog-error').textContent=e.message;}}
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
   if(b.dataset.assign){open(b.dataset.assign);return;}
   if(b.dataset.assignTerm){selectedTerm=Number(b.dataset.assignTerm);render();return;}
   const action=b.dataset.assignmentAction;if(!action)return;
   if(action==='suggest')suggest();if(action==='apply')apply();if(action==='export')exportCSV();
   if(action==='clear'){for(const el of document.querySelectorAll('#assignment-form input'))el.value=0;updatePreview();}
  });
  document.addEventListener('input',e=>{if(e.target.dataset.allocationDept)updatePreview();});
  document.addEventListener('change',e=>{if(e.target.id==='assignment-category'){category=e.target.value;render();}});
  $('#dialog').addEventListener('close',()=>$('#dialog').classList.remove('assignment-dialog'));
  return {view,open,departmentDialog,dutyCSV,exportCSV};
 };
})(globalThis);
