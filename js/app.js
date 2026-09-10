(function(){
"use strict";

const $=function(s){return document.querySelector(s);};
const els={
  input:$("#inputText"),
  mic:$("#btnMic"),
  interim:$("#interim"),
  imageInput:$("#imageInput"),
  imageBadge:$("#imageBadge"),
  imageBadgeName:$("#imageBadgeName"),
  btnRemoveImage:$("#btnRemoveImage"),
  clearInput:$("#btnClearInput"),
  model:$("#modelSelect"),
  convert:$("#btnConvert"),
  status:$("#status"),
  overlay:$("#sheetOverlay"),
  demo:$("#btnDemo"),
  print:$("#btnPrint"),
  reset:$("#btnReset")
};

els.model.value=localStorage.getItem("or_model_choice")||"auto";

let imageData=null;
let recording=false;
let mediaStream=null;
let mediaRecorder=null;
let chunks=[];

function setStatus(kind,msg){
  els.status.className="status "+kind;
  els.status.textContent=msg;
  els.status.hidden=false;
}
function hideStatus(){els.status.hidden=true;}

function setMicUI(on){
  els.mic.classList.toggle("listening",on);
  els.mic.textContent=on?"■ 중지":"🎤 말하기";
}

function setBusy(b){
  els.convert.disabled=b;
  els.mic.disabled=b;
  els.overlay.hidden=!b;
}

const SR_ERRORS={
  "not-allowed":"마이크 권한이 거부되었습니다. 브라우저 주소창에서 마이크 권한을 허용해 주세요.",
  "service-not-allowed":"음성 인식 서비스 사용이 차단되었습니다.",
  "no-speech":"인식된 음성이 없습니다.",
  "network":"네트워크 문제로 음성 인식에 실패했습니다.",
  "audio-capture":"마이크를 찾을 수 없습니다.",
  "aborted":"음성 인식이 중단되었습니다."
};

const speech=new SpeechInput({
  onInterim:function(text){
    els.input.value=text;
    els.interim.hidden=false;
    els.interim.textContent="🎙 듣고 있습니다… (종료하려면 ■ 중지)";
  },
  onFinal:function(text){
    els.interim.hidden=true;
    if(!text)setStatus("error","인식된 음성이 없습니다. 다시 시도해 주세요.");
  },
  onState:function(state,err){
    if(state==="listening"){
      setMicUI(true);
      setStatus("info","음성 인식 중… 말을 마치면 ■ 중지를 누르세요.");
    }else{
      setMicUI(false);
      if(state==="error"&&err){
        els.interim.hidden=true;
        setStatus("error",SR_ERRORS[err]||("음성 인식 오류: "+err));
      }
    }
  }
});

async function fileToDataUrl(file){
  const dataUrl=await new Promise(function(resolve,reject){
    const r=new FileReader();
    r.onload=function(){resolve(r.result);};
    r.onerror=function(){reject(new Error("파일을 읽지 못했습니다"));};
    r.readAsDataURL(file);
  });
  if(file.size<2*1024*1024)return dataUrl;
  const img=await new Promise(function(resolve,reject){
    const i=new Image();
    i.onload=function(){resolve(i);};
    i.onerror=function(){reject(new Error("이미지를 해석하지 못했습니다"));};
    i.src=dataUrl;
  });
  const max=1600;
  let w=img.width,h=img.height;
  if(w>max||h>max){
    const k=max/Math.max(w,h);
    w=Math.round(w*k);h=Math.round(h*k);
  }
  const c=document.createElement("canvas");
  c.width=w;c.height=h;
  c.getContext("2d").drawImage(img,0,0,w,h);
  return c.toDataURL("image/jpeg",0.85);
}

async function startRecording(){
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    setStatus("error","마이크 권한이 필요합니다. 권한을 허용해 주세요.");
    return;
  }
  chunks=[];
  mediaRecorder=new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
  mediaRecorder.onstop=async function(){
    mediaStream.getTracks().forEach(function(t){t.stop();});
    const blob=new Blob(chunks,{type:mediaRecorder.mimeType||"audio/webm"});
    setBusy(true);
    setStatus("info","녹음을 텍스트로 변환하는 중…");
    try{
      const text=await QuoteAI.transcribeAudio(blob);
      if(!text){
        setStatus("error","인식된 음성이 없습니다. 다시 시도해 주세요.");
      }else{
        els.input.value=(els.input.value?els.input.value+" ":"")+text;
        setStatus("success","음성 전사 완료. 내용 확인 후 ✨ 변환 버튼을 누르세요.");
      }
    }catch(err){
      setStatus("error","음성 전사 실패: "+(err&&err.message||err));
    }finally{
      setBusy(false);
    }
  };
  mediaRecorder.start();
  recording=true;
  setMicUI(true);
  setStatus("info","녹음 중… 말을 마치면 ■ 중지를 누르세요.");
}

function stopRecording(){
  recording=false;
  setMicUI(false);
  if(mediaRecorder&&mediaRecorder.state!=="inactive")mediaRecorder.stop();
}

els.mic.addEventListener("click",function(){
  if(SpeechInput.supported){
    if(speech.listening)speech.stop();
    else speech.start();
    return;
  }
  if(!navigator.mediaDevices||!window.MediaRecorder){
    setStatus("error","이 브라우저는 음성 입력을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.");
    return;
  }
  if(recording)stopRecording();
  else startRecording();
});

els.imageInput.addEventListener("change",async function(){
  const file=els.imageInput.files&&els.imageInput.files[0];
  if(!file)return;
  try{
    imageData=await fileToDataUrl(file);
    els.imageBadgeName.textContent="🖼 "+file.name;
    els.imageBadge.hidden=false;
    setStatus("info","이미지가 첨부되었습니다. 변환 시 이미지 인식 모델이 사용됩니다.");
  }catch(e){
    setStatus("error","이미지를 읽지 못했습니다.");
  }
});

els.btnRemoveImage.addEventListener("click",function(){
  imageData=null;
  els.imageBadge.hidden=true;
  els.imageInput.value="";
});

els.clearInput.addEventListener("click",function(){
  els.input.value="";
  imageData=null;
  els.imageBadge.hidden=true;
  els.imageInput.value="";
  hideStatus();
});

els.model.addEventListener("change",function(){
  localStorage.setItem("or_model_choice",els.model.value);
});

async function convert(){
  const text=els.input.value.trim();
  if(!text&&!imageData){
    setStatus("error","내용을 입력하거나 🎤 음성 / 🖼 이미지로 전달해 주세요.");
    return;
  }
  setBusy(true);
  hideStatus();
  const t0=performance.now();
  try{
    const result=await QuoteAI.convertToQuote({
      choice:els.model.value,
      text:text,
      image:imageData
    });
    const filled=QuoteForm.apply(result.data);
    const sec=((performance.now()-t0)/1000).toFixed(1);
    if(filled.filledCount===0&&filled.items===0){
      setStatus("error","견적 관련 정보를 찾지 못했습니다. 품목·수량·단가·공급자 정보 등을 포함해 다시 입력해 주세요.");
    }else{
      let msg="✅ 변환 완료 · "+(result.modelUsed||"AI")+" · "+sec+"초";
      if(result.fallbackReason)msg+=" (대체 모델 사용: "+result.fallbackReason+")";
      setStatus("success",msg);
    }
  }catch(err){
    setStatus("error","변환 실패: "+(err&&err.message||"알 수 없는 오류"));
  }finally{
    setBusy(false);
  }
}

els.convert.addEventListener("click",convert);

els.input.addEventListener("keydown",function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==="Enter")convert();
});

const DEMO={
  docNumber:"",
  issueDate:new Date().toISOString().slice(0,10),
  clientName:"홍길동 팀장",
  validUntil:"",
  supplierBizNo:"123-45-67890",
  supplierCeo:"김한빛",
  supplierCompany:"(주)한빛테크",
  supplierAddress:"서울특별시 강남구 테헤란로 123, 5층",
  supplierPhone:"02-9876-5432",
  supplierBizType:"서비스",
  supplierBizItem:"인쇄·디자인",
  items:[
    {name:"전단지",spec:"a4 / 아트지 150g",qty:5,unit:"개",unitPrice:50000,note:""},
    {name:"명함 제작",spec:"90×50mm / 500장",qty:1,unit:"세트",unitPrice:150000,note:"양면 컬러"},
    {name:"현수막",spec:"1200×300mm",qty:2,unit:"개",unitPrice:80000,note:""}
  ],
  taxIncluded:false,
  account:"국민은행 123-456-789012 (주)한빛테크",
  manager:"이준호",
  notes:"납기: 발주 후 3영업일 / 대량 주문 시 단가 협의 가능"
};

els.demo.addEventListener("click",function(){
  QuoteForm.apply(DEMO);
  setStatus("info","예시 데이터로 견적서를 채웠습니다.");
});

els.print.addEventListener("click",function(){window.print();});

els.reset.addEventListener("click",function(){
  QuoteForm.reset();
  els.input.value="";
  imageData=null;
  els.imageBadge.hidden=true;
  els.imageInput.value="";
  hideStatus();
});

QuoteForm.reset();

setStatus("info","텍스트·음성·이미지 중 편한 방법으로 내용을 전달하고 ✨ 변환을 누르세요.");
})();
