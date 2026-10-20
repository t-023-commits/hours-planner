(function(root){
 'use strict';
 root.createSelectionBoard=function({M,esc,f,header,cohorts,getState,getYear,getTerm,transact,openDialog,closeDialog,render,toast,download}){
  const U=root.PlanningUpdates,P=root.PLANNING_DATA,D=root.CURRICULUM_DATA;
  let gradeFilter=0,pending=null;
  const period=()=>getTerm()||1;
  const current=()=>getState();
  function referenceCell(r){
   const demand=U.demandFor(r),ref=r.ref;
   return `<button class="reference-button" data-selection-reference="${esc(r.id)}"><strong>${demand?`${demand.students}명 <small>보충 수요</small>`:ref?`${f(ref.students)}${ref.students===null?'':'명'} <small> / ${f(ref.sections)}반</small>`:'자료 없음'}</strong><span>${demand?'2026학년도 2학년 2학기':ref?`${ref.cohort} 입학생 · ${ref.grade}학년 ${ref.term}학기`:'같은 선택군 평균 반 수 가정'}</span><span class="reference-link">선택자료·산정 근거 보기 ↗</span></button>`;
  }
  function statusBanner(){return `<div class="update-banner"><div><b>${current().planningVersion===P.version?'경제·윤리 수요 보정안 기반':'기존에 저장한 예상안 유지 중'}</b><p>${current().planningVersion===P.version?'경제 57명 · 윤리와 사상 99명 참고 / 이후 직접 조율한 값은 현재 표에 반영됩니다.':'최신 보정값과 관련 교과 배정은 ‘보정안 비교·불러오기’에서 확인한 후 적용할 수 있습니다.'}</p></div><button class="button" data-selection-action="compare">보정안 비교·불러오기</button></div>`;}
  function view(){
   const y=getYear(),t=period(),s=current(),checks=M.groupChecks(s,y).filter(g=>g.term===t&&(!gradeFilter||g.grade===gradeFilter));
   return header('선택군 조율','선택군의 전체 과목과 반 수를 보면서, 과거 신청인원을 참고해 함께 조정합니다.')+cohorts()+statusBanner()+
   `<div class="selection-toolbar"><div class="year-switch" role="group" aria-label="선택군 조회 학기">${[1,2].map(n=>`<button data-term="${n}" class="${n===t?'active':''}" aria-pressed="${n===t}">${n}학기</button>`).join('')}</div><label>조회 학년 <select id="selection-grade"><option value="0" ${!gradeFilter?'selected':''}>2·3학년 함께</option>${[2,3].map(g=>`<option value="${g}" ${gradeFilter===g?'selected':''}>${g}학년만</option>`).join('')}</select></label><div class="actions"><button class="button small" data-selection-action="csv">선택군 표 CSV</button><button class="button small" data-action="print">인쇄</button></div></div>
   <div class="selection-guide"><b>반 수를 수정하면 같은 선택군이 함께 조정됩니다.</b> 직접 입력한 과목은 유지하고, 나머지 개설 과목을 현재 반 수 비율로 나눕니다. 목표 = 학급 수 × 택N. 0반 과목을 새로 열려면 그 과목의 반 수를 직접 입력하세요.</div>
   <nav class="group-jumps" aria-label="선택군 바로가기">${checks.map(g=>`<button data-selection-jump="${esc(g.id)}" class="${g.actual!==g.target||g.unknown?'needs-review':''}">${g.grade}학년 ${g.code} · 택${g.picks} <b>${g.actual}/${g.target}반</b></button>`).join('')}</nav>
   ${[2,3].filter(g=>!gradeFilter||gradeFilter===g).map(grade=>`<section class="selection-grade-section"><div class="selection-grade-heading"><span>${grade}학년</span><h2>${y-grade+1}학년도 입학생</h2><p>${s.classes[y-grade+1]}학급 · ${t}학기</p></div>${checks.filter(g=>g.grade===grade).map(g=>{
    const rows=s.rows.filter(r=>r.year===y&&r.groupId===g.id).sort((a,b)=>a.sourceRow-b.sourceRow),first=rows[0],ok=g.actual===g.target&&!g.unknown;
    return `<section class="surface selection-card" id="selection-${esc(g.id)}"><div class="selection-card-head"><div><span class="selection-code">선택군 ${g.code}</span><h3>택${g.picks} <small>· ${s.classes[first.cohort]}학급 × ${g.picks}과목 = ${g.target}반</small></h3></div><div class="selection-total ${ok?'balanced':'needs-review'}"><b>${g.actual} / ${g.target}반</b><span>${g.unknown?`미정 ${g.unknown}과목`:ok?'선택군 합계 일치':`${Math.abs(g.actual-g.target)}반 ${g.actual>g.target?'초과':'부족'}`}</span></div><button class="button small" data-balance-group="${esc(first.id)}">함께 조율</button></div>
    <div class="selection-table-scroll"><table class="selection-table"><thead><tr><th>과목 · 담당 교과</th><th class="center">예상 개설 반 수</th><th class="num">반당 시수</th><th class="num">주당 총시수</th><th>과거 선택자료 <small>· 예상 인원과 구분</small></th></tr></thead><tbody>${rows.map(r=>`<tr class="${!r.enabled||r.sections===0?'not-offered':''}"><td><button class="subject-button" data-edit="${esc(r.id)}">${esc(r.name)}</button><div class="subject-meta">${esc(r.relatedPlanning&&P.rules.find(x=>x.name===r.name)?.allowed.join(' · ')||r.dept)}${!r.enabled?' · 미개설':r.sections===0?' · 0반':r.edited?' · 직접 조율':''}</div></td><td class="center"><div class="stepper"><button data-step="-1" data-id="${esc(r.id)}" aria-label="${esc(r.name)} ${grade}학년 반 1개 줄이기" ${r.enabled?'':'disabled'}>−</button><input class="editable" type="number" min="0" max="100" step="1" placeholder="미정" data-field="sections" data-id="${esc(r.id)}" value="${r.sections??''}" aria-label="${y}학년도 ${grade}학년 선택군 ${g.code} ${esc(r.name)} 예상 반 수" ${r.enabled?'':'disabled'}><button data-step="1" data-id="${esc(r.id)}" aria-label="${esc(r.name)} ${grade}학년 반 1개 늘리기" ${r.enabled?'':'disabled'}>＋</button></div>${!r.enabled?`<button class="text-button" data-toggle="${esc(r.id)}">개설 켜기</button>`:''}</td><td class="num">${f(r.hours)}</td><td class="num selection-hours">${f(M.hours(r))}</td><td>${referenceCell(r)}</td></tr>`).join('')}</tbody><tfoot><tr><th>선택군 ${g.code} 합계</th><td class="center"><b>${g.actual}반</b></td><td></td><td class="num"><b>${f(rows.reduce((n,r)=>n+(M.hours(r)??0),0))}</b></td><td>${g.unknown?'미정 제외 입력분':'단위: 시간/주'}</td></tr></tfoot></table></div></section>`;
   }).join('')||'<p>해당 학기에 학생 선택군이 없습니다.</p>'}</section>`).join('')}
   <section class="surface selection-followup"><div><h2>반 수를 조율한 뒤 시수 배정도 확인하세요</h2><p>기존 배정시수는 보존됩니다. 반 수가 바뀌면 아래에서 관련 교과 배정안을 다시 검토할 수 있습니다. 교양은 ‘시수 배정’에서 별도로 조정합니다.</p></div><button class="button primary" data-selection-action="allocate">${t}학기 사회·과학 재배정 검토</button><button class="button" data-view="teachers">교사 평균 보기</button></section>
   <div class="report-links"><a class="button" href="downloads/social-science-comparison.xlsx" download>엑셀 비교표 받기</a><button class="button primary" data-view="print">현재 예상안 A4 인쇄 · PDF</button><a href="downloads/adjusted-plan-print.pdf" target="_blank" rel="noopener">첨부 조율안 PDF (고정본)</a><span>현재 수정값은 A4 인쇄 · PDF에서 출력합니다. 엑셀 비교표와 고정 PDF는 작성 당시 값입니다.</span></div>`;
  }
  function reference(id){
   const r=current().rows.find(r=>r.id===id),refs=D.choices.filter(x=>x.name===r.name),d=U.demandFor(r),rule=P.rules.find(x=>x.name===r.name);
   openDialog(`${esc(r.name)} · 선택자료와 산정 근거`,`${r.year}학년도 ${r.grade}학년 ${r.term}학기 · ${esc(M.selectionLabel(r))}`,
    `<div class="allocation-explanation"><b>현재 예상 ${f(r.sections)}반 · 주당 ${f(M.hours(r))}시간</b><p>${esc(U.projectionText(r))}</p></div>
    ${d?`<div class="demand-reference"><b>보충 자료: ${d.students}명 신청</b><p>2026학년도 2학년 2학기 · 2025 입학생 · 택3 선택군 / 사용자 제공</p><p>${esc(d.reason)}. 239명 × 택3 = 총 717건을 기준으로 ${(d.share*100).toFixed(2)}%를 미래 선택군 반 수에 적용하는 보정 가정입니다. 보정안에서 나머지 과목은 기존 비율로 정수 배분합니다. 미래의 실제 신청인원은 아닙니다.</p><details><summary>당시 택3 선택군의 과목</summary><p>${esc(P.demand.groupNames.join(' / '))}</p></details></div>`:''}
    <h3>원본 선택인원 자료 · 2026.9.28.</h3><div class="table-scroll"><table><thead><tr><th>입학 연도 · 이수 학기</th><th class="num">신청인원</th><th class="num">개설반</th><th>출처</th></tr></thead><tbody>${refs.map(ref=>`<tr><td>${ref.cohort} 입학생<br>${ref.grade}학년 ${ref.term}학기</td><td class="num">${f(ref.students)}명</td><td class="num">${f(ref.sections)}반</td><td>${esc(ref.source)}</td></tr>`).join('')||'<tr><td colspan="4">같은 과목의 선택자료가 없습니다. 최신 보정안에서는 같은 선택군의 기존 반 수 평균을 가정합니다.</td></tr>'}</tbody></table></div><p class="field-help">원본 0명·0반은 그대로 보관하며, 보충 자료와 구분합니다. 2027학년도는 최종 선택자료의 실제 반 수를 유지하고 2028·2029학년도에만 수요를 보정합니다.</p>
    ${rule?`<div class="allocation-explanation"><b>관련 교과: ${esc(rule.allowed.join(' · '))}</b><p>${esc(rule.basis)}<br>${esc(rule.file)} · ${esc(rule.pages)}쪽<br>교육과정 내용에 따른 배정 가정입니다.</p></div>`:''}`);
  }
  function tableCompare(a,b,year,term){
   const left=M.teacherSummary(a,year),right=M.teacherSummary(b,year);
   return `<div class="table-scroll"><table class="scenario-compare"><thead><tr><th>담당 교과</th><th class="num">교사 수</th><th class="num">기존안 시수</th><th class="num">변경안 시수</th><th class="num">시수 증감</th><th class="num">기존안 평균</th><th class="num">변경안 평균</th></tr></thead><tbody>${left.filter(d=>M.TEACHING_DEPTS.includes(d.dept)&&(['국어','수학','영어',...Object.values(U.areas).flat()].includes(d.dept))).map(d=>{const x=d.terms[term-1],z=right.find(v=>v.dept===d.dept).terms[term-1],delta=M.round(z.total-x.total);return `<tr><td><b>${esc(d.dept)}</b></td><td class="num">${f(x.teachers)}</td><td class="num">${f(x.total)}</td><td class="num">${f(z.total)}</td><td class="num ${delta<0?'delta-down':delta>0?'delta-up':''}">${delta>0?'+':''}${f(delta)}</td><td class="num">${x.perTeacher===null?'미산정':f(x.perTeacher)}</td><td class="num"><b>${z.perTeacher===null?'미산정':f(z.perTeacher)}</b></td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function compare(){
   const a=U.latestState('existing',current().teacherCounts,current().classes),b=U.latestState('moved',current().teacherCounts,current().classes);
   openDialog('보정안 비교 · 세계 문화와 영어 선택군 이동','2029학년도 1학기 · 공통·융합 배정 후 · 단위: 시간/주',
    `<p class="scenario-intro">아래는 <b>최신 보정 가정 두 안의 비교</b>입니다. 현재 화면에서 편집한 반 수는 포함하지 않습니다. 현재 입력한 학급 수·교사 수를 적용하고, 사회·과학 공통·융합 과목을 관련 교과 안에서 배정했습니다.</p>
    <div class="scenario-facts"><div><b>기존 교육과정</b><p>세계 문화와 영어 → 3학년 택1<br>경제 57명 · 윤리와 사상 99명 수요 보정</p></div><div><b>선택군 이동안</b><p>세계 문화와 영어 → 3학년 택4<br>기존 택1·택4 선택군 모두 반 수 재배분</p></div></div>${tableCompare(a,b,2029,1)}
    <details class="scenario-details"><summary>택1·택4 과목별 반 수 비교</summary><div class="table-scroll"><table><thead><tr><th>과목</th><th>기존 선택군</th><th class="num">기존 반 수</th><th>변경 선택군</th><th class="num">변경 반 수</th></tr></thead><tbody>${a.rows.filter(r=>r.year===2029&&r.grade===3&&r.term===1&&r.groupId).map(r=>{const z=b.rows.find(x=>x.id===r.id);return `<tr><td>${esc(r.name)}</td><td>${esc(M.selectionLabel(r))}</td><td class="num">${r.sections}</td><td>${esc(M.selectionLabel(z))}</td><td class="num">${z.sections}</td></tr>`;}).join('')}</tbody></table></div></details>
    <p class="field-help">불러오면 2027~2029학년도 과목 편성·메모·배정을 해당 안으로 교체합니다. 현재 교사 수·학급 수·수업 주 수는 유지합니다. 개인 추가 과목은 교체되므로 필요하면 먼저 ‘예상안 저장’을 사용하세요. 적용 직후 ‘되돌리기’로 복구할 수 있습니다.</p><div class="report-links"><a href="downloads/social-science-comparison.xlsx" download>전체 3개년 엑셀 비교표</a><a href="downloads/social-science-print.pdf" target="_blank" rel="noopener">보정안 A4 PDF (고정본)</a></div>`,
    '<button class="button" data-selection-action="load-existing">기존 교육과정 보정안 불러오기</button><button class="button primary" data-selection-action="load-moved">영어 이동안 불러오기</button>');
   document.querySelector('#dialog').classList.add('selection-dialog');
  }
  function load(kind){
   try{const next=U.latestState(kind,current().teacherCounts,current().classes);next.weeks=M.clone(current().weeks);next.classSize=current().classSize;transact(()=>Object.assign(current(),next),'보정안을 반영했습니다. 선택군별 반 수를 조율할 수 있습니다.');closeDialog();}catch(e){toast(e.message);}
  }
  function allocationPreview(){
   const y=getYear(),t=period(),next=M.clone(current()),result=U.allocateRelated(next,y,t);pending=next;
   openDialog(`${y}학년도 ${t}학기 · 관련 교과 재배정`,`사회·과학 ${result.courses}개 공통·융합 과목`,
    `<p class="scenario-intro">여행지리·기후변화와 지속가능한 세계는 지리, 금융과 경제생활·사회문제 탐구는 일반사회에 배정합니다. 기후변화와 환경생태는 생명과학·지구과학 중 평균 시수의 균형을 고려해 배정합니다. 여러 교과에 관련된 과목은 <b>온전한 반 단위</b>로 배분합니다.</p><p>아래 기존안은 현재 편성, 변경안은 이번 재배정 제안입니다. 이 학년도의 이 학기 사회·과학 배정만 교체합니다.</p>${result.unassigned.length?`<div class="notice">미정 시수 또는 교사 수 확인이 필요해 남은 과목: ${esc([...new Set(result.unassigned)].join(', '))}</div>`:''}${tableCompare(current(),next,y,t)}`,
    '<button class="button primary" data-selection-action="apply-allocation">이 학기 재배정 적용</button>');
   document.querySelector('#dialog').classList.add('selection-dialog');
  }
  function csv(){const y=getYear(),t=period();download(`${y}학년도_${t}학기_선택군_반수.csv`,M.csv([['학년도','학년','학기','입학연도','선택군','선택수','학급수','목표반수','과목','교과','개설반수','반당시수','총시수','참고 선택자료','추정 근거'],...current().rows.filter(r=>r.year===y&&r.term===t&&r.groupId&&(!gradeFilter||r.grade===gradeFilter)).map(r=>{const g=M.selectionGroup(r);return [y,r.grade,t,r.cohort,g.code,g.picks,current().classes[r.cohort],current().classes[r.cohort]*g.picks,r.name,r.dept,r.enabled?r.sections:0,r.hours,M.hours(r),U.referenceText(r),U.projectionText(r)];})]),'text/csv;charset=utf-8');}
  document.addEventListener('click',e=>{
   const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.selectionReference){reference(b.dataset.selectionReference);return;}
   if(b.dataset.selectionJump){document.getElementById('selection-'+b.dataset.selectionJump)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
   const action=b.dataset.selectionAction;
   if(action==='compare')compare();if(action==='load-existing')load('existing');if(action==='load-moved')load('moved');if(action==='allocate')allocationPreview();if(action==='csv')csv();
   if(action==='apply-allocation'&&pending){const validated=M.validateState(pending);transact(()=>Object.assign(current(),validated),'관련 교과 배정을 평균 시수에 반영했습니다.');pending=null;closeDialog();}
  });
  document.addEventListener('change',e=>{if(e.target.id==='selection-grade'){gradeFilter=Number(e.target.value);render();}});
  document.querySelector('#dialog').addEventListener('close',()=>{document.querySelector('#dialog').classList.remove('selection-dialog');pending=null;});
  return {view,statusBanner};
 };
})(globalThis);
