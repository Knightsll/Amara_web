import { initApp } from '../app/app.js';
import { onBinaryFrame, onServerMessage } from '../app/websocket.js';
import { initNeuroSyncForwarder } from './neuroSyncForwarder.js';
import { log } from '../utils/logger.js';

function getElement(id) {
    return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();

    const apiUrlInput = getElement('neuroSyncApiUrl');
    const statusElement = getElement('neuroSyncStatus');
    const resultElement = getElement('neuroSyncResult');
    const cancelButton = getElement('neuroSyncCancel');

    if (apiUrlInput && !apiUrlInput.value) {
        apiUrlInput.value = 'http://127.0.0.1:5000/audio_to_blendshapes';
    }

    const forwarder = initNeuroSyncForwarder({
        apiUrlInput,
        statusElement,
        resultElement
    });

    onBinaryFrame(data => forwarder.consumeBinaryFrame(data));
    onServerMessage(message => forwarder.handleServerMessage(message));

    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            forwarder.cancelPendingUpload();
            if (statusElement) {
                statusElement.textContent = '已手动取消当前NeuroSync请求';
                statusElement.dataset.level = 'warning';
            }
            log('用户取消了当前NeuroSync请求', 'warning');
        });
    }
});
