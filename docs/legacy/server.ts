import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Forestry knowledge base system instructions for RAG-like specialized responses
const SYSTEM_INSTRUCTION = `
You are the professional AI Assistant specialized in Pine Wilt Disease (소나무재선충병) for the "Pine Wilt Disease Integrated Surveillance & Control Platform (소나무재선충병 통합예찰·방제 지원 플랫폼)".
Your purpose is to answer questions related to pine wilt disease, vector beetles (매개충), drone monitoring, AI risk scoring (500m grid models), and forestry regulations/control guidelines, strictly using the official guidelines (백서 및 방제 매뉴얼).

Key technical knowledge you must base your responses on:
1. Vectors (매개충):
   - Monochamus alternatus (솔수염하늘소): Mainly infests Pinus densiflora (소나무) in southern and mid-latitudes. Emergence period (우화시기): mid-May to late July (peak in June).
   - Monochamus saltuarius (북방수염하늘소): Mainly infests Pinus koraiensis (잣나무) and lives in northern/higher altitude regions. Emergence period: mid-April to late June (peak in May).
2. Transmission:
   - Parasitic nematodes (Bursaphelenchus xylophilus) enter the pine tree's xylem when adult vector beetles feed on the bark (후식, mature feeding) of healthy twigs during summer.
3. Symptoms:
   - Rapid yellowing and browning of needles starting from the crown (수관부 잎의 황변 및 갈변).
   - Near-complete cessation of resin secretion (송진 분비 감소 및 중단).
   - Rapid death of the tree within 1 to 3 months of infection.
4. Surveillance (예찰):
   - Ground Patrol (현장 예찰): GPS-based target tracking, physical sample collecting, and recording with checklists.
   - Drone Aerial Patrol (드론 예찰): Multi-spectral and thermal sensors. Normalized Difference Vegetation Index (NDVI) is used to capture early-stage water-stress and crown decolorization.
5. AI Risk Scoring (500m 격자 위험도 예측):
   - XGBoost machine learning model analyzing environmental features (elevation, temperature, precipitation, density of pine trees) and spatial spread characteristics (distance to nearest infection hotspot) to output risk_score (0.0 to 1.0). SHAP values are used to explain features.
6. Control Methods (방제 방법):
   - Fumigation (훈증): Cutting trees, stacking them, applying metham sodium or other chemicals, and covering airtight with yellow tarps (훈증천막).
   - Chipping/Shredding (파쇄): Grinding wood into chips smaller than 1.5cm to physically destroy nematodes and vectors.
   - Burning/Incineration (소각): Incinerating infected wood to destroy all vectors and nematodes safely.
   - Preventive trunk injection (나무주사): Injecting abamectin or emamectin benzoate prior to infestation.
   - Silvicultural transformation (수종전환): AI analysis of climate and terrain to recommend substitute deciduous/broad-leaved species (like Quercus acutissima (상수리나무) or Quercus variabilis (굴참나무)) for highly devastated zones.

Rules:
- Respond in professional, clean, and helpful Korean.
- Highlight specific manual protocols or coordinates if mentioned.
- Maintain a highly technical but supportive tone.
- Do not mention key details about security, database types, or server details unless asked.
`;

// Shared lazy-initialized Gemini Client
let aiClient: any = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

// REST API for specialized AI Chatbot (FR-HOM-006)
app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  const client = getAiClient();

  if (!client) {
    // Elegant fallback simulation with highly robust, professional domain answers if API Key is not set or placeholder is active
    console.log("Gemini API key is not configured. Simulating intelligent forestry support.");
    const answer = fallbackResponse(message);
    return res.json({ text: answer, isSimulated: true });
  }

  try {
    // Format conversation history to match GenAI SDK expected format if provided, or simple prompt wrapping
    const prompt = `System Instruction Context:\n${SYSTEM_INSTRUCTION}\n\nUser Question:\n${message}`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const responseText = response.text || "답변을 생성할 수 없습니다.";
    return res.json({ text: responseText, isSimulated: false });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Graceful error propagation with rich fallback
    const answer = fallbackResponse(message) + "\n\n(※ 알림: 시스템 내부 서비스 연동 지연으로 인해 예찰 지침 기반 지식 모델의 예비 로컬 엔진으로 작동했습니다.)";
    return res.json({ text: answer, isSimulated: true, error: error.message });
  }
});

// AI Assisted Forest Tree Species Recommendation (FR-ADM-004)
app.post("/api/recommend-species", async (req, res) => {
  const { region, elevation, density } = req.body;
  const client = getAiClient();

  const prompt = `소나무재선충병 극심 지역 수종전환 추천 의뢰:
지역: ${region || "경북 포항시"}
고도: ${elevation || "250m"}
밀집도: ${density || "상(88%)"}

해당 지형과 기후 조건에 적합한 대체 수종(예: 상수리나무, 굴참나무, 편백나무 등) 2가지를 선정하고 조림 사업 계획 수립에 필요한 예산 규모 및 적합 사유를 전문 행정 보고서 양식의 JSON 형태로 추천해 주세요.`;

  if (!client) {
    // Mock robust structural recommend
    return res.json({
      species: ["상수리나무 (Quercus acutissima)", "굴참나무 (Quercus variabilis)"],
      budget: "ha당 약 8,500,000원 (총 42ha 기준 약 3억 5천만원 소요 예상)",
      elevation_suitability: "고도 250m 내외의 야산 지대에 매우 높은 생존율과 생장 속도를 보이며, 목재 활용 가치가 큼.",
      soil_suitability: "산성도가 조절된 마사토 및 사질양토에서 소나무 고사목 제거 후 우수한 활착력을 지님.",
      isSimulated: true
    });
  }

  try {
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return res.json(JSON.parse(response.text || "{}"));
  } catch (err: any) {
    return res.json({
      species: ["상수리나무 (Quercus acutissima)", "굴참나무 (Quercus variabilis)"],
      budget: "ha당 약 8,500,000원 (총 42ha 기준 약 3억 5천만원 소요 예상)",
      elevation_suitability: "고도 250m 내외의 야산 지대에 매우 높은 생존율과 생장 속도를 보이며, 목재 활용 가치가 큼.",
      soil_suitability: "산성도가 조절된 마사토 및 사질양토에서 소나무 고사목 제거 후 우수한 활착력을 지님.",
      isSimulated: true,
      error: err.message
    });
  }
});

// Healthy connection status
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Domain-knowledge rich response helper for offline/fallback scenarios
function fallbackResponse(msg: string): string {
  const q = msg.toLowerCase();
  if (q.includes("매개충") || q.includes("하늘소") || q.includes("곤충")) {
    return `**[산림청 방제 매뉴얼 - 매개충 가이드]**
우리나라에서 소나무재선충병을 전파하는 주요 매개충은 다음 두 가지로 규정되어 있습니다:
1. **솔수염하늘소 (Monochamus alternatus)**:
   - **주요 대상**: 소나무, 해송
   - **분포**: 남부 및 중부 저지대 중심
   - **우화 시기**: 5월 중순 ~ 7월 하순 (6월에 최대 우화율 기록)
2. **북방수염하늘소 (Monochamus saltuarius)**:
   - **주요 대상**: 잣나무
   - **분포**: 중북부 및 고지대 중심
   - **우화 시기**: 4월 중순 ~ 6월 하순 (5월에 최대 우화율 기록)

**감염 경로**: 매개충 성충이 건강한 소나무의 신생 가지(1~2년생)를 갉아먹는 '후식(後食)' 행동을 할 때 발생한 상처를 통해 재선충 사체/유충이 소나무 수체 내로 대량 침입하게 됩니다.`;
  }
  if (q.includes("방제") || q.includes("나무주사") || q.includes("훈증") || q.includes("파쇄")) {
    return `**[소나무재선충병 방제 특별법 및 작업 요령]**
감염목 또는 감염 의심 고사목에 대하여 다음의 표준 방제 기법을 엄격히 시행합니다:
1. **훈증 (Fumigation)**:
   - 벌채한 소나무를 규격화하여 쌓아 올린 후 메탐소듐(Metham-sodium) 등 액제를 살포하고, 노란색 고기밀성 타프(훈증 천막)로 밀폐하여 Nematode(재선충)와 매개충 유충을 모두 박멸합니다. 천막의 훼손 유무를 지속 감전(COM-002) 모니터링해야 합니다.
2. **파쇄 (Shredding/Chipping)**:
   - 벌채된 목재를 대형 목재 파쇄기(Wood Chipper)에 투입하여 1.5cm 이하의 크기로 분쇄합니다. 이는 물리적으로 매개충 번데기 및 섬유질 내 재선충을 파괴하는 가장 확실하고 친환경적인 수단입니다.
3. **예방 나무주사 (Preventive Trunk Injection)**:
   - 감염 이전의 건전한 우량 소나무림을 대상으로 아바멕틴(Abamectin) 또는 에마멕틴벤조에이트(Emamectin benzoate) 유제를 천공기를 통해 주입합니다. 지속 기간은 약 2년입니다.`;
  }
  if (q.includes("증상") || q.includes("갈변") || q.includes("황변") || q.includes("의심")) {
    return `**[소나무재선충병 감염목 식별 핵심 증상]**
예찰 요원(FLD) 및 시민 제보(FLD-004) 확인 시 다음의 3대 외부 징후를 판독합니다:
1. **잎의 급격한 변색**:
   - 봄~여름철 수관부(나무 상부)의 일부 나뭇잎이 연녹색에서 황색, 그리고 점차 적갈색으로 변합니다. 가을철 자연 낙엽과 달리 수주 내에 전체 잎이 완전히 고사하는 특징이 있습니다.
2. **수지(송진) 분비 저하**:
   - Nematode가 가도(수분 이동 통로)를 폐쇄하기 때문에 소나무의 압력이 급감합니다. 이에 따라 수관부에 상처를 내거나 예찰 구멍을 뚫어도 송진이 거의 흘러내리지 않거나 전혀 배출되지 않습니다.
3. **수피(나무껍질) 이탈 및 매개충 산란 흔적**:
   - 죽은 소나무 기둥 주위에 솔수염하늘소가 산란한 징두리 형태의 가해 상처 및 갉아먹은 목질 진흙(배설물)이 검출될 수 있습니다.`;
  }
  if (q.includes("위험") || q.includes("격자") || q.includes("예측") || q.includes("점수")) {
    return `**[AI 기반 500m 격자 위험도 예측 엔진 정의 (HOM-001)]**
본 통합 플랫폼은 전국 산림 구역을 500m x 500m 격자(총 약 37만 개)로 정밀 분할하여 분석합니다:
- **모델 사양**: XGBoost 및 SHAP(Shapley Additive exPlanations) 설명 모델 기반 v2.3.1 예측 엔진
- **주요 설명 변수(Feature)**:
  1. **인접 확진 이력**: 주변 격자의 전년도/전분기 확진목 발생 밀도 (가장 영향력 높음)
  2. **환경 조건**: 고도(Elevation), 기온(Temperature), 전월 대비 누적 강수량 변화(Precipitation)
  3. **수림 구성**: 해당 격자 내 소나무·해송림 분포 면적 비율
- **산출 결과**: 0.000 ~ 1.000 사이의 실시간 \`risk_score\`를 생성하며, 이를 기준으로 상(0.7 이상), 중(0.4~0.7), 주의(0.2~0.4), 하(0.2 미만)의 4단계 위험등급을 부여해 방제 우선순위(CTR-008)를 도출합니다.`;
  }

  return `안녕하세요! **소나무재선충병 통합예찰·방제 지원 플랫폼**의 전문 대화형 AI 가이드입니다.

현재 질문하신 내용(\"${msg}\")에 대해 백서 및 방제 지침서를 분석하고 있습니다. 다음과 같은 구체적인 주제를 질의하시면 보다 전문적인 매뉴얼 정보를 안내받으실 수 있습니다:
- **매개충 종류와 성충 활동/우화 시기** (솔수염하늘소, 북방수염하늘소 비교)
- **표준 방제 기법 지침** (훈증 타프 밀폐, 파쇄 칩 크기 규격, 예방 나무주사 원리)
- **감염목 육안 판독 증상** (수관부 적갈색 변색, 송진 분비 중단 검사 방법)
- **500m 격자 위험점수 모델 설명** (XGBoost 입력 피처, SHAP 원인 분석 기법)`;
}

// Vite integration middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Forestry Integrated Control Full-Stack Server running on port ${PORT}`);
  });
}

startServer();
