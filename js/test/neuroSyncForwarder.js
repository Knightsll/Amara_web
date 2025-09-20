import { log } from '../utils/logger.js';
import { initOpusDecoder, registerPlaybackChunkListener } from '../app/audio.js';
import { state } from '../app/state.js';
import { SAMPLE_RATE, CHANNELS, MIN_AUDIO_DURATION } from '../app/constants.js';
import { parseNeuroSyncBlendshapeFrames, extractRawNeuroSyncFrames, resetNeuroSyncBlendshapeState } from './NeuroSync_to_Three_emotion.js';

const FRAME_SIZE = 960;
const FRAME_SIZE_BYTES = FRAME_SIZE * CHANNELS * 2;
const MIN_FRAMES_PER_CHUNK = 6; // NeuroSync minimum requirement
const CHUNK_SAMPLES = FRAME_SIZE * MIN_FRAMES_PER_CHUNK;

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

export function initNeuroSyncForwarder({
    apiUrlInput,
    statusElement,
    resultElement
}) {
    let collecting = false;
    let pcmAccumulator = new Int16Array(0);
    let decoderPromise = null;
    let chunkSequence = 0;
    const chunkStates = new Map(); // index -> { promise, blendshape, duration, chunkSamples, session }
    const scheduledTimers = new Set();
    const inflightControllers = new Set();
    const blendshapeLog = [];
    let currentSessionId = 0;
    let hasAudioChunk = false;

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
        inflightControllers.forEach(controller => controller.abort());
        inflightControllers.clear();
        pcmAccumulator = new Int16Array(0);
        chunkSequence = 0;
        chunkStates.clear();
        resetNeuroSyncBlendshapeState();
        if (resultElement) {
            resultElement.textContent = '';
        }
        blendshapeLog.length = 0;
        hasAudioChunk = false;
        if (state.streamingContext && typeof state.streamingContext.resetForNewSession === 'function') {
            state.streamingContext.resetForNewSession();
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
        if (!int16Samples || int16Samples.length === 0) {
            return;
        }

        let samples = int16Samples;
        if (samples.length < CHUNK_SAMPLES) {
            const padded = new Int16Array(CHUNK_SAMPLES);
            padded.set(samples);
            samples = padded;
        }

        const index = chunkSequence++;
        let resolveBlendshape;
        const blendshapePromise = new Promise((resolve) => {
            resolveBlendshape = resolve;
        });

        const playbackDuration = Math.max(int16Samples.length, FRAME_SIZE) / SAMPLE_RATE;

        const chunkState = {
            index,
            promise: blendshapePromise,
            resolve: resolveBlendshape,
            blendshape: [],
            duration: playbackDuration,
            finalChunk,
            chunkSamples: samples,
            session: currentSessionId,
            startInfo: null,
            scheduled: false
        };
        chunkStates.set(index, chunkState);
        hasAudioChunk = true;

        postChunkToApi(samples, index)
            .then(response => {
                const parsed = Array.isArray(response?.blendshapes) ? response.blendshapes : response;
                const rawFrames = extractRawNeuroSyncFrames(parsed, { duration: chunkState.duration });
                const frames = parseNeuroSyncBlendshapeFrames(parsed, { duration: chunkState.duration }, rawFrames);
                chunkState.blendshape = frames;
                chunkState.resolve(frames);
                appendBlendshapeLogs(index + 1, rawFrames, chunkState.duration);
                scheduleChunkFrames(chunkState);
            })
            .catch(error => {
                updateStatus(`NeuroSync 请求失败 (chunk ${index}): ${error.message}`, 'error');
                console.warn('[NeuroSync] chunk', index + 1, 'failed:', error);
                chunkState.blendshape = [];
                chunkState.resolve([]);
                scheduleChunkFrames(chunkState);
            });
    }

    function summarizeFrameValues(values) {
        if (!values || typeof values !== 'object') {
            return { nonZeroCount: 0, sample: [] };
        }
        let nonZeroCount = 0;
        const sample = [];
        Object.entries(values).forEach(([key, value]) => {
            const numeric = Number(value) || 0;
            if (Math.abs(numeric) > 1e-6) {
                nonZeroCount += 1;
                if (!key.toLowerCase().includes('blink') && sample.length < 5) {
                    sample.push({ key, value: Number(numeric.toFixed(3)) });
                }
            }
        });
        return { nonZeroCount, sample };
    }

    function scheduleChunkFrames(chunkState) {
        const hasStartInfo = !!chunkState.startInfo;
        const hasFrames = Array.isArray(chunkState.blendshape) && chunkState.blendshape.length > 0;
        const chunkSession = chunkState.session;
        console.log('[NeuroSync] schedule check', {
            chunk: chunkState.index + 1,
            hasStartInfo,
            hasFrames,
            scheduled: chunkState.scheduled,
            chunkSession,
            currentSession: currentSessionId,
            timerCount: scheduledTimers.size
        });
        if (chunkState.scheduled) {
            /* console.log('[NeuroSync] schedule skip', {
                chunk: chunkState.index + 1,
                reason: 'already scheduled'
            }); */
            return;
        }
        if (!chunkState.startInfo) {
            const fallbackContext = state.streamingContext?.audioContext;
            if (fallbackContext) {
                const fallbackStartTime = fallbackContext.currentTime;
                chunkState.startInfo = {
                    startTime: fallbackStartTime,
                    audioContext: fallbackContext,
                    fallback: true
                };
                console.log('[NeuroSync] schedule fallback startInfo', {
                    chunk: chunkState.index + 1,
                    startTime: fallbackStartTime
                });
            } else {
                console.log('[NeuroSync] schedule blocked (missing startInfo)', {
                    chunk: chunkState.index + 1,
                    framesReady: hasFrames
                });
                return;
            }
        }
        if (chunkState.session !== currentSessionId) {
            console.log('[NeuroSync] schedule skip', {
                chunk: chunkState.index + 1,
                reason: 'stale session',
                chunkSession: chunkState.session,
                currentSession: currentSessionId
            });
            return;
        }
        const frames = chunkState.blendshape;
        if (!frames || !frames.length) {
            console.log('[NeuroSync] schedule blocked (no frames)', {
                chunk: chunkState.index + 1
            });
            return;
        }

        const viewer = state.blendshapeViewer;
        if (!viewer || typeof viewer.applyBlendshapeFrame !== 'function') return;

        const { startTime, audioContext } = chunkState.startInfo;

        // const firstFrame = frames[0]?.values || {};
        /*
        const sampleEntries = Object.entries(firstFrame)
            .slice(0, 6)
            .map(([k, v]) => `${k}:${Number(v).toFixed(3)}`);
        const frameDiagnostics = frames.slice(0, 3).map(frame => {
            const values = frame.values || {};
            let nonZeroCount = 0;
            const nonBlinkNonZero = [];
            Object.entries(values).forEach(([key, value]) => {
                const numeric = Number(value) || 0;
                if (Math.abs(numeric) > 1e-6) {
                    nonZeroCount += 1;
                    const isBlinkKey = key.toLowerCase().includes('blink');
                    if (!isBlinkKey && nonBlinkNonZero.length < 5) {
                        nonBlinkNonZero.push({ key, value: Number(numeric.toFixed(3)) });
                    }
                }
            });
            return {
                time: frame.time,
                nonZeroCount,
                sample: nonBlinkNonZero
            };
        });
        console.log('[NeuroSync] schedule chunk', chunkState.index + 1, sampleEntries.join(', '), 'timeOffset', frames[0]?.time ?? 0);
        console.log('[NeuroSync] schedule chunk diagnostics', chunkState.index + 1, frameDiagnostics);
        */

        frames.forEach(frame => {
            const delay = Math.max(0, frame.time);
            const targetTime = startTime + delay;
            const msDelay = Math.max(0, (targetTime - audioContext.currentTime) * 1000);
            const timerId = setTimeout(() => {
                scheduledTimers.delete(timerId);
                const summary = summarizeFrameValues(frame.values);
                console.log('[NeuroSync] frame dispatch', {
                    chunk: chunkState.index + 1,
                    time: frame.time,
                    nonZeroCount: summary.nonZeroCount,
                    sample: summary.sample
                });
                try {
                    viewer.applyBlendshapeFrame(frame.values);
                } catch (error) {
                    log(`应用NeuroSync表情帧失败: ${error.message}`, 'warning');
                }
            }, msDelay);
            scheduledTimers.add(timerId);
        });

        chunkState.scheduled = true;
    }

    function appendBlendshapeLogs(chunkIndex, frames, chunkDuration) {
        if (!frames || !frames.length) return;
        frames.forEach(frame => {
            blendshapeLog.push({
                session: currentSessionId,
                chunk: chunkIndex,
                time: frame.time,
                duration: chunkDuration,
                values: frame.values
            });
        });
    }

    function flushBlendshapeLogsToCsv() {
        // CSV 导出已停用；保留钩子以便后续恢复
        blendshapeLog.length = 0;
    }

    function scheduleBlendshapeLogFlush() {
        const pending = Array.from(chunkStates.values()).map(state => state.promise.catch(() => []));
        if (pending.length === 0) {
            flushBlendshapeLogsToCsv();
            return;
        }
        Promise.allSettled(pending).finally(() => {
            flushBlendshapeLogsToCsv();
        });
    }

    function removeLastServerMessage() {
        const conversation = document.getElementById('conversation');
        if (!conversation) return;
        const children = conversation.children;
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];
            if (child.classList && child.classList.contains('message') && child.classList.contains('server')) {
                conversation.removeChild(child);
                break;
            }
        }
    }

    async function postChunkToApi(int16Samples, index) {
        const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
        if (!apiUrl) {
            throw new Error('NeuroSync API 地址为空');
        }
        const wavBytes = encodeWav(int16Samples, SAMPLE_RATE, CHANNELS);
        const controller = new AbortController();
        inflightControllers.add(controller);
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
            updateStatus(`NeuroSync 块 ${index + 1} 响应成功`, 'success');
            return json;
        } finally {
            inflightControllers.delete(controller);
        }
    }

    function handleServerMessage(message) {
        if (!message || message.type !== 'tts') return;
        if (message.state === 'start') {
            collecting = true;
            resetSession();
            if (state.streamingContext) {
                state.streamingContext.playbackChunkIndex = 0;
            }
            currentSessionId = Date.now();
            updateStatus('Collecting audio stream...', 'info');
        } else if (message.state === 'stop') {
            collecting = false;
            if (pcmAccumulator.length) {
                enqueueChunk(pcmAccumulator.slice(), { finalChunk: true });
                pcmAccumulator = new Int16Array(0);
            }
            if (!hasAudioChunk) {
                removeLastServerMessage();
            }
            scheduleBlendshapeLogFlush();
        }
    }

    registerPlaybackChunkListener((chunkInfo) => {
        const chunkState = chunkStates.get(chunkInfo.index);
        if (!chunkState || chunkState.session !== currentSessionId) {
            return null;
        }
        console.log('[NeuroSync] playback listener registered', {
            chunk: chunkInfo.index + 1,
            chunkStateFound: !!chunkState,
            chunkSession: chunkState?.session,
            currentSession: currentSessionId
        });
        const beforePlayPromise = Promise.race([
            chunkState.promise.catch(() => []),
            new Promise(resolve => setTimeout(resolve, 250))
        ]);
        beforePlayPromise
            .then(frames => {
                console.log('[NeuroSync] beforePlay resolved', {
                    chunk: chunkInfo.index + 1,
                    frameCount: Array.isArray(frames) ? frames.length : 0
                });
            })
            .catch(error => {
                console.log('[NeuroSync] beforePlay error', {
                    chunk: chunkInfo.index + 1,
                    message: error?.message ?? String(error)
                });
            });
        return {
            beforePlay: beforePlayPromise,
            onStart: ({ startTime, audioContext }) => {
                chunkState.startInfo = { startTime, audioContext };
                console.log('[NeuroSync] chunk start info', {
                    chunk: chunkState.index + 1,
                    startTime,
                    audioTime: audioContext?.currentTime ?? null
                });
                scheduleChunkFrames(chunkState);
            },
            onEnd: () => {
                console.log('[NeuroSync] chunk playback end', {
                    chunk: chunkState.index + 1
                });
                chunkStates.delete(chunkInfo.index);
            }
        };
    });

    window.addEventListener('beforeunload', () => {
        inflightControllers.forEach(controller => controller.abort());
        inflightControllers.clear();
        decoderPromise?.then(decoder => decoder.destroy()).catch(() => {});
        scheduleBlendshapeLogFlush();
    });

    return {
        consumeBinaryFrame,
        handleServerMessage,
        cancelPendingUpload() {
            inflightControllers.forEach(controller => controller.abort());
            inflightControllers.clear();
            scheduledTimers.forEach(timer => clearTimeout(timer));
            scheduledTimers.clear();
            scheduleBlendshapeLogFlush();
        }
    };
}
