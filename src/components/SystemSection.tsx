import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  UploadCloud, 
  Settings, 
  Database, 
  BarChart, 
  Cpu, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Flame 
} from "lucide-react";

export default function SystemSection() {
  const [activeTab, setActiveTab] = useState<"upload" | "model" | "shap">("upload");
  
  // SYS-001 Upload verification states
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  // SYS-003 ML Model State
  const [selectedModel, setSelectedModel] = useState("v2.3.1-XGBoost");
  const [isRetraining, setIsRetraining] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file.name);
    setIsVerifying(true);
    setVerificationResult(null);

    // Simulate coordinates verification and columns mapping for EPSG:5186 projection (FR-SYS-001)
    setTimeout(() => {
      setIsVerifying(false);
      setVerificationResult({
        totalRows: 12480,
        validCoords: 12462,
        failedCoords: 18,
        isProjectionValid: true,
        detectedProjection: "EPSG:5186 (중부원점 대조 완료)",
        mandatoryColumns: ["grid_id", "risk_score", "inspector_gps_x", "inspector_gps_y"]
      });
    }, 1800);
  };

  const handleRetrainModel = () => {
    setIsRetraining(true);
    setEpoch(0);
    const interval = setInterval(() => {
      setEpoch((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsRetraining(false);
          return 100;
        }
        return prev + 20;
      });
    }, 400);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Category Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 max-w-lg">
        <button 
          onClick={() => setActiveTab("upload")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "upload" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          📂 원천 데이터 업로드 검증
        </button>
        <button 
          onClick={() => setActiveTab("model")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "model" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          ⚙️ XGBoost 모델 버전 관리
        </button>
        <button 
          onClick={() => setActiveTab("shap")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "shap" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          📊 SHAP 기여도 중요도 분석
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* CSV/Img File Uploader parser (FR-SYS-001) */}
        {activeTab === "upload" && (
          <motion.div 
            key="upload-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                  📂 원천 행정 데이터 업로드 정합성 테스터 (SYS-001)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  산림청 감염목 CSV 대장 또는 고사목 좌표 자료를 끌어다 놓아 EPSG:5186 규격을 확인합니다.
                </p>
              </div>

              {/* Drag-and-drop input simulator */}
              <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 transition-colors rounded-2xl p-8 text-center bg-slate-50/50 flex flex-col items-center justify-center space-y-3 cursor-pointer relative">
                <input 
                  type="file" 
                  accept=".csv,.xlsx"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <UploadCloud size={38} className="text-slate-400 stroke-[1.5]" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-slate-700">여기를 클릭하거나 파일을 끌어다 업로드하십시오.</p>
                  <p className="text-slate-400 font-semibold">지원 확장자: CSV, Excel (.xlsx) / 최대 용량 100MB</p>
                </div>
              </div>

              {uploadedFile && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-emerald-700" />
                    <span className="font-mono font-bold text-slate-800">{uploadedFile}</span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full">업로드 확인</span>
                </div>
              )}
            </div>

            {/* Validation Feedback screen (FR-SYS-001) */}
            <div className="bg-slate-900 text-emerald-400 font-mono text-xs rounded-3xl p-6 border border-slate-800 h-[380px] flex flex-col justify-between">
              <div className="space-y-3 overflow-y-auto">
                <span className="text-[10px] text-slate-500 font-bold block">// DATA PROJECTION VALIDATOR DAEMON LOG</span>
                
                {isVerifying ? (
                  <div className="flex flex-col items-center justify-center h-[200px] space-y-2">
                    <RefreshCw className="animate-spin text-emerald-500" size={24} />
                    <span className="text-slate-400 font-bold font-mono">가상 타원체 원점 좌표 투영 검사 중...</span>
                  </div>
                ) : verificationResult ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2 font-mono text-[11px] leading-relaxed"
                  >
                    <div className="text-emerald-300 font-bold">✓ 정합성 검증 완료: 정상 연동 규격 확인</div>
                    <div>-------------------------------------------</div>
                    <div>검출 투영계: <span className="text-white font-bold">{verificationResult.detectedProjection}</span></div>
                    <div>전체 감염 레코드 수: <span className="text-white font-bold">{verificationResult.totalRows}행</span></div>
                    <div>정상 투영 좌표 수: <span className="text-white font-bold">{verificationResult.validCoords}건</span></div>
                    <div className="text-rose-400">음영지역 및 외곽 유실 좌표: {verificationResult.failedCoords}건 (임의 보정 대기)</div>
                    <div>-------------------------------------------</div>
                    <div>필수 키 헤더 정보 파싱 대조: </div>
                    <div className="pl-4 flex flex-wrap gap-1.5 pt-1">
                      {verificationResult.mandatoryColumns.map((col: string, idx: number) => (
                        <span key={idx} className="bg-slate-800 text-white border border-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                          {col}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-slate-600 text-center font-bold leading-relaxed">
                    데이터 파일을 마운트하시면<br />
                    EPSG:5186 자동 검증 결과 로그가 도출됩니다. (FR-SYS-001 부합)
                  </div>
                )}
              </div>

              <div className="text-[10px] text-slate-600 font-semibold border-t border-slate-800 pt-3 text-right">
                DATA INTEROPERABILITY COMPLIANCE: COMPLETE
              </div>
            </div>
          </motion.div>
        )}

        {/* Machine Learning Model Performance Version controller (FR-SYS-003, FR-SYS-004) */}
        {activeTab === "model" && (
          <motion.div 
            key="model-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Version select and retainer */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-1.5">
                ⚙️ XGBoost 공간 예측 모델 버전 제어 (SYS-003)
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                      <th className="py-3 px-3">모델 버전 ID</th>
                      <th className="py-3 px-3">PR-AUC 성능</th>
                      <th className="py-3 px-3">Top-K 포착율</th>
                      <th className="py-3 px-3">마지막 학습일</th>
                      <th className="py-3 px-3 text-right">전환</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {[
                      { id: "v2.3.1-XGBoost", prauc: "0.942", topk: "91.2%", date: "2026-07-01", isActive: true },
                      { id: "v2.2.0-XGBoost", prauc: "0.898", topk: "87.4%", date: "2026-05-14", isActive: false },
                      { id: "v2.0.4-RandomForest", prauc: "0.812", topk: "81.9%", date: "2026-03-02", isActive: false },
                    ].map((model) => (
                      <tr key={model.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-3 font-mono font-bold text-emerald-950">{model.id}</td>
                        <td className="py-4 px-3 font-mono font-bold text-emerald-700">{model.prauc}</td>
                        <td className="py-4 px-3 font-mono text-slate-500">{model.topk}</td>
                        <td className="py-4 px-3 text-slate-500 font-mono font-medium">{model.date}</td>
                        <td className="py-4 px-3 text-right">
                          <button
                            onClick={() => setSelectedModel(model.id)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm transition-all ${
                              selectedModel === model.id ? "bg-emerald-800 text-white font-black" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {selectedModel === model.id ? "운영 가동 중" : "전환하기"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Model Retraining trigger panel (FR-SYS-004) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-1.5">
                  <Cpu size={16} className="text-emerald-700" />
                  <span>배치 기계학습 학습 모델 재재학습 가동 (SYS-004)</span>
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  신규 축적된 예찰 요원들의 현장 PCR 시료 및 드론 NDVI 관제 레코드를 XGBoost 예측 엔진에 재주입하여 과적합을 방지하고 예측 성능을 고도화합니다.
                </p>
              </div>

              {isRetraining ? (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 text-xs font-semibold">
                  <div className="flex justify-between items-center">
                    <span>에포크 (Retraining Step) 진행률</span>
                    <span className="font-mono text-emerald-800 font-bold">{epoch}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: `${epoch}%` }}
                      className="bg-emerald-600 h-full rounded-full"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block font-mono text-center">EPOCH: {epoch}/100 | CROSS-VALIDATION ACTIVE</span>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-800 text-xs font-semibold leading-relaxed border border-emerald-100">
                  💡 <b>가동 시 주의:</b> 재학습 연산은 CPU/GPU 리소스를 극단적으로 소모하므로 산악 환경 예찰 주기가 비활성화되는 야간 시간대에 스케줄 가동하는 것을 지향합니다.
                </div>
              )}

              <button 
                onClick={handleRetrainModel}
                disabled={isRetraining}
                className="w-full bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-200 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <RefreshCw size={14} className={isRetraining ? "animate-spin" : ""} />
                <span>기계학습 재학습 엔진 가동 (FR-SYS-004)</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* SHAP Feature Contribution plotter (FR-SYS-005) */}
        {activeTab === "shap" && (
          <motion.div 
            key="shap-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                📊 XGBoost 예측 인자 SHAP 글로벌 중요도 (SYS-005)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                v2.3.1-XGBoost 모델 내부에서 500m 격자 위험도를 연산 시 각 물리 피처(Feature)가 미친 섀플리 기여도 평균치
              </p>
            </div>

            <div className="space-y-4 max-w-2xl text-xs font-semibold text-slate-700">
              {[
                { name: "인접 500m 격자 감염 이력 밀도 (nearest_infection_density)", contribution: 84, color: "bg-rose-500" },
                { name: "소나무 및 해송림 밀포도 구성비 (pine_forest_ratio)", contribution: 72, color: "bg-emerald-500" },
                { name: "전월 누적 강수량 변화율 (precipitation_changes)", contribution: 58, color: "bg-sky-500" },
                { name: "평균 산악 고도 및 경사도 편차 (elevation_gradient)", contribution: 45, color: "bg-amber-500" },
                { name: "우화기 (5월~7월) 평균 지상 온도 (summer_avg_temperature)", contribution: 30, color: "bg-purple-500" },
              ].map((feature, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between font-bold">
                    <span>{feature.name}</span>
                    <span className="font-mono text-slate-900">{feature.contribution}점</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${feature.contribution}%` }}
                      transition={{ duration: 0.6, delay: idx * 0.05 }}
                      className={`${feature.color} h-full rounded-full`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-medium leading-relaxed max-w-2xl text-slate-600">
              💡 <b>SHAP 해석 가이드 (SYS-005):</b> 분석 결과 <b>인접 500m 격자 감염 이력</b>의 기여도가 압도적 1위로 연산되었습니다. 이는 소나무재선충의 전염이 공기 중 전파가 아닌, <b>매개 하늘소의 실질적 우화(MON-007) 비행 거리 한계선</b>에 절대적으로 종속된다는 매뉴얼 지침의 수학적 입증입니다.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
