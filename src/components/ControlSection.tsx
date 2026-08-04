import React, { useState } from "react";
import {
  Plus,
  Minus,
  Layers,
  SlidersHorizontal,
  Database,
  AlertCircle,
  MapPin,
  Navigation,
  BatteryMedium,
  Activity,
  Package,
  X,
  Battery,
  Gauge,
  ListCheckIcon,
  DatabaseIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ControlTask, GridCell } from "../types";

interface ControlSectionProps {
  mode: "status" | "work";
  tasks: ControlTask[];
  grids: GridCell[];
  onAddTask: (task: ControlTask) => void;
  onUpdateTaskProgress: (id: string, progress: number) => void;
}

export default function ControlSection({
  mode,
  tasks,
  grids,
  onAddTask,
  onUpdateTaskProgress,
}: ControlSectionProps) {

  // CTR-003 Registration Form
  const [area, setArea] = useState("");
  const [method, setMethod] = useState<ControlTask["method"]>("파쇄");
  const [company, setCompany] = useState("동해산림방제(주)");
  const [workers, setWorkers] = useState(10);
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const handleRegisterTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!area) return;

    const newTask: ControlTask = {
      id: `CTR-${Math.floor(100 + Math.random() * 900)}`,
      area,
      method,
      status: "예정",
      company,
      workers,
      progress: 0,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    };

    onAddTask(newTask);
    setArea("");
    setIsRegistering(false);
  };

  const getMethodBadge = (m: ControlTask["method"]) => {
    switch (m) {
      case "훈증": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "파쇄": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "소각": return "bg-rose-100 text-rose-800 border-rose-200";
      case "나무주사": return "bg-sky-100 text-sky-800 border-sky-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">

      {/* =========================================
          방제 공정 + GPS 영역
      ========================================= */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">

        {/* =========================================
            방제 공정
        ========================================= */}
        <section className="xl:col-span-6">

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* =========================================
                Header
            ========================================= */}
            <header className="border-b border-slate-200 bg-white px-5 py-4">

              <div className="flex items-center justify-between gap-4">

                <div className="min-w-0">

                  <div className="flex items-center gap-2">

                    <ListCheckIcon
                      size={18}
                      className="shrink-0 text-emerald-700"
                    />

                    <h2 className="text-base font-black text-slate-950">
                      감염목 방제 작업 리스트
                    </h2>

                  </div>

                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    방제 작업 리스트의 상세 정보를 관리합니다.
                  </p>

                </div>


                {/* =========================================
                    작업 추가 버튼
                ========================================= */}
                <button
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="
                    flex shrink-0 items-center gap-1.5
                    rounded-lg
                    bg-emerald-800
                    px-3 py-2
                    text-xs font-bold
                    text-white
                    transition
                    hover:bg-emerald-900
                  "
                >

                  {isRegistering ? (
                    <X size={14} />
                  ) : (
                    <Plus size={14} />
                  )}

                  {isRegistering
                    ? "취소"
                    : "작업 추가 배정"
                  }

                </button>

              </div>

            </header>


            {/* =========================================
                작업 등록 폼
            ========================================= */}
            {isRegistering && (

              <form
                onSubmit={handleRegisterTask}
                className="border-b border-slate-200 bg-slate-50 p-5"
              >

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                  {/* 대상 방제 구역 */}
                  <div>

                    <label className="mb-1 block text-[11px] font-bold text-slate-600">
                      대상 방제 구역/주소
                    </label>

                    <input
                      type="text"
                      value={area}
                      onChange={(e) =>
                        setArea(e.target.value)
                      }
                      placeholder="예: 경북 포항시 죽장면 GRID-3629 산간"
                      className="
                        w-full
                        rounded-lg
                        border border-slate-200
                        bg-white
                        px-3 py-2
                        text-xs
                        text-slate-700
                        outline-none
                        transition
                        placeholder:text-slate-400
                        focus:border-emerald-500
                        focus:ring-2
                        focus:ring-emerald-100
                      "
                    />

                  </div>


                  {/* 표준 방제 기법 */}
                  <div>

                    <label className="mb-1 block text-[11px] font-bold text-slate-600">
                      표준 방제 기법
                    </label>

                    <select
                      value={method}
                      onChange={(e) =>
                        setMethod(
                          e.target.value as ControlTask["method"]
                        )
                      }
                      className="
                        w-full
                        rounded-lg
                        border border-slate-200
                        bg-white
                        px-3 py-2
                        text-xs
                        text-slate-700
                        outline-none
                        transition
                        focus:border-emerald-500
                        focus:ring-2
                        focus:ring-emerald-100
                      "
                    >

                      <option>파쇄</option>
                      <option>훈증</option>
                      <option>소각</option>
                      <option>나무주사</option>
                      <option>항공방제</option>

                    </select>

                  </div>


                  {/* 수주 시공사 */}
                  <div>

                    <label className="mb-1 block text-[11px] font-bold text-slate-600">
                      수주 시공사
                    </label>

                    <input
                      type="text"
                      value={company}
                      onChange={(e) =>
                        setCompany(e.target.value)
                      }
                      className="
                        w-full
                        rounded-lg
                        border border-slate-200
                        bg-white
                        px-3 py-2
                        text-xs
                        text-slate-700
                        outline-none
                        transition
                        focus:border-emerald-500
                        focus:ring-2
                        focus:ring-emerald-100
                      "
                    />

                  </div>


                  {/* 투입 인력 */}
                  <div>

                    <label className="mb-1 block text-[11px] font-bold text-slate-600">
                      투입 배정 인력 (공수)
                    </label>

                    <input
                      type="number"
                      value={workers}
                      onChange={(e) =>
                        setWorkers(Number(e.target.value))
                      }
                      className="
                        w-full
                        rounded-lg
                        border border-slate-200
                        bg-white
                        px-3 py-2
                        text-xs
                        text-slate-700
                        outline-none
                        transition
                        focus:border-emerald-500
                        focus:ring-2
                        focus:ring-emerald-100
                      "
                    />

                  </div>

                </div>


                {/* =========================================
                    Form Buttons
                ========================================= */}
                <div className="mt-4 flex justify-end gap-2">

                  <button
                    type="button"
                    onClick={() =>
                      setIsRegistering(false)
                    }
                    className="
                      rounded-lg
                      border border-slate-200
                      bg-white
                      px-3 py-2
                      text-xs font-bold
                      text-slate-600
                      transition
                      hover:bg-slate-50
                    "
                  >
                    취소
                  </button>


                  <button
                    type="submit"
                    className="
                      rounded-lg
                      bg-emerald-800
                      px-3 py-2
                      text-xs font-bold
                      text-white
                      transition
                      hover:bg-emerald-900
                    "
                  >
                    시공 배정 완료
                  </button>

                </div>

              </form>

            )}


            {/* =========================================
                작업 테이블
            ========================================= */}
            <div className="overflow-x-auto">

              <table className="w-full text-left text-xs">

                {/* =========================================
                    Table Header
                ========================================= */}
                <thead>

                  <tr className="border-b border-slate-200 bg-slate-50">

                    <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                      공정 ID
                    </th>

                    <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                      방제 구역
                    </th>

                    <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                      방제 방식
                    </th>

                    <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                      시공 업체
                    </th>

                    <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                      진척률
                    </th>

                    <th className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                      상태
                    </th>

                  </tr>

                </thead>


                {/* =========================================
                    Table Body
                ========================================= */}
                <tbody>

                  {tasks.map((task) => (

                    <tr
                      key={task.id}
                      className="
                        border-b border-slate-100
                        transition
                        hover:bg-slate-50
                      "
                    >

                      {/* 공정 ID */}
                      <td className="
                        whitespace-nowrap
                        px-3 py-3
                        font-mono
                        text-[10px]
                        font-bold
                        text-slate-700
                      ">
                        {task.id}
                      </td>


                      {/* 방제 구역 */}
                      <td className="
                        px-3 py-3
                        text-[11px]
                        text-slate-700
                      ">
                        {task.area}
                      </td>


                      {/* 방제 방식 */}
                      <td className="px-3 py-3">

                        <span
                          className={`
                            inline-flex
                            rounded-md
                            border
                            px-1.5 py-1
                            text-[10px]
                            font-bold
                            ${getMethodBadge(task.method)}
                          `}
                        >
                          {task.method}
                        </span>

                      </td>


                      {/* 시공 업체 */}
                      <td className="
                        px-3 py-3
                        text-[11px]
                        text-slate-700
                      ">
                        {task.company}
                      </td>


                      {/* 진척률 */}
                      <td className="px-3 py-3">

                        <div className="flex items-center gap-1.5">

                          <div className="
                            h-1.5
                            w-20
                            overflow-hidden
                            rounded-full
                            bg-slate-100
                          ">

                            <div
                              className="
                                h-full
                                rounded-full
                                bg-emerald-600
                                transition-all
                              "
                              style={{
                                width: `${task.progress}%`,
                              }}
                            />

                          </div>

                          <span className="
                            text-[10px]
                            font-bold
                            text-slate-600
                          ">
                            {task.progress}%
                          </span>

                        </div>

                      </td>


                      {/* 상태 */}
                      <td className="
                        whitespace-nowrap
                        px-3 py-3
                        text-[10px]
                        font-bold
                        text-slate-700
                      ">
                        {task.status}
                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>

        </section>
        {/* =========================================
            RIGHT : 현장 출동 요원 위치
        ========================================= */}
        <section className="xl:col-span-6">

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* =========================================
                Header
            ========================================= */}
            <header className="border-b border-slate-200 bg-white px-5 py-4">

              <div className="flex items-center justify-between gap-4">

                {/* 제목 영역 */}
                <div className="min-w-0">

                  <div className="flex items-center gap-2">

                    <Navigation
                      size={18}
                      className="shrink-0 text-emerald-700"
                    />

                    <h2 className="text-base font-black text-slate-950">
                      현장 출동 요원 위치
                    </h2>

                  </div>

                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    현장 방제요원의 위치 및 이동 경로를 확인합니다.
                  </p>

                </div>

                {/* LIVE 상태 */}
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold text-emerald-600">

                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />

                  LIVE

                </span>

              </div>

            </header>


            {/* =========================================
                지도 영역
            ========================================= */}
            <div
              className="
                relative
                h-[600px]
                overflow-hidden
                border
                border-slate-200
                bg-gradient-to-br
                from-emerald-100/40
                via-sky-50/30
                to-emerald-50
              "
            >

              {/* =========================================
                  지도 배경
              ========================================= */}
              <div className="absolute inset-0">

                {/* Grid */}
                <div
                  className="
                    absolute
                    inset-0
                    grid
                    grid-cols-8
                    opacity-25
                  "
                >

                  {Array.from({ length: 48 }).map((_, index) => (

                    <div
                      key={index}
                      className="
                        border-l
                        border-t
                        border-slate-400/30
                      "
                    />

                  ))}

                </div>


                {/* =========================================
                    이동 경로
                ========================================= */}
                <svg
                  className="
                    pointer-events-none
                    absolute
                    inset-0
                    h-full
                    w-full
                  "
                  viewBox="0 0 600 600"
                  preserveAspectRatio="none"
                >

                  <motion.path
                    d="
                      M 40 470
                      Q 150 250 280 370
                      T 450 120
                    "
                    fill="none"
                    stroke="#059669"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                    initial={{
                      strokeDashoffset: 100,
                    }}
                    animate={{
                      strokeDashoffset: -100,
                    }}
                    transition={{
                      duration: 15,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />

                </svg>

              </div>


              {/* =========================================
                  김예찰 마커
              ========================================= */}
              <button
                type="button"
                onClick={() => setSelectedWorkerId("W-101")}
                className="
                  absolute
                  left-[27%]
                  top-[34%]
                  z-30
                  flex
                  h-8
                  w-8
                  cursor-pointer
                  items-center
                  justify-center
                  rounded-full
                  border-2
                  border-white
                  bg-emerald-800
                  text-xs
                  font-bold
                  text-white
                  shadow-lg
                  transition-all
                  hover:scale-125
                  focus:outline-none
                "
                aria-label="김예찰 상세 정보"
              >

                {selectedWorkerId === "W-101" && (
                  <span
                    className="
                      absolute
                      inset-[-5px]
                      rounded-full
                      border-2
                      border-emerald-300
                    "
                  />
                )}

                김

              </button>


              {/* =========================================
                  김예찰 이름
              ========================================= */}
              <div
                className="
                  pointer-events-none
                  absolute
                  left-[27%]
                  top-[27%]
                  z-20
                  -translate-x-1/2
                  whitespace-nowrap
                  rounded
                  bg-slate-900
                  px-2
                  py-1
                  text-[9px]
                  font-bold
                  text-white
                "
              >
                김예찰 · 75% 진행
              </div>


              {/* =========================================
                  김예찰 상세 팝업
                  - 지도 기준 위치
                  - 마커 아래쪽
        ========================================= */}
              <AnimatePresence>

                {selectedWorkerId === "W-101" && (

                  <motion.div
                    initial={{
                      opacity: 0,
                      scale: 0.95,
                      y: -10,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.95,
                      y: -10,
                    }}
                    transition={{
                      duration: 0.2,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="
                      absolute
                      left-[27%]
                      top-[41%]
                      z-50
                      w-[280px]
                      max-w-[calc(100%-32px)]
                      -translate-x-1/2
                      overflow-hidden
                      rounded-2xl
                      border
                      border-slate-200
                      bg-white
                      shadow-2xl
                    "
                  >

                    {/* 팝업 헤더 */}
                    <div
                      className="
                        flex
                        items-center
                        justify-between
                        border-b
                        border-slate-100
                        px-4
                        py-3
                      "
                    >

                      <div className="flex items-center gap-2">

                        <div
                          className="
                            flex
                            h-9
                            w-9
                            shrink-0
                            items-center
                            justify-center
                            rounded-full
                            bg-emerald-800
                            text-sm
                            font-bold
                            text-white
                          "
                        >
                          김
                        </div>

                        <div>

                          <div className="flex items-center gap-2">

                            <span className="text-sm font-black text-slate-900">
                              김예찰
                            </span>

                            <span
                              className="
                                rounded-full
                                bg-emerald-100
                                px-2
                                py-0.5
                                text-[9px]
                                font-bold
                                text-emerald-700
                              "
                            >
                              활동 중
                            </span>

                          </div>

                          <p className="mt-0.5 text-[9px] text-slate-400">
                            GPS ID : W-101
                          </p>

                        </div>

                      </div>


                      {/* 닫기 */}
                      <button
                        type="button"
                        onClick={() => setSelectedWorkerId(null)}
                        className="
                          flex
                          h-7
                          w-7
                          shrink-0
                          items-center
                          justify-center
                          rounded-full
                          text-lg
                          text-slate-400
                          transition
                          hover:bg-slate-100
                          hover:text-slate-700
                        "
                        aria-label="팝업 닫기"
                      >
                        ×
                      </button>

                    </div>


                    {/* 팝업 내용 */}
                    <div className="p-3">

                      <div className="grid grid-cols-2 gap-2">

                        {/* 위치 */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <MapPin size={11} />
                            위치
                          </div>

                          <p
                            className="
                              text-[10px]
                              font-bold
                              leading-relaxed
                              text-slate-800
                            "
                          >
                            경북 포항 죽장면
                            <br />
                            GRID-3629
                          </p>

                        </div>


                        {/* 배터리 */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <Battery size={11} />
                            배터리
                          </div>

                          <p className="text-xs font-black text-emerald-600">
                            87%
                          </p>

                        </div>


                        {/* 진행률 */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <Gauge size={11} />
                            진행률
                          </div>

                          <p className="text-xs font-black text-slate-800">
                            75%
                          </p>

                        </div>


                        {/* GPS */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <Navigation size={11} />
                            GPS
                          </div>

                          <p className="text-[10px] font-black text-emerald-600">
                            CONNECTED
                          </p>

                        </div>

                      </div>


                      {/* 현재 임무 */}
                      <div className="mt-2 rounded-xl bg-slate-50 p-2.5">

                        <div className="mb-1 text-[9px] font-bold text-slate-400">
                          CURRENT MISSION
                        </div>

                        <p className="text-[10px] leading-relaxed text-slate-700">
                          시민 제보 지역 주변 감염 의심목 현장 확인 및 시료 채취
                        </p>

                      </div>

                    </div>

                  </motion.div>

                )}

              </AnimatePresence>


              {/* =========================================
                  박요원 마커
              ========================================= */}
              <button
                type="button"
                onClick={() => setSelectedWorkerId("W-102")}
                className="
                  absolute
                  bottom-[35%]
                  right-[25%]
                  z-30
                  flex
                  h-8
                  w-8
                  cursor-pointer
                  items-center
                  justify-center
                  rounded-full
                  border-2
                  border-white
                  bg-emerald-800
                  text-xs
                  font-bold
                  text-white
                  shadow-lg
                  transition-all
                  hover:scale-125
                  focus:outline-none
                "
                aria-label="박요원 상세 정보"
              >

                {selectedWorkerId === "W-102" && (
                  <span
                    className="
                      absolute
                      inset-[-5px]
                      rounded-full
                      border-2
                      border-emerald-300
                    "
                  />
                )}

                박

              </button>


              {/* =========================================
                  박요원 이름
              ========================================= */}
              <div
                className="
                  pointer-events-none
                  absolute
                  bottom-[42%]
                  right-[25%]
                  z-20
                  translate-x-1/2
                  whitespace-nowrap
                  rounded
                  bg-slate-900
                  px-2
                  py-1
                  text-[9px]
                  font-bold
                  text-white
                "
              >
                박요원 · 48% 진행
              </div>


              {/* =========================================
                  박요원 상세 팝업
                  - 지도 기준 위치
                  - 마커 위쪽
        ========================================= */}
              <AnimatePresence>

                {selectedWorkerId === "W-102" && (

                  <motion.div
                    initial={{
                      opacity: 0,
                      scale: 0.95,
                      y: 10,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.95,
                      y: 10,
                    }}
                    transition={{
                      duration: 0.2,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="
                      absolute
                      bottom-[42%]
                      right-[25%]
                      z-50
                      w-[280px]
                      max-w-[calc(100%-32px)]
                      translate-x-1/2
                      overflow-hidden
                      rounded-2xl
                      border
                      border-slate-200
                      bg-white
                      shadow-2xl
                    "
                  >

                    {/* 팝업 헤더 */}
                    <div
                      className="
                        flex
                        items-center
                        justify-between
                        border-b
                        border-slate-100
                        px-4
                        py-3
                      "
                    >

                      <div className="flex items-center gap-2">

                        <div
                          className="
                            flex
                            h-9
                            w-9
                            shrink-0
                            items-center
                            justify-center
                            rounded-full
                            bg-emerald-800
                            text-sm
                            font-bold
                            text-white
                          "
                        >
                          박
                        </div>

                        <div>

                          <div className="flex items-center gap-2">

                            <span className="text-sm font-black text-slate-900">
                              박요원
                            </span>

                            <span
                              className="
                                rounded-full
                                bg-emerald-100
                                px-2
                                py-0.5
                                text-[9px]
                                font-bold
                                text-emerald-700
                              "
                            >
                              활동 중
                            </span>

                          </div>

                          <p className="mt-0.5 text-[9px] text-slate-400">
                            GPS ID : W-102
                          </p>

                        </div>

                      </div>


                      {/* 닫기 */}
                      <button
                        type="button"
                        onClick={() => setSelectedWorkerId(null)}
                        className="
                          flex
                          h-7
                          w-7
                          shrink-0
                          items-center
                          justify-center
                          rounded-full
                          text-lg
                          text-slate-400
                          transition
                          hover:bg-slate-100
                          hover:text-slate-700
                        "
                        aria-label="팝업 닫기"
                      >
                        ×
                      </button>

                    </div>


                    {/* 팝업 내용 */}
                    <div className="p-3">

                      <div className="grid grid-cols-2 gap-2">

                        {/* 위치 */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <MapPin size={11} />
                            위치
                          </div>

                          <p
                            className="
                              text-[10px]
                              font-bold
                              leading-relaxed
                              text-slate-800
                            "
                          >
                            경북 포항 북구
                            <br />
                            GRID-4218
                          </p>

                        </div>


                        {/* 배터리 */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <Battery size={11} />
                            배터리
                          </div>

                          <p className="text-xs font-black text-emerald-600">
                            64%
                          </p>

                        </div>


                        {/* 진행률 */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <Gauge size={11} />
                            진행률
                          </div>

                          <p className="text-xs font-black text-slate-800">
                            48%
                          </p>

                        </div>


                        {/* GPS */}
                        <div className="rounded-xl bg-slate-50 p-2.5">

                          <div
                            className="
                              mb-1
                              flex
                              items-center
                              gap-1
                              text-[9px]
                              font-bold
                              text-slate-400
                            "
                          >
                            <Navigation size={11} />
                            GPS
                          </div>

                          <p className="text-[10px] font-black text-emerald-600">
                            CONNECTED
                          </p>

                        </div>

                      </div>


                      {/* 현재 임무 */}
                      <div className="mt-2 rounded-xl bg-slate-50 p-2.5">

                        <div className="mb-1 text-[9px] font-bold text-slate-400">
                          CURRENT MISSION
                        </div>

                        <p className="text-[10px] leading-relaxed text-slate-700">
                          포항 북구 예찰 구역 정기 순찰 및 감염목 의심 개체 조사
                        </p>

                      </div>

                    </div>

                  </motion.div>

                )}

              </AnimatePresence>


              {/* =========================================
                  감염 의심 위치
              ========================================= */}
              <div
                className="
                  absolute
                  right-[20%]
                  top-[25%]
                  z-20
                "
              >

                <div
                  className="
                    h-4
                    w-4
                    animate-ping
                    rounded-full
                    bg-rose-500
                  "
                />

                <span
                  className="
                    absolute
                    left-1/2
                    top-5
                    -translate-x-1/2
                    whitespace-nowrap
                    rounded
                    border
                    border-rose-200
                    bg-rose-100
                    px-2
                    py-1
                    text-[9px]
                    font-bold
                    text-rose-800
                  "
                >
                  감염 의심 지점
                </span>

              </div>


              {/* =========================================
                  Telemetry
              ========================================= */}
              <div
                className="
                  absolute
                  bottom-3
                  left-3
                  z-20
                  rounded-lg
                  bg-slate-900/90
                  p-2
                  font-mono
                  text-[9px]
                  text-white
                "
              >

                <div>
                  GPS SYNC: 30s INTERV
                </div>

                <div>
                  TELEMETRY ACTIVE
                </div>

              </div>

            </div>

          </div>

        </section>        
      </div>  
        

      {/* ======================================== */}
      {/* 약제 및 방제 소모품 재고*/}
      {/* ======================================== */}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* =========================================
            Header
        ========================================= */}
        <header className="border-b border-slate-200 bg-white px-5 py-4">

          <div className="flex items-center justify-between gap-4">

            {/* 제목 영역 */}
            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <DatabaseIcon
                  size={18}
                  className="shrink-0 text-emerald-700"
                />

                <h2 className="text-base font-black text-slate-950">
                  약제 및 방제 소모품 재고
                </h2>

              </div>

              <p className="mt-1 text-[10px] font-semibold text-slate-400">
                실시간 재고 및 방제 장비 가동 현황을 확인합니다.
              </p>

            </div>

          </div>

        </header>


        {/* =========================================
            재고 카드 영역
        ========================================= */}
        <div className="p-4">

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">


            {/* =========================================
                재고 경고
            ========================================= */}
            <div
              className="
                flex
                items-center
                gap-3
                rounded-xl
                border
                border-red-200
                bg-red-50
                p-3.5
              "
            >

              <div
                className="
                  flex
                  h-9
                  w-9
                  shrink-0
                  items-center
                  justify-center
                  rounded-lg
                  bg-red-600
                  text-white
                "
              >
                <AlertCircle size={18} />
              </div>


              <div className="min-w-0">

                <h3 className="text-[11px] font-bold text-red-900">
                  훈증 천막 재고 소진
                </h3>

                <p className="mt-0.5 text-[10px] leading-relaxed text-red-700">
                  포항 보관 창고 잔여 12개 · 긴급 발주 권장
                </p>

              </div>

            </div>


            {/* =========================================
                아바멕틴
            ========================================= */}
            <div
              className="
                rounded-xl
                border
                border-slate-200
                bg-white
                p-3.5
                transition
                hover:border-emerald-200
                hover:shadow-sm
              "
            >

              <div className="mb-2.5 flex items-center justify-between gap-2">

                <h3 className="truncate text-[11px] font-bold text-slate-600">
                  아바멕틴 주사 수간 주입제
                </h3>

                <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                  840L · 84%
                </span>

              </div>


              {/* Progress */}
              <div className="h-5 overflow-hidden rounded-md bg-slate-100 p-0.5">

                <div
                  className="h-full rounded bg-emerald-600 transition-all"
                  style={{
                    width: "84%",
                  }}
                />

              </div>

            </div>


            {/* =========================================
                메탐소듐
            ========================================= */}
            <div
              className="
                rounded-xl
                border
                border-slate-200
                bg-white
                p-3.5
                transition
                hover:border-emerald-200
                hover:shadow-sm
              "
            >

              <div className="mb-2.5 flex items-center justify-between gap-2">

                <h3 className="truncate text-[11px] font-bold text-slate-600">
                  메탐소듐 훈증 전용 액제
                </h3>

                <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                  1,200L · 91%
                </span>

              </div>


              {/* Progress */}
              <div className="h-5 overflow-hidden rounded-md bg-slate-100 p-0.5">

                <div
                  className="h-full rounded bg-emerald-600 transition-all"
                  style={{
                    width: "91%",
                  }}
                />

              </div>

            </div>


            {/* =========================================
                파쇄기
            ========================================= */}
            <div
              className="
                rounded-xl
                border
                border-slate-200
                bg-white
                p-3.5
                transition
                hover:border-emerald-200
                hover:shadow-sm
              "
            >

              <div className="mb-2.5 flex items-center justify-between gap-2">

                <h3 className="truncate text-[11px] font-bold text-slate-600">
                  목재 자주식 파쇄기 가동도
                </h3>

                <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                  8 / 12대
                </span>

              </div>


              {/* Equipment Status */}
              <div className="flex h-5 gap-0.5 rounded-md bg-slate-100 p-0.5">

                {Array.from({ length: 12 }).map((_, index) => (

                  <div
                    key={index}
                    className={`
                      flex-1
                      rounded-sm
                      transition-all
                      ${
                        index < 8
                          ? "bg-emerald-600"
                          : "bg-slate-300"
                      }
                    `}
                  />

                ))}

              </div>

            </div>

          </div>

        </div>
      </section>
    </div>

  );
}