(function(root){
 'use strict';
 const M=root.Planner;
 root.createPrintReportUI=function({getState,header}){
  const displayKey='curriculum-print-hours-mode-v1';
  const selectionKey='curriculum-print-departments-v1';
  const socialScience=['역사','일반사회','지리','윤리','물리학','화학','생명과학','지구과학'];
  const choices=[['주요 교과',['국어','수학','영어']],['사회',['역사','일반사회','지리','윤리']],['과학',['물리학','화학','생명과학','지구과학']],['그 외 교과',M.TEACHING_DEPTS.filter(d=>!['국어','수학','영어',...socialScience].includes(d))]];
  let year=0,term=0,hoursMode='detail',departments=[...socialScience],groupAreas=true;
  try{if(localStorage.getItem(displayKey)==='total')hoursMode='total';}catch{}
  try{const saved=JSON.parse(localStorage.getItem(selectionKey));if(Array.isArray(saved?.departments)){departments=M.TEACHING_DEPTS.filter(d=>saved.departments.includes(d));groupAreas=saved.groupAreas!==false;}}catch{}
  const observer=new ResizeObserver(()=>{
   const preview=document.querySelector('.report-preview');
   if(preview)preview.style.setProperty('--report-zoom',Math.min(1,(preview.clientWidth-4)/(297*96/25.4)));
  });
  observer.observe(document.querySelector('#main'));
  function view(){
   const report=root.PrintReport.build(getState(),{year,term,departments,groupAreas,hoursMode});
   const fractional=getState().rows.filter(M.needsWholeSections).length;
   return header('A4 인쇄 · PDF','교과별로 묶은 배당표 · 구분은 공통·일반·진로·융합으로 표시합니다.',false)+
    `<section class="surface report-controls"><label>학년도 <select id="report-year"><option value="0">2027~2029 전체</option>${M.YEARS.map(y=>`<option value="${y}" ${year===y?'selected':''}>${y}학년도</option>`).join('')}</select></label>
    <label>학기 <select id="report-term">${[[0,'두 학기'],[1,'1학기'],[2,'2학기']].map(([n,s])=>`<option value="${n}" ${term===n?'selected':''}>${s}</option>`).join('')}</select></label>
    <label>시수 표시 <select id="report-hours-mode">${[['total','교과 총시수만'],['detail','자체·배정·총시수 모두']].map(([value,label])=>`<option value="${value}" ${hoursMode===value?'selected':''}>${label}</option>`).join('')}</select></label>
    <fieldset class="report-department-picker"><legend>인쇄할 교과 선택 <span>${departments.length}개 선택</span></legend><div class="report-selection-actions"><button class="button small" data-report-select="all">전체 선택</button><button class="button small" data-report-select="social-science">사회·과학 선택</button><button class="button small" data-report-select="none">선택 해제</button></div>
    ${choices.map(([label,depts])=>`<div class="report-choice-row"><strong>${label}</strong><div>${depts.map(d=>`<label><input id="report-dept-${M.TEACHING_DEPTS.indexOf(d)}" type="checkbox" data-report-dept="${d}" ${departments.includes(d)?'checked':''}>${d}</label>`).join('')}</div></div>`).join('')}
    <label class="report-group-option"><input id="report-group-areas" type="checkbox" ${groupAreas?'checked':''}>사회·과학은 각각 묶어서 출력</label><p>선택한 교과마다 새 페이지로 출력합니다. 묶기 해제 시 역사·일반사회·지리·윤리와 과학의 세부 교과도 각각 나뉩니다. 공통·융합·교양 과목은 배정받은 담당 교과에 포함됩니다.</p></fieldset>
    <button class="button primary" data-action="print" ${report.pages.length?'':'disabled'}>현재 값으로 인쇄 / PDF 저장</button>
    <p>미리보기 ${report.pages.length}쪽 · 표의 <b>담당 반 수를 누르면 수정</b>할 수 있습니다. ‘배정 적용’ 후 시수·평균이 바로 갱신되며, 현재 화면의 값으로 인쇄합니다.<br>인쇄 창에서 <b>PDF로 저장 → A4 → 가로 → 배율 100%</b>를 선택하세요. 머리글·바닥글은 끄세요.</p>
    ${fractional?`<div class="report-normalize"><span>전체 예상안에 반 단위 정리가 필요한 과목 ${fractional}개</span><button class="button small" data-assignment-action="section-preview">소수 담당 반 수 정리</button></div>`:''}</section>
    ${report.pages.some(p=>p.hasWarnings)?'<div class="notice report-warning">미정·미배정 또는 선택군 점검 항목이 있습니다. 현재 입력된 값으로 출력하며, 확인이 필요한 평균에는 *가 표시됩니다.</div>':''}
    ${report.pages.length?`<div class="report-preview">${root.PrintReport.render(report,{editable:true})}</div>`:'<section class="surface report-empty" role="status">인쇄할 교과를 하나 이상 선택해 주세요.</section>'}
    <div class="report-links"><a class="button" href="downloads/adjusted-plan-print.pdf" target="_blank" rel="noopener">사회·과학 반 단위 배정 PDF (2026.10.21 고정본)</a><a href="downloads/adjusted-plan.json" download>반 단위 배정 예상안 JSON</a><span>고정본은 2026.10.21 웹 조율안을 반 단위로 정리하고 교과 총시수로 표시한 자료입니다. 이후 수정값과 선택한 시수 표시 방식은 위 ‘현재 값으로 인쇄 / PDF 저장’을 사용하세요.</span></div>`;
  }
  function rememberSelection(){try{localStorage.setItem(selectionKey,JSON.stringify({departments,groupAreas}));}catch{}}
  function refresh(focusId){document.querySelector('#main').innerHTML=view();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});}
  function change(e){if(e.target.id==='report-year')year=Number(e.target.value);else if(e.target.id==='report-term')term=Number(e.target.value);
   else if(e.target.dataset.reportDept){const dept=e.target.dataset.reportDept;departments=M.TEACHING_DEPTS.filter(d=>d===dept?e.target.checked:departments.includes(d));rememberSelection();}
   else if(e.target.id==='report-group-areas'){groupAreas=e.target.checked;rememberSelection();}
   else if(e.target.id==='report-hours-mode'){hoursMode=e.target.value==='total'?'total':'detail';try{localStorage.setItem(displayKey,hoursMode);}catch{}}
   else return;
   refresh(e.target.id);
  }
  document.addEventListener('change',change);
  document.addEventListener('click',e=>{const button=e.target.closest('[data-report-select]');if(!button)return;departments=button.dataset.reportSelect==='all'?[...M.TEACHING_DEPTS]:button.dataset.reportSelect==='social-science'?[...socialScience]:[];rememberSelection();refresh();});
  function print(){if(!departments.length)return;refresh();window.print();}
  return {view,print};
 };
})(globalThis);
