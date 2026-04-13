// ─────────────────────────────────────────────────────────────
// 매출/매입 실적 모달 (13) — 내부인력 실적 자동분배 시뮬레이터
// 사용법: 13-project-management-sales-cost-performance-update-modal.html
//        → 개발자도구 콘솔 붙여넣기
//
// 동작 원리:
//  1) thead 에서 월 컬럼(YYYY-MM) 목록을 추출
//  2) 더미 Work Report 를 돌면서 (등급 × 월) 매트릭스로 분배:
//      - kind === '프로젝트' 만 채택
//      - 직책 → 등급(특급/고급/중급/초급) 매핑
//      - M/D = 분 ÷ 480
//      - 금액 = M/D × 등급단가
//      - seqDt(YYYY-MM) → 같은 등급의 같은 월 셀에 누적
//  3) 모달의 기존 [세부구분=내부인력] 행 모두 삭제 후
//     등급별 4쌍(계획 4 + 실적 4) 으로 재구성:
//      - 계획 행: GRADE_PLAN_MD 더미 (등급별 계획 M/D)
//      - 실적 행: WR 분배 결과를 월별로 채움
//  4) tfoot(매입 계 / 총 합계) 재계산
//  5) 좌상단 fixed 토글 버튼으로 더미·분배 근거 패널 열고닫음
// ─────────────────────────────────────────────────────────────
(function(){
  const POSITION_TO_GRADE = {
    '사장':'특급','부사장':'특급','전무':'특급','상무':'특급','이사':'특급',
    '부장':'고급',
    '차장':'중급','과장':'중급',
    '대리':'초급','주임':'초급','사원':'초급'
  };
  const GRADE_PRICE = {
    '특급': 10_000_000,
    '고급':  9_000_000,
    '중급':  7_000_000,
    '초급':  5_000_000,
  };
  const GRADES = ['특급','고급','중급','초급'];
  // 등급별 계획 M/D (계획 행에 채워 넣을 더미)
  // ※ '특급'은 일부러 0 으로 두어 "계획은 0인데 실적은 발생" 케이스를 시연
  //    → 그래도 특급 계획 행은 0/0/0으로 반드시 삽입되어야 함
  const GRADE_PLAN_MD = { '특급': 0, '고급': 8, '중급': 15, '초급': 20 };

  const ymKey = s => s.slice(0,7); // 'YYYY-MM'
  const fmtMoney = n => Math.round(n).toLocaleString('ko-KR');
  const fmtMd    = n => (Math.round(n * 100) / 100).toString();

  // ── 더미 Work Report (2025-04 ~ 2027-02, 약 23개월) ──
  // 모달 월 컬럼이 (예: 2026-04 ~ 2026-05) 두 달뿐이라도, 범위 밖 데이터까지
  // 의도적으로 풍부하게 넣어 "범위 밖 → 제외" 필터링 동작을 함께 시연한다.
  const workReports = [
    // 2025-04
    { date:'2025-04-02', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'사전 영업 PM' },
    { date:'2025-04-09', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240, memo:'요건 인터뷰' },
    { date:'2025-04-16', userPosition:'대리', project:'P', kind:'프로젝트', minutes:360, memo:'시장 조사' },
    { date:'2025-04-24', userPosition:'사원', project:'P', kind:'연차',     minutes:480, memo:'연차(제외)' },
    // 2025-05
    { date:'2025-05-07', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120, memo:'경영검토' },
    { date:'2025-05-14', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'제안 설계' },
    { date:'2025-05-21', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'견적' },
    { date:'2025-05-28', userPosition:'주임', project:'P', kind:'프로젝트', minutes:240, memo:'리서치' },
    // 2025-06
    { date:'2025-06-04', userPosition:'상무', project:'P', kind:'프로젝트', minutes:240, memo:'스폰서 회의' },
    { date:'2025-06-11', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'PMO' },
    { date:'2025-06-18', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480, memo:'아키 검토' },
    { date:'2025-06-25', userPosition:'대리', project:'P', kind:'기타',     minutes:240, memo:'기타(제외)' },
    // 2025-07
    { date:'2025-07-02', userPosition:'이사', project:'P', kind:'프로젝트', minutes:240, memo:'착수회의' },
    { date:'2025-07-10', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'PMO' },
    { date:'2025-07-17', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'분석' },
    { date:'2025-07-24', userPosition:'사원', project:'P', kind:'프로젝트', minutes:360, memo:'문서화' },
    // 2025-08
    { date:'2025-08-06', userPosition:'전무', project:'P', kind:'프로젝트', minutes:120, memo:'스폰서 보고' },
    { date:'2025-08-13', userPosition:'부장', project:'P', kind:'부서업무', minutes:480, memo:'부서업무(제외)' },
    { date:'2025-08-20', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480, memo:'설계' },
    { date:'2025-08-27', userPosition:'주임', project:'P', kind:'프로젝트', minutes:480, memo:'테스트' },
    // 2025-09
    { date:'2025-09-03', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'PMO' },
    { date:'2025-09-10', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'설계서' },
    { date:'2025-09-17', userPosition:'대리', project:'P', kind:'프로젝트', minutes:360, memo:'프로토' },
    { date:'2025-09-24', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480, memo:'와이어프레임' },
    // 2025-10
    { date:'2025-10-08', userPosition:'이사', project:'P', kind:'프로젝트', minutes:240, memo:'경영보고' },
    { date:'2025-10-15', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'PMO' },
    { date:'2025-10-22', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240, memo:'개발 리드' },
    { date:'2025-10-29', userPosition:'사원', project:'P', kind:'연차',     minutes:480, memo:'연차(제외)' },
    // 2025-11
    { date:'2025-11-04', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'요건정의 워크숍' },
    { date:'2025-11-12', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'아키텍처 초안' },
    { date:'2025-11-18', userPosition:'대리', project:'P', kind:'프로젝트', minutes:240, memo:'프로토타입' },
    { date:'2025-11-26', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480, memo:'화면 와이어프레임' },
    // 2025-12
    { date:'2025-12-03', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120, memo:'착수보고 검토' },
    { date:'2025-12-10', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'PM 회의' },
    { date:'2025-12-15', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'설계서 작성' },
    { date:'2025-12-22', userPosition:'주임', project:'P', kind:'프로젝트', minutes:360, memo:'테스트 케이스' },
    { date:'2025-12-29', userPosition:'사원', project:'P', kind:'연차',     minutes:480, memo:'연차(제외)' },

    // 2026-01
    { date:'2026-01-08', userPosition:'상무', project:'P', kind:'프로젝트', minutes:240, memo:'착수' },
    { date:'2026-01-15', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'PMO' },
    { date:'2026-01-20', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'DB 모델링' },
    { date:'2026-01-27', userPosition:'대리', project:'P', kind:'프로젝트', minutes:480, memo:'API 설계' },
    // 2026-02
    { date:'2026-02-05', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120, memo:'경영보고' },
    { date:'2026-02-12', userPosition:'부장', project:'P', kind:'프로젝트', minutes:360, memo:'PMO' },
    { date:'2026-02-18', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480, memo:'개발 리드' },
    { date:'2026-02-25', userPosition:'주임', project:'P', kind:'기타',     minutes:240, memo:'사내교육(제외)' },
    { date:'2026-02-26', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480, memo:'단위 개발' },
    // 2026-03
    { date:'2026-03-04', userPosition:'전무', project:'P', kind:'프로젝트', minutes:120, memo:'스폰서 리뷰' },
    { date:'2026-03-10', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'리뷰 회의' },
    { date:'2026-03-15', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240, memo:'중간 점검' },
    { date:'2026-03-22', userPosition:'대리', project:'P', kind:'프로젝트', minutes:480, memo:'개발' },
    { date:'2026-03-28', userPosition:'사원', project:'P', kind:'부서업무', minutes:480, memo:'부서업무(제외)' },
    { date:'2026-03-29', userPosition:'사원', project:'P', kind:'프로젝트', minutes:240, memo:'테스트' },
    // 2026-04
    { date:'2026-04-03', userPosition:'이사', project:'P', kind:'프로젝트', minutes:240, memo:'PI 리뷰' },
    { date:'2026-04-09', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'PMO' },
    { date:'2026-04-14', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'설계 변경' },
    { date:'2026-04-17', userPosition:'차장', project:'P', kind:'프로젝트', minutes:240, memo:'리뷰' },
    { date:'2026-04-22', userPosition:'대리', project:'P', kind:'프로젝트', minutes:360, memo:'개발' },
    { date:'2026-04-28', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480, memo:'개발' },
    // 2026-05
    { date:'2026-05-06', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'고객 보고' },
    { date:'2026-05-11', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'통합' },
    { date:'2026-05-15', userPosition:'차장', project:'P', kind:'프로젝트', minutes:120, memo:'리뷰' },
    { date:'2026-05-20', userPosition:'주임', project:'P', kind:'프로젝트', minutes:480, memo:'테스트 자동화' },
    { date:'2026-05-25', userPosition:'사원', project:'P', kind:'프로젝트', minutes:240, memo:'테스트' },
    { date:'2026-05-29', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480, memo:'테스트' },
    // 2026-06
    { date:'2026-06-03', userPosition:'전무', project:'P', kind:'프로젝트', minutes:240, memo:'경영검토' },
    { date:'2026-06-10', userPosition:'부장', project:'P', kind:'프로젝트', minutes:360, memo:'PMO' },
    { date:'2026-06-17', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'배포 준비' },
    { date:'2026-06-24', userPosition:'대리', project:'P', kind:'프로젝트', minutes:240, memo:'안정화' },
    // 2026-07
    { date:'2026-07-02', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120, memo:'리뷰' },
    { date:'2026-07-09', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'운영 인계' },
    { date:'2026-07-16', userPosition:'차장', project:'P', kind:'프로젝트', minutes:240, memo:'개발' },
    { date:'2026-07-23', userPosition:'주임', project:'P', kind:'프로젝트', minutes:360, memo:'테스트' },
    { date:'2026-07-30', userPosition:'사원', project:'P', kind:'기타',     minutes:240, memo:'기타(제외)' },
    // 2026-08
    { date:'2026-08-05', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'운영 PMO' },
    { date:'2026-08-12', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240, memo:'유지보수' },
    { date:'2026-08-19', userPosition:'대리', project:'P', kind:'프로젝트', minutes:360, memo:'버그수정' },
    { date:'2026-08-26', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480, memo:'문서' },
    // 2026-09
    { date:'2026-09-02', userPosition:'상무', project:'P', kind:'프로젝트', minutes:240, memo:'스폰서 회의' },
    { date:'2026-09-09', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'PMO' },
    { date:'2026-09-16', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'기능 추가' },
    { date:'2026-09-23', userPosition:'주임', project:'P', kind:'프로젝트', minutes:480, memo:'리팩토링' },
    // 2026-10
    { date:'2026-10-07', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120, memo:'경영보고' },
    { date:'2026-10-14', userPosition:'부장', project:'P', kind:'프로젝트', minutes:360, memo:'운영' },
    { date:'2026-10-21', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480, memo:'리뷰' },
    { date:'2026-10-28', userPosition:'사원', project:'P', kind:'프로젝트', minutes:240, memo:'테스트' },
    // 2026-11
    { date:'2026-11-04', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'운영 PMO' },
    { date:'2026-11-11', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480, memo:'유지보수' },
    { date:'2026-11-18', userPosition:'대리', project:'P', kind:'연차',     minutes:480, memo:'연차(제외)' },
    { date:'2026-11-25', userPosition:'사원', project:'P', kind:'프로젝트', minutes:360, memo:'개선' },
    // 2026-12
    { date:'2026-12-02', userPosition:'전무', project:'P', kind:'프로젝트', minutes:240, memo:'연말 검토' },
    { date:'2026-12-09', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'PMO' },
    { date:'2026-12-16', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480, memo:'기술 리뷰' },
    { date:'2026-12-23', userPosition:'주임', project:'P', kind:'프로젝트', minutes:240, memo:'문서 정리' },
    { date:'2026-12-30', userPosition:'사원', project:'P', kind:'부서업무', minutes:480, memo:'부서업무(제외)' },

    // 2027-01
    { date:'2027-01-06', userPosition:'이사', project:'P', kind:'프로젝트', minutes:240, memo:'신년 PI' },
    { date:'2027-01-13', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480, memo:'PMO' },
    { date:'2027-01-20', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240, memo:'추가 개발' },
    { date:'2027-01-27', userPosition:'대리', project:'P', kind:'프로젝트', minutes:360, memo:'테스트' },
    // 2027-02
    { date:'2027-02-03', userPosition:'상무', project:'P', kind:'프로젝트', minutes:120, memo:'경영보고' },
    { date:'2027-02-10', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240, memo:'운영' },
    { date:'2027-02-17', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480, memo:'리팩토링' },
    { date:'2027-02-24', userPosition:'사원', project:'P', kind:'프로젝트', minutes:240, memo:'배포' },
  ];

  // ── 1) 모달 헤더에서 월 컬럼 목록 추출 ──
  function readMonthColumns() {
    const tbl = document.querySelector('table.sales-input-table');
    if (!tbl) return [];
    const headRows = tbl.querySelectorAll('thead > tr');
    if (headRows.length < 2) return [];
    // 1행: 연도 그룹 (rowspan / colspan 혼재). colspan>=2 의 '2026년' 같은 셀만 추림
    const yearOrder = [];
    headRows[0].querySelectorAll('th').forEach(th => {
      const txt = th.textContent.trim();
      const m = /^(\d{4})년/.exec(txt);
      if (!m) return;
      const span = parseInt(th.getAttribute('colspan') || '1', 10);
      yearOrder.push({ year: m[1], span });
    });
    // 2행: 월 헤더 순서대로 (행 추가 등 조작 컬럼 제외)
    const monthThs = Array.from(headRows[1].querySelectorAll('th'))
      .filter(th => /월/.test(th.textContent));
    const cols = [];
    let mi = 0;
    yearOrder.forEach(yo => {
      for (let k = 0; k < yo.span; k++) {
        const th = monthThs[mi++];
        if (!th) continue;
        const mm = /^(\d{1,2})월/.exec(th.textContent.trim());
        if (!mm) continue;
        cols.push({ year: yo.year, month: mm[1].padStart(2,'0') });
      }
    });
    return cols; // [{year:'2026', month:'04'}, ...]  index = data-month-idx
  }

  // ── 2) WR → (등급 × 월) 금액 분배 ──
  function distribute(monthCols) {
    const monthKey = c => `${c.year}-${c.month}`;
    // buckets[grade][ym] = 금액
    const buckets = {};
    const breakdown = {};                      // 'grade|ym' -> [WR rows]
    const excluded = [];
    GRADES.forEach(g => {
      buckets[g] = {};
      monthCols.forEach(c => {
        buckets[g][monthKey(c)] = 0;
        breakdown[`${g}|${monthKey(c)}`] = [];
      });
    });

    workReports.forEach(r => {
      const grade = POSITION_TO_GRADE[r.userPosition];
      if (r.kind !== '프로젝트') {
        excluded.push({ ...r, reason: `업무구분=${r.kind} (프로젝트 아님)` });
        return;
      }
      if (!grade) {
        excluded.push({ ...r, reason: `직책=${r.userPosition} 등급매핑 없음` });
        return;
      }
      const ym = ymKey(r.date);
      if (!(ym in buckets[grade])) {
        excluded.push({ ...r, reason: `${ym} 모달 월 컬럼 범위 밖` });
        return;
      }
      const md = r.minutes / 480;
      const price = GRADE_PRICE[grade];
      const amount = md * price;
      buckets[grade][ym] += amount;
      breakdown[`${grade}|${ym}`].push({ ...r, grade, md, price, amount });
    });
    return { buckets, breakdown, excluded };
  }

  // ── 4) 내부인력 행을 등급별로 재구성(계획 4 + 실적 4) + 분배 + tfoot ──
  function rebuildInternalRows(monthCols, buckets) {
    const tbody = document.getElementById('financialInputTbody');
    if (!tbody) { console.warn('⚠ tbody 없음'); return { rows: 0 }; }

    // 기존 내부인력 행 모두 제거
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const sg = tr.querySelector('.field-subGubun')?.value || '';
      if (sg === '내부인력') tr.remove();
    });

    const monthKey = c => `${c.year}-${c.month}`;
    const colCount = monthCols.length;

    const buildRow = (rowType, grade, getMonthVal, qty, price, editable) => {
      const total = qty * price;
      const monthTds = monthCols.map((c, idx) => {
        const v = getMonthVal(c);
        const dis = editable ? '' : 'disabled';
        const bg = (rowType === '실적') ? 'background:#fff3e0;' : '';
        return `<td><input type="text" class="si-input si-right si-money month-input" data-month-idx="${idx}" value="${fmtMoney(v)}" style="${bg}" ${dis}></td>`;
      }).join('');
      const dateType = rowType === '계획' ? 'PLAN' : 'ACTUAL';
      const lastTd = rowType === '실적'
        ? `<td><button class="btn-row-add" type="button">추가</button></td>`
        : `<td></td>`;
      return `
        <tr class="row-buy" data-row-type="${rowType}" data-date-type="${dateType}" data-grade="${grade}">
          <td><input type="text" class="si-input" value="${rowType}" disabled></td>
          <td><input type="text" class="si-input field-gubun" value="매입" disabled></td>
          <td><input type="text" class="si-input field-subGubun" value="내부인력" disabled></td>
          <td><div class="custom-select" style="opacity:0.6;"><button type="button" class="select-button" disabled><span>자사</span></button></div></td>
          <td><input type="text" class="si-input field-product" value="${grade}" disabled></td>
          <td><input type="number" class="si-input si-right field-qty" value="${qty}" disabled></td>
          <td><input type="text" class="si-input si-right si-money field-price" value="${fmtMoney(price)}" disabled></td>
          <td class="si-total si-total--purchase"><input type="text" class="si-input si-right si-money field-total" value="${fmtMoney(total)}" disabled></td>
          ${monthTds}
          ${lastTd}
        </tr>`;
    };

    // 등급별 [계획·실적] 쌍을 순서대로 (특급계획·특급실적 → 고급계획·고급실적 → ...)
    let html = '';
    GRADES.forEach(grade => {
      const price = GRADE_PRICE[grade];
      // 계획
      const planMd = GRADE_PLAN_MD[grade];
      const planTotal = planMd * price;
      const perMonth = colCount > 0 ? planTotal / colCount : 0;
      html += buildRow('계획', grade, () => perMonth, planMd, price, false);
      // 실적 (바로 아래)
      const actualTotalAmt = monthCols.reduce((a,c)=> a + buckets[grade][monthKey(c)], 0);
      const actualMd = price > 0 ? actualTotalAmt / price : 0;
      html += buildRow('실적', grade, c => buckets[grade][monthKey(c)], fmtMd(actualMd), price, true);
    });

    // 매입 계획(상품매입 등) 마지막 위치 보존을 위해 "내부인력 계획 그룹" 다음에 삽입
    // 단순화: tbody 끝에 append (UX상 위치보다 데이터 무결성 우선)
    tbody.insertAdjacentHTML('beforeend', html);

    recalcFooter(monthCols);
    return { rows: GRADES.length * 2 };
  }

  function recalcFooter(monthCols) {
    const tbl = document.querySelector('table.sales-input-table');
    if (!tbl) return;
    const sums = { 매출: { months: monthCols.map(()=>0), grand: 0 },
                   매입: { months: monthCols.map(()=>0), grand: 0 } };
    tbl.querySelectorAll('#financialInputTbody > tr').forEach(tr => {
      if (tr.getAttribute('data-row-type') !== '실적') return;
      const gu = tr.querySelector('.field-gubun')?.value;
      if (!sums[gu]) return;
      monthCols.forEach((_c, idx) => {
        const inp = tr.querySelector(`input.month-input[data-month-idx="${idx}"]`);
        if (!inp) return;
        const v = parseInt((inp.value||'0').replace(/,/g,''),10) || 0;
        sums[gu].months[idx] += v;
        sums[gu].grand += v;
      });
    });

    const setFoot = (selector, totalId, monthsArr) => {
      const tr = tbl.querySelector(selector);
      if (!tr) return;
      const total = tr.querySelector(`#${totalId}`);
      if (total) total.textContent = fmtMoney(monthsArr.reduce((a,b)=>a+b,0));
      // 월별 td 들 (label colspan=7, total 1, months..., 마지막 td 1)
      const tds = Array.from(tr.querySelectorAll('td'));
      // 구조: [label(colspan=7), grandTotal, ...months, 빈td]
      monthsArr.forEach((v, i) => { if (tds[2+i]) tds[2+i].textContent = fmtMoney(v); });
    };
    setFoot('.si-footer--sales', 'finPopupFooterSales', sums.매출.months);
    setFoot('.si-footer--purchase', 'finPopupFooterPurchase', sums.매입.months);

    const totalRow = tbl.querySelector('.si-footer--total');
    if (totalRow) {
      const grandTd = totalRow.querySelector('#finPopupFooterGrand');
      if (grandTd) grandTd.textContent = fmtMoney(sums.매출.grand - sums.매입.grand);
      const tds = Array.from(totalRow.querySelectorAll('td'));
      monthCols.forEach((_, i) => {
        if (tds[2+i]) tds[2+i].textContent = fmtMoney(sums.매출.months[i] - sums.매입.months[i]);
      });
    }
  }

  // ── 5) 좌상단 fixed 토글 버튼 + 분배 근거 패널 ──
  function buildToggle() {
    if (document.getElementById('perf-toggle-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'perf-toggle-btn';
    btn.type = 'button';
    btn.textContent = '📋 Work Report 더미 / 분배 근거';
    btn.style.cssText = `
      position:fixed; top:12px; left:12px; z-index:99999;
      background:#1976d2; color:#fff; border:none; border-radius:6px;
      padding:8px 14px; font-weight:bold; font-size:13px; cursor:pointer;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'perf-panel';
    panel.style.cssText = `
      position:fixed; top:52px; left:12px; z-index:99998;
      width: 760px; max-height: calc(100vh - 80px); overflow:auto;
      background:#fff; border:1px solid #999; border-radius:8px;
      box-shadow:0 4px 16px rgba(0,0,0,0.25);
      padding:14px; display:none; font-size:12px;
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    return panel;
  }

  function renderPanel(panel, monthCols, buckets, breakdown, excluded) {
    const monthHeaders = monthCols.map(c => `<th>${c.year}-${c.month}</th>`).join('');
    const monthKey = c => `${c.year}-${c.month}`;

    // ① 등급 × 월 매트릭스 (모달의 내부인력 실적 행과 1:1)
    const matrixRows = GRADES.map(g => {
      const cells = monthCols.map(c => {
        const v = buckets[g][monthKey(c)] || 0;
        return `<td style="text-align:right; ${v>0?'background:#fff3e0;':'color:#bbb;'}">${fmtMoney(v)}</td>`;
      }).join('');
      const rowSum = monthCols.reduce((a,c)=> a + (buckets[g][monthKey(c)]||0), 0);
      const planMd = GRADE_PLAN_MD[g] || 0;
      const planAlert = (planMd === 0 && rowSum > 0)
        ? `<span style="color:#c62828; font-weight:bold;" title="계획 0 / 실적 발생 → 계획 행을 0으로 자동 삽입">⚠</span>`
        : '';
      const planCellBg = (planMd === 0 && rowSum > 0) ? 'background:#ffebee;' : '';
      return `<tr>
        <td style="font-weight:bold; background:#e3f2fd;">${g}</td>
        <td style="text-align:right; color:#666;">${fmtMoney(GRADE_PRICE[g])}</td>
        <td style="text-align:right; ${planCellBg}">${planMd} ${planAlert}</td>
        ${cells}
        <td style="text-align:right; background:#ffe0b2;"><strong>${fmtMoney(rowSum)}</strong></td>
      </tr>`;
    }).join('');
    const colSums = monthCols.map(c => GRADES.reduce((a,g)=> a + (buckets[g][monthKey(c)]||0), 0));
    const grandTotal = colSums.reduce((a,b)=>a+b, 0);
    const colSumCells = colSums.map(v => `<td style="text-align:right;"><strong>${fmtMoney(v)}</strong></td>`).join('');

    // ② WR 행별 표 (등급 칼럼 강조)
    const wrRows = workReports.map(r => {
      const grade = POSITION_TO_GRADE[r.userPosition] || '-';
      const md = r.minutes / 480;
      const price = GRADE_PRICE[grade] || 0;
      const counted = r.kind === '프로젝트' && grade !== '-' && monthCols.some(c => monthKey(c) === ymKey(r.date));
      const amount = counted ? md * price : 0;
      const targetMonth = counted ? ymKey(r.date) : '-';
      const dim = counted ? '' : 'opacity:0.45; background:#fafafa;';
      const mark = counted ? '✓' : '✗';
      return `<tr style="${dim}">
        <td>${r.date}</td>
        <td>${r.userPosition}</td>
        <td style="font-weight:bold; background:${counted?'#e3f2fd':'#f5f5f5'};">${grade}</td>
        <td>${r.kind}</td>
        <td style="text-align:right;">${r.minutes}</td>
        <td style="text-align:right;">${fmtMd(md)}</td>
        <td style="text-align:right;">${fmtMoney(price)}</td>
        <td style="text-align:right;">${counted ? fmtMoney(amount) : '-'}</td>
        <td>${targetMonth} / ${grade}</td>
        <td style="text-align:center;">${mark}</td>
      </tr>`;
    }).join('');

    // ③ (등급 × 월) 기여 상세
    const detailBlocks = GRADES.map(g => {
      const blocks = monthCols.map(c => {
        const ym = monthKey(c);
        const items = breakdown[`${g}|${ym}`] || [];
        if (!items.length) return '';
        return items.map((r, i) => `
          <tr>
            ${i === 0 ? `<td rowspan="${items.length+1}" style="vertical-align:top; font-weight:bold; background:#e3f2fd;">${g}<br>${ym}</td>` : ''}
            <td>${r.date} · ${r.userPosition}</td>
            <td style="text-align:right;">${fmtMd(r.md)} M/D</td>
            <td style="text-align:right;">× ${fmtMoney(r.price)}</td>
            <td style="text-align:right;">${fmtMoney(r.amount)}</td>
          </tr>
        `).join('') + `<tr style="background:#fff3e0; font-weight:bold;">
          <td style="text-align:right;" colspan="3">${g} · ${ym} 합계 → 모달 [${g}] 행 ${ym} 셀</td>
          <td style="text-align:right;">${fmtMoney(items.reduce((a,r)=>a+r.amount,0))}</td>
        </tr>`;
      }).join('');
      return blocks;
    }).join('');
    const monthDetail = detailBlocks || `<tr><td colspan="5" style="text-align:center; color:#999;">기여 없음</td></tr>`;

    // 제외 목록
    const excludedRows = excluded.length ? excluded.map(r => `
      <tr style="opacity:0.7;">
        <td>${r.date}</td><td>${r.userPosition}</td><td>${r.kind}</td>
        <td style="text-align:right;">${r.minutes}</td>
        <td style="color:#c62828;">${r.reason}</td>
      </tr>
    `).join('') : `<tr><td colspan="5" style="text-align:center; color:#999;">없음</td></tr>`;

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="margin:0; font-size:14px;">내부인력 실적 자동분배 시뮬레이터</h3>
        <button id="perf-close" type="button" style="border:none; background:#eee; border-radius:4px; padding:4px 10px; cursor:pointer;">닫기 ×</button>
      </div>

      <div style="background:#e8f5e9; padding:8px 10px; border-radius:4px; margin-bottom:10px; line-height:1.5;">
        <strong>분배 규칙</strong><br>
        ① <code>kind = '프로젝트'</code> 인 Work Report 만 채택 (연차/기타/부서업무 제외)<br>
        ② 작성자 직책 → 등급(특급/고급/중급/초급) 매핑<br>
        ③ M/D = 분 ÷ 480 → 금액 = M/D × 등급단가<br>
        ④ 작성일(<code>seqDt</code>)의 <strong>YYYY-MM</strong> 이 모달의 어느 월 컬럼인지 찾아 누적<br>
        ⑤ 모달의 [세부구분=내부인력 AND 행구분=실적] 행의 월별 입력칸에 집계 결과 채움
      </div>

      <div style="background:#fff3e0; padding:8px 10px; border-radius:4px; margin-bottom:10px; line-height:1.5; border-left:3px solid #ff9800;">
        <strong>⚠ 계획 행 자동 보정 규칙</strong><br>
        계획에 잡히지 않았던 등급이라도 <strong>실적이 발생하면 계획 행을 0/0/...로 채워 함께 삽입</strong>한다.<br>
        <small style="color:#666;">
          사유 ① 사용자가 [계획 vs 실적] 을 같은 등급 라인에서 바로 비교할 수 있어야 함<br>
          사유 ② 4개 등급(특급/고급/중급/초급) 행은 항상 한 쌍씩 존재해야 매트릭스가 깨지지 않음<br>
          예시 ③ 본 더미: 특급 계획 = 0 M/D 이지만 이사·상무·전무 WR 이 있어 특급 실적 &gt; 0 → 특급 계획 행도 0 으로 삽입됨
        </small>
      </div>

      <strong>① 등급 × 월 분배 매트릭스 (모달의 내부인력 실적 4개 행과 1:1)</strong>
      <table border="1" cellspacing="0" style="width:100%; border-collapse:collapse; margin:6px 0 14px;">
        <thead style="background:#eceff1;">
          <tr><th>등급</th><th>단가</th><th>계획<br>(M/D)</th>${monthHeaders}<th>실적 합계<br>(원)</th></tr>
        </thead>
        <tbody>${matrixRows}</tbody>
        <tfoot style="background:#fff9c4; font-weight:bold;">
          <tr>
            <td>월 합계</td>
            <td></td>
            <td></td>
            ${colSumCells}
            <td style="text-align:right; background:#ffe0b2;"><strong>${fmtMoney(grandTotal)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <strong>② Work Report 더미 행별 처리 결과 (${workReports.length}건)</strong>
      <table border="1" cellspacing="0" style="width:100%; border-collapse:collapse; margin:6px 0 14px;">
        <thead style="background:#eceff1;">
          <tr>
            <th>일자</th><th>직책</th><th>등급</th><th>업무구분</th>
            <th>분</th><th>M/D</th><th>단가</th><th>금액</th><th>적용 월/등급</th><th>채택</th>
          </tr>
        </thead>
        <tbody>${wrRows}</tbody>
      </table>

      <strong>③ 등급 × 월 기여 상세 (어떤 WR이 어느 셀에 꽂혔는지)</strong>
      <table border="1" cellspacing="0" style="width:100%; border-collapse:collapse; margin:6px 0 14px;">
        <thead style="background:#eceff1;">
          <tr><th>등급/월</th><th>WR 행</th><th>M/D</th><th>단가</th><th>금액</th></tr>
        </thead>
        <tbody>${monthDetail}</tbody>
      </table>

      <strong>④ 제외된 Work Report (${excluded.length}건)</strong>
      <table border="1" cellspacing="0" style="width:100%; border-collapse:collapse; margin:6px 0;">
        <thead style="background:#eceff1;">
          <tr><th>일자</th><th>직책</th><th>업무구분</th><th>분</th><th>제외 사유</th></tr>
        </thead>
        <tbody>${excludedRows}</tbody>
      </table>
    `;
    document.getElementById('perf-close').addEventListener('click', () => {
      panel.style.display = 'none';
    });
  }

  // ── 실행 ──
  const monthCols = readMonthColumns();
  if (!monthCols.length) {
    console.error('❌ 모달의 월 컬럼을 읽지 못했습니다. 13번 모달 화면인지 확인하세요.');
    return;
  }
  const { buckets, breakdown, excluded } = distribute(monthCols);
  const { rows } = rebuildInternalRows(monthCols, buckets);
  const panel = buildToggle();
  renderPanel(panel, monthCols, buckets, breakdown, excluded);

  window.실적 = {
    get() { return { workReports, monthCols, buckets, breakdown, excluded }; },
    rerun() {
      const cols = readMonthColumns();
      const r = distribute(cols);
      rebuildInternalRows(cols, r.buckets);
      renderPanel(document.getElementById('perf-panel'), cols, r.buckets, r.breakdown, r.excluded);
    },
    addWR(rec) { workReports.push(rec); this.rerun(); },
    clearWR() { workReports.length = 0; this.rerun(); }
  };

  console.log(`✅ 실적 시뮬레이터 부착 완료. 월컬럼 ${monthCols.length}개, 내부인력 실적 행 ${rows}개, WR 더미 ${workReports.length}건`);
})();

// ─────────────────────────────────────────────────────────────
// 응용
// ─────────────────────────────────────────────────────────────
// 실적.get()                    // 더미·집계 결과 조회
// 실적.rerun()                  // DOM 변경 후 재계산
// 실적.addWR({date:'2026-04-30', userPosition:'과장', kind:'프로젝트', minutes:480})
// 실적.clearWR()
//
// 등급 단가:
//   특급 10,000,000 / 고급 9,000,000 / 중급 7,000,000 / 초급 5,000,000
// 직책→등급:
//   이사·상무·전무·부사장·사장 → 특급
//   부장                       → 고급
//   차장·과장                  → 중급
//   대리·주임·사원             → 초급
