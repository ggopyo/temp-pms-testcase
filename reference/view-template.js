// ─────────────────────────────────────────────────────────────
// 공수비교표 시뮬레이터 (자기완결형)
// 사용법: 12-project-management-view.html → 개발자도구 콘솔 붙여넣기
//
// Pre-Sales: 프로젝트 전체 기간 통으로 입력된 등급별 총 M/D
//            → 기간 필터 적용 시 (겹침일수 / 전체일수) 비율로 일할 계산
// 투입인력: 인력별 투입~철수 구간을 [from..to]와 겹침일수 × 비율
// Work Report: 일자별 기록을 [from..to] 범위 필터링 후 분 ÷ 480
// ─────────────────────────────────────────────────────────────
(function(){
  const POSITION_TO_GRADE = {
    '사장':'특급','부사장':'특급','전무':'특급','상무':'특급','이사':'특급',
    '부장':'고급',
    '차장':'중급','과장':'중급',
    '대리':'초급','주임':'초급','사원':'초급'
  };
  const GRADES = ['특급','고급','중급','초급'];

  let data = {
    projectPeriod: { start: '2024-01-01', end: '2026-12-31' },
    presales: [],
    deploys: [],
    workReports: []
  };

  const parseDate = s => new Date(s + 'T00:00:00');
  const daysBetween = (a, b) => Math.floor((b - a) / 86400000) + 1;
  const overlapDays = (aStart, aEnd, pStart, pEnd) => {
    const s = aStart > pStart ? aStart : pStart;
    const e = aEnd < pEnd ? aEnd : pEnd;
    if (e < s) return 0;
    return daysBetween(s, e);
  };
  const fmt = n => n === 0 ? '0' : (Math.round(n * 100) / 100).toString();

  function findCompareTable() {
    const ths = document.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent.includes('프로젝트 공수 예상/발생 비교표')) return th.closest('table');
    }
    return null;
  }

  function annotateTable(table) {
    const rows = table.querySelectorAll('tbody tr');
    const cols = ['vrb','deploy','wr'];
    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 4) return;
      const label = tds[0].textContent.trim();
      const grade = (GRADES.includes(label) || label === '합계') ? label : null;
      if (!grade) return;
      cols.forEach((c, i) => {
        tds[i+1].setAttribute('data-grade', grade);
        tds[i+1].setAttribute('data-col', c);
      });
    });
    table.id = 'md-compare-table';
  }

  function injectPanel(table) {
    if (document.getElementById('md-simulator')) return;
    const wrap = table.closest('div');
    const panel = document.createElement('div');
    panel.id = 'md-simulator';
    panel.style.cssText = 'margin-top:35px; width:100%;';
    panel.innerHTML = `
      <h3 class="sub-container-title" style="margin-bottom:12px;">공수비교표 시뮬레이터</h3>

      <div class="period-filter-wrap" style="margin-bottom: 16px; align-items:center;">
        <div class="singleYear-calendar-container">
          <div class="calendar-container-item">
            <input id="md-from" class="calendar-input year-month-date" type="date" value="2024-01-01">
          </div>
        </div>
        <span style="margin-inline: 8px;">~</span>
        <div class="singleYear-calendar-container">
          <div class="calendar-container-item">
            <input id="md-to" class="calendar-input year-month-date" type="date" value="2026-12-31">
          </div>
        </div>
        <button id="md-clear" class="btn btn-outline" type="button" style="margin-left: 12px;">초기화</button>
        <span id="md-period-info" class="input-text" style="margin-left: 12px;"></span>
      </div>

      <!-- ① Pre-Sales -->
      <div style="margin-top:24px;">
        <strong class="input-text" style="display:block; margin-bottom:6px;">① Pre-Sales 내부인력 매입 (프로젝트 전체 기간 총 M/D)</strong>
        <table class="table-row" id="src-presales-table" style="width:100%;">
          <colgroup><col style="width:15%"><col style="width:15%"><col style="width:50%"><col style="width:20%"></colgroup>
          <thead><tr><th>등급</th><th>총 M/D</th><th>계산식 (총MD × 일할비율)</th><th style="background:#fffde7;">→ 공수비교표 VRB 값</th></tr></thead>
          <tbody></tbody>
          <tfoot></tfoot>
        </table>
      </div>

      <!-- ② 투입인력관리 -->
      <div style="margin-top:24px;">
        <strong class="input-text" style="display:block; margin-bottom:6px;">② 프로젝트 투입인력관리 (행 단위 → 등급별 기여)</strong>
        <div style="max-height:320px; overflow:auto;">
          <table class="table-row" id="src-deploys-table" style="width:100%;">
            <colgroup>
              <col style="width:9%"><col style="width:7%"><col style="width:7%"><col style="width:10%"><col style="width:10%"><col style="width:6%"><col style="width:7%">
              <col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:8%">
            </colgroup>
            <thead>
              <tr>
                <th rowspan="2">이름</th><th rowspan="2">직책</th><th rowspan="2">등급</th><th rowspan="2">투입</th><th rowspan="2">철수</th><th rowspan="2">비율</th><th rowspan="2">겹침일수</th>
                <th colspan="5" style="background:#e3f2fd;">등급별 기여 (M/D)</th>
              </tr>
              <tr>
                <th style="background:#e3f2fd;">특급</th><th style="background:#e3f2fd;">고급</th><th style="background:#e3f2fd;">중급</th><th style="background:#e3f2fd;">초급</th><th style="background:#e3f2fd;">행 합계</th>
              </tr>
            </thead>
            <tbody></tbody>
            <tfoot></tfoot>
          </table>
        </div>
      </div>

      <!-- ③ Work Report -->
      <div style="margin-top:24px;">
        <strong class="input-text" style="display:block; margin-bottom:6px;">③ Work Report (행 단위 → 등급별 기여)</strong>
        <div style="max-height:360px; overflow:auto;">
          <table class="table-row" id="src-wr-table" style="width:100%;">
            <colgroup>
              <col style="width:10%"><col style="width:7%"><col style="width:7%"><col style="width:10%"><col style="width:7%"><col style="width:7%"><col style="width:7%">
              <col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:9%">
            </colgroup>
            <thead>
              <tr>
                <th rowspan="2">일자</th><th rowspan="2">직책</th><th rowspan="2">등급</th><th rowspan="2">업무구분</th><th rowspan="2">소요(분)</th><th rowspan="2">M/D</th><th rowspan="2">집계</th>
                <th colspan="5" style="background:#fff3e0;">등급별 기여 (M/D)</th>
              </tr>
              <tr>
                <th style="background:#fff3e0;">특급</th><th style="background:#fff3e0;">고급</th><th style="background:#fff3e0;">중급</th><th style="background:#fff3e0;">초급</th><th style="background:#fff3e0;">행 합계</th>
              </tr>
            </thead>
            <tbody></tbody>
            <tfoot></tfoot>
          </table>
        </div>
      </div>
    `;
    wrap.parentNode.insertBefore(panel, wrap);
  }

  function compute() {
    const fromStr = document.getElementById('md-from').value;
    const toStr = document.getElementById('md-to').value;
    const fromD = parseDate(fromStr), toD = parseDate(toStr);
    const result = {};
    GRADES.forEach(g => result[g] = { vrb:0, deploy:0, wr:0 });

    // ① VRB: 프로젝트 전체 기간 총 M/D × (필터구간과 프로젝트구간 겹침일수 / 프로젝트 전체일수)
    const pStart = parseDate(data.projectPeriod.start);
    const pEnd = parseDate(data.projectPeriod.end);
    const projectTotalDays = daysBetween(pStart, pEnd);
    const projectOverlap = overlapDays(pStart, pEnd, fromD, toD);
    const ratio = projectTotalDays > 0 ? projectOverlap / projectTotalDays : 0;
    data.presales.forEach(row => {
      if (!result[row.grade]) return;
      result[row.grade].vrb += row.md * ratio;
    });

    // ② 투입인력관리
    data.deploys.forEach(row => {
      const grade = POSITION_TO_GRADE[row.position];
      if (!grade) return;
      const days = overlapDays(parseDate(row.in), parseDate(row.out), fromD, toD);
      result[grade].deploy += days * (row.ratio / 100);
    });

    // ③ Work Report
    data.workReports.forEach(row => {
      if (row.kind !== '프로젝트') return;
      const d = parseDate(row.date);
      if (d < fromD || d > toD) return;
      const grade = POSITION_TO_GRADE[row.userPosition];
      if (!grade) return;
      result[grade].wr += row.minutes / 480;
    });
    return { result, ratio, projectOverlap, projectTotalDays };
  }

  function renderTable() {
    const { result, ratio, projectOverlap, projectTotalDays } = compute();
    const sums = { vrb:0, deploy:0, wr:0 };
    GRADES.forEach(g => {
      ['vrb','deploy','wr'].forEach(c => {
        const td = document.querySelector(`#md-compare-table td[data-grade="${g}"][data-col="${c}"]`);
        if (td) td.textContent = fmt(result[g][c]);
        sums[c] += result[g][c];
      });
    });
    ['vrb','deploy','wr'].forEach(c => {
      const td = document.querySelector(`#md-compare-table td[data-grade="합계"][data-col="${c}"]`);
      if (td) td.textContent = fmt(sums[c]);
    });
    const info = document.getElementById('md-period-info');
    if (info) info.textContent = `프로젝트기간 ${data.projectPeriod.start}~${data.projectPeriod.end} 중 ${projectOverlap}/${projectTotalDays}일 겹침 (Pre-Sales 일할비율 ${(ratio*100).toFixed(1)}%)`;
  }
  function renderSources() {
    const fromStr = document.getElementById('md-from').value;
    const toStr = document.getElementById('md-to').value;
    const fromD = parseDate(fromStr), toD = parseDate(toStr);

    // 일할비율 계산 (Pre-Sales용)
    const pStart = parseDate(data.projectPeriod.start);
    const pEnd = parseDate(data.projectPeriod.end);
    const projectTotalDays = daysBetween(pStart, pEnd);
    const projectOverlap = overlapDays(pStart, pEnd, fromD, toD);
    const ratio = projectTotalDays > 0 ? projectOverlap / projectTotalDays : 0;

    // ① Pre-Sales
    const psBody = document.querySelector('#src-presales-table tbody');
    const psFoot = document.querySelector('#src-presales-table tfoot');
    if (data.presales.length) {
      let psMdTotal = 0, psVrbTotal = 0;
      psBody.innerHTML = data.presales.map(r => {
        const v = r.md * ratio;
        psMdTotal += r.md;
        psVrbTotal += v;
        return `<tr>
          <td>${r.grade}</td>
          <td>${r.md} M/D</td>
          <td>${r.md} × (${projectOverlap} / ${projectTotalDays}) = ${r.md} × ${(ratio*100).toFixed(2)}%</td>
          <td style="background:#fffde7;"><strong>${fmt(v)}</strong></td>
        </tr>`;
      }).join('');
      psFoot.innerHTML = `<tr style="background:#fff9c4; font-weight:bold;">
        <td>합계</td>
        <td>${psMdTotal} M/D</td>
        <td style="text-align:right;">∑ → 공수비교표 VRB 합계</td>
        <td>${fmt(psVrbTotal)}</td>
      </tr>`;
    } else {
      psBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#888;">(데이터 없음)</td></tr>`;
      psFoot.innerHTML = '';
    }

    // ② 투입인력
    const dpBody = document.querySelector('#src-deploys-table tbody');
    const dpFoot = document.querySelector('#src-deploys-table tfoot');
    const dpSums = {특급:0, 고급:0, 중급:0, 초급:0};
    if (data.deploys.length) {
      dpBody.innerHTML = data.deploys.map(r => {
        const grade = POSITION_TO_GRADE[r.position] || '-';
        const ov = overlapDays(parseDate(r.in), parseDate(r.out), fromD, toD);
        const v = ov * (r.ratio / 100);
        if (dpSums[grade] !== undefined && v > 0) dpSums[grade] += v;
        const dim = ov === 0 ? 'opacity:0.4;' : '';
        const cell = g => (g === grade && v > 0) ? `<td style="background:#e3f2fd;">${fmt(v)}</td>` : `<td style="background:#e3f2fd;">-</td>`;
        return `<tr style="${dim}">
          <td>${r.name}</td><td>${r.position}</td><td>${grade}</td><td>${r.in}</td><td>${r.out}</td><td>${r.ratio}%</td><td>${ov}</td>
          ${GRADES.map(cell).join('')}
          <td style="background:#e3f2fd;"><strong>${v > 0 ? fmt(v) : '-'}</strong></td>
        </tr>`;
      }).join('');
      const dpTotal = GRADES.reduce((a,g)=>a+dpSums[g], 0);
      dpFoot.innerHTML = `<tr style="background:#bbdefb; font-weight:bold;">
        <td>합계</td>
        <td></td><td></td><td></td><td></td><td></td>
        <td>→</td>
        ${GRADES.map(g => `<td>${fmt(dpSums[g])}</td>`).join('')}
        <td>${fmt(dpTotal)}</td>
      </tr>`;
    } else {
      dpBody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#888;">(데이터 없음)</td></tr>`;
      dpFoot.innerHTML = '';
    }

    // ③ Work Report
    const wrBody = document.querySelector('#src-wr-table tbody');
    const wrFoot = document.querySelector('#src-wr-table tfoot');
    const wrSums = {특급:0, 고급:0, 중급:0, 초급:0};
    if (data.workReports.length) {
      wrBody.innerHTML = data.workReports.map(r => {
        const grade = POSITION_TO_GRADE[r.userPosition] || '-';
        const md = r.minutes / 480;
        const d = parseDate(r.date);
        const inRange = d >= fromD && d <= toD;
        const isProject = r.kind === '프로젝트';
        const counted = inRange && isProject;
        const v = counted ? md : 0;
        if (wrSums[grade] !== undefined && v > 0) wrSums[grade] += v;
        const dim = counted ? '' : 'opacity:0.4;';
        const mark = counted ? '✓' : (isProject ? '범위외' : '제외');
        const cell = g => (counted && g === grade) ? `<td style="background:#fff3e0;">${fmt(v)}</td>` : `<td style="background:#fff3e0;">-</td>`;
        return `<tr style="${dim}">
          <td>${r.date}</td><td>${r.userPosition}</td><td>${grade}</td><td>${r.kind}</td><td>${r.minutes}</td><td>${fmt(md)}</td><td>${mark}</td>
          ${GRADES.map(cell).join('')}
          <td style="background:#fff3e0;"><strong>${v > 0 ? fmt(v) : '-'}</strong></td>
        </tr>`;
      }).join('');
      const wrTotal = GRADES.reduce((a,g)=>a+wrSums[g], 0);
      wrFoot.innerHTML = `<tr style="background:#ffe0b2; font-weight:bold;">
        <td>합계</td>
        <td></td><td></td><td></td><td></td><td></td>
        <td>→</td>
        ${GRADES.map(g => `<td>${fmt(wrSums[g])}</td>`).join('')}
        <td>${fmt(wrTotal)}</td>
      </tr>`;
    } else {
      wrBody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#888;">(데이터 없음)</td></tr>`;
      wrFoot.innerHTML = '';
    }
  }
  function recalc() { renderSources(); renderTable(); }

  const table = findCompareTable();
  if (!table) { console.error('❌ 공수비교표 테이블을 찾지 못했습니다.'); return; }
  annotateTable(table);
  injectPanel(table);

  document.getElementById('md-from').addEventListener('change', recalc);
  document.getElementById('md-to').addEventListener('change', recalc);
  document.getElementById('md-clear').addEventListener('click', () => {
    data = { projectPeriod: data.projectPeriod, presales:[], deploys:[], workReports:[] };
    recalc();
  });

  window.공수 = {
    set(d) { data = Object.assign({projectPeriod:data.projectPeriod, presales:[],deploys:[],workReports:[]}, d); },
    get() { return data; },
    clear() { data = { projectPeriod: data.projectPeriod, presales:[], deploys:[], workReports:[] }; },
    recalc,
    setPeriod(from, to) {
      document.getElementById('md-from').value = from;
      document.getElementById('md-to').value = to;
      recalc();
    },
    setProjectPeriod(start, end) {
      data.projectPeriod = { start, end };
      recalc();
    }
  };

  // ── 더미데이터 ──
  data = {
    projectPeriod: { start: '2024-01-01', end: '2026-12-31' },

    // ① Pre-Sales: 등급별 프로젝트 전체 총 M/D (월별 분할 없음)
    presales: [
      { grade:'특급', md: 60  },
      { grade:'고급', md: 90  },
      { grade:'중급', md: 180 },
      { grade:'초급', md: 240 },
    ],

    // ② 투입인력 — 풍부하게
    deploys: [
      // 2024
      { name:'박이사', position:'이사', in:'2024-02-01', out:'2024-04-30', ratio:100 },
      { name:'서사장', position:'사장', in:'2024-05-01', out:'2024-06-15', ratio:30  },
      { name:'최부장', position:'부장', in:'2024-01-15', out:'2024-12-31', ratio:80  },
      { name:'정부장', position:'부장', in:'2024-07-01', out:'2024-10-31', ratio:50  },
      { name:'홍과장', position:'과장', in:'2024-01-01', out:'2024-12-31', ratio:100 },
      { name:'김차장', position:'차장', in:'2024-03-01', out:'2024-09-30', ratio:60  },
      { name:'한과장', position:'과장', in:'2024-06-01', out:'2024-11-30', ratio:80  },
      { name:'이대리', position:'대리', in:'2024-04-01', out:'2024-08-31', ratio:100 },
      { name:'장사원', position:'사원', in:'2024-09-01', out:'2024-12-31', ratio:100 },

      // 2025
      { name:'이상무', position:'상무', in:'2025-03-01', out:'2025-06-30', ratio:50  },
      { name:'박이사', position:'이사', in:'2025-09-01', out:'2025-12-31', ratio:80  },
      { name:'정부장', position:'부장', in:'2025-01-01', out:'2025-12-31', ratio:100 },
      { name:'홍과장', position:'과장', in:'2025-01-01', out:'2025-12-31', ratio:100 },
      { name:'김차장', position:'차장', in:'2025-04-01', out:'2025-10-31', ratio:60  },
      { name:'한과장', position:'과장', in:'2025-02-01', out:'2025-08-31', ratio:80  },
      { name:'박주임', position:'주임', in:'2025-01-01', out:'2025-06-30', ratio:100 },
      { name:'이대리', position:'대리', in:'2025-05-01', out:'2025-12-31', ratio:80  },
      { name:'윤사원', position:'사원', in:'2025-07-01', out:'2025-12-31', ratio:50  },

      // 2026
      { name:'박이사', position:'이사', in:'2026-04-01', out:'2026-04-30', ratio:100 },
      { name:'전전무', position:'전무', in:'2026-10-01', out:'2026-12-31', ratio:40  },
      { name:'최부장', position:'부장', in:'2026-04-01', out:'2026-05-31', ratio:100 },
      { name:'정부장', position:'부장', in:'2026-09-01', out:'2026-12-31', ratio:50  },
      { name:'홍과장', position:'과장', in:'2026-03-01', out:'2026-06-30', ratio:100 },
      { name:'김차장', position:'차장', in:'2026-04-15', out:'2026-05-31', ratio:50  },
      { name:'한과장', position:'과장', in:'2026-08-01', out:'2026-11-30', ratio:80  },
      { name:'이대리', position:'대리', in:'2026-04-10', out:'2026-05-20', ratio:80  },
      { name:'박주임', position:'주임', in:'2026-06-01', out:'2026-09-30', ratio:100 },
      { name:'윤사원', position:'사원', in:'2026-08-01', out:'2026-10-31', ratio:100 },
      { name:'장사원', position:'사원', in:'2026-11-01', out:'2026-12-31', ratio:60  },
    ],

    // ③ Work Report — 풍부하게 (집계 제외 케이스 섞음)
    workReports: [
      // 2024
      { date:'2024-02-15', userPosition:'이사', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2024-03-08', userPosition:'이사', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-04-22', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2024-05-10', userPosition:'사장', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2024-01-20', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-04-15', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2024-08-05', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-11-12', userPosition:'부장', project:'P', kind:'프로젝트', minutes:360 },
      { date:'2024-02-12', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-03-22', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-05-30', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2024-07-22', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2024-09-18', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-10-05', userPosition:'차장', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2024-06-10', userPosition:'대리', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-07-25', userPosition:'대리', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2024-08-15', userPosition:'대리', project:'P', kind:'연차',     minutes:480 }, // 제외
      { date:'2024-09-20', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2024-12-10', userPosition:'사원', project:'P', kind:'프로젝트', minutes:240 },

      // 2025
      { date:'2025-03-04', userPosition:'상무', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-05-18', userPosition:'상무', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2025-09-22', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2025-11-15', userPosition:'이사', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-02-20', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-04-12', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2025-06-08', userPosition:'부장', project:'P', kind:'프로젝트', minutes:360 },
      { date:'2025-08-25', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-10-18', userPosition:'부장', project:'P', kind:'기타',     minutes:240 }, // 제외
      { date:'2025-12-05', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-03-15', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-05-22', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2025-07-30', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-09-10', userPosition:'과장', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2025-11-22', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2025-04-08', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-06-18', userPosition:'차장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2025-09-25', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-02-28', userPosition:'주임', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-05-15', userPosition:'주임', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2025-07-12', userPosition:'대리', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-10-08', userPosition:'대리', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2025-08-20', userPosition:'사원', project:'P', kind:'부서업무', minutes:240 }, // 제외
      { date:'2025-11-15', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2025-12-22', userPosition:'사원', project:'P', kind:'프로젝트', minutes:360 },

      // 2026
      { date:'2026-04-10', userPosition:'이사', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-04-25', userPosition:'이사', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2026-10-15', userPosition:'전무', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-11-20', userPosition:'전무', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2026-04-15', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-05-10', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-09-12', userPosition:'부장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-11-28', userPosition:'부장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-03-20', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-04-10', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-05-05', userPosition:'과장', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2026-06-15', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-08-22', userPosition:'과장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-10-30', userPosition:'과장', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-04-20', userPosition:'차장', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-05-25', userPosition:'차장', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2026-04-25', userPosition:'대리', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-05-12', userPosition:'대리', project:'P', kind:'프로젝트', minutes:360 },
      { date:'2026-06-08', userPosition:'주임', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-07-15', userPosition:'주임', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-09-22', userPosition:'주임', project:'P', kind:'프로젝트', minutes:120 },
      { date:'2026-08-20', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-09-15', userPosition:'사원', project:'P', kind:'기타',     minutes:480 }, // 제외
      { date:'2026-10-08', userPosition:'사원', project:'P', kind:'프로젝트', minutes:240 },
      { date:'2026-11-25', userPosition:'사원', project:'P', kind:'프로젝트', minutes:480 },
      { date:'2026-12-10', userPosition:'사원', project:'P', kind:'프로젝트', minutes:360 },
    ],
  };
  recalc();
  console.log('✅ 시뮬레이터 부착 완료. presales=' + data.presales.length + ' deploys=' + data.deploys.length + ' workReports=' + data.workReports.length);
})();

// ─────────────────────────────────────────────────────────────
// 응용 예시
// ─────────────────────────────────────────────────────────────
// 공수.setPeriod('2024-01-01', '2024-12-31')        // 2024년만
// 공수.setPeriod('2025-01-01', '2025-12-31')        // 2025년만
// 공수.setPeriod('2026-04-01', '2026-05-31')        // 2026년 4~5월만
// 공수.setProjectPeriod('2024-06-01', '2026-06-30') // 프로젝트 기간 변경
// 공수.clear(); 공수.recalc()
// 공수.get()
//
// Pre-Sales VRB 계산:
//   result[grade].vrb = 등급별 총MD × (필터구간∩프로젝트구간 / 프로젝트 전체일수)
//
// 직책→등급:
//   이사·상무·전무·부사장·사장 → 특급
//   부장                       → 고급
//   차장·과장                  → 중급
//   대리·주임·사원             → 초급
