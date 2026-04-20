// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, AlertCircle, Search, Filter, CalendarDays, CheckCircle2, Printer, BookOpen, MousePointer2, TrendingUp, TableProperties } from 'lucide-react';

// [중요] 현장 입력 앱 URL이 아닌, '대시보드 전용 서버'에서 1단계에서 새로 발급받은 URL을 여기에 넣습니다.
const DASHBOARD_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby03SJbc10FOwewYt8sVXB1xqK-HXatSgySDj14Hyyt4CBL4afEef3BSlXhDSrGSyi6/exec';

const TABS = ['전체', 'Mouse-1', 'Mouse-2', 'Rat', '중동물', '격리사육실', '격리실험실'];

// 날짜 포맷 함수 (YYYY-MM-DD)
const formatDate = (dateObj) => {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('전체');
  const [dashboardData, setDashboardData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('업데이트 필요');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 사육실별 일자별 추이 패널 토글 상태
  const [showRoomTrend, setShowRoomTrend] = useState(false);

  // 상세 데이터 테이블 다중 필터 상태
  const [filterSpecies, setFilterSpecies] = useState('전체');
  const [filterPI, setFilterPI] = useState('전체');
  const [filterProject, setFilterProject] = useState('전체');
  const [tableStartDate, setTableStartDate] = useState('');
  const [tableEndDate, setTableEndDate] = useState('');

  // 통합 변동 내역 필터 상태 (디폴트: 최근 30일 ~ 오늘)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const [eventStartDate, setEventStartDate] = useState(formatDate(thirtyDaysAgo));
  const [eventEndDate, setEventEndDate] = useState(formatDate(today));
  const [eventSearch, setEventSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('전체');

  // 데이터 로드 함수 (새로운 대시보드 전용 URL 호출)
  const fetchDashboardData = async () => {
    if (DASHBOARD_SCRIPT_URL.includes('여기에_새로_발급받은')) {
      alert("코드 상단의 DASHBOARD_SCRIPT_URL 에 대시보드 전용 서버 주소를 넣어야 작동합니다!");
      return;
    }

    setIsLoading(true);
    try {
      // [수정됨] 대시보드 전용 데이터를 요청하기 위해 '?type=dashboard' 쿼리 파라미터 추가
      const response = await fetch(DASHBOARD_SCRIPT_URL + '?type=dashboard');
      const serverResponse = await response.json();
      
      // 서버에서 보내주는 새 포맷({ version: "6.3", data: [...] })에 맞춰 세팅
      if (serverResponse.data) {
        setDashboardData(serverResponse.data);
        const now = new Date();
        setLastUpdated(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
      }
    } catch (error) {
      console.error("데이터 로드 실패:", error);
      alert("데이터를 불러오는 데 실패했습니다. 인터넷 연결이나 URL을 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 데이터 가공 로직 (최근 45일치 데이터를 기반으로 집계)
  const stats = useMemo(() => {
    const s = {
      mouse: { heads: 0, cages: 0 },
      rat: { heads: 0, cages: 0 },
      rabbit: { heads: 0, cages: 0 },
      activeProjects: new Set(),
      realEvents: [],
      todayTrend: []
    };

    if (dashboardData.length === 0) return s;

    // 1. 사육실별 최신 날짜 파악 (메인 KPI 카드에는 가장 최신 현황만 보여주기 위함)
    const latestDatePerRoom = {};
    dashboardData.forEach(item => {
      if (!latestDatePerRoom[item.roomName] || item.date > latestDatePerRoom[item.roomName]) {
        latestDatePerRoom[item.roomName] = item.date;
      }
    });

    // 추이(Trend) 계산을 위한 날짜별 집계 객체
    const trendMap = {};

    dashboardData.forEach(item => {
      if (!item.projectId || item.projectId === 'NONE') return;

      const count = Number(item.animalCount) || 0;
      const isMouse = item.roomName.includes('Mouse') || item.strain.includes('mouse') || item.strain.includes('BALB') || item.strain.includes('C57') || item.strain.includes('ICR');
      const isRat = item.roomName.includes('Rat') || item.strain.includes('Rat');
      const isRabbit = item.roomName.includes('중동물') || item.strain.includes('Rabbit');

      // --- [추이 데이터] 전체 날짜를 누적 ---
      if (!trendMap[item.date]) {
          trendMap[item.date] = { mouse: { heads: 0, cages: 0 }, rat: { heads: 0, cages: 0 }, rabbit: { heads: 0, cages: 0 } };
      }
      if (isMouse) { trendMap[item.date].mouse.heads += count; trendMap[item.date].mouse.cages += 1; }
      else if (isRat) { trendMap[item.date].rat.heads += count; trendMap[item.date].rat.cages += 1; }
      else if (isRabbit) { trendMap[item.date].rabbit.heads += count; trendMap[item.date].rabbit.cages += 1; }

      // --- [특이사항 및 변동 내역] 전체 날짜에서 추출 ---
      const loc = `${item.roomName} ${item.rackId}동 ${item.cageId}`;
      if (item.warnings) s.realEvents.push({ date: item.date, location: loc, pi: item.pi, type: '경고', content: item.warnings, color: 'text-red-700 bg-red-100 border-red-200' });
      if (item.note) s.realEvents.push({ date: item.date, location: loc, pi: item.pi, type: '메모', content: item.note, color: 'text-slate-700 bg-slate-100 border-slate-200' });
      if (['반입', '반출', '변동', '이동'].includes(item.status)) {
        let col = 'text-indigo-700 bg-indigo-100 border-indigo-200';
        if(item.status === '반입') col = 'text-blue-700 bg-blue-100 border-blue-200';
        if(item.status === '반출') col = 'text-rose-700 bg-rose-100 border-rose-200';
        if(item.status === '수량변동') col = 'text-amber-700 bg-amber-100 border-amber-200';
        if(item.status === '이동') col = 'text-purple-700 bg-purple-100 border-purple-200';
        s.realEvents.push({ date: item.date, location: loc, pi: item.pi, type: '상태', content: item.status, color: col });
      }

      // --- [메인 KPI] 각 사육실의 가장 '최신' 날짜 데이터만 카드에 표시 ---
      if (item.date === latestDatePerRoom[item.roomName]) {
        s.activeProjects.add(item.projectId);
        if (isMouse) { s.mouse.heads += count; s.mouse.cages += 1; }
        else if (isRat) { s.rat.heads += count; s.rat.cages += 1; }
        else if (isRabbit) { s.rabbit.heads += count; s.rabbit.cages += 1; }
      }
    });

    // 집계된 전체 추이 데이터를 날짜 최신순으로 정렬 (최대 14일치만 표출)
    const trendDates = Object.keys(trendMap).sort((a, b) => new Date(b) - new Date(a)).slice(0, 14);
    s.todayTrend = trendDates.map(date => {
        const dObj = new Date(date);
        return {
            date: date,
            displayDate: `${String(dObj.getMonth()+1).padStart(2,'0')}/${String(dObj.getDate()).padStart(2,'0')}`,
            ...trendMap[date]
        };
    });

    return s;
  }, [dashboardData]);

  // 통합 이벤트 검색 및 필터링 로직
  const filteredEvents = useMemo(() => {
    let allEvents = [...stats.realEvents];
    
    // 날짜 필터 적용
    allEvents = allEvents.filter(ev => ev.date >= eventStartDate && ev.date <= eventEndDate);

    if (eventTypeFilter !== '전체') {
      allEvents = allEvents.filter(ev => ev.type === eventTypeFilter);
    }
    
    if (eventSearch) {
      const q = eventSearch.toLowerCase();
      allEvents = allEvents.filter(ev => 
        ev.content.toLowerCase().includes(q) || 
        ev.location.toLowerCase().includes(q) || 
        ev.pi.toLowerCase().includes(q)
      );
    }
    
    return allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [stats.realEvents, eventStartDate, eventEndDate, eventTypeFilter, eventSearch]);


  // 드롭다운 필터 옵션 추출 로직
  const filterOptions = useMemo(() => {
    const pis = new Set();
    const projects = new Set();
    
    let data = dashboardData.filter(item => item.projectId && item.projectId !== 'NONE');
    if (activeTab !== '전체') {
      data = data.filter(item => item.roomName.includes(activeTab));
    }

    data.forEach(item => {
      if (item.pi) pis.add(item.pi);
      if (item.projectId) projects.add(item.projectId);
    });

    return {
      pis: Array.from(pis).sort(),
      projects: Array.from(projects).sort()
    };
  }, [dashboardData, activeTab]);

  // 2. [핵심] 탭별 사육실 매트릭스 데이터 변환 로직 (엑셀 완벽 구현)
  const roomMatrixData = useMemo(() => {
    if (activeTab === '전체' || dashboardData.length === 0) return null;

    // 현재 선택된 탭(사육실)의 데이터만 필터링
    const roomData = dashboardData.filter(item => item.roomName.includes(activeTab) && item.projectId && item.projectId !== 'NONE');
    if (roomData.length === 0) return { columns: [], colKeys: [], rowMap: new Map(), sortedDates: [] };

    const colsMap = new Map();
    const rowMap = new Map();

    roomData.forEach(item => {
      // 열(Column) 구분 기준: 학과 + PI + 과제번호 + 동물계통 + 상세계통 + 사육대(Rack)
      const colKey = `${item.affiliation}_${item.pi}_${item.projectId}_${item.strain}_${item.strainDetail}_${item.rackId}`;
      
      if (!colsMap.has(colKey)) {
        colsMap.set(colKey, {
          affiliation: item.affiliation || '-',
          pi: item.pi || '-',
          projectId: item.projectId || '-',
          strain: item.strain || '-',
          strainDetail: item.strainDetail || '', // LMO 등 상세계통 추가
          rackId: item.rackId // A1, A2 등 사육대
        });
      }

      // 날짜별 데이터 행(Row) 집계
      if (!rowMap.has(item.date)) {
        rowMap.set(item.date, { totalHeads: 0, totalCages: 0, values: {} });
      }
      
      const rData = rowMap.get(item.date);
      if (!rData.values[colKey]) rData.values[colKey] = { heads: 0, cages: 0 };

      const count = Number(item.animalCount) || 0;
      rData.values[colKey].heads += count;
      rData.values[colKey].cages += 1;
      
      rData.totalHeads += count;
      rData.totalCages += 1;
    });

    // 열 정렬 (PI 오름차순 -> 학과 오름차순 -> 사육대 순서)
    const sortedColKeys = Array.from(colsMap.keys()).sort((a, b) => {
      const colA = colsMap.get(a);
      const colB = colsMap.get(b);
      if (colA.pi !== colB.pi) return colA.pi.localeCompare(colB.pi);
      if (colA.projectId !== colB.projectId) return colA.projectId.localeCompare(colB.projectId);
      return colA.rackId.localeCompare(colB.rackId);
    });
    
    const columns = sortedColKeys.map(key => colsMap.get(key));

    // 날짜 정렬 (최신순)
    const sortedDates = Array.from(rowMap.keys()).sort((a, b) => new Date(b) - new Date(a));

    return { columns, colKeys: sortedColKeys, rowMap, sortedDates };
  }, [dashboardData, activeTab]);

  // 다중 필터 적용 로직
  const { filteredTableData, roomStats } = useMemo(() => {
    if (dashboardData.length === 0) return { filteredTableData: [], roomStats: { heads: 0, cages: 0 } };

    // 각 사육실별 최신 날짜를 파악
    const latestDatePerRoom = {};
    dashboardData.forEach(item => {
      if (!latestDatePerRoom[item.roomName] || item.date > latestDatePerRoom[item.roomName]) {
        latestDatePerRoom[item.roomName] = item.date;
      }
    });

    let data = dashboardData.filter(item => item.projectId && item.projectId !== 'NONE');
    
    // 2. 날짜 필터 적용 (없으면 기본으로 최신 현황만 표시하여 표가 지저분해지는 것을 방지)
    if (tableStartDate || tableEndDate) {
      if (tableStartDate) data = data.filter(item => item.date && item.date >= tableStartDate);
      if (tableEndDate) data = data.filter(item => item.date && item.date <= tableEndDate);
    } else {
      data = data.filter(item => item.date === latestDatePerRoom[item.roomName]);
    }

    let currentRoomHeads = 0;
    let currentRoomCages = 0;

    // 1. 탭(사육실) 필터 적용 및 사육실 통계 산출
    if (activeTab !== '전체') {
      const roomData = data.filter(item => item.roomName.includes(activeTab));
      roomData.forEach(item => {
        currentRoomHeads += Number(item.animalCount) || 0;
        currentRoomCages += 1;
      });
      data = roomData;
    } else {
      data.forEach(item => {
        currentRoomHeads += Number(item.animalCount) || 0;
        currentRoomCages += 1;
      });
    }

    // 3. 종별(Species) 필터 적용
    if (filterSpecies !== '전체') {
      if (filterSpecies === 'Mouse') data = data.filter(item => item.roomName.includes('Mouse') || item.strain.includes('mouse') || item.strain.includes('BALB') || item.strain.includes('C57') || item.strain.includes('ICR'));
      else if (filterSpecies === 'Rat') data = data.filter(item => item.roomName.includes('Rat') || item.strain.includes('Rat'));
      else if (filterSpecies === 'Rabbit') data = data.filter(item => item.roomName.includes('중동물') || item.strain.includes('Rabbit'));
    }

    // 4. PI 및 과제번호 필터 적용
    if (filterPI !== '전체') data = data.filter(item => item.pi === filterPI);
    if (filterProject !== '전체') data = data.filter(item => item.projectId === filterProject);

    // 5. 텍스트 검색어 필터 적용
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(item => 
        (item.pi && item.pi.toLowerCase().includes(q)) ||
        (item.projectId && item.projectId.toLowerCase().includes(q)) ||
        (item.strain && item.strain.toLowerCase().includes(q)) ||
        (item.affiliation && item.affiliation.toLowerCase().includes(q)) ||
        (item.note && item.note.toLowerCase().includes(q))
      );
    }
    
    // 리스트 정렬
    data.sort((a, b) => {
      if (a.rackId !== b.rackId) return a.rackId.localeCompare(b.rackId);
      return a.cageId.localeCompare(b.cageId);
    });
    
    return { filteredTableData: data, roomStats: { heads: currentRoomHeads, cages: currentRoomCages } };
  }, [dashboardData, activeTab, filterSpecies, filterPI, filterProject, tableStartDate, tableEndDate, searchQuery]);

  // 사육실별 최근 14일 추이 데이터 세팅
  const roomTrendData = useMemo(() => {
    if (activeTab === '전체' || dashboardData.length === 0) return [];
    
    const validData = dashboardData.filter(item => item.roomName.includes(activeTab) && item.projectId && item.projectId !== 'NONE');
    const tMap = {};
    
    validData.forEach(item => {
        if (!tMap[item.date]) tMap[item.date] = { heads: 0, cages: 0 };
        tMap[item.date].heads += Number(item.animalCount) || 0;
        tMap[item.date].cages += 1;
    });

    return Object.keys(tMap).sort((a, b) => new Date(b) - new Date(a)).slice(0, 14).map(date => {
        const dObj = new Date(date);
        return {
            date: date,
            displayDate: `${String(dObj.getMonth()+1).padStart(2,'0')}/${String(dObj.getDate()).padStart(2,'0')}`,
            heads: tMap[date].heads,
            cages: tMap[date].cages
        }
    });
  }, [dashboardData, activeTab]);


  return (
    <div className="min-h-screen bg-slate-100 p-2 md:p-6 text-slate-800 font-sans" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <style>{`
        @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
        .matrix-table th, .matrix-table td { border: 1px solid #e2e8f0; }
        .sticky-col-1 { position: sticky; left: 0; z-index: 20; background-color: white; border-right: 2px solid #cbd5e1 !important; }
        .sticky-col-2 { position: sticky; left: 90px; z-index: 20; background-color: #f8fafc; }
        .sticky-col-3 { position: sticky; left: 150px; z-index: 20; background-color: #f8fafc; border-right: 2px solid #cbd5e1 !important; }
        .matrix-table thead .sticky-col-1, .matrix-table thead .sticky-col-2, .matrix-table thead .sticky-col-3 { z-index: 30; }
      `}</style>
      
      {/* ---------------- Header ---------------- */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200 gap-4 print:shadow-none print:border-b-2 print:border-slate-800 print:rounded-none print:p-0 print:mb-4 print:bg-transparent">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg shrink-0 print:shadow-none print:bg-slate-800">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">통합 사육실 실시간 현황</h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">Data Based On: <span className="font-bold text-indigo-600 ml-1 print:text-slate-800">{lastUpdated}</span></p>
          </div>
        </div>
        
        <div className="flex w-full md:w-auto gap-2 print:hidden">
          <div className="relative flex-1 md:w-56">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="w-4 h-4 text-slate-400" /></div>
            <input 
              type="text" 
              placeholder="과제, PI, 품종 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
            />
          </div>
          <button 
            onClick={fetchDashboardData}
            disabled={isLoading}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all shrink-0 ${isLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'}`}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">{isLoading ? '불러오는 중...' : '새로고침'}</span>
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold shadow-sm transition-all shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden lg:inline">PDF 출력</span>
          </button>
        </div>
      </header>

      {/* ---------------- Navigation Tabs ---------------- */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 pb-2 print:hidden">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { 
              setActiveTab(tab); 
              setSearchQuery(''); 
              setFilterSpecies('전체');
              setFilterPI('전체');
              setFilterProject('전체');
              setTableStartDate('');
              setTableEndDate('');
              setShowRoomTrend(false);
            }}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all border-2 ${activeTab === tab ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-transparent hover:border-slate-200 hover:text-slate-700 shadow-sm'}`}
          >
            {tab !== '전체' && <TableProperties className={`w-4 h-4 mr-1 inline-block ${activeTab === tab ? 'text-indigo-300' : 'text-slate-400'}`} />}
            {tab}
          </button>
        ))}
      </div>

      {/* ---------------- KPI Cards ---------------- */}
      {activeTab === '전체' && (
        <div className="space-y-6 animate-in fade-in duration-500 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 print:bg-transparent print:border print:border-blue-200"><MousePointer2 className="w-4 h-4" /></div>
                  <h3 className="font-bold text-slate-700">Mouse</h3>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md print:bg-transparent print:border print:border-blue-200">전체현황</span>
              </div>
              <div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-4xl font-black text-slate-800 print:text-2xl">{stats.mouse.heads.toLocaleString()}</span>
                  <span className="text-sm font-bold text-slate-500 mb-1">마리</span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{stats.mouse.cages.toLocaleString()} 케이지 운용 중</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 print:bg-transparent print:border print:border-emerald-200"><MousePointer2 className="w-4 h-4" /></div>
                  <h3 className="font-bold text-slate-700">Rat</h3>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md print:bg-transparent print:border print:border-emerald-200">전체현황</span>
              </div>
              <div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-4xl font-black text-slate-800 print:text-2xl">{stats.rat.heads.toLocaleString()}</span>
                  <span className="text-sm font-bold text-slate-500 mb-1">마리</span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{stats.rat.cages.toLocaleString()} 케이지 운용 중</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 print:bg-transparent print:border print:border-orange-200"><Activity className="w-4 h-4" /></div>
                  <h3 className="font-bold text-slate-700">Rabbit</h3>
                </div>
                <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-md print:bg-transparent print:border print:border-orange-200">전체현황</span>
              </div>
              <div>
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-4xl font-black text-slate-800 print:text-2xl">{stats.rabbit.heads.toLocaleString()}</span>
                  <span className="text-sm font-bold text-slate-500 mb-1">마리</span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{stats.rabbit.cages.toLocaleString()} 케이지 운용 중</p>
              </div>
            </div>

            <div className="bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-700 flex flex-col justify-between text-white relative overflow-hidden print:bg-white print:text-slate-800 print:border-slate-300 print:shadow-none">
              <div className="absolute -right-6 -top-6 opacity-10 print:hidden"><BookOpen className="w-32 h-32" /></div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white backdrop-blur-sm print:bg-transparent print:text-slate-800 print:border print:border-slate-200"><BookOpen className="w-4 h-4" /></div>
                  <h3 className="font-bold text-slate-100 print:text-slate-800">활성 연구과제</h3>
                </div>
              </div>
              <div className="relative z-10">
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-5xl font-black print:text-2xl">{stats.activeProjects.size}</span>
                  <span className="text-sm font-bold text-slate-300 mb-1 print:text-slate-500">개 과제</span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-2 print:text-slate-500">현재 사육 중인 과제 기준</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">
            {/* 추이 뷰 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:col-span-1 print:shadow-none print:mb-6">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl print:bg-transparent">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-indigo-500" /> 최근 14일 추이
                </h3>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap table-fixed">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-[16%]">일자</th>
                      <th className="p-3 text-right w-[22%]">Mouse <span className="block text-[10px] font-normal text-slate-400 mt-0.5">마리/케이지</span></th>
                      <th className="p-3 text-right w-[22%]">Rat <span className="block text-[10px] font-normal text-slate-400 mt-0.5">마리/케이지</span></th>
                      <th className="p-3 text-right w-[22%]">Rabbit <span className="block text-[10px] font-normal text-slate-400 mt-0.5">마리/케이지</span></th>
                      <th className="p-3 text-right font-black text-slate-700 bg-slate-100/50 w-[18%]">총합 <span className="block text-[10px] font-normal text-slate-400 mt-0.5">마리/케이지</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.todayTrend.map((d, idx) => {
                      const totalHeads = d.mouse.heads + d.rat.heads + d.rabbit.heads;
                      const totalCages = d.mouse.cages + d.rat.cages + d.rabbit.cages;
                      return (
                        <tr key={idx} className="hover:bg-indigo-50/50 transition-colors">
                          <td className="p-3 font-bold text-slate-700">{d.displayDate}</td>
                          <td className="p-3 text-right text-blue-600">
                            <span className="font-bold text-sm">{d.mouse.heads.toLocaleString()}</span><span className="text-slate-300 mx-1">/</span><span className="text-xs font-medium text-slate-500">{d.mouse.cages.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-right text-emerald-600">
                            <span className="font-bold text-sm">{d.rat.heads.toLocaleString()}</span><span className="text-slate-300 mx-1">/</span><span className="text-xs font-medium text-slate-500">{d.rat.cages.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-right text-orange-600">
                            <span className="font-bold text-sm">{d.rabbit.heads.toLocaleString()}</span><span className="text-slate-300 mx-1">/</span><span className="text-xs font-medium text-slate-500">{d.rabbit.cages.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-right font-black text-slate-800 bg-slate-50/50">
                            <span className="font-bold text-sm">{totalHeads.toLocaleString()}</span><span className="text-slate-300 mx-1">/</span><span className="text-xs font-medium text-slate-500">{totalCages.toLocaleString()}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {stats.todayTrend.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-4 text-center text-xs text-slate-400 bg-slate-50/30">
                          표시할 데이터가 없습니다. URL 설정을 확인해 주세요.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 통합 이벤트 뷰 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:col-span-2 print:shadow-none h-[500px] lg:h-auto print:h-auto print:break-inside-avoid">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-t-2xl print:bg-transparent">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" /> 통합 변동 내역 및 특이사항
                  </h3>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full sm:w-auto print:hidden">
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                    <input type="date" value={eventStartDate} onChange={e => setEventStartDate(e.target.value)} className="text-xs p-1 focus:outline-none" />
                    <span className="text-slate-400 font-bold">~</span>
                    <input type="date" value={eventEndDate} onChange={e => setEventEndDate(e.target.value)} className="text-xs p-1 focus:outline-none" />
                  </div>
                  <select 
                    value={eventTypeFilter} 
                    onChange={e => setEventTypeFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none font-bold text-slate-600 bg-white"
                  >
                    <option value="전체">전체 태그</option>
                    <option value="상태">상태 (반입/이동 등)</option>
                    <option value="경고">경고 (과밀사육 등)</option>
                    <option value="메모">메모</option>
                  </select>
                  <div className="relative flex-1 sm:w-40">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" placeholder="키워드 검색" 
                      value={eventSearch} onChange={e => setEventSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="p-0 overflow-y-auto flex-1 hide-scrollbar bg-white print:overflow-visible">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-slate-400 font-bold text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm print:shadow-none print:static">
                    <tr>
                      <th className="p-3 w-24">일자</th>
                      <th className="p-3 w-16">구분</th>
                      <th className="p-3">위치 및 내용</th>
                      <th className="p-3 w-32 text-right">PI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEvents.length === 0 ? (
                      <tr><td colSpan="4" className="p-10 text-center text-slate-400 font-medium">검색 조건에 맞는 특이사항이나 변동 내역이 없습니다.</td></tr>
                    ) : (
                      filteredEvents.map((ev, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors print:break-inside-avoid">
                          <td className="p-3 text-xs font-bold text-slate-500 whitespace-nowrap">{ev.date.substring(5)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`text-[10px] font-black px-2 py-1 rounded border ${ev.color}`}>
                              {ev.type}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="text-[10px] font-bold text-slate-400 mb-0.5">{ev.location}</div>
                            <div className="text-sm font-bold text-slate-800">{ev.content}</div>
                          </td>
                          <td className="p-3 text-xs font-bold text-slate-600 text-right whitespace-nowrap">{ev.pi}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. 개별 사육실 탭일 때 ==================== */}
      {activeTab !== '전체' && (
        <div className="space-y-6">
          {/* --- 매트릭스 뷰 (상단) --- */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-indigo-800 flex items-center gap-2">
                  <TableProperties className="w-5 h-5" /> {activeTab} 일일 동물 현황 (Matrix)
                </h2>
                <p className="text-xs text-slate-500 mt-1">엑셀 형태의 크로스탭 뷰입니다. 스크롤을 우측으로 넘겨도 날짜와 총합은 고정되어 표시됩니다.</p>
              </div>
            </div>

            <div className="overflow-x-auto hide-scrollbar max-h-[600px] overflow-y-auto w-full relative bg-slate-50">
              {!roomMatrixData || roomMatrixData.sortedDates.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold">{activeTab} 에 기록된 사육 정보가 없습니다.</div>
              ) : (
                <table className="text-xs text-center matrix-table w-max bg-white">
                  <thead className="bg-slate-100 text-slate-600 font-bold tracking-tight">
                    <tr>
                      <th className="p-2 sticky-col-1 bg-slate-200 shadow-[1px_0_0_#cbd5e1] w-24"></th>
                      <th className="p-2 sticky-col-2 w-14 text-[10px]"></th>
                      <th className="p-2 sticky-col-3 shadow-[1px_0_0_#cbd5e1] w-14 text-[10px]"></th>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={i} colSpan="2" className="p-2 whitespace-nowrap bg-indigo-50/50 text-indigo-900 border-b-0 border-l border-r border-slate-200">{col.affiliation}</th>
                      ))}
                    </tr>
                    <tr>
                      <th className="p-2 sticky-col-1 bg-slate-200 shadow-[1px_0_0_#cbd5e1]"></th>
                      <th className="p-2 sticky-col-2 text-[10px]"></th>
                      <th className="p-2 sticky-col-3 shadow-[1px_0_0_#cbd5e1] text-[10px]"></th>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={i} colSpan="2" className="p-2 whitespace-nowrap font-black text-sm text-slate-800 bg-indigo-50/30 border-t-0 border-b-0 border-l border-r border-slate-200">{col.pi}</th>
                      ))}
                    </tr>
                    <tr>
                      <th className="p-2 sticky-col-1 bg-slate-200 shadow-[1px_0_0_#cbd5e1]"></th>
                      <th className="p-2 sticky-col-2 font-black text-slate-700 text-[10px]">전체합계</th>
                      <th className="p-2 sticky-col-3 font-black text-slate-700 text-[10px] shadow-[1px_0_0_#cbd5e1]">전체합계</th>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={i} colSpan="2" className="p-2 whitespace-nowrap text-[10px] text-slate-500 bg-white border-t-0 border-b border-l border-r border-slate-200">{col.projectId}</th>
                      ))}
                    </tr>
                    <tr>
                      <th className="p-2 sticky-col-1 bg-slate-200 shadow-[1px_0_0_#cbd5e1]"></th>
                      <th className="p-2 sticky-col-2"></th>
                      <th className="p-2 sticky-col-3 shadow-[1px_0_0_#cbd5e1]"></th>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={i} colSpan="2" className="p-2 whitespace-nowrap text-[11px] font-bold text-slate-700 bg-white border-b-0">
                          {col.strain}
                          {col.strainDetail && (
                            <span className="block mt-0.5 text-[9px] font-black text-rose-500 bg-rose-50 rounded px-1">{col.strainDetail}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="p-2 sticky-col-1 bg-slate-200 shadow-[1px_0_0_#cbd5e1] text-[11px]">일자 (날짜)</th>
                      <th className="p-2 sticky-col-2 text-[10px]">케이지</th>
                      <th className="p-2 sticky-col-3 shadow-[1px_0_0_#cbd5e1] text-[10px]">마릿수</th>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={i} colSpan="2" className="p-2 whitespace-nowrap text-xs font-black text-emerald-700 bg-emerald-50/50">{col.rackId}동</th>
                      ))}
                    </tr>
                    <tr className="bg-slate-200">
                      <th className="p-1 sticky-col-1 shadow-[1px_0_0_#cbd5e1]"></th>
                      <th className="p-1 sticky-col-2"></th>
                      <th className="p-1 sticky-col-3 shadow-[1px_0_0_#cbd5e1]"></th>
                      {roomMatrixData.columns.map((_, i) => (
                        <React.Fragment key={i}>
                          <th className="p-1 w-10 text-[9px] font-medium text-slate-500 bg-slate-100 border-l border-slate-300">케이지</th>
                          <th className="p-1 w-10 text-[9px] font-medium text-slate-500 bg-slate-100 border-r border-slate-300">두수</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {roomMatrixData.sortedDates.map((date, rIdx) => {
                      const rowData = roomMatrixData.rowMap.get(date);
                      return (
                        <tr key={date} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100">
                          <td className="p-2 sticky-col-1 font-bold text-slate-700 shadow-[1px_0_0_#cbd5e1] whitespace-nowrap text-[11px]">
                            {date.replace(/-/g, '. ')}
                          </td>
                          <td className="p-2 sticky-col-2 font-black text-slate-800 bg-amber-50/30 text-[11px]">
                            {rowData.totalCages.toLocaleString()}
                          </td>
                          <td className="p-2 sticky-col-3 font-black text-slate-800 bg-emerald-50/30 shadow-[1px_0_0_#cbd5e1] text-[11px]">
                            {rowData.totalHeads.toLocaleString()}
                          </td>
                          {roomMatrixData.colKeys.map((colKey, cIdx) => {
                            const cell = rowData.values[colKey];
                            const hasData = cell && cell.cages > 0;
                            return (
                              <React.Fragment key={cIdx}>
                                <td className={`p-2 ${hasData ? 'font-bold text-slate-700' : 'text-slate-200'} bg-white border-l text-[11px]`}>
                                  {hasData ? cell.cages.toLocaleString() : '-'}
                                </td>
                                <td className={`p-2 ${hasData ? 'font-bold text-slate-700 bg-slate-50/50' : 'text-slate-200'} border-r border-slate-200 text-[11px]`}>
                                  {hasData ? cell.heads.toLocaleString() : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Universal Data Table Block (Always visible) ---------------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 print:shadow-none">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col gap-3 print:bg-transparent">
          <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
                <h2 className="text-lg font-black text-slate-800">
                  {activeTab === '전체' ? '전체 통합 상세 데이터' : `${activeTab} 상세 데이터`}
                </h2>
                {activeTab !== '전체' && (
                  <div className="flex items-center gap-2 bg-indigo-100/50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    <span className="text-xs font-bold text-indigo-800">총 두수: {roomStats.heads.toLocaleString()}마리</span>
                    <span className="text-indigo-300">|</span>
                    <span className="text-xs font-bold text-indigo-800">총 케이지: {roomStats.cages.toLocaleString()}개</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                현재 조건에 맞는 케이지 <span className="font-bold text-indigo-500">{filteredTableData.length}</span>개가 표시되고 있습니다.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 print:hidden w-full xl:w-auto">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-1 shadow-sm w-full sm:w-auto">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400 ml-1" />
                  <input 
                    type="date" 
                    value={tableStartDate} 
                    onChange={e => setTableStartDate(e.target.value)} 
                    className="text-xs p-1 focus:outline-none text-slate-600 font-bold bg-transparent cursor-pointer w-full sm:w-auto" 
                  />
                  <span className="text-slate-300 font-bold">~</span>
                  <input 
                    type="date" 
                    value={tableEndDate} 
                    onChange={e => setTableEndDate(e.target.value)} 
                    className="text-xs p-1 focus:outline-none text-slate-600 font-bold bg-transparent cursor-pointer w-full sm:w-auto" 
                  />
                </div>

                {activeTab !== '전체' && (
                  <button 
                    onClick={() => setShowRoomTrend(!showRoomTrend)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors w-full sm:w-auto ${showRoomTrend ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" /> 일자별 추이 {showRoomTrend ? '닫기' : '보기'}
                  </button>
                )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center print:hidden mt-1 bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
              <span className="text-xs font-black text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> 필터
              </span>
              
              {activeTab === '전체' && (
                <select 
                  value={filterSpecies} 
                  onChange={e => setFilterSpecies(e.target.value)} 
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-500 font-bold text-slate-600 bg-slate-50 cursor-pointer"
                >
                  <option value="전체">종별: 전체</option>
                  <option value="Mouse">Mouse (마우스)</option>
                  <option value="Rat">Rat (랫드)</option>
                  <option value="Rabbit">Rabbit (중동물)</option>
                </select>
              )}

              <select 
                value={filterPI} 
                onChange={e => setFilterPI(e.target.value)} 
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-500 font-bold text-slate-600 bg-slate-50 cursor-pointer"
              >
                <option value="전체">연구책임자(PI): 전체</option>
                {filterOptions.pis.map(pi => <option key={pi} value={pi}>{pi}</option>)}
              </select>

              <select 
                value={filterProject} 
                onChange={e => setFilterProject(e.target.value)} 
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-500 font-bold text-slate-600 bg-slate-50 max-w-[200px] sm:max-w-[300px] truncate cursor-pointer"
              >
                <option value="전체">과제번호: 전체</option>
                {filterOptions.projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              {(filterSpecies !== '전체' || filterPI !== '전체' || filterProject !== '전체' || tableStartDate !== '' || tableEndDate !== '') && (
                <button 
                  onClick={() => { 
                    setFilterSpecies('전체'); 
                    setFilterPI('전체'); 
                    setFilterProject('전체'); 
                    setTableStartDate('');
                    setTableEndDate('');
                  }} 
                  className="text-[10px] font-bold text-slate-400 hover:text-red-500 underline ml-2 transition-colors flex items-center gap-1"
                >
                  조건 초기화
                </button>
              )}
          </div>
        </div>

        {showRoomTrend && activeTab !== '전체' && (
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 animate-in fade-in slide-in-from-top-2 print:hidden shadow-inner">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-indigo-500" /> 최근 14일 {activeTab} 사육 변동 추이
            </h3>
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 min-w-max">
              {roomTrendData.map((d, i) => (
                <div key={i} className={`flex flex-col items-center border rounded-xl p-3 min-w-[120px] bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200 shadow-sm`}>
                  <span className="text-xs font-bold mb-1.5 text-indigo-700">{d.displayDate}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-indigo-700">{d.heads.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-slate-400">마리</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 bg-slate-100/70 px-2 py-0.5 rounded mt-1 w-full text-center">
                    {d.cages.toLocaleString()} 케이지
                  </div>
                </div>
              ))}
              {roomTrendData.length === 0 && (
                <div className="flex items-center justify-center p-3 min-w-[150px] text-xs font-medium text-slate-400 border border-dashed border-slate-300 rounded-xl bg-slate-50/50">
                  표시할 데이터가 없습니다.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto print:overflow-visible min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b-2 border-slate-100">
                <th className="p-3 text-xs font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">일자 / 위치</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase tracking-wider">과제번호 (PI / 학과)</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase tracking-wider">품종 / 계통</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase tracking-wider text-right">사육 두수</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase tracking-wider text-center">상태</th>
                <th className="p-3 text-xs font-black text-slate-500 uppercase tracking-wider">특이사항 / 경고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTableData.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-medium">검색 및 필터 조건에 맞는 케이지가 없습니다.</td></tr>
              ) : (
                filteredTableData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors print:break-inside-avoid">
                    <td className="p-3 whitespace-nowrap">
                      <div className="text-[10px] font-bold text-slate-400 mb-0.5">{row.date}</div>
                      <span className="font-bold text-sm text-slate-700">{row.rackId}동 {row.cageId}</span>
                      {activeTab === '전체' && <div className="text-[10px] font-bold text-indigo-500 mt-0.5">{row.roomName}</div>}
                    </td>
                    <td className="p-3">
                      <div className="text-[10px] text-indigo-500 font-bold mb-0.5">{row.projectId}</div>
                      <div className="font-bold text-sm text-slate-800">{row.pi} <span className="font-medium text-slate-500 text-xs ml-1">| {row.affiliation}</span></div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {row.strain.split(',').map(s => <span key={s} className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{s.trim()}</span>)}
                      </div>
                      {row.strainDetail && <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{row.strainDetail}</div>}
                    </td>
                    <td className="p-3 text-right"><span className="font-black text-lg text-slate-800">{row.animalCount}</span></td>
                    <td className="p-3 text-center">
                      {row.status === '정상' ? <span className="text-xs font-bold text-slate-400">정상</span> : <span className={`text-[10px] font-black px-2 py-1 rounded-md ${row.status === '반입' ? 'bg-blue-100 text-blue-700' : row.status === '반출' ? 'bg-rose-100 text-rose-700' : row.status === '이동' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span>}
                    </td>
                    <td className="p-3 max-w-[200px]">
                      {row.warnings && <div className="text-[10px] font-bold text-red-600 mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{row.warnings}</div>}
                      {row.note && <div className="text-[10px] text-slate-600 bg-slate-100 p-1.5 rounded truncate" title={row.note}>{row.note}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
