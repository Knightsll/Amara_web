import { log } from '../utils/logger.js';
import { checkOpusLoaded, initOpusEncoder } from '../opus.js';
import { createStreamingContext } from '../StreamingContext.js';
import { state } from './state.js';
import { dom, getVisualizerContext } from './dom.js';
import { SAMPLE_RATE, CHANNELS, FRAME_SIZE, MIN_AUDIO_DURATION } from './constants.js';
import { addMessage } from '../document.js';

const queue = state.queue;
let visualizerContext = getVisualizerContext();

export function resetVisualizerContext() {
    visualizerContext = getVisualizerContext();
}

export function getAudioContextInstance() {
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: SAMPLE_RATE,
            latencyHint: 'interactive'
        });
        log('创建音频上下文，采样率: ' + SAMPLE_RATE + 'Hz', 'debug');
    }
    return state.audioContext;
}

export function initVisualizer() {
    if (!visualizerContext) {
        visualizerContext = getVisualizerContext();
    }
    dom.visualizerCanvas.width = dom.visualizerCanvas.clientWidth;
    dom.visualizerCanvas.height = dom.visualizerCanvas.clientHeight;
    visualizerContext.fillStyle = '#fafafa';
    visualizerContext.fillRect(0, 0, dom.visualizerCanvas.width, dom.visualizerCanvas.height);
}

export function drawVisualizer(dataArray) {
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

export async function startAudioBuffering() {
    log("开始音频缓冲...", 'info');
    initOpusDecoder().catch(error => {
        log(`预初始化Opus解码器失败: ${error.message}`, 'warning');
    });
    const timeout = 300;
    while (true) {
        const packets = await queue.dequeue(3, timeout, (count) => {
            log(`缓冲超时，当前缓冲包数: ${count}，开始播放`, 'info');
        });
        if (packets.length) {
            log(`已缓冲 ${packets.length} 个音频包，开始播放`, 'info');
            state.streamingContext.pushAudioBuffer(packets);
        }
        while (true) {
            const data = await queue.dequeue(99, 50);
            if (data.length) {
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
            try {
                state.opusDecoder = await initOpusDecoder();
                if (!state.opusDecoder) {
                    throw new Error('解码器初始化失败');
                }
                log('Opus解码器初始化成功', 'success');
            } catch (error) {
                log('Opus解码器初始化失败: ' + error.message, 'error');
                state.isAudioPlaying = false;
                return;
            }
        }

        if (!state.streamingContext) {
            state.streamingContext = createStreamingContext(
                state.opusDecoder,
                state.audioContext,
                SAMPLE_RATE,
                CHANNELS,
                MIN_AUDIO_DURATION
            );
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

    if (typeof window.ModuleInstance === 'undefined') {
        if (typeof Module !== 'undefined') {
            window.ModuleInstance = Module;
            log('使用全局Module作为ModuleInstance', 'info');
        } else {
            throw new Error('Opus库未加载，ModuleInstance和Module对象都不存在');
        }
    }

    const mod = window.ModuleInstance;
    const opusDecoder = {
        channels: CHANNELS,
        rate: SAMPLE_RATE,
        frameSize: FRAME_SIZE,
        module: mod,
        decoderPtr: null,
        init: function () {
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
        decode: function (opusData) {
            if (!this.decoderPtr) {
                if (!this.init()) {
                    throw new Error('解码器未初始化且无法初始化');
                }
            }
            const opusPtr = mod._malloc(opusData.length);
            mod.HEAPU8.set(opusData, opusPtr);
            const pcmPtr = mod._malloc(this.frameSize * 2);
            const decodedSamples = mod._opus_decode(this.decoderPtr, opusPtr, opusData.length, pcmPtr, this.frameSize, 0);
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
        },
        destroy: function () {
            if (this.decoderPtr) {
                this.module._free(this.decoderPtr);
                this.decoderPtr = null;
            }
        }
    };

    if (!opusDecoder.init()) {
        throw new Error('Opus解码器初始化失败');
    }

    state.opusDecoder = opusDecoder;
    return opusDecoder;
}

export async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: SAMPLE_RATE,
                channelCount: 1
            }
        });
        log('已获取麦克风访问权限', 'success');

        state.audioContext = getAudioContextInstance();
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 2048;
        const source = state.audioContext.createMediaStreamSource(stream);
        source.connect(state.analyser);

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
                log('已初始化MediaRecorder (使用WebM标准编码，Opus不支持)', 'warning');
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

            log(`录音结束，已收集的音频块数量: ${state.audioChunks.length}`, 'info');
            if (state.audioChunks.length === 0) {
                log('警告：没有收集到任何音频数据，请检查麦克风是否工作正常', 'error');
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
                log(`已提取Opus数据，大小: ${(opusData.byteLength / 1024).toFixed(2)} KB`, 'info');
                state.websocket.send(opusData);
                log(`已发送Opus音频数据: ${(opusData.byteLength / 1024).toFixed(2)} KB`, 'success');
            } catch (error) {
                log(`音频数据发送失败: ${error.message}`, 'error');
            }
        };

        return true;
    } catch (error) {
        log(`初始化音频失败: ${error.message}`, 'error');
        return false;
    }
}

export async function startRecording() {
    if (state.isRecording) return;

    if (!state.mediaRecorder) {
        const initialized = await initAudio();
        if (!initialized || !state.mediaRecorder) {
            log('无法开始录音: mediaRecorder未初始化', 'error');
            return;
        }
    }

    state.audioChunks = [];
    state.mediaRecorder.start();
    state.isRecording = true;
    log('开始录音', 'info');

    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    drawVisualizer(dataArray);
    dom.recordButton.textContent = '停止录音';
    dom.recordButton.classList.add('recording');
}

export function stopRecording() {
    if (!state.isRecording) return;

    state.mediaRecorder.stop();
    state.isRecording = false;
    dom.recordButton.textContent = '开始录音';
    dom.recordButton.classList.remove('recording');
}

export async function startDirectRecording() {
    if (state.isRecording) return;

    if (!initOpusEncoder()) {
        log('无法启动录音: Opus编码器初始化失败', 'error');
        return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: SAMPLE_RATE,
            channelCount: 1
        }
    });

    state.audioContext = getAudioContextInstance();
    const processorResult = await createAudioProcessor();
    if (!processorResult) {
        log('无法创建音频处理器', 'error');
        return;
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
    } else {
        log('WebSocket未连接，无法发送开始消息', 'error');
        return false;
    }

    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    drawVisualizer(dataArray);

    let recordingSeconds = 0;
    state.recordingTimer = setInterval(() => {
        recordingSeconds += 0.1;
        dom.recordButton.textContent = `停止录音 ${recordingSeconds.toFixed(1)}秒`;
    }, 100);

    dom.recordButton.classList.add('recording');
    dom.recordButton.disabled = false;
    log('开始PCM直接录音', 'success');
}

export function stopDirectRecording() {
    if (!state.isRecording) return;

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
        log('已发送录音停止信号', 'info');
    }

    dom.recordButton.textContent = '开始录音';
    dom.recordButton.classList.remove('recording');
    dom.recordButton.disabled = false;
    log('停止PCM直接录音', 'success');
}

export async function createAudioProcessor() {
    state.audioContext = getAudioContextInstance();
    try {
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
            
*** End Patch
PATCH
