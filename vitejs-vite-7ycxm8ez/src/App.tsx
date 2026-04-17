// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import { Activity, RefreshCw, AlertCircle, Search, Filter, CalendarDays, Printer, BookOpen, MousePointer2, TrendingUp, TableProperties, CheckCircle2, History, ToggleLeft, ToggleRight } from 'lucide-react';

// [중요] 1단계에서 새로 발급받은 '대시보드 전용 웹 앱 URL'을 여기에 꼭 넣어주세요!
const DASHBOARD_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzpaQp8E6tTOVofHCoaa4duf5Y7Cw0vwJn6o6cpK3SXxy_G1Ore9ibj-GukGarTVhvNZg/exec';

const TABS = ['전체', 'Mouse-1', 'Mouse-2', 'Rat', '중동물', '격리사육실', '격리실험실'];

const formatDate = (dateObj) => {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('전체');
  const [serverPayload, setServerPayload] = useState({ matrixSummary: {}, columnsMeta: {}, recentRawData: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('업데이트 필요');
  const [searchQuery, setSearchQuery] = useState('');
  
  // [신규] 매트릭스 뷰에서 활성 과제만 볼지, 종료된 과제도 포함할지 결정하는 토글 상태
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  // 리스트 뷰 필터
  const [filterPI, setFilterPI] = useState('전체');
  const [filterProject, setFilterProject] = useState('전체');
  const [tableStartDate, setTableStartDate] = useState('');
  const [tableEndDate, setTableEndDate] = useState('');

  // 60일 특이사항 뷰 필터
  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(today.getDate() - 60);
  
  const [eventStartDate, setEventStartDate] = useState(formatDate(sixtyDaysAgo));
  const [eventEndDate, setEventEndDate] = useState(formatDate(today));
  const [eventSearch, setEventSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('전체');

  // 데이터 로드
  const fetchDashboardData = async () => {
    if (DASHBOARD_SCRIPT_URL.includes('여기에_')) {
      alert("코드 8번째 줄의 DASHBOARD_SCRIPT_URL 에 새 서버 주소를 넣어야 작동합니다!");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(DASHBOARD_SCRIPT_URL);
      const data = await response.json();
      
      if (data.recentRawData) {
        setServerPayload(data);
        const now = new Date();
        setLastUpdated(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
      }
    } catch (error) {
      console.error("데이터 로드 실패:", error);
      alert("데이터를 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 1. KPI 및 최근 14일 추이 (최근 60일 원본 데이터에서 계산)
  const stats = useMemo(() => {
    const s = { mouse: { heads: 0, cages: 0 }, rat: { heads: 0, cages: 0 }, rabbit: { heads: 0, cages: 0 }, activeProjects: new Set(), realEvents: [], todayTrend: [] };
    const rawData = serverPayload.recentRawData;
    if (!rawData || rawData.length === 0) return s;

    const latestDatePerRoom = {};
    rawData.forEach(item => {
      // 날짜 포맷팅 정제 (영문 방지)
      const dObj = new Date(item.date);
      if(!isNaN(dObj.getTime())) item.date = formatDate(dObj);

      if (!latestDatePerRoom[item.roomName] || item.date > latestDatePerRoom[item.roomName]) latestDatePerRoom[item.roomName] = item.date;
    });

    const trendMap = {};

    rawData.forEach(item => {
      const count = Number(item.animalCount) || 0;
      const isMouse = item.roomName.includes('Mouse') || item.strain.includes('mouse') || item.strain.includes('BALB') || item.strain.includes('C57') || item.strain.includes('ICR');
      const isRat = item.roomName.includes('Rat') || item.strain.includes('Rat');
      const isRabbit = item.roomName.includes('중동물') || item.strain.includes('Rabbit');

      if (!trendMap[item.date]) trendMap[item.date] = { mouse: { heads: 0, cages: 0 }, rat: { heads: 0, cages: 0 }, rabbit: { heads: 0, cages: 0 } };
      if (isMouse) { trendMap[item.date].mouse.heads += count; trendMap[item.date].mouse.cages += 1; }
      else if (isRat) { trendMap[item.date].rat.heads += count; trendMap[item.date].rat.cages += 1; }
      else if (isRabbit) { trendMap[item.date].rabbit.heads += count; trendMap[item.date].rabbit.cages += 1; }

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

      if (item.date === latestDatePerRoom[item.roomName]) {
        s.activeProjects.add(item.projectId);
        if (isMouse) { s.mouse.heads += count; s.mouse.cages += 1; }
        else if (isRat) { s.rat.heads += count; s.rat.cages += 1; }
        else if (isRabbit) { s.rabbit.heads += count; s.rabbit.cages += 1; }
      }
    });

    const trendDates = Object.keys(trendMap).sort((a, b) => new Date(b) - new Date(a)).slice(0, 14);
    s.todayTrend = trendDates.map(date => {
        const dObj = new Date(date);
        return { date: date, displayDate: `${String(dObj.getMonth()+1).padStart(2,'0')}/${String(dObj.getDate()).padStart(2,'0')}`, ...trendMap[date] };
    });

    return s;
  }, [serverPayload.recentRawData]);

  // 2. [버그 수정 완료] 서버 압축 데이터를 엑셀 매트릭스로 완벽 변환 (빈 날짜 채우기 + 데이터 병합)
  const roomMatrixData = useMemo(() => {
    if (activeTab === '전체' || !serverPayload.matrixSummary) return null;

    // 1단계: activeTab("Mouse-1")이 포함된 모든 서버 데이터 병합 ("Mouse-1 사육실", "Mouse-1" 등)
    const matchingRoomKeys = Object.keys(serverPayload.matrixSummary).filter(key => key.includes(activeTab));
    
    if (matchingRoomKeys.length === 0) return { columns: [], colKeys: [], roomSummary: {}, continuousDates: [] };

    const mergedSummary = {};
    const mergedColsMeta = {};

    matchingRoomKeys.forEach(roomKey => {
      const summary = serverPayload.matrixSummary[roomKey];
      const colsMeta = serverPayload.columnsMeta[roomKey];

      // 메타 정보(컬럼) 병합
      Object.assign(mergedColsMeta, colsMeta);

      // 날짜별 데이터 병합
      Object.keys(summary).forEach(rawDateStr => {
        // 긴 영문 날짜를 YYYY-MM-DD 로 강제 정제
        let nDate = rawDateStr;
        const dObj = new Date(rawDateStr);
        if (!isNaN(dObj.getTime())) {
          nDate = formatDate(dObj); 
        }

        if (!mergedSummary[nDate]) {
          mergedSummary[nDate] = { totalCages: 0, totalHeads: 0, values: {} };
        }
        
        mergedSummary[nDate].totalCages += summary[rawDateStr].totalCages || 0;
        mergedSummary[nDate].totalHeads += summary[rawDateStr].totalHeads || 0;

        Object.keys(summary[rawDateStr].values).forEach(colKey => {
          if (!mergedSummary[nDate].values[colKey]) {
            mergedSummary[nDate].values[colKey] = { cages: 0, heads: 0 };
          }
          mergedSummary[nDate].values[colKey].cages += summary[rawDateStr].values[colKey].cages;
          mergedSummary[nDate].values[colKey].heads += summary[rawDateStr].values[colKey].heads;
        });
      });
    });

    // 2단계: 데이터가 존재하는 가장 최신 날짜와 가장 예전 날짜 파악
    const sortedAvailableDates = Object.keys(mergedSummary).sort((a, b) => new Date(b) - new Date(a));
    if (sortedAvailableDates.length === 0) return { columns: [], colKeys: [], roomSummary: {}, continuousDates: [] };
    
    const latestDate = sortedAvailableDates[0];
    const earliestDate = sortedAvailableDates[sortedAvailableDates.length - 1];

    // 3단계: 중간에 빈칸(입력 없는 날)이 없도록 엑셀처럼 꽉 찬 날짜 배열 자동 생성
    const continuousDates = [];
    for (let d = new Date(latestDate); d >= new Date(earliestDate); d.setDate(d.getDate() - 1)) {
      continuousDates.push(formatDate(d));
    }

    // 4단계: 컬럼(과제)별 활성 상태(최신 날짜에 쥐가 있는지) 판별
    const processedColsMeta = {};
    Object.keys(mergedColsMeta).forEach(colKey => {
      const isCurrentlyActive = (mergedSummary[latestDate]?.values[colKey]?.cages || 0) > 0;
      processedColsMeta[colKey] = {
        ...mergedColsMeta[colKey],
        isActive: isCurrentlyActive
      };
    });

    // 5단계: 화면에 보여줄 컬럼 필터 및 정렬
    const visibleColKeys = Object.keys(processedColsMeta).filter(colKey => {
      return showActiveOnly ? processedColsMeta[colKey].isActive : true;
    });

    const sortedVisibleColKeys = visibleColKeys.sort((a, b) => {
      const colA = processedColsMeta[a];
      const colB = processedColsMeta[b];
      if (colA.pi !== colB.pi) return colA.pi.localeCompare(colB.pi);
      if (colA.projectId !== colB.projectId) return colA.projectId.localeCompare(colB.projectId);
      return colA.rackId.localeCompare(colB.rackId);
    });
    
    const visibleColumns = sortedVisibleColKeys.map(key => processedColsMeta[key]);

    return { columns: visibleColumns, colKeys: sortedVisibleColKeys, roomSummary: mergedSummary, continuousDates };
  }, [serverPayload.matrixSummary, serverPayload.columnsMeta, activeTab, showActiveOnly]);

  // 3. 60일 치 메모/경고 이벤트 필터링
  const filteredEvents = useMemo(() => {
    let allEvents = [...stats.realEvents];
    allEvents = allEvents.filter(ev => ev.date >= eventStartDate && ev.date <= eventEndDate);
    if (eventTypeFilter !== '전체') allEvents = allEvents.filter(ev => ev.type === eventTypeFilter);
    if (eventSearch) {
      const q = eventSearch.toLowerCase();
      allEvents = allEvents.filter(ev => ev.content.toLowerCase().includes(q) || ev.location.toLowerCase().includes(q) || ev.pi.toLowerCase().includes(q));
    }
    return allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [stats.realEvents, eventStartDate, eventEndDate, eventTypeFilter, eventSearch]);

  // 4. 개별 케이지 리스트 뷰 (최근 60일 내 검색용)
  const filterOptions = useMemo(() => {
    const pis = new Set();
    const projects = new Set();
    let data = serverPayload.recentRawData || [];
    if (activeTab !== '전체') data = data.filter(item => item.roomName.includes(activeTab));
    data.forEach(item => { if (item.pi) pis.add(item.pi); if (item.projectId) projects.add(item.projectId); });
    return { pis: Array.from(pis).sort(), projects: Array.from(projects).sort() };
  }, [serverPayload.recentRawData, activeTab]);

  const { filteredTableData } = useMemo(() => {
    const rawData = serverPayload.recentRawData || [];
    if (rawData.length === 0) return { filteredTableData: [] };
    
    const latestDatePerRoom = {};
    rawData.forEach(item => {
      // 날짜 포맷 정제
      const dObj = new Date(item.date);
      if(!isNaN(dObj.getTime())) item.date = formatDate(dObj);
      if (!latestDatePerRoom[item.roomName] || item.date > latestDatePerRoom[item.roomName]) latestDatePerRoom[item.roomName] = item.date;
    });

    let data = [...rawData];
    
    if (tableStartDate || tableEndDate) {
      if (tableStartDate) data = data.filter(item => item.date && item.date >= tableStartDate);
      if (tableEndDate) data = data.filter(item => item.date && item.date <= tableEndDate);
    } else {
      data = data.filter(item => item.date === latestDatePerRoom[item.roomName]);
    }

    if (activeTab !== '전체') {
      data = data.filter(item => item.roomName.includes(activeTab));
    }

    if (filterPI !== '전체') data = data.filter(item => item.pi === filterPI);
    if (filterProject !== '전체') data = data.filter(item => item.projectId === filterProject);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(item => (item.pi && item.pi.toLowerCase().includes(q)) || (item.projectId && item.projectId.toLowerCase().includes(q)) || (item.strain && item.strain.toLowerCase().includes(q)) || (item.note && item.note.toLowerCase().includes(q)));
    }
    
    data.sort((a, b) => {
      if (a.rackId !== b.rackId) return a.rackId.localeCompare(b.rackId);
      return a.cageId.localeCompare(b.cageId);
    });

    return { filteredTableData: data };
  }, [serverPayload.recentRawData, activeTab, filterPI, filterProject, tableStartDate, tableEndDate, searchQuery]);


  return (
    <div className="min-h-screen bg-slate-100 p-2 md:p-6 text-slate-800 font-sans" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <style>{`
        @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
        .matrix-table th, .matrix-table td { border: 1px solid #e2e8f0; }
        /* 스크롤 시 틀 고정(Sticky) 설정 */
        .sticky-col-1 { position: sticky; left: 0; z-index: 20; background-color: white; border-right: 2px solid #cbd5e1 !important; }
        .sticky-col-2 { position: sticky; left: 112px; z-index: 20; background-color: #f8fafc; }
        .sticky-col-3 { position: sticky; left: 168px; z-index: 20; background-color: #f8fafc; border-right: 2px solid #cbd5e1 !important; }
        .matrix-table thead .sticky-col-1, .matrix-table thead .sticky-col-2, .matrix-table thead .sticky-col-3 { z-index: 30; }
      `}</style>
      
      {/* ---------------- 헤더 영역 ---------------- */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200 gap-4 print:hidden">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
              통합 사육실 실시간 현황 
            </h1>
            <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">Data Based On: <span className="font-bold text-indigo-600 ml-1">{lastUpdated}</span></p>
          </div>
        </div>
        
        <div className="flex w-full md:w-auto gap-2">
          {activeTab === '전체' && (
            <div className="relative flex-1 md:w-56">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="w-4 h-4 text-slate-400" /></div>
              <input type="text" placeholder="과제, PI, 품종 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium" />
            </div>
          )}
          <button onClick={fetchDashboardData} disabled={isLoading} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-all shrink-0 ${isLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'}`}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden lg:inline">{isLoading ? '데이터 로딩중...' : '새로고침'}</span>
          </button>
        </div>
      </header>

      {/* ---------------- 사육실(탭) 네비게이션 ---------------- */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 pb-2 print:hidden">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { 
              setActiveTab(tab); setSearchQuery(''); setFilterPI('전체'); setFilterProject('전체'); setTableStartDate(''); setTableEndDate('');
            }}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap transition-all border-2 ${activeTab === tab ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-transparent hover:border-slate-200 hover:text-slate-700 shadow-sm'}`}
          >
            {tab !== '전체' && <TableProperties className={`w-4 h-4 ${activeTab === tab ? 'text-indigo-300' : 'text-slate-400'}`} />}
            {tab}
          </button>
        ))}
      </div>

      {/* ==================== 1. '전체' 탭일 때 ==================== */}
      {activeTab === '전체' && (
        <div className="space-y-6 animate-in fade-in duration-500 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><MousePointer2 className="w-4 h-4" /></div><h3 className="font-bold text-slate-700">Mouse</h3></div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">최신현황</span>
              </div>
              <div><div className="flex items-end gap-2 mb-1"><span className="text-4xl font-black text-slate-800">{stats.mouse.heads.toLocaleString()}</span><span className="text-sm font-bold text-slate-500 mb-1">마리</span></div><p className="text-xs text-slate-500 font-medium">{stats.mouse.cages.toLocaleString()} 케이지 운용 중</p></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600"><MousePointer2 className="w-4 h-4" /></div><h3 className="font-bold text-slate-700">Rat</h3></div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">최신현황</span>
              </div>
              <div><div className="flex items-end gap-2 mb-1"><span className="text-4xl font-black text-slate-800">{stats.rat.heads.toLocaleString()}</span><span className="text-sm font-bold text-slate-500 mb-1">마리</span></div><p className="text-xs text-slate-500 font-medium">{stats.rat.cages.toLocaleString()} 케이지 운용 중</p></div>
            </div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600"><Activity className="w-4 h-4" /></div><h3 className="font-bold text-slate-700">Rabbit</h3></div>
                <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-md">최신현황</span>
              </div>
              <div><div className="flex items-end gap-2 mb-1"><span className="text-4xl font-black text-slate-800">{stats.rabbit.heads.toLocaleString()}</span><span className="text-sm font-bold text-slate-500 mb-1">마리</span></div><p className="text-xs text-slate-500 font-medium">{stats.rabbit.cages.toLocaleString()} 케이지 운용 중</p></div>
            </div>
            <div className="bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-700 flex flex-col justify-between text-white relative overflow-hidden">
              <div className="absolute -right-6 -top-6 opacity-10 print:hidden"><BookOpen className="w-32 h-32" /></div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white backdrop-blur-sm"><BookOpen className="w-4 h-4" /></div><h3 className="font-bold text-slate-100">활성 연구과제</h3></div>
              </div>
              <div className="relative z-10"><div className="flex items-end gap-2 mb-1"><span className="text-5xl font-black">{stats.activeProjects.size}</span><span className="text-sm font-bold text-slate-300 mb-1">개 과제</span></div><p className="text-xs text-slate-400 font-medium mt-2">현재 사육 중인 과제 기준</p></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:col-span-3 h-[600px] lg:h-auto print:h-auto">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-rose-500" /> 최근 60일 특이사항 및 변동 보드
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto print:hidden">
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                    <input type="date" value={eventStartDate} onChange={e => setEventStartDate(e.target.value)} min={formatDate(sixtyDaysAgo)} className="text-xs p-1 focus:outline-none" />
                    <span className="text-slate-400 font-bold">~</span>
                    <input type="date" value={eventEndDate} onChange={e => setEventEndDate(e.target.value)} className="text-xs p-1 focus:outline-none" />
                  </div>
                  <select value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg p-1.5 focus:outline-none font-bold bg-white">
                    <option value="전체">전체 태그</option><option value="상태">상태</option><option value="경고">경고</option><option value="메모">메모</option>
                  </select>
                  <div className="relative flex-1 sm:w-40">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="키워드 검색" value={eventSearch} onChange={e => setEventSearch(e.target.value)} className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="p-0 overflow-y-auto flex-1 hide-scrollbar bg-white">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-slate-400 font-bold text-[10px] sticky top-0 z-10 shadow-sm">
                    <tr><th className="p-3 w-24">일자</th><th className="p-3 w-16">구분</th><th className="p-3">위치 및 내용</th><th className="p-3 w-32 text-right">PI</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEvents.length === 0 ? (
                      <tr><td colSpan="4" className="p-10 text-center text-slate-400 font-medium">검색 내역이 없습니다.</td></tr>
                    ) : (
                      filteredEvents.map((ev, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-xs font-bold text-slate-500 whitespace-nowrap">{ev.date.replace(/-/g, '. ')}</td>
                          <td className="p-3 whitespace-nowrap"><span className={`text-[10px] font-black px-2 py-1 rounded border ${ev.color}`}>{ev.type}</span></td>
                          <td className="p-3"><div className="text-[10px] font-bold text-slate-400 mb-0.5">{ev.location}</div><div className="text-sm font-bold text-slate-800">{ev.content}</div></td>
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
          
          {/* --- 무한 누적 매트릭스 뷰 (상단) --- */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-indigo-800 flex items-center gap-2">
                  <TableProperties className="w-5 h-5" /> {activeTab} 일일 동물 현황 (Matrix)
                </h2>
                <p className="text-xs text-slate-500 mt-1">서버 압축 통신 기술 적용. 1년 이상 무한 누적되어도 속도가 저하되지 않습니다.</p>
              </div>
              
              <button 
                onClick={() => setShowActiveOnly(!showActiveOnly)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${showActiveOnly ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-100 border-slate-300 text-slate-600'}`}
              >
                {showActiveOnly ? <ToggleRight className="w-5 h-5 text-indigo-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                <span className="text-xs font-bold">{showActiveOnly ? '현재 활성화된 과제만 보기' : '종료된 모든 과거 과제 표시 중'}</span>
              </button>
            </div>

            <div className="overflow-x-auto hide-scrollbar max-h-[600px] overflow-y-auto w-full relative bg-slate-50">
              {!roomMatrixData || roomMatrixData.continuousDates.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold">{activeTab} 에 기록된 사육 정보가 없습니다.</div>
              ) : roomMatrixData.columns.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold">현재 진행 중인 활성 과제가 없습니다. (우측 상단 토글을 눌러 과거 기록을 확인하세요)</div>
              ) : (
                <table className="text-xs text-center matrix-table w-max bg-white">
                  <thead className="bg-slate-100 text-slate-600 font-bold tracking-tight">
                    {/* [UI 최적화 완료] 상단 모서리 빈칸들을 완벽하게 병합 (Excel 스타일) */}
                    <tr>
                      <th rowSpan={5} className="p-2 sticky-col-1 bg-slate-200 shadow-[1px_0_0_#cbd5e1] w-28 align-bottom pb-3 border-b border-slate-300">
                        <span className="text-sm font-black text-slate-700">일자 (날짜)</span>
                      </th>
                      <th rowSpan={5} className="p-2 sticky-col-2 bg-slate-200 w-14 text-center align-bottom pb-3 border-b border-slate-300">
                        <span className="text-[10px] font-bold text-slate-600">총 케이지</span>
                      </th>
                      <th rowSpan={5} className="p-2 sticky-col-3 bg-slate-200 shadow-[1px_0_0_#cbd5e1] w-14 text-center align-bottom pb-3 border-b border-slate-300">
                        <span className="text-[10px] font-bold text-slate-600">총 마릿수</span>
                      </th>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={`aff-${i}`} colSpan={2} className={`p-2 whitespace-nowrap border-b-0 border-l border-r border-slate-200 ${col.isActive ? 'bg-indigo-50/50 text-indigo-900' : 'bg-slate-200 text-slate-500'}`}>
                          {col.affiliation}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={`pi-${i}`} colSpan={2} className={`p-2 whitespace-nowrap font-black text-sm border-t-0 border-b-0 border-l border-r border-slate-200 ${col.isActive ? 'text-slate-800 bg-indigo-50/30' : 'text-slate-500 bg-slate-100'}`}>
                          {col.pi} {col.isActive ? '' : '(종료)'}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={`proj-${i}`} colSpan={2} className={`p-2 whitespace-nowrap text-[10px] border-t-0 border-b border-l border-r border-slate-200 ${col.isActive ? 'text-slate-500 bg-white' : 'text-slate-400 bg-slate-50'}`}>
                          {col.projectId}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={`strain-${i}`} colSpan={2} className={`p-2 whitespace-nowrap text-[11px] font-bold border-b-0 ${col.isActive ? 'text-slate-700 bg-white' : 'text-slate-400 bg-slate-50'}`}>
                          {col.strain}
                          {col.strainDetail && (
                            <span className={`block mt-0.5 text-[9px] font-black rounded px-1 ${col.isActive ? 'text-rose-500 bg-rose-50' : 'text-slate-400 bg-slate-200'}`}>
                              {col.strainDetail}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {roomMatrixData.columns.map((col, i) => (
                        <th key={`rack-${i}`} colSpan={2} className={`p-2 whitespace-nowrap text-xs font-black border-b border-slate-300 ${col.isActive ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-500 bg-slate-200'}`}>
                          {col.rackId}동
                        </th>
                      ))}
                    </tr>
                    {/* Row 6: 하위 분할 (케이지/두수) */}
                    <tr className="bg-slate-200">
                      <th className="p-1 sticky-col-1 shadow-[1px_0_0_#cbd5e1] border-b border-slate-300"></th>
                      <th className="p-1 sticky-col-2 border-b border-slate-300"></th>
                      <th className="p-1 sticky-col-3 shadow-[1px_0_0_#cbd5e1] border-b border-slate-300"></th>
                      {roomMatrixData.columns.map((_, i) => (
                        <React.Fragment key={`split-${i}`}>
                          <th className="p-1 w-10 text-[9px] font-medium text-slate-500 bg-slate-100 border-l border-b border-slate-300">케이지</th>
                          <th className="p-1 w-10 text-[9px] font-medium text-slate-500 bg-slate-100 border-r border-b border-slate-300">두수</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {/* [버그 수정 완료] 빈 날짜를 자동으로 채워서 끊김 없이 출력 */}
                    {roomMatrixData.continuousDates.map((date, rIdx) => {
                      const rowData = roomMatrixData.roomSummary[date]; // 데이터가 없는 날은 undefined
                      const totalCages = rowData?.totalCages || 0;
                      const totalHeads = rowData?.totalHeads || 0;
                      
                      return (
                        <tr key={date} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100">
                          <td className="p-2 sticky-col-1 font-bold text-slate-700 shadow-[1px_0_0_#cbd5e1] whitespace-nowrap text-[11px]">
                            {date.replace(/-/g, '. ')}
                          </td>
                          <td className="p-2 sticky-col-2 font-black text-slate-800 bg-amber-50/30 text-[11px]">
                            {totalCages > 0 ? totalCages.toLocaleString() : '-'}
                          </td>
                          <td className="p-2 sticky-col-3 font-black text-slate-800 bg-emerald-50/30 shadow-[1px_0_0_#cbd5e1] text-[11px]">
                            {totalHeads > 0 ? totalHeads.toLocaleString() : '-'}
                          </td>
                          {roomMatrixData.colKeys.map((colKey, cIdx) => {
                            const cell = rowData?.values[colKey];
                            const hasData = cell && cell.cages > 0;
                            const isActiveCol = roomMatrixData.columns[cIdx].isActive;
                            
                            return (
                              <React.Fragment key={cIdx}>
                                <td className={`p-2 ${hasData ? 'font-bold text-slate-700' : 'text-slate-200'} border-l text-[11px] ${isActiveCol ? 'bg-white' : 'bg-slate-50'}`}>
                                  {hasData ? cell.cages.toLocaleString() : '-'}
                                </td>
                                <td className={`p-2 ${hasData ? 'font-bold text-slate-700' : 'text-slate-200'} border-r border-slate-200 text-[11px] ${hasData && isActiveCol ? 'bg-slate-50/50' : !isActiveCol ? 'bg-slate-100' : ''}`}>
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

          {/* --- 최근 60일 리스트 뷰 (하단) --- */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col gap-3">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-800">{activeTab} 케이지별 상세 리스트 (최근 60일)</h2>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full xl:w-auto">
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-1 shadow-sm w-full sm:w-auto">
                      <CalendarDays className="w-3.5 h-3.5 text-slate-400 ml-1" />
                      <input type="date" value={tableStartDate} onChange={e => setTableStartDate(e.target.value)} min={formatDate(sixtyDaysAgo)} className="text-xs p-1 focus:outline-none text-slate-600 font-bold bg-transparent" />
                      <span className="text-slate-300 font-bold">~</span>
                      <input type="date" value={tableEndDate} onChange={e => setTableEndDate(e.target.value)} className="text-xs p-1 focus:outline-none text-slate-600 font-bold bg-transparent" />
                    </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                  <span className="text-xs font-black text-slate-400 mr-1 flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> 필터</span>
                  <select value={filterPI} onChange={e => setFilterPI(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 font-bold text-slate-600 bg-slate-50"><option value="전체">연구책임자: 전체</option>{filterOptions.pis.map(pi => <option key={pi} value={pi}>{pi}</option>)}</select>
                  <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="text-xs border border-slate-200 rounded-md px-2 py-1.5 font-bold text-slate-600 bg-slate-50"><option value="전체">과제번호: 전체</option>{filterOptions.projects.map(p => <option key={p} value={p}>{p}</option>)}</select>
                  {(filterPI !== '전체' || filterProject !== '전체' || tableStartDate !== '' || tableEndDate !== '') && (<button onClick={() => { setFilterPI('전체'); setFilterProject('전체'); setTableStartDate(''); setTableEndDate(''); }} className="text-[10px] font-bold text-slate-400 hover:text-red-500 underline ml-2">조건 초기화</button>)}
              </div>
            </div>
            
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-white border-b-2 border-slate-100"><th className="p-3 text-xs font-black text-slate-500">일자 / 위치</th><th className="p-3 text-xs font-black text-slate-500">과제번호 (PI / 학과)</th><th className="p-3 text-xs font-black text-slate-500">품종 / 계통</th><th className="p-3 text-xs font-black text-slate-500 text-right">사육 두수</th><th className="p-3 text-xs font-black text-slate-500 text-center">상태</th><th className="p-3 text-xs font-black text-slate-500">특이사항</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTableData.length === 0 ? (
                    <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-medium">검색 조건에 맞는 60일 내 기록이 없습니다.</td></tr>
                  ) : (
                    filteredTableData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 whitespace-nowrap"><div className="text-[10px] font-bold text-slate-400 mb-0.5">{row.date.replace(/-/g, '. ')}</div><span className="font-bold text-sm text-slate-700">{row.rackId}동 {row.cageId}</span></td>
                        <td className="p-3"><div className="text-[10px] text-indigo-500 font-bold mb-0.5">{row.projectId}</div><div className="font-bold text-sm text-slate-800">{row.pi}</div></td>
                        <td className="p-3">
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{row.strain}</span>
                          {row.strainDetail && <div className="text-[10px] text-rose-500 font-bold mt-1">{row.strainDetail}</div>}
                        </td>
                        <td className="p-3 text-right"><span className="font-black text-lg text-slate-800">{row.animalCount}</span></td>
                        <td className="p-3 text-center"><span className="text-[10px] font-black px-2 py-1 rounded-md bg-slate-100 text-slate-600">{row.status}</span></td>
                        <td className="p-3 max-w-[200px]">{row.warnings && <div className="text-[10px] font-bold text-red-600 mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/>{row.warnings}</div>}{row.note && <div className="text-[10px] text-slate-600 bg-slate-100 p-1.5 rounded truncate" title={row.note}>{row.note}</div>}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}