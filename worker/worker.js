const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = {
  text: "google/gemini-2.5-flash-lite",
  vision: "google/gemini-2.5-flash",
  audio: "openai/gpt-4o-mini-audio-preview",
  fallback: "openai/gpt-4o-mini"
};

const MODEL_WHITELIST = new Set([
  MODELS.text,
  MODELS.vision,
  MODELS.fallback,
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct",
  "deepseek/deepseek-chat"
]);

const SYSTEM_PROMPT = [
"당신은 견적서 자동입력 변환기입니다.",
"사용자의 자연어(텍스트/음성 전사/이미지)에서 견적 정보만 추출해, 아래 JSON 스키마에 정확히 맞는 JSON 하나만 출력하세요.",
"",
"규칙:",
"1. 출력은 JSON 객체 하나뿐입니다. 코드펜스, 설명, 주석, 양식 문구를 절대 만들지 마세요. 값만 제공합니다.",
"2. 금액(수량, 단가)은 정수입니다. 예: 50000",
"3. taxIncluded가 true이면 사용자가 말한 단가가 부가세 포함 금액이라는 뜻이며, 시스템이 별도 금액으로 환산하므로 단가는 사용자가 말한 값 그대로 넣으세요. 별도/불명이면 false.",
"4. unit은 품목 단위이며 없으면 \"개\"를 사용하세요. 예: 개, 세트, 식, 장",
"5. 날짜는 YYYY-MM-DD로 출력하세요. \"10월 20일\"처럼 연도가 없으면 제공된 오늘 날짜의 연도를 사용하세요.",
"6. 사용자가 견적일을 정하지 않았으면 issueDate에 오늘 날짜를 넣으세요.",
"7. 유효기간을 모르면 validUntil은 빈 문자열로 두세요(시스템이 기본값을 적용합니다).",
"8. 없는 값은 모두 빈 문자열(\"\") 또는 0으로 두고, 임의로 만들어내지 마세요.",
"9. 품목은 최대 20개까지 추출하세요.",
"10. 견적 관련 정보가 전혀 없으면 모든 값을 빈 값으로 두세요.",
"",
"스키마:",
"{",
'  "docNumber": "문서번호, 없으면 빈 문자열",',
'  "issueDate": "YYYY-MM-DD",',
'  "clientName": "견적 받을 고객 담당자 또는 상호 (귀하 앞에 들어갈 이름)",',
'  "validUntil": "견적 유효기간 텍스트",',
'  "supplierBizNo": "공급자 사업자등록번호",',
'  "supplierCeo": "공급자 대표자명",',
'  "supplierCompany": "공급자 상호",',
'  "supplierAddress": "공급자 주소",',
'  "supplierPhone": "공급자 연락처",',
'  "supplierBizType": "업태",',
'  "supplierBizItem": "종목",',
'  "items": [ { "name": "품목명", "spec": "규격 및 사양", "qty": 1, "unit": "개", "unitPrice": 0, "note": "비고" } ],',
'  "taxIncluded": false,',
'  "account": "입금 계좌번호 (은행명 포함)",',
'  "manager": "작성 담당자",',
'  "notes": "기타 비고 (납기일, 결제조건 등 포함)"',
"}"
].join("\n");

const MAX_TEXT = 8000;
const MAX_IMAGE_CHARS = 7 * 1024 * 1024;
const MAX_AUDIO_CHARS = 14 * 1024 * 1024;

const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 60000, max = 30;
  const arr = (hits.get(ip) || []).filter(function(t) { return now - t < win; });
  if (arr.length >= max) return true;
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function cors(resp, request, env) {
  const origin = request.headers.get("origin") || "";
  const list = allowedOrigins(env);
  if (origin && list.length && list.indexOf(origin) !== -1) {
    resp.headers.set("access-control-allow-origin", origin);
    resp.headers.set("vary", "origin");
  } else if (origin && !list.length) {
    resp.headers.set("access-control-allow-origin", origin);
    resp.headers.set("vary", "origin");
  }
  resp.headers.set("access-control-allow-methods", "POST, OPTIONS");
  resp.headers.set("access-control-allow-headers", "content-type");
  resp.headers.set("access-control-max-age", "86400");
  return resp;
}

function allowedOrigins(env) {
  if (!env || !env.ALLOWED_ORIGINS) return [];
  return env.ALLOWED_ORIGINS.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
}

function originBlocked(request, env) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return false;
  const list = allowedOrigins(env);
  if (!list.length) return false;
  return list.indexOf(origin) === -1;
}

function validateImage(v) {
  const s = String(v || "");
  if (!s) return null;
  if (s.indexOf("data:image/") !== 0) throw new Error("지원하지 않는 이미지 형식입니다");
  if (s.length > MAX_IMAGE_CHARS) throw new Error("이미지가 너무 큽니다");
  return s;
}

function buildUserText(text, image) {
  const today = new Date().toISOString().slice(0, 10);
  const intro = "오늘 날짜: " + today + "\n아래 입력을 견적서 JSON으로 변환하세요.";
  const body = text
    ? intro + "\n\n[사용자 입력]\n" + text
    : intro + "\n\n첨부된 이미지에서 견적 정보를 추출하세요.";
  return body;
}

async function chat(env, reqBody) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.OPENROUTER_API_KEY,
      "Content-Type": "application/json",
      "X-Title": "Quote Auto-Input AI"
    },
    body: JSON.stringify(reqBody)
  });
  if (!res.ok) {
    let msg = "AI 서비스 오류 (" + res.status + ")";
    try {
      const err = await res.json();
      if (err && err.error && err.error.message) msg = err.error.message;
    } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return text;
}

function extractJson(text) {
  const t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("모델이 JSON을 반환하지 않았습니다");
  return JSON.parse(body.slice(start, end + 1));
}

async function handleConvert(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "잘못된 요청 형식입니다" }, 400); }
  let image;
  try { image = validateImage(body.image); } catch (e) { return json({ error: e.message }, 400); }
  const text = String(body.text || "").slice(0, MAX_TEXT).trim();
  if (!text && !image) return json({ error: "변환할 내용이 없습니다" }, 400);

  const choice = MODEL_WHITELIST.has(body.model) ? body.model : "auto";
  const model = choice === "auto" ? (image ? MODELS.vision : MODELS.text) : choice;

  const parts = [{ type: "text", text: buildUserText(text, image) }];
  if (image) parts.push({ type: "image_url", image_url: { url: image } });

  const reqBody = {
    model: model,
    temperature: 0.1,
    max_tokens: 2500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: parts }
    ]
  };

  try {
    const raw = await chat(env, reqBody);
    return json({ data: extractJson(raw), modelUsed: model });
  } catch (err) {
    if (choice === "auto" && model !== MODELS.fallback) {
      reqBody.model = MODELS.fallback;
      const raw = await chat(env, reqBody);
      return json({
        data: extractJson(raw),
        modelUsed: MODELS.fallback,
        fallbackReason: String(err.message || err)
      });
    }
    throw err;
  }
}

async function handleTranscribe(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "잘못된 요청 형식입니다" }, 400); }
  const audio = String(body.audio || "").replace(/\s+/g, "");
  const format = String(body.format || "webm").replace(/[^a-z0-9]/gi, "") || "webm";
  if (audio.length < 100) return json({ error: "오디오 데이터가 없습니다" }, 400);
  if (audio.length > MAX_AUDIO_CHARS) return json({ error: "오디오가 너무 깁니다" }, 413);
  const raw = await chat(env, {
    model: MODELS.audio,
    temperature: 0,
    max_tokens: 800,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "다음 오디오를 한국어 자연어로 정확히 전사하세요. 전사 텍스트만 출력하고 다른 설명은 하지 마세요." },
        { type: "input_audio", input_audio: { data: audio, format: format } }
      ]
    }]
  });
  return json({ text: String(raw || "").trim() });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request, env);

    const url = new URL(request.url);
    const isApi = url.pathname === "/api/convert" || url.pathname === "/api/transcribe";
    if (!isApi) return cors(json({ error: "not found" }, 404), request, env);

    if (originBlocked(request, env)) return json({ error: "허용되지 않은 출처입니다" }, 403);

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (limited(ip)) return cors(json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요" }, 429), request, env);

    if (!env.OPENROUTER_API_KEY) return cors(json({ error: "서버에 API 키가 설정되지 않았습니다" }, 500), request, env);
    if (request.method !== "POST") return cors(json({ error: "POST만 지원합니다" }, 405), request, env);

    try {
      if (url.pathname === "/api/convert") return cors(await handleConvert(request, env), request, env);
      return cors(await handleTranscribe(request, env), request, env);
    } catch (err) {
      return cors(json({ error: (err && err.message) || "서버 오류" }, 500), request, env);
    }
  }
};
