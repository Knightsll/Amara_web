import { dom } from './dom.js';

export function generateRandomMac() {
    const hex = '0123456789ABCDEF';
    let mac = '02';
    for (let i = 0; i < 5; i++) {
        const part = [
            hex[Math.floor(Math.random() * 16)],
            hex[Math.floor(Math.random() * 16)]
        ].join('');
        mac += ':' + part;
    }
    return mac;
}

export function initConfigBindings() {
    if (dom.deviceMacInput) {
        let savedMac = localStorage.getItem('deviceMac');
        if (!savedMac) {
            savedMac = generateRandomMac();
            localStorage.setItem('deviceMac', savedMac);
        }
        dom.deviceMacInput.value = savedMac;
        if (dom.displayMac) {
            dom.displayMac.textContent = savedMac;
        }

        const updateDisplay = () => {
            const mac = dom.deviceMacInput.value.trim();
            const clientId = dom.clientIdInput ? dom.clientIdInput.value.trim() : '';
            if (dom.displayMac) dom.displayMac.textContent = mac;
            if (dom.displayClient) dom.displayClient.textContent = clientId;
            if (mac) {
                localStorage.setItem('deviceMac', mac);
            }
        };

        dom.deviceMacInput.addEventListener('input', updateDisplay);
        if (dom.clientIdInput) {
            dom.clientIdInput.addEventListener('input', updateDisplay);
        }
        updateDisplay();
    }

    if (dom.otaUrlInput) {
        const savedOtaUrl = localStorage.getItem('otaUrl');
        if (savedOtaUrl) {
            dom.otaUrlInput.value = savedOtaUrl;
        }
    }

    if (dom.serverUrlInput) {
        const savedWsUrl = localStorage.getItem('wsUrl');
        if (savedWsUrl) {
            dom.serverUrlInput.value = savedWsUrl;
        }
    }

    if (dom.toggleConfig && dom.configPanel) {
        dom.toggleConfig.addEventListener('click', () => {
            const isExpanded = dom.configPanel.classList.contains('expanded');
            dom.configPanel.classList.toggle('expanded');
            dom.toggleConfig.textContent = isExpanded ? '编辑' : '收起';
        });
    }

    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(`${tab.dataset.tab}Tab`);
            if (target) target.classList.add('active');
        });
    });
}

export function persistServerSettings(wsUrl, otaUrl) {
    if (wsUrl) {
        localStorage.setItem('wsUrl', wsUrl);
    }
    if (otaUrl) {
        localStorage.setItem('otaUrl', otaUrl);
    }
}

export function getConfig() {
    const deviceMac = dom.deviceMacInput ? dom.deviceMacInput.value.trim() : '';
    return {
        deviceId: deviceMac,
        deviceName: dom.deviceNameInput ? dom.deviceNameInput.value.trim() : '',
        deviceMac,
        clientId: dom.clientIdInput ? dom.clientIdInput.value.trim() : '',
        token: dom.tokenInput ? dom.tokenInput.value.trim() : ''
    };
}
