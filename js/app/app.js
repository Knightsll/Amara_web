import { initVisualizer, startAudioBuffering, playBufferedAudio, configureAudio, startDirectRecording, stopDirectRecording } from './audio.js';
import { initUI } from './ui.js';
import { initializeWebsocketModule, connectToServer, sendTextMessage, testAuthentication } from './websocket.js';
import { state } from './state.js';
import { checkOpusLoaded, initOpusEncoder } from '../opus.js';
import { log } from '../utils/logger.js';
import { dom } from './dom.js';
import { setupBlendshapeViewer } from '../blendshapeViewer.js';

export function initApp() {
    initVisualizer();

    configureAudio();
    initializeWebsocketModule();

    setupBlendshapeViewer({
        modelFileInput: dom.modelFileInput,
        unloadModelButton: dom.unloadModelButton,
        modelViewer: dom.modelViewer,
        blendshapeControls: dom.blendshapeControls,
        blendshapeEmptyHint: dom.blendshapeEmptyHint,
        streamStatus: dom.streamStatus,
        log
    });

    initUI({
        onConnect: connectToServer,
        onSendText: sendTextMessage,
        onStartRecording: startDirectRecording,
        onStopRecording: stopDirectRecording,
        onTestAuth: testAuthentication
    });

    checkOpusLoaded();
    state.opusEncoder = initOpusEncoder();

    Promise.resolve(playBufferedAudio()).catch(error => {
        log(`初始化音频播放失败: ${error.message}`, 'error');
    });

    Promise.resolve(startAudioBuffering()).catch(error => {
        log(`音频缓冲循环异常退出: ${error.message}`, 'error');
    });
}
