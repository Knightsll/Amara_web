import { log } from '../utils/logger.js';
import { initOpusDecoder, registerPlaybackChunkListener } from '../app/audio.js';
import { state } from '../app/state.js';
import { SAMPLE_RATE, CHANNELS, MIN_AUDIO_DURATION } from '../app/constants.js';

const FRAME_SIZE = 960;
const FRAME_SIZE_BYTES = FRAME_SIZE * CHANNELS * 2;
const CHUNK_SAMPLES = Math.max(1, Math.round(SAMPLE_RATE * MIN_AUDIO_DURATION * 3));

function encodeWav(int16Samples, sampleRate, channels) {
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = int16Samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    let offset = 0;

    const writeString = (str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset++, str.charCodeAt(i));
        }
    };

    writeString('RIFF');
    view.setUint32(offset, 36 + dataSize, true); offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, channels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString('data');
    view.setUint32(offset, dataSize, true); offset += 4;

    for (let i = 0; i < int16Samples.length; i++, offset += 2) {
        view.setInt16(offset, int16Samples[i], true);
    }

    return new Uint8Array(buffer);
}

async function createStandaloneOpusDecoder() {
    const baseDecoder = await initOpusDecoder();
    const mod = baseDecoder.module;
    const decoderSize = mod._opus_decoder_get_size(CHANNELS);
    const decoderPtr = mod._malloc(decoderSize);
    if (!decoderPtr) {
        throw new Error('无法分配NeuroSync专用解码器内存');
    }
    const err = mod._opus_decoder_init(decoderPtr, SAMPLE_RATE, CHANNELS);
    if (err < 0) {
        mod._free(decoderPtr);
        throw new Error(`NeuroSync专用解码器初始化失败: ${err}`);
    }

    return {
        module: mod,
        decoderPtr,
        decode(opusData) {
            try {
                const opusPtr = mod._malloc(opusData.length);
                mod.HEAPU8.set(opusData, opusPtr);
                const pcmPtr = mod._malloc(FRAME_SIZE_BYTES);
                const decodedSamples = mod._opus_decode(
                    decoderPtr,
                    opusPtr,
                    opusData.length,
                    pcmPtr,
                    FRAME_SIZE,
                    0
                );
                if (decodedSamples < 0) {
                    mod._free(opusPtr);
                    mod._free(pcmPtr);
                    throw new Error(`解码失败: ${decodedSamples}`);
                }
                const pcm = new Int16Array(decodedSamples);
                for (let i = 0; i < decodedSamples; i++) {
                    pcm[i] = mod.HEAP16[(pcmPtr >> 1) + i];
                }
                mod._free(opusPtr);
                mod._free(pcmPtr);
                return pcm;
            } catch (error) {
                log(`NeuroSync解码错误: ${error.message}`, 'error');
                return new Int16Array(0);
            }
        },
        destroy() {
            if (this.decoderPtr) {
                this.module._free(this.decoderPtr);
            }
        }
    };
}

function extractBlendshapeFrames(response, fallbackDuration) {
    if (!response) return [];
    let frames = [];
    if (Array.isArray(response)) {
        frames = response;
    } else if (Array.isArray(response.frames)) {
        frames = response.frames;
    } else if (Array.isArray(response.blendshapes)) {
        frames = response.blendshapes;
    } else if (response.values && typeof response.values === 'object') {
        frames = [{ time: 0, values: response.values }];
    } else {
        frames = [{ time: 0, values: response }];
    }

    const duration = Math.max(fallbackDuration, 0.0001);
    if (!frames.length) return [];

    return frames.map((frame, index) => {
        const time = typeof frame.time === 'number'
            ? Math.max(0, Math.min(duration, frame.time))
            : (duration / Math.max(frames.length, 1)) * index;
        const values = frame.values && typeof frame.values === 'object'
            ? frame.values
            : frame;
        return { time, values };
    });
}

export function initNeuroSyncForwarder({
    apiUrlInput,
    statusElement,
    resultElement
}) {
    let collecting = false;
    let pcmAccumulator = new Int16Array(0);
    let decoderPromise = null;
    let chunkSequence = 0;
    let postQueue = Promise.resolve();
    const chunkStates = new Map(); // index -> { promise, resolve, data }
    const scheduledTimers = new Set();
    let lastPostAbort = null;

    function updateStatus(text, level = 'info') {
        if (statusElement) {
            statusElement.textContent = text;
            statusElement.dataset.level = level;
        }
        log(text, level);
    }

    async function ensureDecoder() {
        if (!decoderPromise) {
            decoderPromise = createStandaloneOpusDecoder().catch(error => {
                decoderPromise = null;
                throw error;
            });
        }
        return decoderPromise;
    }

    function resetSession() {
        scheduledTimers.forEach(timer => clearTimeout(timer));
        scheduledTimers.clear();
        pcmAccumulator = new Int16Array(0);
        chunkSequence = 0;
        postQueue = Promise.resolve();
        chunkStates.clear();
        if (resultElement) {
            resultElement.textContent = '(等待返回结果)';
        }
    }

    async function consumeBinaryFrame(data) {
        if (!collecting) return;
        try {
            const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
            if (!(arrayBuffer instanceof ArrayBuffer)) return;
            const opusData = new Uint8Array(arrayBuffer);
            if (!opusData.length) return;
            const decoder = await ensureDecoder();
            const pcm = decoder.decode(opusData);
            if (!pcm.length) return;

            const merged = new Int16Array(pcmAccumulator.length + pcm.length);
            merged.set(pcmAccumulator, 0);
            merged.set(pcm, pcmAccumulator.length);
            pcmAccumulator = merged;

            while (pcmAccumulator.length >= CHUNK_SAMPLES) {
                const chunk = pcmAccumulator.slice(0, CHUNK_SAMPLES);
                pcmAccumulator = pcmAccumulator.slice(CHUNK_SAMPLES);
                enqueueChunk(chunk);
            }
        } catch (error) {
            updateStatus(`解码音频帧失败: ${error.message}`, 'error');
        }
    }

    function enqueueChunk(int16Samples, { finalChunk = false } = {}) {
        const index = chunkSequence++;
        let resolveBlendshape;
        let rejectBlendshape;
        const blendshapePromise = new Promise((resolve, reject) => {
            resolveBlendshape = resolve;
            rejectBlendshape = reject;
        });

        const chunkState = {
            index,
            promise: blendshapePromise,
            resolve: resolveBlendshape,
            reject: rejectBlendshape,
            blendshape: null,
            duration: int16Samples.length / SAMPLE_RATE,
            finalChunk
        };
        chunkStates.set(index, chunkState);

        postQueue = postQueue.then(() => postChunkToApi(int16Samples, index))
            .then(response => {
                chunkState.blendshape = response;
                chunkState.resolve(response);
            })
            .catch(error => {
                updateStatus(`NeuroSync 请求失败 (chunk ${index}): ${error.message}`, 'error');
                chunkState.resolve(null); // 允许音频继续播放
            });
    }

    async function postChunkToApi(int16Samples, index) {
        const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
        if (!apiUrl) {
            throw new Error('NeuroSync API 地址为空');
        }
        const wavBytes = encodeWav(int16Samples, SAMPLE_RATE, CHANNELS);
        const controller = new AbortController();
        lastPostAbort = controller;
        updateStatus(`发送第 ${index + 1} 个音频块到 NeuroSync...`, 'info');
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: wavBytes,
                signal: controller.signal
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`${response.status} ${text}`);
            }
            const json = await response.json().catch(() => null);
            if (resultElement) {
                resultElement.textContent = JSON.stringify(json ?? {}, null, 2);
            }
            updateStatus(`NeuroSync 块 ${index + 1} 响应成功`, 'success');
            return json;
        } finally {
            if (lastPostAbort === controller) {
                lastPostAbort = null;
            }
        }
    }

    function handleServerMessage(message) {
        if (!message || message.type !== 'tts') return;
        if (message.state === 'start') {
            collecting = true;
            resetSession();
            updateStatus('开始收集小智语音流...', 'info');
        } else if (message.state === 'stop') {
            collecting = false;
            if (pcmAccumulator.length) {
                enqueueChunk(pcmAccumulator.slice(), { finalChunk: true });
                pcmAccumulator = new Int16Array(0);
            }
        }
    }

    registerPlaybackChunkListener((chunkInfo) => {
        const chunkState = chunkStates.get(chunkInfo.index);
        if (!chunkState) {
            return null;
        }
        return {
            beforePlay: chunkState.promise,
            onStart: ({ startTime, audioContext }) => {
                if (!chunkState.blendshape) return;
                const viewer = state.blendshapeViewer;
                if (!viewer || typeof viewer.applyBlendshapeFrame !== 'function') return;
                const frames = extractBlendshapeFrames(chunkState.blendshape, chunkState.duration);
                frames.forEach(frame => {
                    const delay = Math.max(0, frame.time);
                    const targetTime = startTime + delay;
                    const msDelay = Math.max(0, (targetTime - audioContext.currentTime) * 1000);
                    const timerId = setTimeout(() => {
                        scheduledTimers.delete(timerId);
                        try {
                            viewer.applyBlendshapeFrame(frame.values);
                        } catch (error) {
                            log(`应用NeuroSync表情帧失败: ${error.message}`, 'warning');
                        }
                    }, msDelay);
                    scheduledTimers.add(timerId);
                });
            },
            onEnd: () => {
                chunkStates.delete(chunkInfo.index);
            }
        };
    });

    window.addEventListener('beforeunload', () => {
        if (lastPostAbort) {
            lastPostAbort.abort();
        }
        decoderPromise?.then(decoder => decoder.destroy()).catch(() => {});
    });

    return {
        consumeBinaryFrame,
        handleServerMessage,
        cancelPendingUpload() {
            if (lastPostAbort) {
                lastPostAbort.abort();
            }
            scheduledTimers.forEach(timer => clearTimeout(timer));
            scheduledTimers.clear();
        }
    };
}
