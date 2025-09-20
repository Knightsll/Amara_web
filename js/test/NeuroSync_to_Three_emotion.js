const UNITY_BLENDSHAPE_NAMES = [
    'eyeBlinkLeft','eyeLookDownLeft','eyeLookInLeft','eyeLookOutLeft','eyeLookUpLeft','eyeSquintLeft','eyeWideLeft',
    'eyeBlinkRight','eyeLookDownRight','eyeLookInRight','eyeLookOutRight','eyeLookUpRight','eyeSquintRight','eyeWideRight',
    'jawForward','jawLeft','jawRight','jawOpen','mouthClose','mouthFunnel','mouthPucker','mouthRight','mouthLeft',
    'mouthSmileLeft','mouthSmileRight','mouthFrownRight','mouthFrownLeft','mouthDimpleLeft','mouthDimpleRight',
    'mouthStretchLeft','mouthStretchRight','mouthRollLower','mouthRollUpper','mouthShrugLower','mouthShrugUpper',
    'mouthPressLeft','mouthPressRight','mouthLowerDownLeft','mouthLowerDownRight','mouthUpperUpLeft','mouthUpperUpRight',
    'browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight','cheekPuff','cheekSquintLeft',
    'cheekSquintRight','noseSneerLeft','noseSneerRight','tongueOut','STAFF','EYEPATCH','SMUG','Smile','Angry','Sad','Happy','Suprise'
];

const NEUROSYNC_BASE_COLUMNS = [
    'EyeBlinkLeft','EyeLookDownLeft','EyeLookInLeft','EyeLookOutLeft','EyeLookUpLeft','EyeSquintLeft','EyeWideLeft',
    'EyeBlinkRight','EyeLookDownRight','EyeLookInRight','EyeLookOutRight','EyeLookUpRight','EyeSquintRight','EyeWideRight',
    'JawForward','JawRight','JawLeft','JawOpen','MouthClose','MouthFunnel','MouthPucker','MouthRight','MouthLeft',
    'MouthSmileLeft','MouthSmileRight','MouthFrownLeft','MouthFrownRight','MouthDimpleLeft','MouthDimpleRight',
    'MouthStretchLeft','MouthStretchRight','MouthRollLower','MouthRollUpper','MouthShrugLower','MouthShrugUpper',
    'MouthPressLeft','MouthPressRight','MouthLowerDownLeft','MouthLowerDownRight','MouthUpperUpLeft','MouthUpperUpRight',
    'BrowDownLeft','BrowDownRight','BrowInnerUp','BrowOuterUpLeft','BrowOuterUpRight','CheekPuff','CheekSquintLeft',
    'CheekSquintRight','NoseSneerLeft','NoseSneerRight','TongueOut','HeadYaw','HeadPitch','HeadRoll',
    'LeftEyeYaw','LeftEyePitch','LeftEyeRoll','RightEyeYaw','RightEyePitch','RightEyeRoll'
];

const NEUROSYNC_EMOTION_COLUMNS = ['Angry','Disgusted','Fearful','Happy','Neutral','Sad','Surprised'];

const NEUROSYNC_TO_UNITY_MAP = new Map([
    ['EyeBlinkLeft','eyeBlinkLeft'],
    ['EyeBlinkRight','eyeBlinkRight'],
    ['EyeSquintLeft','eyeSquintLeft'],
    ['EyeSquintRight','eyeSquintRight'],
    ['EyeWideLeft','eyeWideLeft'],
    ['EyeWideRight','eyeWideRight'],
    ['EyeLookUpLeft','eyeLookUpLeft'],
    ['EyeLookUpRight','eyeLookUpRight'],
    ['EyeLookDownLeft','eyeLookDownLeft'],
    ['EyeLookDownRight','eyeLookDownRight'],
    ['EyeLookInLeft','eyeLookInLeft'],
    ['EyeLookInRight','eyeLookInRight'],
    ['EyeLookOutLeft','eyeLookOutLeft'],
    ['EyeLookOutRight','eyeLookOutRight'],
    ['JawForward','jawForward'],
    ['JawRight','jawRight'],
    ['JawLeft','jawLeft'],
    ['JawOpen','jawOpen'],
    ['MouthClose','mouthClose'],
    ['MouthFunnel','mouthFunnel'],
    ['MouthPucker','mouthPucker'],
    ['MouthSmileLeft','mouthSmileLeft'],
    ['MouthSmileRight','mouthSmileRight'],
    ['MouthFrownLeft','mouthFrownLeft'],
    ['MouthFrownRight','mouthFrownRight'],
    ['MouthDimpleLeft','mouthDimpleLeft'],
    ['MouthDimpleRight','mouthDimpleRight'],
    ['MouthStretchLeft','mouthStretchLeft'],
    ['MouthStretchRight','mouthStretchRight'],
    ['MouthRollLower','mouthRollLower'],
    ['MouthRollUpper','mouthRollUpper'],
    ['MouthShrugLower','mouthShrugLower'],
    ['MouthShrugUpper','mouthShrugUpper'],
    ['MouthPressLeft','mouthPressLeft'],
    ['MouthPressRight','mouthPressRight'],
    ['MouthLowerDownLeft','mouthLowerDownLeft'],
    ['MouthLowerDownRight','mouthLowerDownRight'],
    ['MouthUpperUpLeft','mouthUpperUpLeft'],
    ['MouthUpperUpRight','mouthUpperUpRight'],
    ['BrowDownLeft','browDownLeft'],
    ['BrowDownRight','browDownRight'],
    ['BrowInnerUp','browInnerUp'],
    ['BrowOuterUpLeft','browOuterUpLeft'],
    ['BrowOuterUpRight','browOuterUpRight'],
    ['CheekPuff','cheekPuff'],
    ['CheekSquintLeft','cheekSquintLeft'],
    ['CheekSquintRight','cheekSquintRight'],
    ['NoseSneerLeft','noseSneerLeft'],
    ['NoseSneerRight','noseSneerRight'],
    ['TongueOut','tongueOut']
]);

const EMOTION_TO_UNITY_MAP = new Map([
    ['Angry',['Angry']],
    ['Happy',['Happy']],
    ['Neutral',['Smile']],
    ['Sad',['Sad']],
    ['Surprised',['Suprise']]
]);

const UNITY_INDEX = new Map(UNITY_BLENDSHAPE_NAMES.map((name, idx) => [name, idx]));
const DEFAULT_DECAY = 0.95;
const DEFAULT_ALPHA = 0.65;
const lastValues = new Float32Array(UNITY_BLENDSHAPE_NAMES.length);

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function addNameVariants(target, baseName, rawValue) {
    if (!baseName) return;
    const value = clamp01(toNumber(rawValue));
    const variants = new Set();
    variants.add(baseName);
    const pascal = baseName[0].toUpperCase() + baseName.slice(1);
    variants.add(pascal);
    const camel = baseName[0].toLowerCase() + baseName.slice(1);
    variants.add(camel);
    variants.add(baseName.toUpperCase());
    variants.forEach(name => {
        target[name] = value;
    });
}

function arrayToNamedValues(array) {
    const named = {};
    for (let i = 0; i < NEUROSYNC_BASE_COLUMNS.length && i < array.length; i++) {
        const col = NEUROSYNC_BASE_COLUMNS[i];
        if (col) {
            addNameVariants(named, col, array[i]);
        }
    }
    const emotionOffset = NEUROSYNC_BASE_COLUMNS.length;
    for (let i = 0; i < NEUROSYNC_EMOTION_COLUMNS.length; i++) {
        const col = NEUROSYNC_EMOTION_COLUMNS[i];
        const value = array[emotionOffset + i];
        if (value !== undefined) {
            addNameVariants(named, col, value);
        }
    }
    return named;
}

function cloneObjectValues(obj) {
    const cloned = {};
    Object.entries(obj).forEach(([key, value]) => {
        addNameVariants(cloned, key, value);
    });
    return cloned;
}

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function copyLastValues() {
    return Float32Array.from(lastValues);
}

function valuesToObject(valuesArray) {
    const result = {};
    UNITY_BLENDSHAPE_NAMES.forEach((name, idx) => {
        addNameVariants(result, name, valuesArray[idx] ?? 0);
    });
    return result;
}

function summarizeBlendshapeValues(obj) {
    if (!obj || typeof obj !== 'object') {
        return { keyCount: 0, nonZeroCount: 0, sample: [] };
    }
    const keys = Object.keys(obj);
    const nonZero = [];
    for (const key of keys) {
        const num = Number(obj[key]);
        if (Number.isFinite(num) && num !== 0) {
            nonZero.push({ key, value: num });
            if (nonZero.length >= 5) break;
        }
    }
    const nonZeroCount = keys.reduce((count, key) => {
        const num = Number(obj[key]);
        return count + (Number.isFinite(num) && num !== 0 ? 1 : 0);
    }, 0);
    return {
        keyCount: keys.length,
        nonZeroCount,
        sample: nonZero.map(({ key, value }) => ({ key, value: Number(value.toFixed(3)) }))
    };
}

function applyUnityValue(targetArray, unityName, value) {
    const index = UNITY_INDEX.get(unityName);
    if (index === undefined) return;
    targetArray[index] = clamp01(value);
}

// -------- 新增：emotion 处理逻辑 --------
function processTopEmotionsFromArray(nsArray, mapped, { decay, alpha }) {
    const emotionOffset = NEUROSYNC_BASE_COLUMNS.length;
    const emotionCount = Math.min(NEUROSYNC_EMOTION_COLUMNS.length, nsArray.length - emotionOffset);
    if (emotionCount <= 0) return;

    const scaled = [];
    for (let i = 0; i < emotionCount; i++) {
        const emoName = NEUROSYNC_EMOTION_COLUMNS[i];
        let emoVal = nsArray[emotionOffset + i] ?? 0;
        switch (emoName) {
            case 'Angry': emoVal /= 5; break;
            case 'Happy': emoVal /= 1; break;
            case 'Neutral': emoVal /= 10; break;
            case 'Sad': emoVal /= 12; break;
            case 'Surprised': emoVal /= 15; break;
        }
        scaled.push({ name: emoName, value: emoVal });
    }

    scaled.sort((a, b) => b.value - a.value);
    const top = scaled.slice(0, 2);

    // console.log('Top emotions (array):', top);

    EMOTION_TO_UNITY_MAP.forEach((unityNames) => {
        unityNames.forEach(unityName => {
            const index = UNITY_INDEX.get(unityName);
            if (index === undefined) return;
            mapped[index] = clamp01(mapped[index] * decay);
        });
    });

    top.forEach(({ name, value }) => {
        const unityNames = EMOTION_TO_UNITY_MAP.get(name);
        if (!unityNames) return;
        unityNames.forEach(unityName => {
            const index = UNITY_INDEX.get(unityName);
            if (index === undefined) return;
            const targetVal = 0.5 * clamp01(value);
            mapped[index] = clamp01(alpha * mapped[index] + (1 - alpha) * targetVal);
        });
    });
}

function processTopEmotionsFromObject(emotions, mapped, { decay, alpha }) {
    if (!emotions || typeof emotions !== 'object') return;

    const scaled = NEUROSYNC_EMOTION_COLUMNS.map(emoName => {
        let emoVal = emotions[emoName] ?? emotions[emoName.toLowerCase()] ?? 0;
        switch (emoName) {
            case 'Angry': emoVal /= 5; break;
            case 'Happy': emoVal /= 1; break;
            case 'Neutral': emoVal /= 10; break;
            case 'Sad': emoVal /= 12; break;
            case 'Surprised': emoVal /= 15; break;
        }
        return { name: emoName, value: toNumber(emoVal) };
    });

    scaled.sort((a, b) => b.value - a.value);
    const top = scaled.slice(0, 2);

    // console.log('Top emotions (object):', top);

    EMOTION_TO_UNITY_MAP.forEach((unityNames) => {
        unityNames.forEach(unityName => {
            const index = UNITY_INDEX.get(unityName);
            if (index === undefined) return;
            mapped[index] = clamp01(mapped[index] * decay);
        });
    });

    top.forEach(({ name, value }) => {
        const unityNames = EMOTION_TO_UNITY_MAP.get(name);
        if (!unityNames) return;
        unityNames.forEach(unityName => {
            const index = UNITY_INDEX.get(unityName);
            if (index === undefined) return;
            const targetVal = 0.5 * clamp01(value);
            mapped[index] = clamp01(alpha * mapped[index] + (1 - alpha) * targetVal);
        });
    });
}

// -------- 修改后的 mapArrayValues / mapObjectValues --------
function mapArrayValues(nsArray, { decay = DEFAULT_DECAY, alpha = DEFAULT_ALPHA } = {}) {
    const mapped = copyLastValues();

    const baseCount = Math.min(NEUROSYNC_BASE_COLUMNS.length, nsArray.length);
    for (let i = 0; i < baseCount; i++) {
        const neuroName = NEUROSYNC_BASE_COLUMNS[i];
        const unityName = NEUROSYNC_TO_UNITY_MAP.get(neuroName);
        if (!unityName) continue;
        applyUnityValue(mapped, unityName, nsArray[i]);
    }

    processTopEmotionsFromArray(nsArray, mapped, { decay, alpha });

    lastValues.set(mapped);
    const result = valuesToObject(mapped);
    // console.log('[NeuroSync] mapArrayValues summary', {
    //     inputLength: Array.isArray(nsArray) ? nsArray.length : 0,
    //     nonZeroInput: Array.isArray(nsArray) ? nsArray.some(v => Number(v) !== 0) : false,
    //     output: summarizeBlendshapeValues(result)
    // });
    return result;
}

function mapObjectValues(valueObject, options = {}) {
    const mapped = copyLastValues();
    let changed = false;

    const lowerCaseMap = new Map();
    Object.entries(valueObject).forEach(([key, value]) => {
        lowerCaseMap.set(key.toLowerCase(), value);
    });

    NEUROSYNC_TO_UNITY_MAP.forEach((unityName, neuroName) => {
        const value = lowerCaseMap.get(neuroName.toLowerCase());
        if (value === undefined) return;
        applyUnityValue(mapped, unityName, value);
        changed = true;
    });

    UNITY_INDEX.forEach((idx, unityName) => {
        if (NEUROSYNC_TO_UNITY_MAP.has(unityName)) return;
        const value = lowerCaseMap.get(unityName.toLowerCase());
        if (value === undefined) return;
        applyUnityValue(mapped, unityName, value);
        changed = true;
    });

    const emotions = valueObject.emotions || valueObject.Emotions;
    processTopEmotionsFromObject(emotions, mapped, options);

    if (changed) {
        lastValues.set(mapped);
    }

    const result = valuesToObject(mapped);
    // console.log('[NeuroSync] mapObjectValues summary', {
    //     changed,
    //     output: summarizeBlendshapeValues(result)
    // });
    return result;
}

// -------- 其他保持不变 --------
function normalizeFrameList(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.frames)) return response.frames;
    if (Array.isArray(response.blendshapes)) return response.blendshapes;
    if (response.frame) return [response.frame];
    return [response];
}

// ---- 全局眨眼状态 ----
let blinkState = {
    timeToNextBlink: 0, // 距离下一次眨眼的剩余时间
    inBlink: false,     // 是否正在眨眼
    blinkProgress: 0    // 当前眨眼进度 (0~1)
};

function resetBlinkState() {
    blinkState = {
        timeToNextBlink: 0,
        inBlink: false,
        blinkProgress: 0
    };
}

// ---- 眨眼控制器 ----
function applyBlink(frames, { blinkMin = 3, blinkMax = 8 } = {}) {
    if (!frames.length) return frames;

    const result = [];
    let prevTime = frames[0]?.time ?? 0;
    const nextInterval = () => Math.random() * (blinkMax - blinkMin) + blinkMin;
    for (const frame of frames) {
        const { time } = frame;
        const values = { ...frame.values };

        const delta = Math.max(0, time - prevTime);
        prevTime = time;

        if (!blinkState.inBlink) {
            if (blinkState.timeToNextBlink <= 0) {
                blinkState.timeToNextBlink = nextInterval();
            }
            blinkState.timeToNextBlink -= delta;
            if (blinkState.timeToNextBlink <= 0) {
                blinkState.inBlink = true;
                blinkState.blinkProgress = 0;
            }
        }

        if (blinkState.inBlink) {
            // 一个眨眼过程持续 ~0.2s, 这里按时间推进
            const blinkDuration = 0.2; 
            blinkState.blinkProgress += delta;

            let blinkValue = 0;
            const t = blinkState.blinkProgress / blinkDuration;
            if (t < 0.25) blinkValue = t * 4 * 1.0;          // 闭眼阶段
            else if (t < 0.75) blinkValue = 1.0;             // 保持闭眼
            else blinkValue = (1 - (t - 0.75) * 4);          // 张开阶段

            blinkValue = clamp01(blinkValue);

            const currentLeft = toNumber(values.eyeBlinkLeft ?? values.EyeBlinkLeft);
            const currentRight = toNumber(values.eyeBlinkRight ?? values.EyeBlinkRight);
            const finalLeft = Math.max(currentLeft, blinkValue);
            const finalRight = Math.max(currentRight, blinkValue);
            addNameVariants(values, 'eyeBlinkLeft', finalLeft);
            addNameVariants(values, 'eyeBlinkRight', finalRight);

            if (blinkState.blinkProgress >= blinkDuration) {
                // 眨眼结束，准备下一次眨眼
                blinkState.inBlink = false;
                blinkState.timeToNextBlink = nextInterval();
                blinkState.blinkProgress = 0;
            }
        }

        result.push({ time, values });
    }

    return result;
}





export function parseNeuroSyncBlendshapeFrames(
    response,
    { duration = 0, decay = DEFAULT_DECAY, alpha = DEFAULT_ALPHA, enableBlink = true } = {},
    preExtractedFrames = null
) {
    const rawFrames = preExtractedFrames ?? extractRawNeuroSyncFrames(response, { duration });
    const rawFramesSummary = rawFrames.map(frame => {
        const arrayValues = Array.isArray(frame.arrayValues) ? frame.arrayValues : null;
        const namedValues = frame.values && typeof frame.values === 'object' ? frame.values : {};
        const nonZeroArray = arrayValues ? arrayValues.some(value => Number(value) !== 0) : null;
        const valueKeys = Object.keys(namedValues);
        const nonZeroObject = valueKeys.some(key => Number(namedValues[key]) !== 0);
        return {
            time: frame?.time ?? 0,
            arrayLength: arrayValues?.length ?? 0,
            hasNonZeroArray: !!nonZeroArray,
            valueKeyCount: valueKeys.length,
            hasNonZeroObject: nonZeroObject
        };
    });
    // console.log('[NeuroSync] raw frames summary', rawFramesSummary);
    // if (rawFrames.length) {
    //     console.log('[NeuroSync] first raw frame data', rawFrames[0]);
    // }
    if (!rawFrames.length) return [];

    // 修复第一个 frame 全 0
    if (rawFrames.length > 1) {
        const first = rawFrames[0];
        const second = rawFrames[1];
        const isFirstAllZero = (arrOrObj) => {
            if (Array.isArray(arrOrObj)) return arrOrObj.every(v => !v || v === 0);
            if (arrOrObj && typeof arrOrObj === 'object') return Object.values(arrOrObj).every(v => !v || v === 0);
            return true;
        };
        if (isFirstAllZero(first.arrayValues ?? first.values)) {
            rawFrames[0] = { ...second, time: first.time };
        }
    }

    let frames = rawFrames.map(frame => {
        const mapped = frame.arrayValues
            ? mapArrayValues(frame.arrayValues, { decay, alpha })
            : mapObjectValues(frame.values, { decay, alpha });
        return { time: frame.time, values: mapped };
    });

    if (enableBlink) {
        frames = applyBlink(frames);
        /*
        const preBlinkFrames = frames.map(frame => ({ time: frame.time, values: { ...frame.values } }));
        const framesBlinkSummary = frames.slice(0, 5).map(({ time, values }) => ({
            time,
            eyeBlinkLeft: Number(toNumber(values.eyeBlinkLeft ?? values.EyeBlinkLeft).toFixed(3)),
            eyeBlinkRight: Number(toNumber(values.eyeBlinkRight ?? values.EyeBlinkRight).toFixed(3))
        }));
        const nonBlinkDiagnostics = frames.slice(0, 5).map((afterFrame, index) => {
            const beforeFrame = preBlinkFrames[index];
            if (!afterFrame || !beforeFrame) return null;
            const beforeValues = beforeFrame.values || {};
            const afterValues = afterFrame.values || {};
            const mergedKeys = new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)]);
            let beforeNonZero = 0;
            let afterNonZero = 0;
            const zeroedKeys = [];
            const changedKeys = [];
            mergedKeys.forEach(key => {
                if (!key || key.toLowerCase().includes('blink')) return;
                const beforeVal = toNumber(beforeValues[key]);
                const afterVal = toNumber(afterValues[key]);
                if (Math.abs(beforeVal) > 1e-6) beforeNonZero += 1;
                if (Math.abs(afterVal) > 1e-6) afterNonZero += 1;
                if (Math.abs(afterVal - beforeVal) > 1e-6) {
                    const entry = {
                        key,
                        before: Number(beforeVal.toFixed(3)),
                        after: Number(afterVal.toFixed(3))
                    };
                    changedKeys.push(entry);
                    if (Math.abs(beforeVal) > 1e-6 && Math.abs(afterVal) <= 1e-6) {
                        zeroedKeys.push(entry);
                    }
                }
            });
            return {
                time: afterFrame.time,
                beforeNonZero,
                afterNonZero,
                zeroedKeys: zeroedKeys.slice(0, 5),
                changedKeys: changedKeys.slice(0, 5)
            };
        }).filter(Boolean);
        console.log('[NeuroSync] frames after blink', {
            frameCount: frames.length,
            blinkSample: framesBlinkSummary,
            nonBlinkDiagnostics
        });
        */
    }

    return frames;
}





export function resetNeuroSyncBlendshapeState() {
    resetBlinkState();
    lastValues.fill(0);
}

export function extractRawNeuroSyncFrames(response, { duration = 0 } = {}) {
    const frames = normalizeFrameList(response);
    if (!frames.length) return [];

    const totalDuration = Math.max(duration, 0);
    const timeStep = frames.length > 1 ? totalDuration / (frames.length - 1) : 0;

    return frames.map((frame, index) => {
        let valuesSource = frame;
        if (frame && typeof frame === 'object') {
            if (Array.isArray(frame.values)) {
                valuesSource = frame.values;
            } else if (frame.values && typeof frame.values === 'object') {
                valuesSource = frame.values;
            }
        }

        let arrayValues = null;
        let namedValues = {};

        if (Array.isArray(valuesSource)) {
            arrayValues = valuesSource.map(toNumber);
            namedValues = arrayToNamedValues(arrayValues);
        } else if (valuesSource && typeof valuesSource === 'object') {
            namedValues = cloneObjectValues(valuesSource);
        }

        let time = 0;
        if (frame && typeof frame.time === 'number' && Number.isFinite(frame.time)) {
            time = Math.max(0, frame.time);
        } else {
            time = index * timeStep;
        }

        return {
            time,
            values: namedValues,
            arrayValues
        };
    });
}

export {
    UNITY_BLENDSHAPE_NAMES,
    NEUROSYNC_BASE_COLUMNS,
    NEUROSYNC_EMOTION_COLUMNS
};
