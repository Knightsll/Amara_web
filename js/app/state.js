import BlockingQueue from '../utils/BlockingQueue.js';

export const state = {
    websocket: null,
    mediaRecorder: null,
    audioContext: null,
    analyser: null,
    audioChunks: [],
    isRecording: false,
    audioQueue: [],
    isPlaying: false,
    opusDecoder: null,
    opusEncoder: null,
    visualizationRequest: null,
    audioBuffers: [],
    totalAudioSize: 0,
    audioBufferQueue: [],
    isAudioPlaying: false,
    streamingContext: null,
    blendshapeViewer: null,
    audioProcessor: null,
    audioProcessorType: null,
    audioSource: null,
    pcmDataBuffer: new Int16Array(),
    recordingTimer: null,
    queue: new BlockingQueue()
};
