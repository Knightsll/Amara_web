import { log } from '../utils/logger.js';
import { initOpusEncoder } from '../opus.js';
import { createStreamingContext } from '../StreamingContext.js';
import { state } from './state.js';
import { dom, getVisualizerContext } from './dom.js';
import { SAMPLE_RATE, CHANNELS, FRAME_SIZE, MIN_AUDIO_DURATION } from './constants.js';

let visualizerContext = getVisualizerContext();
let sendCommandToBridge = () => {};
const pendingChunkListeners = [];

export function configureAudio({ sendCommand } = {}) {
    sendCommandToBridge = typeof sendCommand === 'function' ? sendCommand : () => {};
}

export function registerPlaybackChunkListener(listener) {
    if (typeof listener !== 'function') return;
    if (state.streamingContext && typeof state.streamingContext.registerChunkListener === 'function') {
        state.streamingContext.registerChunkListener(listener);
    } else {
        pendingChunkListeners.push(listener);
    }
}

export function getAudioContextInstance() {
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: SAMPLE_RATE,
            latencyHint: 'interactive'
        });
        log(`创建音频上下文，采样率: ${SAMPLE_RATE}Hz`, 'debug');
    }
    return state.audioContext;
}

export function initVisualizer() {
    if (!dom.visualizerCanvas) return;
    if (!visualizerContext) {
        visualizerContext = getVisualizerContext();
    }
    if (!visualizerContext) return;
    dom.visualizerCanvas.width = dom.visualizerCanvas.clientWidth;
    dom.visualizerCanvas.height = dom.visualizerCanvas.clientHeight;
    visualizerContext.fillStyle = '#fafafa';
    visualizerContext.fillRect(0, 0, dom.visualizerCanvas.width, dom.visualizerCanvas.height);
}

export function drawVisualizer(dataArray) {
    if (!state.analyser || !visualizerContext || !dom.visualizerCanvas) return;
    state.visualizationRequest = requestAnimationFrame(() => drawVisualizer(dataArray));
    if (!state.isRecording) return;
    state.analyser.getByteFrequencyData(dataArray);
    visualizerContext.fillStyle = '#fafafa';
    visualizerContext.fillRect(0, 0, dom.visualizerCanvas.width, dom.visualizerCanvas.height);
    const barWidth = (dom.visualizerCanvas.width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2;
        visualizerContext.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
        visualizerContext.fillRect(x, dom.visualizerCanvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

export async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: SAMPLE_RATE,
                channelCount: CHANNELS
            }
        });
        log('已获取麦克风访问权限', 'success');

        state.audioContext = getAudioContextInstance();
        if (state.audioContext && state.audioContext.state === 'suspended') {
            try {
                await state.audioContext.resume();
                log('音频上下文已在录音前恢复', 'debug');
            } catch (resumeError) {
                log(`恢复音频上下文失败: ${resumeError.message}`, 'warning');
            }
        }
        const source = state.audioContext.createMediaStreamSource(stream);
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048;
        source.connect(state.analyser);

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
            const settings = audioTracks[0].getSettings();
            log(`实际麦克风设置 - 采样率: ${settings.sampleRate || '未知'}Hz, 声道数: ${settings.channelCount || '未知'}`, 'info');
        }

        try {
            state.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: SAMPLE_RATE
            });
            log('已初始化MediaRecorder (使用Opus编码)', 'success');
        } catch (e1) {
            try {
                state.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm',
                    audioBitsPerSecond: SAMPLE_RATE
                });
                log('已初始化MediaRecorder (使用WebM标准编码)', 'warning');
            } catch (e2) {
                try {
                    state.mediaRecorder = new MediaRecorder(stream, {
                        mimeType: 'audio/ogg;codecs=opus',
                        audioBitsPerSecond: SAMPLE_RATE
                    });
                    log('已初始化MediaRecorder (使用OGG+Opus编码)', 'warning');
                } catch (e3) {
                    state.mediaRecorder = new MediaRecorder(stream);
                    log(`已初始化MediaRecorder (使用默认编码: ${state.mediaRecorder.mimeType})`, 'warning');
                }
            }
        }

        state.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.audioChunks.push(event.data);
            }
        };

        state.mediaRecorder.onstop = async () => {
            if (state.visualizationRequest) {
                cancelAnimationFrame(state.visualizationRequest);
                state.visualizationRequest = null;
            }

            if (state.audioChunks.length === 0) {
                log('警告: 没有收集到任何音频数据', 'warning');
                return;
            }

            const blob = new Blob(state.audioChunks, { type: state.audioChunks[0].type });
            state.audioChunks = [];

            try {
                const arrayBuffer = await blob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
                    log('错误：WebSocket连接不存在或未打开', 'error');
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
                log('正在处理音频数据，提取纯Opus帧...', 'info');
                const opusData = extractOpusFrames(uint8Array);
                const payload = opusData instanceof Uint8Array ? opusData : new Uint8Array(opusData);
                const sizeKb = (payload.byteLength / 1024).toFixed(2);
                log(`已提取Opus数据，大小: ${sizeKb} KB`, 'info');
                state.websocket.send(payload.buffer);
                log(`已发送Opus音频数据: ${(payload.byteLength / 1024).toFixed(2)} KB`, 'success');
            } catch (error) {
                log(`音频数据发送失败: ${error.message}`, 'error');
            }
        };

        try {
            if (typeof window.ModuleInstance === 'undefined') {
                throw new Error('Opus库未加载，ModuleInstance对象不存在');
            }
            if (typeof window.ModuleInstance._opus_decoder_get_size === 'function') {
                const testSize = window.ModuleInstance._opus_decoder_get_size(CHANNELS);
                log(`Opus解码器测试成功，解码器大小: ${testSize} 字节`, 'success');
            } else {
                throw new Error('Opus解码函数未找到');
            }
        } catch (err) {
            log(`Opus解码器初始化警告: ${err.message}，将在需要时重试`, 'warning');
        }

        log('音频系统初始化完成', 'success');
        return true;
    } catch (error) {
        log(`音频初始化错误: ${error.message}`, 'error');
        return false;
    }
}

export function startRecording() {
    return startDirectRecording();
}

export function stopRecording() {
    return stopDirectRecording();
}

export async function startDirectRecording() {
    if (state.isRecording) return true;

    try {
        if (!getOpusEncoder()) {
            log('无法启动录音: Opus编码器初始化失败', 'error');
            return false;
        }

        const stream = await (async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('当前环境不支持 getUserMedia，请在 HTTPS/localhost 上运行，并使用现代浏览器');
            }
            return await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: SAMPLE_RATE,
                    channelCount: CHANNELS
                }
            });
        })();
        

        state.audioContext = getAudioContextInstance();
        const processorResult = await createAudioProcessor();
        if (!processorResult) {
            log('无法创建音频处理器', 'error');
            return false;
        }

        state.audioProcessor = processorResult.node;
        state.audioProcessorType = processorResult.type;
        state.audioSource = state.audioContext.createMediaStreamSource(stream);
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048;

        state.audioSource.connect(state.analyser);
        state.audioSource.connect(state.audioProcessor);

        state.pcmDataBuffer = new Int16Array();
        state.audioBuffers = [];
        state.totalAudioSize = 0;
        state.isRecording = true;

        if (state.audioProcessorType === 'worklet' && state.audioProcessor.port) {
            state.audioProcessor.port.postMessage({ command: 'start' });
        }

        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            const listenMessage = { type: 'listen', mode: 'manual', state: 'start' };
            log(`发送录音开始消息: ${JSON.stringify(listenMessage)}`, 'info');
            state.websocket.send(JSON.stringify(listenMessage));
            sendCommandToBridge(listenMessage);
        } else {
            log('WebSocket未连接，无法发送开始消息', 'error');
        }

        if (state.analyser) {
            const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
            drawVisualizer(dataArray);
        }

        let recordingSeconds = 0;
        state.recordingTimer = setInterval(() => {
            recordingSeconds += 0.1;
            if (dom.recordButton) {
                dom.recordButton.textContent = `停止录音 ${recordingSeconds.toFixed(1)}秒`;
            }
        }, 100);

        if (dom.recordButton) {
            dom.recordButton.classList.add('recording');
            dom.recordButton.disabled = false;
        }

        log('开始PCM直接录音', 'success');
        return true;
    } catch (error) {
        log(`直接录音启动错误: ${error.message}`, 'error');
        state.isRecording = false;
        return false;
    }
}

export function stopDirectRecording() {
    if (!state.isRecording) return true;

    try {
        state.isRecording = false;

        if (state.audioProcessor) {
            if (state.audioProcessorType === 'worklet' && state.audioProcessor.port) {
                state.audioProcessor.port.postMessage({ command: 'stop' });
            }
            state.audioProcessor.disconnect();
            state.audioProcessor = null;
        }

        if (state.audioSource) {
            state.audioSource.disconnect();
            state.audioSource = null;
        }

        if (state.visualizationRequest) {
            cancelAnimationFrame(state.visualizationRequest);
            state.visualizationRequest = null;
        }

        if (state.recordingTimer) {
            clearInterval(state.recordingTimer);
            state.recordingTimer = null;
        }

        encodeAndSendOpus();

        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            const emptyOpusFrame = new Uint8Array(0);
            state.websocket.send(emptyOpusFrame);
            const stopMessage = { type: 'listen', mode: 'manual', state: 'stop' };
            state.websocket.send(JSON.stringify(stopMessage));
            sendCommandToBridge(stopMessage);
            log('已发送录音停止信号', 'info');
        }

        if (dom.recordButton) {
            dom.recordButton.textContent = '开始录音';
            dom.recordButton.classList.remove('recording');
            dom.recordButton.disabled = false;
        }

        log('停止PCM直接录音', 'success');
        return true;
    } catch (error) {
        log(`直接录音停止错误: ${error.message}`, 'error');
        return false;
    }
}

export async function createAudioProcessor() {
    state.audioContext = getAudioContextInstance();
    try {
        if (state.audioContext.state === 'suspended') {
            try {
                await state.audioContext.resume();
                log('音频上下文在创建处理器前恢复成功', 'debug');
            } catch (resumeError) {
                log(`创建处理器前恢复音频上下文失败: ${resumeError.message}`, 'warning');
            }
        }

        if (state.audioContext.audioWorklet) {
            const blob = new Blob([audioProcessorCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await state.audioContext.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            const audioProcessor = new AudioWorkletNode(state.audioContext, 'audio-recorder-processor');
            audioProcessor.port.onmessage = (event) => {
                if (event.data.type === 'buffer') {
                    processPCMBuffer(event.data.buffer);
                }
            };
            log('使用AudioWorklet处理音频', 'success');
            return { node: audioProcessor, type: 'worklet' };
        }

        log('AudioWorklet不可用，使用ScriptProcessorNode作为回退方案', 'warning');
        return createScriptProcessorFallback();
    } catch (error) {
        log(`创建音频处理器失败: ${error.message}，尝试回退方案`, 'error');
        return createScriptProcessorFallback();
    }
}

function createScriptProcessorFallback() {
    try {
        const frameSize = 4096;
        const scriptProcessor = state.audioContext.createScriptProcessor(frameSize, 1, 1);
        scriptProcessor.onaudioprocess = (event) => {
            if (!state.isRecording) return;
            const input = event.inputBuffer.getChannelData(0);
            const buffer = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
                buffer[i] = Math.max(-32768, Math.min(32767, Math.floor(input[i] * 32767)));
            }
            processPCMBuffer(buffer);
        };
        const silent = state.audioContext.createGain();
        silent.gain.value = 0;
        scriptProcessor.connect(silent);
        silent.connect(state.audioContext.destination);
        log('使用ScriptProcessorNode作为回退方案成功', 'warning');
        return { node: scriptProcessor, type: 'processor' };
    } catch (fallbackError) {
        log(`回退方案也失败: ${fallbackError.message}`, 'error');
        return null;
    }
}

function processPCMBuffer(buffer) {
    if (!state.isRecording) return;
    const newBuffer = new Int16Array(state.pcmDataBuffer.length + buffer.length);
    newBuffer.set(state.pcmDataBuffer);
    newBuffer.set(buffer, state.pcmDataBuffer.length);
    state.pcmDataBuffer = newBuffer;
    const samplesPerFrame = FRAME_SIZE;
    while (state.pcmDataBuffer.length >= samplesPerFrame) {
        const frameData = state.pcmDataBuffer.slice(0, samplesPerFrame);
        state.pcmDataBuffer = state.pcmDataBuffer.slice(samplesPerFrame);
        encodeAndSendOpus(frameData);
    }
}

function encodeAndSendOpus(pcmData = null) {
    const encoder = getOpusEncoder();
    if (!encoder) {
        log('Opus编码器未初始化', 'error');
        return;
    }

    try {
        if (pcmData) {
            const opusData = encoder.encode(pcmData);
            if (opusData && opusData.length > 0) {
                state.audioBuffers.push(opusData.buffer);
                state.totalAudioSize += opusData.length;
                if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
                    try {
                        state.websocket.send(opusData.buffer);
                        log(`发送Opus帧，大小：${opusData.length}字节`, 'debug');
                    } catch (error) {
                        log(`WebSocket发送错误: ${error.message}`, 'error');
                    }
                }
            } else {
                log('Opus编码失败，无有效数据返回', 'error');
            }
        } else if (state.pcmDataBuffer.length > 0) {
            const samplesPerFrame = FRAME_SIZE;
            if (state.pcmDataBuffer.length < samplesPerFrame) {
                const paddedBuffer = new Int16Array(samplesPerFrame);
                paddedBuffer.set(state.pcmDataBuffer);
                encodeAndSendOpus(paddedBuffer);
            } else {
                encodeAndSendOpus(state.pcmDataBuffer.slice(0, samplesPerFrame));
            }
            state.pcmDataBuffer = new Int16Array(0);
        }
    } catch (error) {
        log(`Opus编码错误: ${error.message}`, 'error');
    }
}

function getOpusEncoder() {
    if (!state.opusEncoder) {
        const encoder = initOpusEncoder();
        if (encoder) {
            state.opusEncoder = encoder;
        }
    }
    return state.opusEncoder;
}

export async function handleBinaryMessage(data, { force = false } = {}) {
    try {
        let arrayBuffer;
        if (data instanceof ArrayBuffer) {
            arrayBuffer = data;
            log(`收到ArrayBuffer音频数据，大小: ${arrayBuffer.byteLength}字节`, 'debug');
        } else if (data instanceof Blob) {
            arrayBuffer = await data.arrayBuffer();
            log(`收到Blob音频数据，大小: ${arrayBuffer.byteLength}字节`, 'debug');
        } else {
            log(`收到未知类型的二进制数据: ${typeof data}`, 'warning');
            return;
        }
        const opusData = new Uint8Array(arrayBuffer);
        if (opusData.length > 0) {
            state.queue.enqueue(opusData);
        } else if (state.streamingContext) {
            state.streamingContext.endOfStream = true;
        }
    } catch (error) {
        log(`处理二进制消息出错: ${error.message}`, 'error');
    }
}

export async function startAudioBuffering() {
    log('开始音频缓冲...', 'info');
    initOpusDecoder().catch(error => {
        log(`预初始化Opus解码器失败: ${error.message}`, 'warning');
    });
    const timeout = 300;
    while (true) {
        const packets = await state.queue.dequeue(3, timeout, (count) => {
            log(`缓冲超时，当前缓冲包数: ${count}，开始播放`, 'info');
        });
        if (packets.length && state.streamingContext) {
            state.streamingContext.pushAudioBuffer(packets);
        }
        while (true) {
            const data = await state.queue.dequeue(99, 50);
            if (data.length && state.streamingContext) {
                state.streamingContext.pushAudioBuffer(data);
            } else {
                break;
            }
        }
    }
}

export async function playBufferedAudio() {
    try {
        state.audioContext = getAudioContextInstance();
        if (!state.opusDecoder) {
            log('初始化Opus解码器...', 'info');
            state.opusDecoder = await initOpusDecoder();
            log('Opus解码器初始化成功', 'success');
        }
        if (!state.streamingContext) {
            state.streamingContext = createStreamingContext(
                state.opusDecoder,
                state.audioContext,
                SAMPLE_RATE,
                CHANNELS,
                MIN_AUDIO_DURATION
            );
            while (pendingChunkListeners.length) {
                const listener = pendingChunkListeners.shift();
                state.streamingContext.registerChunkListener(listener);
            }
        }
        state.streamingContext.decodeOpusFrames();
        state.streamingContext.startPlaying();
    } catch (error) {
        log(`播放已缓冲的音频出错: ${error.message}`, 'error');
        state.isAudioPlaying = false;
        state.streamingContext = null;
    }
}

export async function initOpusDecoder() {
    if (state.opusDecoder) return state.opusDecoder;
    try {
        if (typeof window.ModuleInstance === 'undefined') {
            if (typeof Module !== 'undefined') {
                window.ModuleInstance = Module;
                log('使用全局Module作为ModuleInstance', 'info');
            } else {
                throw new Error('Opus库未加载，ModuleInstance和Module对象都不存在');
            }
        }
        const mod = window.ModuleInstance;
        const decoder = {
            channels: CHANNELS,
            rate: SAMPLE_RATE,
            frameSize: FRAME_SIZE,
            module: mod,
            decoderPtr: null,
            init() {
                if (this.decoderPtr) return true;
                const decoderSize = mod._opus_decoder_get_size(this.channels);
                log(`Opus解码器大小: ${decoderSize}字节`, 'debug');
                this.decoderPtr = mod._malloc(decoderSize);
                if (!this.decoderPtr) {
                    throw new Error('无法分配解码器内存');
                }
                const err = mod._opus_decoder_init(this.decoderPtr, this.rate, this.channels);
                if (err < 0) {
                    this.destroy();
                    throw new Error(`Opus解码器初始化失败: ${err}`);
                }
                log('Opus解码器初始化成功', 'success');
                return true;
            },
            decode(opusData) {
                if (!this.decoderPtr && !this.init()) {
                    throw new Error('解码器未初始化且无法初始化');
                }
                try {
                    const opusPtr = mod._malloc(opusData.length);
                    mod.HEAPU8.set(opusData, opusPtr);
                    const pcmPtr = mod._malloc(this.frameSize * 2);
                    const decodedSamples = mod._opus_decode(
                        this.decoderPtr,
                        opusPtr,
                        opusData.length,
                        pcmPtr,
                        this.frameSize,
                        0
                    );
                    if (decodedSamples < 0) {
                        mod._free(opusPtr);
                        mod._free(pcmPtr);
                        throw new Error(`Opus解码失败: ${decodedSamples}`);
                    }
                    const decodedData = new Int16Array(decodedSamples);
                    for (let i = 0; i < decodedSamples; i++) {
                        decodedData[i] = mod.HEAP16[(pcmPtr >> 1) + i];
                    }
                    mod._free(opusPtr);
                    mod._free(pcmPtr);
                    return decodedData;
                } catch (error) {
                    log(`Opus解码错误: ${error.message}`, 'error');
                    return new Int16Array(0);
                }
            },
            destroy() {
                if (this.decoderPtr) {
                    this.module._free(this.decoderPtr);
                    this.decoderPtr = null;
                }
            }
        };
        if (!decoder.init()) {
            throw new Error('Opus解码器初始化失败');
        }
        state.opusDecoder = decoder;
        return decoder;
    } catch (error) {
        log(`Opus解码器初始化失败: ${error.message}`, 'error');
        state.opusDecoder = null;
        throw error;
    }
}

function extractOpusFrames(uint8Array) {
    // 当前实现返回原始数据，后续可在此解析容器格式以提取纯Opus帧
    return uint8Array;
}

const audioProcessorCode = `
    class AudioRecorderProcessor extends AudioWorkletProcessor {
        constructor() {
            super();
            this.frameSize = 960;
            this.buffer = new Int16Array(this.frameSize);
            this.bufferIndex = 0;
            this.isRecording = false;
            this.port.onmessage = (event) => {
                if (event.data.command === 'start') {
                    this.isRecording = true;
                    this.port.postMessage({ type: 'status', status: 'started' });
                } else if (event.data.command === 'stop') {
                    this.isRecording = false;
                    if (this.bufferIndex > 0) {
                        const finalBuffer = this.buffer.slice(0, this.bufferIndex);
                        this.port.postMessage({ type: 'buffer', buffer: finalBuffer });
                        this.bufferIndex = 0;
                    }
                    this.port.postMessage({ type: 'status', status: 'stopped' });
                }
            };
        }

        process(inputs) {
            if (!this.isRecording) return true;
            const input = inputs[0][0];
            if (!input) return true;
            for (let i = 0; i < input.length; i++) {
                if (this.bufferIndex >= this.frameSize) {
                    this.port.postMessage({ type: 'buffer', buffer: this.buffer.slice(0) });
                    this.bufferIndex = 0;
                }
                this.buffer[this.bufferIndex++] = Math.max(-32768, Math.min(32767, Math.floor(input[i] * 32767)));
            }
            return true;
        }
    }
    registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
`;
