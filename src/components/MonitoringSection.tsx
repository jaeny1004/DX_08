import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Camera,
  Plus,
  Check,
  Video,
  User,
  X,
} from "lucide-react";
import { TreeRecord } from "../types";
import SectionTitle from "./SectionTitle";

interface MonitoringSectionProps {
  title: string;
  trees: TreeRecord[];
  onAddTree: (newTree: TreeRecord) => void;
  onUpdateTreeStatus: (id: string, newStatus: TreeRecord["status"]) => void;
}

// TODO: 실제 AI 드론 판독 API 연동 자리 - 지금은 하드코딩 더미 값으로 대체
const DRONE_REPLAY_DUMMY = {
  species: "소나무",
  severity: "심",
  capturedLocation: "경북 포항시 북구 죽장면 산47",
  coordX: 62.4,
  coordY: 35.2,
};

export default function MonitoringSection({
  title,
  trees,
  onAddTree,
  onUpdateTreeStatus
}: MonitoringSectionProps) {
  // Tree registration form state (FR-MON-002)
  const [region, setRegion] = useState("");
  const [species, setSpecies] = useState<TreeRecord["species"]>("소나무");
  const [severity, setSeverity] = useState<TreeRecord["severity"]>("중");
  const [gpsX, setX] = useState("362947");
  const [gpsY, setY] = useState("289014");
  const [inspector, setInspector] = useState("김지원");
  const [isRegistering, setIsRegistering] = useState(false);

  // Timeline detailed view selection (FR-MON-003)
  const [selectedTreeId, setSelectedTreeId] = useState<string>(trees[0]?.id || "");

  // AI 드론 판독 영상 패널 (신규)
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(false);
  const [isDroneReplayAnalyzed, setIsDroneReplayAnalyzed] = useState(false);

  const handleRegisterTree = (e: React.FormEvent) => {
    e.preventDefault();
    if (!region) return;

    // Simulate coordinates projection conversion to EPSG:5186 (FR-MON-002)
    const newRecord: TreeRecord = {
      id: `PT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      region,
      species,
      confirmedDate: new Date().toISOString().split("T")[0],
      status: "예찰의심",
      severity,
      x: Number(gpsX),
      y: Number(gpsY),
      inspector,
      timeline: [
        {
          stage: "현장 제보 등록 (MON-002)",
          date: new Date().toLocaleString(),
          note: `GPS 등록 완료 (EPSG:5186 가상 투영변화 완료). 피해정도: ${severity}`,
          actor: inspector
        }
      ]
    };

    onAddTree(newRecord);
    setRegion("");
    setIsRegistering(false);
  };

  const selectedTree = trees.find(t => t.id === selectedTreeId) || trees[0];

  const handleOpenVideoPanel = () => {
    setIsDroneReplayAnalyzed(false);
    setIsVideoPanelOpen(true);
  };

  const listCard = (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
            📋 확진목 리스트
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            소나무재선충병에 감염된 확진목의 상세 내역과 타임라인을 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="관리 ID / 지역 / 수종 검색"
            className="w-56 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-emerald-700"
          />
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="bg-emerald-800 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-900 transition-colors shrink-0"
          >
            <Plus size={14} />
            <span>신규 등록</span>
          </button>
        </div>
      </div>

      {isRegistering && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          onSubmit={handleRegisterTree}
          className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 space-y-4"
        >
          <div className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1">
            <Camera size={14} className="text-emerald-700" />
            <span>신규 확진 및 예찰 의심 고사목 신규 가입 (FR-MON-002)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">지역 상세 주소</label>
              <input
                type="text"
                required
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="예: 경북 포항시 북구 죽장면 산42"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">수종 선택</label>
              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value as any)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
              >
                <option>소나무</option>
                <option>해송</option>
                <option>잣나무</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">피해 심각 정도</label>
              <div className="flex gap-4 pt-1 font-bold text-slate-700">
                {["경", "중", "심"].map((item) => (
                  <label key={item} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="severity"
                      checked={severity === item}
                      onChange={() => setSeverity(item as any)}
                      className="accent-emerald-700"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">담당 요원 (서명자)</label>
              <input
                type="text"
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">중부 원점 좌표 X (EPSG:5186)</label>
              <input
                type="text"
                value={gpsX}
                onChange={(e) => setX(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">중부 원점 좌표 Y (EPSG:5186)</label>
              <input
                type="text"
                value={gpsY}
                onChange={(e) => setY(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 text-xs pt-2">
            <button
              type="button"
              onClick={() => setIsRegistering(false)}
              className="px-3.5 py-2 border border-slate-200 bg-white rounded-xl font-bold text-slate-600"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl font-bold hover:bg-emerald-900"
            >
              대장 추가 등록
            </button>
          </div>
        </motion.form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
              <th className="py-3 px-3">관리 ID</th>
              <th className="py-3 px-3">발견 지역</th>
              <th className="py-3 px-3">수종</th>
              <th className="py-3 px-3 text-center">심각도</th>
              <th className="py-3 px-3 text-right">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
            {trees.map((t) => (
              <tr
                key={t.id}
                onClick={() => setSelectedTreeId(t.id)}
                className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${selectedTreeId === t.id ? "bg-emerald-50/60" : ""}`}
              >
                <td className="py-3 px-3 font-mono font-bold text-emerald-950">{t.id}</td>
                <td className="py-3 px-3 truncate max-w-[150px]">{t.region}</td>
                <td className="py-3 px-3 text-slate-500">{t.species}</td>
                <td className="py-3 px-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-3xs font-black ${
                    t.severity === "심" ? "bg-rose-100 text-rose-700" : t.severity === "중" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {t.severity}
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <select
                    value={t.status}
                    onChange={(e) => onUpdateTreeStatus(t.id, e.target.value as any)}
                    onClick={(e) => e.stopPropagation()}
                    className="text-2xs font-bold border border-slate-200 rounded-lg p-1 outline-none bg-white"
                  >
                    <option value="예찰의심">예찰의심</option>
                    <option value="현장확인">현장확인</option>
                    <option value="시료검사">시료검사</option>
                    <option value="확진완료">확진완료</option>
                    <option value="방제대기">방제대기</option>
                    <option value="방제중">방제중</option>
                    <option value="방제완료">방제완료</option>
                    <option value="사후관리">사후관리</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const timelineCard = (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm min-h-[400px]">
      <div className="border-b border-slate-100 pb-3 mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-slate-950">
            🧬 감염목 상세 타임라인
          </h3>
          <div className="text-xs font-bold text-slate-400">
            선택 관리 ID{" "}
            <span className="text-emerald-800 font-mono font-black">
              {selectedTree?.id ?? "-"}
            </span>
          </div>
        </div>
        <p className="text-2xs text-slate-400 font-medium mt-1">
          해당 확진목의 타임라인과 상세 정보를 제공합니다.
        </p>
      </div>

      {selectedTree ? (
        <div className="relative border-l-2 border-slate-100 pl-4 ml-2 space-y-5 pt-2">
          {selectedTree.timeline.map((step, idx) => {
            const isDroneStep = step.stage.includes("AI 드론 판독");

            return (
              <div key={idx} className="relative">
                {/* Indicator circle */}
                <div className="absolute -left-[23px] top-0.5 w-2.5 h-2.5 rounded-full bg-emerald-800 border border-white" />

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-start gap-2 font-bold text-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{step.stage}</span>
                      {isDroneStep && (
                        <button
                          type="button"
                          onClick={handleOpenVideoPanel}
                          className="flex items-center gap-1 rounded-lg bg-emerald-800 px-2 py-1 text-3xs font-bold text-white hover:bg-emerald-900 transition-colors"
                        >
                          <Video size={11} />
                          <span>영상 보기</span>
                        </button>
                      )}
                    </div>
                    <span className="text-3xs text-slate-400 font-mono font-medium shrink-0">{step.date}</span>
                  </div>
                  <p className="text-2xs text-slate-500 font-medium leading-relaxed">{step.note}</p>

                  {isDroneStep ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-3xs font-bold text-sky-700">
                        <User size={10} />
                        <span>{step.actor}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-bold text-emerald-700">
                        <Check size={10} />
                        <span>AI 분석 완료</span>
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-3xs font-bold text-emerald-700">
                      <User size={10} />
                      <span>{step.actor}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-slate-400 text-xs">
          대장을 선택하면 타임라인이 출력됩니다.
        </div>
      )}
    </div>
  );

  const videoPanel = (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden h-fit"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-black text-slate-950 flex items-center gap-2">
          🚁 AI 드론 판독 영상
        </h3>
        <button
          type="button"
          onClick={() => setIsVideoPanelOpen(false)}
          aria-label="영상 패널 닫기"
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-2xl overflow-hidden bg-slate-950">
          <video
            controls
            preload="metadata"
            className="w-full aspect-video"
            src={`${import.meta.env.BASE_URL}media/drone-replay.mp4`}
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-3xs font-black text-rose-600">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
            <span>DRONE REPLAY</span>
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            선택된 확진목의 AI 드론 예찰 영상입니다.
          </p>
        </div>

        <div className="space-y-2 text-xs border-t border-b border-slate-100 py-3">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400 font-bold shrink-0">대상 확진목</span>
            <span className="font-mono font-black text-emerald-950 text-right">{selectedTree?.id ?? "-"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-400 font-bold shrink-0">등록 위치</span>
            <span className="font-semibold text-slate-700 text-right">{selectedTree?.region ?? "-"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-3xs font-bold text-slate-400">수종</div>
            <div className="mt-1 text-sm font-black text-slate-800">
              {isDroneReplayAnalyzed ? DRONE_REPLAY_DUMMY.species : "-"}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="text-3xs font-bold text-slate-400">심각도</div>
            <div className="mt-1 text-sm font-black text-slate-800">
              {isDroneReplayAnalyzed ? DRONE_REPLAY_DUMMY.severity : "-"}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
          <div className="text-3xs font-bold text-slate-400">촬영 위치</div>
          <div className="mt-1 text-xs font-bold text-slate-800">
            {isDroneReplayAnalyzed ? DRONE_REPLAY_DUMMY.capturedLocation : "-"}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
          <div className="text-3xs font-bold text-slate-400">중부원점좌표 (EPSG:5186)</div>
          <div className="mt-1 flex gap-4 font-mono text-sm font-black text-slate-800">
            <span>X {isDroneReplayAnalyzed ? DRONE_REPLAY_DUMMY.coordX : "-"}</span>
            <span>Y {isDroneReplayAnalyzed ? DRONE_REPLAY_DUMMY.coordY : "-"}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsDroneReplayAnalyzed(true)}
          className="w-full bg-emerald-800 text-white rounded-xl py-3 text-xs font-bold hover:bg-emerald-900 transition-colors"
        >
          드론 판독 실행
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-6">
      <SectionTitle title={title} />

      {isVideoPanelOpen ? (
        <div
          className="grid gap-6 items-start"
          style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(360px, 1fr)" }}
        >
          <div className="space-y-6 min-w-0">
            {listCard}
            {timelineCard}
          </div>
          {videoPanel}
        </div>
      ) : (
        <div className="space-y-6">
          {listCard}
          {timelineCard}
        </div>
      )}
    </div>
  );
}
