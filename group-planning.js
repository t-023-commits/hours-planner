(function(root){
 'use strict';
 root.createGroupPlanningUI=function({M,esc,f,getState,transact,openDialog,closeDialog,render,toast}){
  const $=s=>document.querySelector(s);
  let draft=null;
  function edit(id,patch){
   const row=getState().rows.find(r=>r.id===id);
   if(!row)return;
   const changesSections=Object.hasOwn(patch,'sections')&&patch.sections!==row.sections;
   const changesOpening=Object.hasOwn(patch,'enabled')&&patch.enabled!==row.enabled;
   if(M.selectionGroup(row)&&(changesSections||changesOpening)){
    open(id,patch);return;
   }
   transact(()=>Object.assign(row,patch,{edited:true}),'변경 사항을 반영했습니다.');
   closeDialog();
  }
  function open(id,patch={}){
   draft=M.groupSectionPlan(getState(),id,patch);
   render(); // Restore a table input until the whole draft is applied.
   draw();
  }
  function draw(){
   const selected=draft.rows.find(r=>r.id===draft.id),g=draft.group;
   const original=new Map(getState().rows.map(r=>[r.id,r]));
   openDialog(`선택군 ${esc(g.code)} · 개설 반 수 함께 조정`,
    `${selected.year}학년도 · ${selected.grade}학년 ${selected.term}학기 · ${selected.cohort} 입학생`,
    `<div class="group-target"><span>${draft.classes}학급 × 택${g.picks}${Number.isInteger(draft.base)&&draft.base!==draft.target?` = 기준 ${draft.base}반 · 반편성 시뮬레이션에서 조정`:''}</span><strong>목표 ${draft.target}반</strong></div>
    <p class="group-explanation"><b>${esc(selected.name)}</b>에 입력한 반 수는 유지하고, 나머지 개설 과목은 현재 반 수 비율로 정수 배분합니다. 0반·미개설 과목은 자동으로 늘리지 않습니다. 아래 숫자를 직접 조정할 수도 있습니다.</p>
    <div class="draft-actions"><button class="button small" data-group-action="rebalance">나머지 반 수 자동 맞추기</button><span>직접 조정 후에는 합계를 목표 반 수에 맞춰 주세요.</span></div>
    <form id="group-sections-form"><div class="table-scroll group-draft-scroll"><table class="group-draft-table"><thead><tr><th>교과 · 과목</th><th class="num">현재 반 수</th><th class="center">변경 반 수</th><th class="num">증감</th><th class="num">변경 후 주당시수</th></tr></thead><tbody>${draft.rows.map(r=>{
     const old=original.get(r.id);
     return `<tr data-group-row="${esc(r.id)}" class="${r.id===draft.id?'group-pinned':''}"><td><strong>${esc(r.name)}</strong><div class="subject-meta">${esc(r.dept)}${r.id===draft.id?' · 직접 입력한 과목':''}${!r.enabled?' · 미개설':''}</div>${root.PlanningUpdates?`<div class="subject-meta">참고: ${esc(root.PlanningUpdates.referenceText(r))}</div>`:''}</td><td class="num">${old.enabled?f(old.sections):'미개설'}</td><td class="center"><input class="editable group-section-input" type="number" min="0" max="100" step="1" placeholder="미정" aria-label="${esc(r.name)} 조정 후 개설 반 수" data-group-section="${esc(r.id)}" value="${r.sections??''}" ${!r.enabled?'disabled':''}></td><td class="num group-delta"></td><td class="num group-hours"></td></tr>`;
    }).join('')}</tbody></table></div></form>
    <p id="group-plan-note" class="group-explanation"></p>
    <p class="field-help">이 선택군의 과목만 함께 변경합니다. 다른 학기·학년·학년도와 다른 과목의 선택인원은 그대로이며, 적용한 변경은 ‘되돌리기’로 한 번에 복구할 수 있습니다.</p>`,
    '<div id="group-total-preview" class="group-total-preview" role="status" aria-live="polite"></div><button class="button primary" data-group-action="apply">선택군 함께 적용</button>');
   $('#dialog').classList.add('group-planning-dialog');
   update();
  }
  function read(){
   for(const el of document.querySelectorAll('[data-group-section]')){
    const row=draft.rows.find(r=>r.id===el.dataset.groupSection);
    if(row.enabled)row.sections=el.validity.badInput?NaN:el.value===''?null:Number(el.value);
   }
  }
  function update(){
   if(!draft||!$('#group-sections-form'))return;
   read();
   const status=M.groupSectionStatus(draft),original=new Map(getState().rows.map(r=>[r.id,r]));
   for(const el of document.querySelectorAll('[data-group-row]')){
    const row=draft.rows.find(r=>r.id===el.dataset.groupRow),old=original.get(row.id);
    const before=old.enabled?old.sections:0,after=row.enabled?row.sections:0;
    const delta=before===null||after===null||!Number.isFinite(after)?null:after-before;
    el.querySelector('.group-delta').textContent=delta===null?'—':`${delta>0?'+':''}${delta}반`;
    el.querySelector('.group-hours').textContent=status.valid?`${f(M.hours(row))}${M.hours(row)===null?'':'시간'}`:'—';
   }
   const preview=$('#group-total-preview');
   preview.classList.toggle('incomplete',!status.canApply||status.unknown>0);
   preview.textContent=!status.valid?'반 수는 0~100 사이의 정수로 입력해 주세요.':`목표 ${draft.target}반 · ${status.unknown?'입력분':'변경 후 합계'} ${status.actual}반${status.unknown?` · 미정 ${status.unknown}과목`:status.actual===draft.target?' · 합계 일치':` · ${Math.abs(status.actual-draft.target)}반 ${status.actual>draft.target?'초과':'부족'}`}`;
   const paused=draft.rows.filter(r=>M.assignmentStatus(r).over).length;
   $('#group-plan-note').textContent=[draft.note,status.unknown?'미정 과목을 남겨 저장하면 합계 맞추기는 보류됩니다. 모든 반 수를 정한 뒤 자동 맞추기를 사용하세요.':'',paused?`반 수 감소로 담당 교과 배정을 다시 확인할 과목이 ${paused}개 있습니다. 기존 시수 배정은 보관하고 반영을 보류합니다.`:''].filter(Boolean).join(' ');
   const apply=$('[data-group-action="apply"]');
   apply.disabled=!status.canApply;
   apply.textContent=status.unknown?'미정 상태로 저장':'선택군 함께 적용';
  }
  function apply(){
   if(!$('#group-sections-form').reportValidity())return;
   read();
   try{
    const next=M.clone(getState()),count=M.applyGroupSections(next,draft),status=M.groupSectionStatus(draft);
    if(count)transact(()=>Object.assign(getState(),next),status.unknown?'입력한 반 수를 저장했습니다. 미정 과목 입력 후 합계를 맞춰 주세요.':`선택군 ${draft.group.code}의 ${count}개 과목을 함께 변경했습니다. 합계 ${status.actual}반입니다.`);
    else toast('변경된 반 수가 없습니다.');
    closeDialog();
   }catch(err){$('#dialog-error').textContent=err.message;}
  }
  document.addEventListener('input',e=>{if(e.target.dataset.groupSection){
   if(draft){draft.note='';const id=e.target.dataset.groupSection;if(id!==draft.id)draft.weights[id]=e.target.value===''?null:Number(e.target.value);}
   update();
  }});
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.balanceGroup){open(b.dataset.balanceGroup);return;}
   if(b.dataset.groupAction==='apply')apply();
   if(b.dataset.groupAction==='rebalance'){
    if(!$('#group-sections-form').reportValidity())return;
    read();draft=M.balanceGroupSections(draft);draw();
   }
  });
  $('#dialog').addEventListener('close',()=>{$('#dialog').classList.remove('group-planning-dialog');draft=null;});
  return {edit,open};
 };
})(globalThis);
