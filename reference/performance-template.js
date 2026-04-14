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
  // 등급별 "월" 단가 (원/월). M/D 단위 계산에는 월÷22(근무일수) 한 "일 단가"를 사용해야 한다.
  const GRADE_PRICE = {
    '특급': 10_000_000,
    '고급':  9_000_000,
    '중급':  7_000_000,
    '초급':  5_000_000,
  };
  const WORKDAYS_PER_MONTH = 22;
  const GRADE_DAILY_PRICE = Object.fromEntries(
    Object.entries(GRADE_PRICE).map(([g, p]) => [g, p / WORKDAYS_PER_MONTH])
  );
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
      const monthlyPrice = GRADE_PRICE[grade];
      const dailyPrice = GRADE_DAILY_PRICE[grade]; // = monthlyPrice / 22
      const amount = md * dailyPrice;              // 일 단가로 계산
      buckets[grade][ym] += amount;
      breakdown[`${grade}|${ym}`].push({ ...r, grade, md, price: dailyPrice, monthlyPrice, amount });
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
      const dailyPrice = GRADE_DAILY_PRICE[grade]; // 모달 단가는 "일 단가" 기준 (qty=M/D 와 단위 정합)
      // 계획
      const planMd = GRADE_PLAN_MD[grade];
      const planTotal = planMd * dailyPrice;
      const perMonth = colCount > 0 ? planTotal / colCount : 0;
      html += buildRow('계획', grade, () => perMonth, planMd, dailyPrice, false);
      // 실적 (바로 아래) — buckets 는 이미 일 단가 기준 amount 누적
      const actualTotalAmt = monthCols.reduce((a,c)=> a + buckets[grade][monthKey(c)], 0);
      const actualMd = dailyPrice > 0 ? actualTotalAmt / dailyPrice : 0;
      html += buildRow('실적', grade, c => buckets[grade][monthKey(c)], fmtMd(actualMd), dailyPrice, true);
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
      position:fixed; top:52px; left:12px; right:12px; bottom:12px; z-index:99998;
      overflow:auto;
      background:#fff; border:1px solid #999; border-radius:8px;
      box-shadow:0 4px 16px rgba(0,0,0,0.25);
      padding:14px; display:none; font-size:14px;
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    return panel;
  }

  function renderPanel(panel, monthCols, _buckets, _breakdown, excluded) {
    // 통합표 컬럼: 등급 하위열 순서는 사용자 요청대로 초급→중급→고급→특급
    const SUB_ORDER = ['초급','중급','고급','특급'];

    // 좌측 고정(sticky) 메타 컬럼 너비 정의 (단위: px)
    // 9개: 일자 / 직책 / 등급 / 업무구분 / 분 / M/D / 월 금액 / 일 금액 / 채택
    const META_WIDTHS = [120, 80, 70, 100, 70, 70, 130, 130, 180];
    const META_LEFTS  = META_WIDTHS.reduce((arr, _w, i) => { arr.push(i === 0 ? 0 : arr[i-1] + META_WIDTHS[i-1]); return arr; }, []);
    const META_LABELS = ['일자','직책','등급','업무구분','분','M/D','월 금액','일 금액','채택'];
    const SUB_MIN_W = 110; // 월×등급 하위열 최소 너비
    const ROW_PAD = '14px 10px'; // 행 높이 2.5배 확보용 셀 패딩
    const stickyTd = (i, extra='') => `position:sticky; left:${META_LEFTS[i]}px; min-width:${META_WIDTHS[i]}px; width:${META_WIDTHS[i]}px; background:#fff; z-index:2; padding:${ROW_PAD}; ${extra}`;
    const stickyTh = (i, extra='') => `position:sticky; left:${META_LEFTS[i]}px; top:0; min-width:${META_WIDTHS[i]}px; width:${META_WIDTHS[i]}px; background:#eceff1; z-index:20; padding:${ROW_PAD}; ${extra}`;
    const stickyTf = (extraLeft, extra='') => `position:sticky; left:${extraLeft}px; background:#fff9c4; z-index:15; padding:${ROW_PAD}; ${extra}`;

    const monthKey = c => `${c.year}-${c.month}`;
    const inModal = new Set(monthCols.map(monthKey));

    // 전체 YYYY-MM 추출 (WR 데이터 + 모달 컬럼 합집합)
    const allYms = Array.from(new Set([
      ...workReports.map(r => r.date.slice(0,7)),
      ...monthCols.map(monthKey),
    ])).sort();

    // 합계 매트릭스
    const cellSums = {};      // [ym][grade] = 금액
    allYms.forEach(ym => { cellSums[ym] = {}; SUB_ORDER.forEach(g => cellSums[ym][g] = 0); });

    // ── 통합표 본문 (WR 한 건 = 한 행, 자기 [월][등급] 셀에만 "일 금액" 표시) ──
    const bodyRows = workReports.map(r => {
      const grade        = POSITION_TO_GRADE[r.userPosition] || '-';
      const md           = r.minutes / 480;
      const monthlyPrice = GRADE_PRICE[grade] || 0;
      const dailyPrice   = GRADE_DAILY_PRICE[grade] || 0; // = monthlyPrice / 22
      const ym           = r.date.slice(0,7);
      const inRange      = inModal.has(ym);
      const counted      = r.kind === '프로젝트' && grade !== '-' && inRange;
      const monthlyAmt   = counted ? md * monthlyPrice : 0; // 월 금액(참고용)
      const dailyAmt     = counted ? md * dailyPrice   : 0; // 일 금액(실제 분배값)
      if (counted) cellSums[ym][grade] += dailyAmt;

      const reason = r.kind !== '프로젝트' ? r.kind
                   : grade === '-'         ? '등급매핑 없음'
                   : !inRange              ? '범위 밖'
                   : '';
      const dim   = counted ? '' : 'opacity:0.45; background:#fafafa;';
      const mark  = counted ? '✓' : `✗ <small style="color:#c62828;">${reason}</small>`;

      const cells = allYms.flatMap(ym2 =>
        SUB_ORDER.map(g => {
          if (counted && ym2 === ym && g === grade) {
            return `<td style="text-align:right; background:#fff3e0; font-weight:bold; min-width:${SUB_MIN_W}px; padding:${ROW_PAD};">${fmtMoney(dailyAmt)}</td>`;
          }
          return `<td style="color:#ddd; text-align:center; min-width:${SUB_MIN_W}px; padding:${ROW_PAD};">·</td>`;
        })
      ).join('');

      const rowBg = counted ? '#fff' : '#fafafa';
      return `<tr style="${dim}">
        <td style="${stickyTd(0, `background:${rowBg};`)}">${r.date}</td>
        <td style="${stickyTd(1, `background:${rowBg};`)}">${r.userPosition}</td>
        <td style="${stickyTd(2, `font-weight:bold; background:${counted?'#e3f2fd':'#f5f5f5'};`)}">${grade}</td>
        <td style="${stickyTd(3, `background:${rowBg};`)}">${r.kind}</td>
        <td style="${stickyTd(4, `text-align:right; background:${rowBg};`)}">${r.minutes}</td>
        <td style="${stickyTd(5, `text-align:right; background:${rowBg};`)}">${fmtMd(md)}</td>
        <td style="${stickyTd(6, `text-align:right; background:${rowBg}; color:#888;`)}">${counted ? fmtMoney(monthlyAmt) : '-'}</td>
        <td style="${stickyTd(7, `text-align:right; background:${counted?'#e8f5e9':rowBg}; font-weight:bold;`)}">${counted ? fmtMoney(dailyAmt) : '-'}</td>
        <td style="${stickyTd(8, `white-space:nowrap; background:${rowBg}; border-right:2px solid #ff9800;`)}">${mark}</td>
        ${cells}
      </tr>`;
    }).join('');

    // ── 합계 행 ──
    const sumCells = allYms.flatMap(ym =>
      SUB_ORDER.map(g => {
        const v = cellSums[ym][g];
        const bg = inModal.has(ym) ? '#ffe0b2' : '#eeeeee';
        return `<td style="text-align:right; background:${bg}; font-weight:bold; min-width:${SUB_MIN_W}px; padding:${ROW_PAD};">${v?fmtMoney(v):'-'}</td>`;
      })
    ).join('');
    const grandSum = allYms.reduce((a,ym)=> a + SUB_ORDER.reduce((b,g)=>b+cellSums[ym][g],0), 0);

    // ── 헤더 (2행: YYYY-MM (colspan=4) → 초급/중급/고급/특급) ──
    const META_COLS = META_LABELS.length; // 9: 일자/직책/등급/구분/분/MD/월금액/일금액/채택
    const META_TOTAL_W = META_WIDTHS.reduce((a,b)=>a+b,0);
    const ymHeaders = allYms.map(ym =>
      `<th colspan="4" style="${inModal.has(ym)?'background:#ffe0b2;':'background:#f5f5f5;color:#888;'} top:0; position:sticky; z-index:15; min-width:${SUB_MIN_W*4}px; padding:${ROW_PAD};">${ym}</th>`
    ).join('');
    const subHeaders = allYms.map(ym =>
      SUB_ORDER.map(g =>
        `<th style="${inModal.has(ym)?'background:#fff3e0;':'background:#fafafa;color:#999;'} position:sticky; top:50px; z-index:15; min-width:${SUB_MIN_W}px; padding:${ROW_PAD};">${g}</th>`
      ).join('')
    ).join('');
    // 좌측 고정된 META 헤더 (rowspan=2) — 각각 stickyTh로 left 오프셋 부여
    const metaHeadersTop = META_LABELS.map((lbl, i) =>
      `<th rowspan="2" style="${stickyTh(i, i === META_LABELS.length - 1 ? 'border-right:2px solid #ff9800;' : '')}">${lbl}</th>`
    ).join('');

    // 제외 목록 (간단히 한 박스로)
    const excludedSummary = excluded.length
      ? `<details style="margin-top:8px;"><summary style="cursor:pointer;">▶ 제외된 WR ${excluded.length}건 보기</summary>
          <table border="1" cellspacing="0" style="border-collapse:collapse; margin-top:6px; font-size:11px;">
            <thead style="background:#eceff1;"><tr><th>일자</th><th>직책</th><th>구분</th><th>분</th><th>사유</th></tr></thead>
            <tbody>${excluded.map(r => `<tr><td>${r.date}</td><td>${r.userPosition}</td><td>${r.kind}</td><td style="text-align:right;">${r.minutes}</td><td style="color:#c62828;">${r.reason}</td></tr>`).join('')}</tbody>
          </table>
        </details>`
      : '';

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 style="margin:0; font-size:16px;">내부인력 실적 자동분배 시뮬레이터 — 통합 매트릭스</h3>
        <button id="perf-close" type="button" style="border:none; background:#eee; border-radius:4px; padding:4px 10px; cursor:pointer;">닫기 ×</button>
      </div>

      <div style="background:#e3f2fd; padding:8px 10px; border-radius:4px; margin-bottom:8px; line-height:1.5; border-left:3px solid #1976d2;">
        <strong>실적 셀 산식</strong> &nbsp; <code>실적[등급G][월M] = Σ (wr.minutes ÷ 480 × 일단가[G])</code>,
        &nbsp; <code>일단가[G] = 월단가[G] ÷ 22</code> (근무일수)<br>
        조건: <code>kind='프로젝트'</code> ∧ 직책→등급=G ∧ <code>date.slice(0,7)</code>=M
        <small style="color:#555; display:block; margin-top:4px;">
          · <b>월 단가</b>: 특급 10M / 고급 9M / 중급 7M / 초급 5M &nbsp;→&nbsp;
          <b>일 단가</b>: 특급 ~454,545 / 고급 ~409,091 / 중급 ~318,182 / 초급 ~227,273 원/일<br>
          · 주황 배경 = 모달 월 컬럼 (실제 분배 대상) · 회색 배경 = 모달 범위 밖 (제외)<br>
          · 표의 <b>월 금액</b>은 참고용(회색), 실제 분배값은 <b>일 금액</b>(녹색) 및 월×등급 셀
        </small>
      </div>

      <div style="background:#fff3e0; padding:6px 10px; border-radius:4px; margin-bottom:10px; line-height:1.4; border-left:3px solid #ff9800; font-size:13px;">
        <strong>⚠ 계획 행 자동 보정</strong> — 계획에 없던 등급도 실적이 있으면 계획 행을 0/0/...으로 함께 삽입.
        본 더미: 특급 계획=0이지만 이사·상무·전무 WR로 특급 실적&gt;0 → 특급 계획 행 0으로 삽입됨.
      </div>

      <div style="overflow:auto; max-height: calc(100vh - 240px); border:1px solid #ddd;">
        <table border="1" cellspacing="0" style="border-collapse:separate; border-spacing:0; white-space:nowrap; font-size:14px;">
          <thead style="background:#eceff1;">
            <tr>
              ${metaHeadersTop}
              ${ymHeaders}
            </tr>
            <tr>${subHeaders}</tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot style="background:#fff9c4; font-weight:bold;">
            <tr>
              <td colspan="${META_COLS}" style="${stickyTf(0, `text-align:right; min-width:${META_TOTAL_W}px; border-right:2px solid #ff9800;`)}">합계 (주황 셀 = 모달 실적 행에 꽂힘)</td>
              ${sumCells}
            </tr>
            <tr>
              <td colspan="${META_COLS}" style="${stickyTf(0, `text-align:right; min-width:${META_TOTAL_W}px; border-right:2px solid #ff9800;`)}">총합 (모달 분배 대상만)</td>
              <td colspan="${allYms.length * 4}" style="text-align:right; background:#ffe0b2;">${fmtMoney(grandSum)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${excludedSummary}
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
