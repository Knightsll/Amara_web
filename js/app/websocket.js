import { log } from '../utils/logger.js';
import { addMessage } from '../document.js';
import { webSocketConnect } from '../xiaoZhiConnect.js';
import { state } from './state.js';
import { dom } from './dom.js';
import { getConfig, persistServerSettings } from './config.js';
import { initAudio, stopDirectRecording, handleBinaryMessage } from './audio.js';

let sendCommandToBridge = () => {};
const serverMessageListeners = new Set();
const binaryMessageListeners = new Set();

const ARM_ENDPOINTS = {
    say_hello: '/amara/say_hello',
    cheerful: '/amara/cheerful',
    talk: '/amara/talk',
    stop: '/amara/stop'
};

const ARM_MATCHERS = {
    say_hello: ['hello', 'hi', 'new friend'],
    cheerful: ['cheer', 'depressed']
};

function getArmBaseUrl() {
    const input = dom.armApiInput;
    if (!input) return '';
    return input.value.trim();
}

function buildArmUrl(action) {
    const base = getArmBaseUrl();
    if (!base) return '';
    const endpoint = ARM_ENDPOINTS[action];
    if (!endpoint) return '';
    const sanitized = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${sanitized}${endpoint}`;
}

async function triggerArmAction(action, { reason } = {}) {
    const url = buildArmUrl(action);
    if (!url) {
        log(`[Arm] 未配置地址，跳过动作 ${action}`, 'warning');
        return;
    }
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
        const context = reason ? ` (reason: ${reason})` : '';
        log(`[Arm] 动作 ${action} 已触发${context}`, 'info');
    } catch (error) {
        log(`[Arm] 调用 ${action} 失败: ${error.message}`, 'error');
    }
}

function handleArmIntentByText(rawText) {
    if (!rawText) return;
    const text = rawText.toLowerCase();
    if (ARM_MATCHERS.say_hello.some(keyword => text.includes(keyword))) {
        triggerArmAction('say_hello', { reason: rawText });
        return;
    }
    if (ARM_MATCHERS.cheerful.some(keyword => text.includes(keyword))) {
        triggerArmAction('cheerful', { reason: rawText });
        return;
    }
    triggerArmAction('talk', { reason: rawText });
}

export function initializeWebsocketModule({ sendCommand } = {}) {
    sendCommandToBridge = typeof sendCommand === 'function' ? sendCommand : () => {};
}

export function onServerMessage(callback) {
    if (typeof callback === 'function') {
        serverMessageListeners.add(callback);
    }
    return () => serverMessageListeners.delete(callback);
}

export function onBinaryFrame(callback) {
    if (typeof callback === 'function') {
        binaryMessageListeners.add(callback);
    }
    return () => binaryMessageListeners.delete(callback);
}

export async function connectToServer() {
    const url = dom.serverUrlInput ? dom.serverUrlInput.value.trim() : '';
    if (!url) {
        log('请输入服务器地址', 'error');
        return;
    }

    const otaUrl = dom.otaUrlInput ? dom.otaUrlInput.value.trim() : '';
    const config = getConfig();
    persistServerSettings(url, otaUrl);

    try {
        const ws = await webSocketConnect(otaUrl, url, config);
        if (!ws) {
            return;
        }

        state.websocket = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = async () => {
            log(`已连接到服务器: ${url}`, 'success');
            updateConnectionStatus('ws已连接', 'green');
            await sendHelloMessage(ws, config);
            updateConnectButton(true);
            setInteractionEnabled(true);
            const audioInitialized = await initAudio();
            if (dom.recordButton) {
                dom.recordButton.disabled = !audioInitialized;
            }
        };

        ws.onclose = () => {
            log('已断开连接', 'info');
            updateConnectionStatus('ws disconnect', 'red');
            updateConnectButton(false);
            setInteractionEnabled(false);
            stopDirectRecording();
            state.websocket = null;
        };

        ws.onerror = (error) => {
            log(`WebSocket错误: ${error.message || '未知错误'}`, 'error');
            updateConnectionStatus('ws未连接', 'red');
        };

        ws.onmessage = (event) => {
            try {
                if (typeof event.data === 'string') {
                    const message = JSON.parse(event.data);
                    handleServerMessage(message);
                    serverMessageListeners.forEach(listener => {
                        try {
                            listener(message);
                        } catch (err) {
                            log(`额外消息处理回调错误: ${err.message}`, 'warning');
                        }
                    });
                } else {
                    handleBinaryMessage(event.data).catch(err => {
                        log(`处理音频数据失败: ${err.message}`, 'error');
                    });
                    binaryMessageListeners.forEach(listener => {
                        try {
                            const result = listener(event.data);
                            if (result && typeof result.catch === 'function') {
                                result.catch(error => {
                                    log(`额外二进制回调错误: ${error.message}`, 'warning');
                                });
                            }
                        } catch (err) {
                            log(`额外二进制回调错误: ${err.message}`, 'warning');
                        }
                    });
                }
            } catch (error) {
                log(`WebSocket消息处理错误: ${error.message}`, 'error');
                if (typeof event.data === 'string') {
                    addMessage(event.data);
                }
            }
        };

        updateConnectionStatus('ws未连接', 'orange');
    } catch (error) {
        log(`连接错误: ${error.message}`, 'error');
        updateConnectionStatus('ws未连接', 'red');
    }
}

export function disconnectFromServer() {
    if (!state.websocket) return;
    stopDirectRecording();
    state.websocket.close();
}

export function sendTextMessage() {
    const message = dom.messageInput ? dom.messageInput.value.trim() : '';
    if (!message || !state.websocket || state.websocket.readyState !== WebSocket.OPEN) return;

    try {
        handleArmIntentByText(message);
        const listenMessage = {
            type: 'listen',
            mode: 'manual',
            state: 'detect',
            text: message
        };
        state.websocket.send(JSON.stringify(listenMessage));
        sendCommandToBridge(listenMessage);
        addMessage(message, true);
        log(`发送文本消息: ${message}`, 'info');
        if (dom.messageInput) {
            dom.messageInput.value = '';
        }
    } catch (error) {
        log(`发送文本消息错误: ${error.message}`, 'error');
    }
}

export async function testAuthentication() {
    log('开始测试认证...', 'info');
    const config = getConfig();
    const serverUrl = dom.serverUrlInput ? dom.serverUrlInput.value.trim() : '';
    if (!serverUrl) {
        log('请输入服务器地址', 'error');
        return;
    }

    log('-------- 服务器认证配置检查 --------', 'info');
    log('请确认config.yaml中的auth配置：', 'info');
    log('1. server.auth.enabled 为 false 或服务器已正确配置认证', 'info');
    log('2. 如果启用了认证，请确认使用了正确的token', 'info');
    log(`3. 或者在allowed_devices中添加了测试设备MAC：${config.deviceMac}`, 'info');

    try {
        log('测试1: 尝试无参数连接...', 'info');
        const ws1 = new WebSocket(serverUrl);
        ws1.onopen = () => {
            log('测试1成功: 无参数可连接，服务器可能没有启用认证', 'success');
            ws1.close();
        };
        ws1.onerror = () => {
            log('测试1失败: 无参数连接被拒绝，服务器可能启用了认证', 'error');
        };
        setTimeout(() => {
            if (ws1.readyState === WebSocket.CONNECTING || ws1.readyState === WebSocket.OPEN) {
                ws1.close();
            }
        }, 5000);
    } catch (error) {
        log(`测试1出错: ${error.message}`, 'error');
    }

    setTimeout(() => attemptAuthenticatedConnection(serverUrl, config), 6000);
    log('认证测试已启动，请查看测试结果...', 'info');
}

function attemptAuthenticatedConnection(serverUrl, config) {
    try {
        log('测试2: 尝试带token参数连接...', 'info');
        const url = new URL(serverUrl);
        url.searchParams.append('token', config.token);
        url.searchParams.append('device_id', config.deviceId);
        url.searchParams.append('device_mac', config.deviceMac);
        const ws2 = new WebSocket(url.toString());
        ws2.onopen = () => {
            log('测试2成功: 带token参数可连接', 'success');
            const helloMsg = {
                type: 'hello',
                device_id: config.deviceId,
                device_mac: config.deviceMac,
                token: config.token
            };
            ws2.send(JSON.stringify(helloMsg));
            log('已发送hello测试消息', 'info');
            ws2.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.type === 'hello' && response.session_id) {
                        log(`测试完全成功! 收到hello响应，会话ID: ${response.session_id}`, 'success');
                        ws2.close();
                    }
                } catch (err) {
                    log(`收到非JSON响应: ${event.data}`, 'info');
                }
            };
            setTimeout(() => ws2.close(), 5000);
        };
        ws2.onerror = () => {
            log('测试2失败: 带token参数连接被拒绝', 'error');
            log('请检查token是否正确，或服务器是否接受URL参数认证', 'error');
        };
    } catch (error) {
        log(`测试2出错: ${error.message}`, 'error');
    }
}

function updateConnectButton(connected) {
    if (!dom.connectButton) return;
    dom.connectButton.textContent = connected ? 'Disconnect' : 'Connect';
    dom.connectButton.removeEventListener('click', connected ? connectToServer : disconnectFromServer);
    dom.connectButton.removeEventListener('click', connected ? disconnectFromServer : connectToServer);
    dom.connectButton.addEventListener('click', connected ? disconnectFromServer : connectToServer);
}

function setInteractionEnabled(enabled) {
    if (dom.messageInput) dom.messageInput.disabled = !enabled;
    if (dom.sendTextButton) dom.sendTextButton.disabled = !enabled;
    if (dom.recordButton) dom.recordButton.disabled = !enabled;
    if (dom.stopButton) dom.stopButton.disabled = !enabled;
}

function updateConnectionStatus(text, color) {
    if (!dom.connectionStatus) return;
    dom.connectionStatus.textContent = text;
    dom.connectionStatus.style.color = color;
}

async function sendHelloMessage(ws, config) {
    try {
        const helloMessage = {
            type: 'hello',
            device_id: config.deviceId,
            device_name: config.deviceName,
            device_mac: config.deviceMac,
            token: config.token,
            features: { mcp: true }
        };
        log('发送hello握手消息', 'info');
        ws.send(JSON.stringify(helloMessage));
        return await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                log('等待hello响应超时', 'error');
                log('提示: 请尝试点击"测试认证"按钮进行连接排查', 'info');
                resolve(false);
            }, 5000);
            const handler = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.type === 'hello' && response.session_id) {
                        log(`服务器握手成功，会话ID: ${response.session_id}`, 'success');
                        clearTimeout(timeout);
                        ws.removeEventListener('message', handler);
                        resolve(true);
                    }
                } catch (error) {
                    // ignore non-JSON payloads during hello wait
                }
            };
            ws.addEventListener('message', handler);
        });
    } catch (error) {
        log(`发送hello消息错误: ${error.message}`, 'error');
        return false;
    }
}

export function handleServerMessage(message) {
    if (!message || typeof message !== 'object') return;
    const type = message.type;

    if (type === 'hello') {
        log(`服务器回应：${JSON.stringify(message, null, 2)}`, 'success');
        return;
    }

    if (type === 'tts') {
        if (message.state === 'start') {
            log('服务器开始发送语音', 'info');
        } else if (message.state === 'sentence_start') {
            log(`服务器发送语音段: ${message.text}`, 'info');
            if (message.text) {
                addMessage(message.text);
            }
        } else if (message.state === 'sentence_end') {
            log(`语音段结束: ${message.text}`, 'info');
        } else if (message.state === 'stop') {
            log('服务器语音传输结束', 'info');
            if (dom.recordButton) {
                dom.recordButton.disabled = false;
                dom.recordButton.textContent = '开始录音';
                dom.recordButton.classList.remove('recording');
            }
            triggerArmAction('stop', { reason: 'tts_stop' });
        }
        return;
    }

    if (type === 'audio') {
        log(`收到音频控制消息: ${JSON.stringify(message)}`, 'info');
        return;
    }

    if (type === 'stt') {
        log(`识别结果: ${message.text}`, 'info');
        addMessage(`[语音识别] ${message.text}`, true);
        if (message && message.text) {
            let isFinal = true;
            if (Object.prototype.hasOwnProperty.call(message, 'final')) {
                isFinal = !!message.final;
            } else if (Object.prototype.hasOwnProperty.call(message, 'is_final')) {
                isFinal = !!message.is_final;
            }
            const sttState = typeof message.state === 'string' ? message.state.toLowerCase() : '';
            if (['partial', 'detect', 'listening', 'processing', 'intermediate'].includes(sttState)) {
                isFinal = false;
            }
            if (isFinal) {
                handleArmIntentByText(message.text);
            }
        }
        return;
    }

    if (type === 'llm') {
        log(`大模型回复: ${message.text}`, 'info');
        if (message.text && message.text !== '😊') {
            addMessage(message.text);
        }
        return;
    }

    if (type === 'mcp') {
        const payload = message.payload || {};
        log(`服务器下发: ${JSON.stringify(message)}`, 'info');
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN && payload) {
            if (payload.method === 'tools/list') {
                const replayMessage = JSON.stringify({
                    session_id: '',
                    type: 'mcp',
                    payload: {
                        jsonrpc: '2.0',
                        id: 2,
                        result: {
                            tools: [
                                {
                                    name: 'self.get_device_status',
                                    description: 'Provides the real-time information of the device, including the current status of the audio speaker, screen, battery, network, etc.\nUse this tool for: \n1. Answering questions about current condition (e.g. what is the current volume of the audio speaker?)\n2. As the first step to control the device (e.g. turn up / down the volume of the audio speaker, etc.)',
                                    inputSchema: { type: 'object', properties: {} }
                                },
                                {
                                    name: 'self.audio_speaker.set_volume',
                                    description: 'Set the volume of the audio speaker. If the current volume is unknown, you must call `self.get_device_status` tool first and then call this tool.',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            volume: { type: 'integer', minimum: 0, maximum: 100 }
                                        },
                                        required: ['volume']
                                    }
                                },
                                {
                                    name: 'self.screen.set_brightness',
                                    description: 'Set the brightness of the screen.',
                                    inputSchema: {
                                        type: 'object',
                                        properties: {
                                            brightness: { type: 'integer', minimum: 0, maximum: 100 }
                                        },
                                        required: ['brightness']
                                    }
                                },
                                {
                                    name: 'self.screen.set_theme',
                                    description: "Set the theme of the screen. The theme can be 'light' or 'dark'.",
                                    inputSchema: {
                                        type: 'object',
                                        properties: { theme: { type: 'string' } },
                                        required: ['theme']
                                    }
                                }
                            ]
                        }
                    }
                });
                state.websocket.send(replayMessage);
                log(`回复MCP消息: ${replayMessage}`, 'info');
            } else if (payload.method === 'tools/call') {
                const replayMessage = JSON.stringify({
                    session_id: '9f261599',
                    type: 'mcp',
                    payload: {
                        jsonrpc: '2.0',
                        id: payload.id,
                        result: {
                            content: [{ type: 'text', text: 'true' }],
                            isError: false
                        }
                    }
                });
                state.websocket.send(replayMessage);
                log(`回复MCP消息: ${replayMessage}`, 'info');
            }
        }
        return;
    }

    if (type === 'info') {
        log(`信息: ${message.message || JSON.stringify(message)}`, 'info');
        return;
    }

    if (type === 'blendshape') {
        return;
    }

    log(`未知消息类型: ${type}`, 'info');
    addMessage(JSON.stringify(message, null, 2));
}
