(function(){
"use strict";

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;

class SpeechInput{
  constructor(handlers){
    this.onInterim=(handlers&&handlers.onInterim)||function(){};
    this.onFinal=(handlers&&handlers.onFinal)||function(){};
    this.onState=(handlers&&handlers.onState)||function(){};
    this.rec=null;
    this.listening=false;
    this.finalText="";
  }

  static get supported(){return !!SR;}

  start(){
    if(!SR)throw new Error("이 브라우저는 실시간 음성 인식을 지원하지 않습니다");
    if(this.listening)return;
    this.finalText="";
    const rec=new SR();
    rec.lang="ko-KR";
    rec.continuous=true;
    rec.interimResults=true;
    rec.maxAlternatives=1;
    const self=this;

    rec.onresult=function(e){
      let interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        const r=e.results[i];
        if(r.isFinal){
          self.finalText+=(self.finalText?" ":"")+r[0].transcript;
        }else{
          interim+=r[0].transcript;
        }
      }
      const combined=(self.finalText+" "+interim).trim();
      if(combined)self.onInterim(combined);
    };
    rec.onerror=function(e){
      self.onState("error",e.error);
    };
    rec.onend=function(){
      const had=self.finalText.trim();
      self.listening=false;
      self.rec=null;
      self.onState("idle");
      self.onFinal(had);
    };

    rec.start();
    this.rec=rec;
    this.listening=true;
    this.onState("listening");
  }

  stop(){
    if(this.rec&&this.listening){
      this.listening=false;
      try{this.rec.stop();}catch(e){}
    }
  }
}

window.SpeechInput=SpeechInput;
})();
