export const dom = {
    connectButton: document.getElementById('connectButton'),
    serverUrlInput: document.getElementById('serverUrl'),
    connectionStatus: document.getElementById('connectionStatus'),
    messageInput: document.getElementById('messageInput'),
    sendTextButton: document.getElementById('sendTextButton'),
    recordButton: document.getElementById('recordButton'),
    stopButton: document.getElementById('stopButton'),
    conversationDiv: document.getElementById('conversation'),
    logContainer: document.getElementById('logContainer'),
    visualizerCanvas: document.getElementById('audioVisualizer'),
    modelFileInput: document.getElementById('modelFileInput'),
    unloadModelButton: document.getElementById('unloadModelButton'),
    modelViewer: document.getElementById('modelViewer'),
    blendshapeControls: document.getElementById('blendshapeControls'),
    blendshapeEmptyHint: document.getElementById('blendshapeEmptyHint'),
    streamStatus: document.getElementById('streamStatus'),
    blendshapeWsUrlInput: document.getElementById('blendshapeWsUrl'),
    connectBlendshapeWsButton: document.getElementById('connectBlendshapeWs'),
    disconnectBlendshapeWsButton: document.getElementById('disconnectBlendshapeWs'),
    deviceMacInput: document.getElementById('deviceMac'),
    deviceNameInput: document.getElementById('deviceName'),
    clientIdInput: document.getElementById('clientId'),
    tokenInput: document.getElementById('token'),
    displayMac: document.getElementById('displayMac'),
    displayClient: document.getElementById('displayClient'),
    toggleConfig: document.getElementById('toggleConfig'),
    configPanel: document.getElementById('configPanel'),
    otaUrlInput: document.getElementById('otaUrl'),
    authTestButton: document.getElementById('authTestButton')
};

export function getVisualizerContext() {
    return dom.visualizerCanvas ? dom.visualizerCanvas.getContext('2d') : null;
}
