/**
 * LiveNote — offscreen/offscreen.js  (PoC: 탭 오디오 → 온디바이스 STT)
 *
 * service worker 는 MediaStream/AudioContext 를 다룰 수 없으므로,
 * 탭 오디오 캡처와 Gemini Nano(LanguageModel) 받아쓰기를 이 offscreen 문서에서 수행한다.
 *
 * 흐름:
 *   1) background 가 tabCapture.getMediaStreamId 로 받은 streamId 를 넘겨준다.
 *   2) getUserMedia(chromeMediaSource:'tab') 로 탭 오디오 스트림 확보.
 *   3) ScriptProcessor 로 PCM 을 모아 CHUNK_SEC 마다 AudioBuffer 생성.
 *   4) LanguageModel(expectedInputs:[{type:'audio'}]) 로 받아쓰기.
 *   5) 결과를 background/popup 으로 전달(AUDIO_POC_TRANSCRIPT).
 *
 * 본 파일은 PoC 검증용이다(품질·지연 실측). 정식 파이프라인 연결은 이후 단계.
 */
(() => {
  "use strict";

  const CHUNK_SEC = 12; // 받아쓰기 청크 길이(초)
  const TRANSCRIBE_PROMPT =
    "다음은 한국어 주식 방송의 오디오 일부입니다. 들리는 말을 그대로 한국어로 받아써 주세요. " +
    "설명이나 군더더기 없이 받아쓴 문장만 출력하세요. 말이 없으면 빈 문자열을 출력하세요.";

  let stream = null;
  let audioCtx = null;
  let processor = null;
  let sourceNode = null;
  let session = null;
  let running = false;
  let transcribeTimer = null;

  let sampleRate = 16000;
  let pcmChunks = []; // Float32Array[]
  let pcmLength = 0; // 누적 샘플 수
  let busy = false; // 받아쓰기 진행 중이면 다음 청크는 누적만

  function report(kind, payload) {
    chrome.runtime
      .sendMessage({ type: "AUDIO_POC_EVENT", kind, ...payload })
      .catch(() => {});
  }

  function hasApi() {
    return typeof LanguageModel !== "undefined";
  }

  async function ensureSession() {
    if (session) return session;
    if (!hasApi()) throw new Error("LanguageModel API unavailable");

    const availability = await LanguageModel.availability();
    report("status", { status: `availability: ${availability}` });
    if (availability === "unavailable")
      throw new Error("LanguageModel unavailable (기기/플래그 미지원)");

    session = await LanguageModel.create({
      expectedInputs: [{ type: "audio" }],
      expectedOutputs: [{ type: "text", languages: ["ko"] }],
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          report("status", {
            status: `모델 다운로드 ${Math.round((e.loaded || 0) * 100)}%`,
          });
        });
      },
    });
    return session;
  }

  /** 모아둔 PCM 을 AudioBuffer 로 묶는다(모노). */
  function drainToAudioBuffer() {
    if (!pcmLength) return null;
    const merged = new Float32Array(pcmLength);
    let offset = 0;
    for (const c of pcmChunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    pcmChunks = [];
    pcmLength = 0;

    const buf = audioCtx.createBuffer(1, merged.length, sampleRate);
    buf.copyToChannel(merged, 0);
    return buf;
  }

  async function transcribeTick() {
    if (busy || !running) return;
    if (pcmLength < sampleRate * CHUNK_SEC) return; // 아직 청크 분량 안 참
    busy = true;
    const t0 = performance.now();
    const audioBuffer = drainToAudioBuffer();
    try {
      const s = await ensureSession();
      const result = await s.prompt([
        {
          role: "user",
          content: [
            { type: "text", value: TRANSCRIBE_PROMPT },
            { type: "audio", value: audioBuffer },
          ],
        },
      ]);
      const text = (result || "").trim();
      const ms = Math.round(performance.now() - t0);
      console.log(`[LiveNote PoC] (${ms}ms) "${text}"`);
      report("transcript", { text, ms, seconds: CHUNK_SEC });
    } catch (e) {
      console.warn("[LiveNote PoC] transcribe failed:", e?.message || e);
      report("error", { message: e?.message || String(e) });
      // 세션 오염 가능 → 폐기 후 재생성
      try { session?.destroy?.(); } catch (_) {}
      session = null;
    } finally {
      busy = false;
    }
  }

  async function start(streamId) {
    if (running) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });
    } catch (e) {
      report("error", { message: "탭 오디오 캡처 실패: " + (e?.message || e) });
      return;
    }

    audioCtx = new AudioContext();
    sampleRate = audioCtx.sampleRate;
    sourceNode = audioCtx.createMediaStreamSource(stream);

    // ScriptProcessor 로 PCM 수집(모노). AudioWorklet 대비 PoC 용으로 간단.
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      if (!running) return;
      const input = ev.inputBuffer.getChannelData(0);
      pcmChunks.push(new Float32Array(input));
      pcmLength += input.length;
    };

    // 캡처하면 탭 소리가 음소거되므로, 사용자가 계속 들을 수 있게 destination 으로 패스스루.
    sourceNode.connect(processor);
    processor.connect(audioCtx.destination);
    sourceNode.connect(audioCtx.destination);

    running = true;
    report("status", { status: `캡처 시작 (sampleRate=${sampleRate})` });

    // 주기적으로 청크 분량이 차면 받아쓰기
    transcribeTimer = setInterval(transcribeTick, 1000);
  }

  function stop() {
    running = false;
    clearInterval(transcribeTimer);
    transcribeTimer = null;
    try { processor?.disconnect(); } catch (_) {}
    try { sourceNode?.disconnect(); } catch (_) {}
    try { audioCtx?.close(); } catch (_) {}
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    audioCtx = null;
    processor = null;
    sourceNode = null;
    pcmChunks = [];
    pcmLength = 0;
    report("status", { status: "캡처 중지" });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.target !== "offscreen") return;
    if (msg.type === "AUDIO_POC_START") start(msg.streamId);
    else if (msg.type === "AUDIO_POC_STOP") stop();
  });
})();
