import { log } from '../utils/logger.js';
import { initOpusDecoder } from '../app/audio.js';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;

function mergePcmChunks(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Int16Array(totalLength);
    let offset = 0;
    chunks.forEach(chunk => {
        merged.set(chunk, offset);
        offset += chunk.length;
    });
    return merged;
}

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
    view.setUint16(offset, 1, true); offset += 2; // PCM
    view.setUint16(offset, channels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2; // bits per sample
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

const FRAME_SIZE = 960;
const FRAME_SIZE_BYTES = FRAME_SIZE * CHANNELS * 2;

export function initNeuroSyncForwarder({
    apiUrlInput,
    statusElement,
    resultElement
}) {
    let collecting = false;
    let pcmChunks = [];
    let decoderPromise = null;
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

    async function consumeBinaryFrame(data) {
        if (!collecting) return;
        try {
            const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;
            if (!(arrayBuffer instanceof ArrayBuffer)) return;
            const opusData = new Uint8Array(arrayBuffer);
            if (!opusData.length) return;
            const decoder = await ensureDecoder();
            const pcm = decoder.decode(opusData);
            if (pcm.length) {
                pcmChunks.push(pcm);
            }
        } catch (error) {
            updateStatus(`解码音频帧失败: ${error.message}`, 'error');
        }
    }

    function resetCollection() {
        pcmChunks = [];
    }

    async function postToApi(int16Samples) {
        const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
        if (!apiUrl) {
            updateStatus('NeuroSync API 地址为空，跳过上传', 'warning');
            return;
        }
        updateStatus('正在发送音频到NeuroSync API...', 'info');
        const wavBytes = encodeWav(int16Samples, SAMPLE_RATE, CHANNELS);
        const controller = new AbortController();
        lastPostAbort = controller;
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
                updateStatus(`NeuroSync 请求失败: ${response.status} ${text}`, 'error');
                if (resultElement) {
                    resultElement.textContent = text;
                }
                return;
            }
            const json = await response.json().catch(() => null);
            updateStatus('NeuroSync 响应成功', 'success');
            if (resultElement) {
                resultElement.textContent = JSON.stringify(json ?? {}, null, 2);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                updateStatus('NeuroSync 请求已取消', 'warning');
            } else {
                updateStatus(`NeuroSync 请求异常: ${error.message}`, 'error');
            }
        } finally {
            if (lastPostAbort === controller) {
                lastPostAbort = null;
            }
        }
    }

    async function finalizeUpload() {
        if (!pcmChunks.length) {
            updateStatus('未收集到任何PCM数据，跳过上传', 'warning');
            return;
        }
        const merged = mergePcmChunks(pcmChunks);
        resetCollection();
        await postToApi(merged);
    }

    function handleServerMessage(message) {
        if (!message || message.type !== 'tts') return;
        if (message.state === 'start') {
            collecting = true;
            resetCollection();
            updateStatus('开始收集小智语音流...', 'info');
        } else if (message.state === 'stop') {
            collecting = false;
            updateStatus('语音流结束，准备发送到NeuroSync', 'info');
            finalizeUpload().catch(error => {
                updateStatus(`上传NeuroSync失败: ${error.message}`, 'error');
            });
        }
    }

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
        }
    };
}
