import { initApp } from '../app/app.js';
import { onBinaryFrame, onServerMessage } from '../app/websocket.js';
import { initNeuroSyncForwarder } from './neuroSyncForwarder.js';
import { log } from '../utils/logger.js';

function getElement(id) {
    return document.getElementById(id);
}

const API_STORAGE_KEY = 'neuroSync.apiUrl';
const AUDIO_PERMISSION_KEY = 'amara.audioGranted';

document.addEventListener('DOMContentLoaded', () => {
    initApp();

    const apiUrlInput = getElement('neuroSyncApiUrl');
    const apiPresetSelect = getElement('neuroSyncApiPreset');
    const apiApplyButton = getElement('neuroSyncApply');
    const statusElement = getElement('neuroSyncStatus');
    const resultElement = getElement('neuroSyncResult');
    const cancelButton = getElement('neuroSyncCancel');

    const updatePresetSelection = (value) => {
        if (!apiPresetSelect) return;
        const options = Array.from(apiPresetSelect.options || []);
        const match = options.find(option => option.value === value);
        apiPresetSelect.value = match ? value : '';
    };

    const persistApiUrl = () => {
        if (!apiUrlInput) return;
        const value = apiUrlInput.value.trim();
        if (value) {
            localStorage.setItem(API_STORAGE_KEY, value);
        } else {
            localStorage.removeItem(API_STORAGE_KEY);
        }
        updatePresetSelection(value);
    };

    if (apiUrlInput) {
        const storedUrl = localStorage.getItem(API_STORAGE_KEY);
        if (storedUrl) {
            apiUrlInput.value = storedUrl;
        } else if (!apiUrlInput.value) {
            apiUrlInput.value = 'http://127.0.0.1:5000/audio_to_blendshapes';
        }
        updatePresetSelection(apiUrlInput.value.trim());
        apiUrlInput.addEventListener('change', persistApiUrl);
        apiUrlInput.addEventListener('blur', persistApiUrl);
    }

    if (apiPresetSelect && apiUrlInput) {
        apiPresetSelect.addEventListener('change', () => {
            const selected = apiPresetSelect.value.trim();
            if (!selected) return;
            apiUrlInput.value = selected;
            persistApiUrl();
            apiUrlInput.dispatchEvent(new Event('change'));
        });
    }

    if (apiApplyButton && apiUrlInput) {
        apiApplyButton.addEventListener('click', () => {
            const selected = apiPresetSelect ? apiPresetSelect.value.trim() : '';
            if (selected) {
                apiUrlInput.value = selected;
            }
            persistApiUrl();
            apiUrlInput.dispatchEvent(new Event('change'));
        });
    }

    if (resultElement) {
        resultElement.style.display = 'none';
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

    if (!localStorage.getItem(AUDIO_PERMISSION_KEY)) {
        const hint = document.createElement('div');
        hint.style.position = 'absolute';
        hint.style.bottom = '120px';
        hint.style.left = '50%';
        hint.style.transform = 'translateX(-50%)';
        hint.style.padding = '12px 18px';
        hint.style.borderRadius = '14px';
        hint.style.background = 'rgba(12, 14, 28, 0.85)';
        hint.style.color = '#d8dfff';
        hint.style.border = '1px solid rgba(92, 118, 240, 0.45)';
        hint.style.boxShadow = '0 12px 32px rgba(6, 8, 18, 0.45)';
        hint.style.backdropFilter = 'blur(8px)';
        hint.style.zIndex = '40';
        hint.style.fontSize = '14px';
        hint.style.textAlign = 'center';
        hint.innerHTML = '提示：录音按钮启用后请在浏览器弹窗中允许麦克风权限';
        document.body.appendChild(hint);
        setTimeout(() => {
            hint.remove();
        }, 6000);
    }

    const oncePermission = () => {
        localStorage.setItem(AUDIO_PERMISSION_KEY, '1');
        window.removeEventListener('click', oncePermission);
    };
    window.addEventListener('click', oncePermission, { once: true });
});
