(function(root){
 'use strict';
 // 사이트를 새로 배포할 때마다 이 값을 올립니다. 값이 바뀌면 처음 열 때 초기값으로 시작하고,
 // 그 전 작업은 '버전 열기'에 자동 보관합니다.
 const SITE_VERSION='2026-10-30.3';
 const VERSIONS_KEY='curriculum-hours-planner-versions-v1',SITE_KEY='curriculum-hours-planner-site';
 root.createVersionUI=function({M,esc,getState,transact,persist,render,openDialog,closeDialog,toast,download}){
  let initial=null,versions=null;
  const coreCache=new Map();
  // 초기값 = 게시된 기본안(default-plan.js) + 2026.10.28. 최종 선택인원. 선택군 목표는 학급 수 × 택N.
  function baseline(){
   if(!initial){
    try{initial=M.validateState(root.PUBLISHED_PLAN);}catch(e){initial=root.PlanningUpdates.latestState();}
    initial.name='초기값';initial.versionId='initial';initial.updatedAt=null;
   }
   return initial;
  }
  const initialState=()=>M.clone(baseline());
  const core=s=>JSON.stringify([s.rows,s.classes,s.teacherCounts,s.groupTargets||{},s.cohortStudents||{},s.weeks,s.classSize]);
  function list(){
   if(!versions){
    try{const v=JSON.parse(localStorage.getItem(VERSIONS_KEY)||'[]');versions=Array.isArray(v)?v.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&Array.isArray(x.state?.rows)):[];}
    catch(e){versions=[];}
   }
   return versions;
  }
  function store(next){
   try{localStorage.setItem(VERSIONS_KEY,JSON.stringify(next));versions=next;coreCache.clear();return true;}
   catch(e){toast('브라우저 저장 공간이 부족해 버전을 저장하지 못했습니다. ‘버전 열기’에서 쓰지 않는 버전을 지우거나 JSON 파일로 보관해 주세요.');return false;}
  }
  function coreOf(id){
   if(!coreCache.has(id)){const s=id==='initial'?baseline():list().find(v=>v.id===id)?.state;coreCache.set(id,s?core(s):null);}
   return coreCache.get(id);
  }
  function info(s=getState()){
   const saved=s.versionId?coreOf(s.versionId):null;
   const name=s.versionId==='initial'?'초기값':s.name||'이름 없는 안';
   const modified=!saved||saved!==core(s);
   return {id:s.versionId||null,name,modified,label:modified?`${name} (수정 중)`:name};
  }
  function badge(){
   const v=info();
   return `<b title="지금 보는 버전">${esc(v.name)}</b>${v.modified?'<small>수정 중</small>':''}`;
  }
  const stamp=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}. ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
  const newId=()=>`v${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const fileName=name=>`${name.replace(/[\\/:*?"<>|]/g,'_')}.json`;
  function nextName(){const used=new Set(list().map(v=>v.name));for(let n=1;;n++)if(!used.has(`버전 ${n}`))return `버전 ${n}`;}
  function replace(next){const s=getState();for(const k of Object.keys(s))delete s[k];Object.assign(s,next);}
  function saveDialog(){
   const s=getState(),own=s.versionId&&s.versionId!=='initial'&&list().some(v=>v.id===s.versionId);
   openDialog('버전 저장','이름을 붙여 저장하면 인쇄물 제목과 PDF 파일 이름에도 이 이름이 들어갑니다.',
    `<form id="version-form"><div class="form-grid"><label class="full">버전 이름<input id="version-name" maxlength="40" required value="${esc(own?s.name:nextName())}" placeholder="예: 버전 1"></label>
     <label class="inline-check full"><input type="checkbox" id="version-file" checked> JSON 파일로도 내려받기 (다른 컴퓨터에서 ‘버전 열기 → JSON 파일 불러오기’로 사용)</label></div></form>
     <p class="field-help">같은 이름의 버전이 있으면 지금 내용으로 바꿔 저장합니다. 저장한 버전은 이 브라우저의 ‘버전 열기’에 남습니다.</p>`,
    '<button class="button primary" data-version-action="save">저장</button>');
   setTimeout(()=>{const el=document.getElementById('version-name');el?.focus();el?.select();},0);
  }
  function save(){
   const el=document.getElementById('version-name');
   if(!el||!el.reportValidity())return;
   const name=el.value.trim(),error=document.getElementById('dialog-error');
   if(!name){error.textContent='버전 이름을 입력해 주세요.';return;}
   if(name==='초기값'){error.textContent='‘초기값’은 기본 버전 이름이라 쓸 수 없습니다.';return;}
   const s=getState(),all=list(),same=all.find(v=>v.name===name),id=same?.id||newId(),savedAt=new Date().toISOString();
   const snapshot=M.clone(s);snapshot.name=name;snapshot.versionId=id;snapshot.updatedAt=savedAt;
   const entry={id,name,savedAt,state:snapshot};
   if(!store(same?all.map(v=>v.id===id?entry:v):[...all,entry]))return;
   const file=document.getElementById('version-file')?.checked;
   s.name=name;s.versionId=id;persist();render();
   if(file)download(fileName(name),JSON.stringify(snapshot,null,2),'application/json');else closeDialog();
   toast(`‘${name}’ 버전으로 저장했습니다. 인쇄할 때 이 이름이 표시됩니다.`);
  }
  function openList(){
   const s=getState(),cur=info(s),all=list();
   const item=(id,name,meta,removable)=>`<div class="version-item${s.versionId===id?' current':''}"><div><b>${esc(name)}</b><small>${meta}</small></div><div class="version-buttons">${s.versionId===id&&!cur.modified?'<span class="version-now">지금 보는 버전</span>':`<button class="button small" data-version-open="${esc(id)}">${s.versionId===id?'저장된 상태로 열기':'열기'}</button>`}${removable?`<button class="button small subtle" data-version-delete="${esc(id)}">삭제</button>`:''}</div></div>`;
   openDialog('버전 열기','초기값이나 저장한 버전을 불러옵니다.',
    `<div class="version-list">${item('initial','초기값','게시된 기본안 · 선택군 목표 = 학급 수 × 택N · 2027학년도 2·3학년 선택인원은 2026.10.28. 최종',false)}
     ${all.slice().reverse().map(v=>item(v.id,v.name,`${stamp(v.savedAt)} 저장`,true)).join('')||'<p class="field-help version-empty">아직 저장한 버전이 없습니다. 위쪽의 ‘버전 저장’으로 이름을 붙여 저장하세요.</p>'}</div>
     ${cur.modified?`<p class="field-help"><b>${esc(cur.name)}</b>에서 저장하지 않은 수정 내용은 다른 버전을 열면 화면에서 사라집니다. 바로 ‘되돌리기’로 복구할 수 있습니다.</p>`:''}
     <p class="field-help">버전은 이 브라우저에만 저장됩니다. 다른 컴퓨터에서 만든 버전은 JSON 파일로 불러오세요.</p>`,
    '<button class="button" data-version-action="file">JSON 파일 불러오기</button>');
  }
  function open(id){
   const source=id==='initial'?initialState():M.clone(list().find(v=>v.id===id)?.state||null);
   if(!source)return;
   let next;
   try{next=M.validateState(source);}catch(e){toast(e.message);return;}
   next.versionId=id;
   if(id==='initial')next.name='초기값';
   transact(()=>replace(next),`지금 보는 버전: ${id==='initial'?'초기값':next.name} · ‘되돌리기’로 이전 화면을 복구할 수 있습니다.`);
   closeDialog();
  }
  function toInitial(){
   const s=getState();
   if(s.versionId==='initial'&&!info(s).modified){toast('이미 초기값입니다.');return;}
   open('initial');
  }
  function confirmDelete(id){
   const v=list().find(x=>x.id===id);if(!v)return;
   openDialog('버전 삭제',esc(v.name),`<p>이 브라우저에서 <b>${esc(v.name)}</b> 버전을 지웁니다. 지금 화면의 예상안은 바뀌지 않습니다. 내려받은 JSON 파일은 그대로 남습니다.</p>`,
    `<button class="button danger" data-version-delete-confirm="${esc(id)}">삭제</button>`);
  }
  function remove(id){
   if(!store(list().filter(v=>v.id!==id)))return;
   toast('버전을 지웠습니다.');openList();render();
  }
  // A plan read from a JSON file becomes a version in this browser so it keeps its own name.
  function adopt(s,file){
   if(core(s)===coreOf('initial')){s.name='초기값';s.versionId='initial';return s;}
   let name=s.name&&!['초기값','기본 예상안'].includes(s.name)?s.name:file.replace(/\.json$/i,'');
   const all=list(),same=all.find(v=>v.name===name);
   if(same&&core(same.state)===core(s)){s.name=name;s.versionId=same.id;return s;}
   if(same)name=`${name} (불러옴)`;
   s.name=name;s.versionId=newId();
   store([...all,{id:s.versionId,name,savedAt:new Date().toISOString(),state:M.clone(s)}]);
   return s;
  }
  // Called once at page load with the plan saved in this browser (or null).
  function start(saved){
   let seen=null;
   try{seen=localStorage.getItem(SITE_KEY);localStorage.setItem(SITE_KEY,SITE_VERSION);}catch(e){}
   if(saved&&seen===SITE_VERSION){
    if(!saved.versionId&&core(saved)===coreOf('initial')){saved.versionId='initial';saved.name='초기값';}
    return {state:saved,reset:false,archived:null};
   }
   let archived=null;
   if(saved&&core(saved)!==coreOf('initial')&&!list().some(v=>core(v.state)===core(saved))){
    const d=new Date(),name=`자동 보관 ${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const snapshot=M.clone(saved);snapshot.name=name;snapshot.versionId=newId();
    if(store([...list(),{id:snapshot.versionId,name,savedAt:d.toISOString(),state:snapshot}]))archived=name;
   }
   return {state:initialState(),reset:!!saved,archived};
  }
  document.addEventListener('submit',e=>{if(e.target.id==='version-form'){e.preventDefault();save();}});
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   const d=b.dataset;
   if(d.versionAction==='save')save();
   else if(d.versionAction==='file')document.getElementById('import-file')?.click();
   else if(d.versionOpen)open(d.versionOpen);
   else if(d.versionDelete)confirmDelete(d.versionDelete);
   else if(d.versionDeleteConfirm)remove(d.versionDeleteConfirm);
  });
  return {SITE_VERSION,info,badge,baseline,initialState,saveDialog,openList,open,toInitial,adopt,start};
 };
})(globalThis);
