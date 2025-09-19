import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js?module';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js?module';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/DRACOLoader.js?module';

const textDecoder = new TextDecoder();

export class BlendshapeViewer {
    constructor(options) {
        const {
            modelFileInput,
            unloadModelButton,
            modelViewer,
            blendshapeControls,
            blendshapeEmptyHint,
            streamStatus,
            log = () => {},
            onAudioFrame = null,
            onJsonMessage = null,
            onStreamStateChange = null
        } = options;

        this.modelFileInput = modelFileInput;
        this.unloadModelButton = unloadModelButton;
        this.modelViewer = modelViewer;
        this.blendshapeControls = blendshapeControls;
        this.blendshapeEmptyHint = blendshapeEmptyHint;
        this.streamStatus = streamStatus;
        this.log = log;
        this.onAudioFrame = onAudioFrame;
        this.onJsonMessage = onJsonMessage;
        this.onStreamStateChange = onStreamStateChange;

        this.threeRenderer = null;
        this.threeScene = null;
        this.threeCamera = null;
        this.threeControls = null;
        this.currentModelRoot = null;
        this.blendshapeTargets = [];
        this.blendshapeMap = new Map();
        this.currentBlendshapeValues = new Map();
        this.blendshapeUIBindings = new Map();
        this.activeSocket = null;
        this.pendingCommands = [];

        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setCrossOrigin('anonymous');
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/');
        this.gltfLoader.setDRACOLoader(dracoLoader);

        this.modelFileInput.addEventListener('change', (event) => {
            const files = event.target.files;
            const file = files && files[0];
            if (file) {
                this.loadModelFile(file);
            }
            event.target.value = '';
        });

        this.unloadModelButton.addEventListener('click', () => {
            this.clearCurrentModel();
            this.updateStreamStatus('model not loaded');
        });

        this.ensureThreeScene();

        // create WritableStream API (or fallback object) for external integrations
        this.setupBlendshapeStreamInterface();
    }

    ensureThreeScene() {
        if (this.threeRenderer) return;

        const width = this.modelViewer.clientWidth || this.modelViewer.offsetWidth || 600;
        const height = this.modelViewer.clientHeight || this.modelViewer.offsetHeight || 360;

        this.threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        if ('outputColorSpace' in this.threeRenderer) {
            this.threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
        } else if ('outputEncoding' in this.threeRenderer) {
            this.threeRenderer.outputEncoding = THREE.sRGBEncoding;
        }
        this.threeRenderer.setPixelRatio(window.devicePixelRatio);
        this.threeRenderer.setSize(width, height);
        this.modelViewer.appendChild(this.threeRenderer.domElement);

        this.threeScene = new THREE.Scene();
        this.threeScene.background = new THREE.Color(0x111111);

        this.threeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.threeCamera.position.set(0, 1.2, 2.5);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.threeScene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(2, 2, 2);
        this.threeScene.add(mainLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.6);
        backLight.position.set(-2, 2, -2);
        this.threeScene.add(backLight);

        this.threeControls = new OrbitControls(this.threeCamera, this.threeRenderer.domElement);
        this.threeControls.enableDamping = true;
        this.threeControls.dampingFactor = 0.08;
        this.threeControls.target.set(0, 1, 0);

        window.addEventListener('resize', () => this.onWindowResize());
        this.animateThree();
    }

    onWindowResize() {
        if (!this.threeRenderer || !this.threeCamera) return;
        const width = this.modelViewer.clientWidth || this.modelViewer.offsetWidth || 1;
        const height = this.modelViewer.clientHeight || this.modelViewer.offsetHeight || 1;
        this.threeCamera.aspect = width / height;
        this.threeCamera.updateProjectionMatrix();
        this.threeRenderer.setSize(width, height);
    }

    animateThree() {
        requestAnimationFrame(() => this.animateThree());
        if (this.threeControls) {
            this.threeControls.update();
        }
        if (this.threeRenderer && this.threeScene && this.threeCamera) {
            this.threeRenderer.render(this.threeScene, this.threeCamera);
        }
    }

    clearCurrentModel() {
        if (this.currentModelRoot && this.threeScene) {
            this.threeScene.remove(this.currentModelRoot);
            this.currentModelRoot.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry && typeof child.geometry.dispose === 'function') {
                        child.geometry.dispose();
                    }
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(material => {
                                if (material && typeof material.dispose === 'function') {
                                    material.dispose();
                                }
                            });
                        } else if (typeof child.material.dispose === 'function') {
                            child.material.dispose();
                        }
                    }
                }
            });
        }
        this.currentModelRoot = null;
        this.blendshapeTargets = [];
        this.blendshapeMap = new Map();
        this.currentBlendshapeValues.clear();
        this.updateBlendshapeControls();
        this.unloadModelButton.disabled = true;
        this.disconnectBlendshapeSocket();
    }

    frameSceneToObject(object) {
        if (!this.threeCamera || !this.threeControls) return;

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(this.threeCamera.fov / 2)))) * 1.5;

        const direction = new THREE.Vector3(0, 0, 1);
        this.threeCamera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
        this.threeCamera.near = Math.max(0.1, distance / 100);
        this.threeCamera.far = distance * 10;
        this.threeCamera.updateProjectionMatrix();

        this.threeControls.target.copy(center);
        this.threeControls.update();
    }

    collectBlendshapeTargets(root) {
        const targets = [];
        root.traverse((child) => {
            if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                targets.push({
                    mesh: child,
                    dictionary: child.morphTargetDictionary,
                    influences: child.morphTargetInfluences
                });
            }
        });
        return targets;
    }

    rebuildBlendshapeMap() {
        this.blendshapeMap = new Map();
        this.blendshapeTargets.forEach(target => {
            Object.entries(target.dictionary).forEach(([name, index]) => {
                if (!this.blendshapeMap.has(name)) {
                    this.blendshapeMap.set(name, []);
                }
                this.blendshapeMap.get(name).push({ mesh: target.mesh, index });
            });
        });
    }

    updateBlendshapeControls() {
        if (!this.blendshapeControls) {
            return;
        }

        this.blendshapeControls.innerHTML = '';
        this.blendshapeUIBindings.clear();

        if (!this.blendshapeMap.size) {
            if (this.blendshapeEmptyHint) {
                this.blendshapeEmptyHint.style.display = 'block';
                this.blendshapeControls.appendChild(this.blendshapeEmptyHint);
            }
            return;
        }

        if (this.blendshapeEmptyHint) {
            this.blendshapeEmptyHint.style.display = 'none';
        }

        this.blendshapeMap.forEach((entries, name) => {
            const container = document.createElement('div');
            container.className = 'blendshape-slider';

            const label = document.createElement('label');
            label.textContent = name;

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.01';
            slider.value = this.currentBlendshapeValues.get(name) ?? 0;

            const valueLabel = document.createElement('span');
            valueLabel.textContent = Number(slider.value).toFixed(2);

            slider.addEventListener('input', () => {
                const value = Number(slider.value);
                valueLabel.textContent = value.toFixed(2);
                this.setBlendshapeValue(name, value);
            });

            container.appendChild(label);
            container.appendChild(slider);
            container.appendChild(valueLabel);

            this.blendshapeControls.appendChild(container);
            this.blendshapeUIBindings.set(name, { slider, valueLabel });
        });
    }

    setBlendshapeValue(name, value) {
        if (!this.blendshapeMap.has(name)) return;
        const targets = this.blendshapeMap.get(name);
        const clampedValue = Math.max(0, Math.min(1, value));
        targets.forEach(({ mesh, index }) => {
            mesh.morphTargetInfluences[index] = clampedValue;
        });
        this.currentBlendshapeValues.set(name, clampedValue);
    }

    applyBlendshapeFrame(frame) {
        if (!frame || !this.blendshapeMap.size) {
            return;
        }

        Object.entries(frame).forEach(([name, value]) => {
            const clampedValue = Math.max(0, Math.min(1, Number(value)));
            this.setBlendshapeValue(name, clampedValue);
            const binding = this.blendshapeUIBindings.get(name);
            if (binding) {
                binding.slider.value = clampedValue.toString();
                binding.valueLabel.textContent = clampedValue.toFixed(2);
            }
        });

        this.updateStreamStatus(`frame applied @ ${new Date().toLocaleTimeString()}`);
    }

    normalizeBlendshapeChunk(chunk) {
        if (!chunk) return null;

        if (chunk instanceof ArrayBuffer) {
            chunk = textDecoder.decode(chunk);
        } else if (ArrayBuffer.isView(chunk)) {
            chunk = textDecoder.decode(chunk);
        }

        if (typeof chunk === 'string') {
            try {
                chunk = JSON.parse(chunk);
            } catch (error) {
                this.log(`无法解析blendshape字符串: ${error.message}`, 'error');
                return null;
            }
        }

        if (Array.isArray(chunk)) {
            try {
                chunk = Object.fromEntries(chunk);
            } catch (error) {
                this.log(`无法从数组创建blendshape对象: ${error.message}`, 'error');
                return null;
            }
        }

        if (typeof chunk !== 'object') {
            this.log('收到的blendshape帧不是有效对象', 'error');
            return null;
        }

        return chunk;
    }

    updateStreamStatus(status) {
        if (this.streamStatus) {
            this.streamStatus.textContent = status;
        }
    }

    async loadModelFile(file) {
        if (!file) return;

        this.updateStreamStatus('loading model...');

        const url = URL.createObjectURL(file);
        try {
            const gltf = await this.gltfLoader.loadAsync(url);
            this.log(`模型加载成功: ${file.name}`, 'success');

            this.clearCurrentModel();

            this.currentModelRoot = gltf.scene;
            this.threeScene.add(this.currentModelRoot);

            this.blendshapeTargets = this.collectBlendshapeTargets(this.currentModelRoot);
            this.rebuildBlendshapeMap();
            this.blendshapeMap.forEach((entries, name) => {
                const firstEntry = entries[0];
                const initialValue = firstEntry.mesh.morphTargetInfluences[firstEntry.index] ?? 0;
                this.currentBlendshapeValues.set(name, initialValue);
            });
            this.updateBlendshapeControls();

        this.frameSceneToObject(this.currentModelRoot);

        this.unloadModelButton.disabled = false;
        this.updateStreamStatus(this.blendshapeMap.size ? 'blendshape ready' : 'model loaded (no blendshapes)');
        const keys = Array.from(this.blendshapeMap.keys());
        this.log(`Blendshape channels detected: ${keys.join(', ')}`, keys.length ? 'info' : 'warning');
    } catch (error) {
        this.log(`模型加载失败: ${error.message}`, 'error');
        this.updateStreamStatus('model load failed');
    } finally {
        URL.revokeObjectURL(url);
        }
    }

    setupBlendshapeStreamInterface() {
        if (typeof window.WritableStream === 'undefined') {
            this.log('当前环境不支持 WritableStream，使用简易接口兼容模式', 'warning');
        }

        const baseStreamImpl = {
            start: () => {
                if (!this.blendshapeMap.size) {
                    this.updateStreamStatus('stream ready (awaiting model)');
                } else {
                    this.updateStreamStatus('stream ready');
                }
            },
            write: (chunk) => {
                const frame = this.normalizeBlendshapeChunk(chunk);
                if (frame) {
                    this.applyBlendshapeFrame(frame);
                }
            },
            close: () => {
                this.updateStreamStatus('stream closed');
            },
            abort: (reason) => {
                this.updateStreamStatus(`stream aborted: ${reason ?? 'unknown'}`);
            }
        };

        const stream = typeof window.WritableStream !== 'undefined'
            ? new WritableStream(baseStreamImpl)
            : {
                get locked() { return false; },
                async abort(reason) { baseStreamImpl.abort?.(reason); },
                async close() { baseStreamImpl.close?.(); },
                async write(chunk) { return baseStreamImpl.write?.(chunk); }
            };

        window.amaraBlendshapeStream = stream;
        window.applyAmaraBlendshapeFrame = (frame) => this.applyBlendshapeFrame(frame);

        window.dispatchEvent(new CustomEvent('amara-blendshape-stream-ready', {
            detail: {
                stream,
                applyBlendshapeFrame: (frame) => this.applyBlendshapeFrame(frame)
            }
        }));

        this.updateStreamStatus('stream ready (awaiting model)');
        this.log('Blendshape stream interface ready: use window.amaraBlendshapeStream or window.applyAmaraBlendshapeFrame', 'info');
    }

    connectBlendshapeSocket(url) {
        this.disconnectBlendshapeSocket();
        if (!url) {
            this.log('Blendshape WebSocket URL is empty', 'warning');
            return;
        }

        try {
            const socket = new WebSocket(url);
            this.updateStreamStatus('connecting stream ...');
            this.pendingCommands = [];

            socket.onopen = () => {
                this.updateStreamStatus('stream connected');
                this.log(`Blendshape WebSocket connected: ${url}`, 'success');
                if (typeof this.onStreamStateChange === 'function') {
                    this.onStreamStateChange(true);
                }
                if (this.pendingCommands.length) {
                    const commands = [...this.pendingCommands];
                    this.pendingCommands.length = 0;
                    commands.forEach(cmd => {
                        try {
                            const message = typeof cmd === 'string' ? cmd : JSON.stringify(cmd);
                            socket.send(message);
                        } catch (error) {
                            this.log(`发送延迟命令失败: ${error.message}`, 'warning');
                        }
                    });
                }
            };

        socket.onmessage = async (event) => {
            if (event.data instanceof Blob) {
                const buffer = await event.data.arrayBuffer();
                if (typeof this.onAudioFrame === 'function') {
                    this.onAudioFrame(buffer);
                }
                return;
            }

            if (event.data instanceof ArrayBuffer) {
                if (typeof this.onAudioFrame === 'function') {
                    this.onAudioFrame(event.data);
                }
                return;
            }

            const text = typeof event.data === 'string' ? event.data : ''; 
            if (!text) {
                return;
            }

            let payload;
            try {
                payload = JSON.parse(text);
            } catch (error) {
                this.log(`Blendshape stream JSON parse error: ${error.message}`, 'warning');
                return;
            }

            if (payload && payload.type === 'blendshape' && payload.values) {
                this.applyBlendshapeFrame(payload.values);
                return;
            }

            if (typeof this.onJsonMessage === 'function') {
                this.onJsonMessage(payload);
            }
        };

            socket.onerror = (error) => {
                this.log(`Blendshape WebSocket error: ${error.message || 'unknown'}`, 'error');
                this.updateStreamStatus('stream error');
                if (typeof this.onStreamStateChange === 'function') {
                    this.onStreamStateChange(false);
                }
            };

            socket.onclose = () => {
                if (this.activeSocket === socket) {
                    this.updateStreamStatus('stream disconnected');
                    this.activeSocket = null;
                    if (typeof this.onStreamStateChange === 'function') {
                        this.onStreamStateChange(false);
                    }
                }
            };

        this.activeSocket = socket;
        return socket;
        } catch (error) {
            this.log(`无法连接Blendshape WebSocket: ${error.message}`, 'error');
        }
        return null;
    }

    disconnectBlendshapeSocket() {
        if (this.activeSocket) {
            try {
                this.activeSocket.close();
            } catch (error) {
                this.log(`关闭Blendshape WebSocket失败: ${error.message}`, 'warning');
            }
            this.activeSocket = null;
        }
        this.pendingCommands.length = 0;
    }

    sendCommand(payload) {
        if (!this.activeSocket) {
            this.log('Blendshape stream not connected; command ignored', 'warning');
            return false;
        }

        if (this.activeSocket.readyState === WebSocket.CONNECTING) {
            this.pendingCommands.push(payload);
            return true;
        }

        if (this.activeSocket.readyState !== WebSocket.OPEN) {
            this.log('Blendshape stream not open; command ignored', 'warning');
            return false;
        }
        try {
            const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
            this.activeSocket.send(message);
            return true;
        } catch (error) {
            this.log(`发送桥接命令失败: ${error.message}`, 'error');
            return false;
        }
    }
}

export function setupBlendshapeViewer(options) {
    return new BlendshapeViewer(options);
}
