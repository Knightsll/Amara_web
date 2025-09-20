import { dom } from './dom.js';
import { initVisualizer } from './audio.js';
import { initConfigBindings } from './config.js';
import { state } from './state.js';

export function initUI({ onConnect, onSendText, onStartRecording, onStopRecording, onTestAuth }) {
    initConfigBindings();

    if (dom.connectButton && typeof onConnect === 'function') {
        dom.connectButton.addEventListener('click', onConnect);
    }

    if (dom.sendTextButton && typeof onSendText === 'function') {
        dom.sendTextButton.addEventListener('click', onSendText);
    }

    if (dom.messageInput && typeof onSendText === 'function') {
        dom.messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                onSendText();
            }
        });
        dom.messageInput.disabled = true;
    }

    if (dom.sendTextButton) {
        dom.sendTextButton.disabled = true;
    }

    if (dom.recordButton) {
        dom.recordButton.disabled = true;
        dom.recordButton.addEventListener('click', () => {
            if (state.isRecording) {
                onStopRecording && onStopRecording();
            } else {
                onStartRecording && onStartRecording();
            }
        });
    }

    if (dom.stopButton && typeof onStopRecording === 'function') {
        dom.stopButton.addEventListener('click', onStopRecording);
        dom.stopButton.disabled = true;
    }

    if (dom.authTestButton && typeof onTestAuth === 'function') {
        dom.authTestButton.addEventListener('click', onTestAuth);
    }

    window.addEventListener('resize', initVisualizer);
}
