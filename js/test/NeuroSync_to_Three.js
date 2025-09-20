// const UNITY_BLENDSHAPE_NAMES = [
//     'eyeBlinkLeft','eyeLookDownLeft','eyeLookInLeft','eyeLookOutLeft','eyeLookUpLeft','eyeSquintLeft','eyeWideLeft',
//     'eyeBlinkRight','eyeLookDownRight','eyeLookInRight','eyeLookOutRight','eyeLookUpRight','eyeSquintRight','eyeWideRight',
//     'jawForward','jawLeft','jawRight','jawOpen','mouthClose','mouthFunnel','mouthPucker','mouthRight','mouthLeft',
//     'mouthSmileLeft','mouthSmileRight','mouthFrownRight','mouthFrownLeft','mouthDimpleLeft','mouthDimpleRight',
//     'mouthStretchLeft','mouthStretchRight','mouthRollLower','mouthRollUpper','mouthShrugLower','mouthShrugUpper',
//     'mouthPressLeft','mouthPressRight','mouthLowerDownLeft','mouthLowerDownRight','mouthUpperUpLeft','mouthUpperUpRight',
//     'browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight','cheekPuff','cheekSquintLeft',
//     'cheekSquintRight','noseSneerLeft','noseSneerRight','tongueOut','STAFF','EYEPATCH','SMUG','Smile','Angry','Sad','Happy','Suprise'
// ];

// const NEUROSYNC_BASE_COLUMNS = [
//     'EyeBlinkLeft','EyeLookDownLeft','EyeLookInLeft','EyeLookOutLeft','EyeLookUpLeft','EyeSquintLeft','EyeWideLeft',
//     'EyeBlinkRight','EyeLookDownRight','EyeLookInRight','EyeLookOutRight','EyeLookUpRight','EyeSquintRight','EyeWideRight',
//     'JawForward','JawRight','JawLeft','JawOpen','MouthClose','MouthFunnel','MouthPucker','MouthRight','MouthLeft',
//     'MouthSmileLeft','MouthSmileRight','MouthFrownLeft','MouthFrownRight','MouthDimpleLeft','MouthDimpleRight',
//     'MouthStretchLeft','MouthStretchRight','MouthRollLower','MouthRollUpper','MouthShrugLower','MouthShrugUpper',
//     'MouthPressLeft','MouthPressRight','MouthLowerDownLeft','MouthLowerDownRight','MouthUpperUpLeft','MouthUpperUpRight',
//     'BrowDownLeft','BrowDownRight','BrowInnerUp','BrowOuterUpLeft','BrowOuterUpRight','CheekPuff','CheekSquintLeft',
//     'CheekSquintRight','NoseSneerLeft','NoseSneerRight','TongueOut','HeadYaw','HeadPitch','HeadRoll',
//     'LeftEyeYaw','LeftEyePitch','LeftEyeRoll','RightEyeYaw','RightEyePitch','RightEyeRoll'
// ];

// const NEUROSYNC_EMOTION_COLUMNS = ['Angry','Disgusted','Fearful','Happy','Neutral','Sad','Surprised'];

// const NEUROSYNC_TO_UNITY_MAP = new Map([
//     ['EyeBlinkLeft','eyeBlinkLeft'],
//     ['EyeBlinkRight','eyeBlinkRight'],
//     ['EyeSquintLeft','eyeSquintLeft'],
//     ['EyeSquintRight','eyeSquintRight'],
//     ['EyeWideLeft','eyeWideLeft'],
//     ['EyeWideRight','eyeWideRight'],
//     ['EyeLookUpLeft','eyeLookUpLeft'],
//     ['EyeLookUpRight','eyeLookUpRight'],
//     ['EyeLookDownLeft','eyeLookDownLeft'],
//     ['EyeLookDownRight','eyeLookDownRight'],
//     ['EyeLookInLeft','eyeLookInLeft'],
//     ['EyeLookInRight','eyeLookInRight'],
//     ['EyeLookOutLeft','eyeLookOutLeft'],
//     ['EyeLookOutRight','eyeLookOutRight'],
//     ['JawForward','jawForward'],
//     ['JawRight','jawRight'],
//     ['JawLeft','jawLeft'],
//     ['JawOpen','jawOpen'],
//     ['MouthClose','mouthClose'],
//     ['MouthFunnel','mouthFunnel'],
//     ['MouthPucker','mouthPucker'],
//     ['MouthSmileLeft','mouthSmileLeft'],
//     ['MouthSmileRight','mouthSmileRight'],
//     ['MouthFrownLeft','mouthFrownLeft'],
//     ['MouthFrownRight','mouthFrownRight'],
//     ['MouthDimpleLeft','mouthDimpleLeft'],
//     ['MouthDimpleRight','mouthDimpleRight'],
//     ['MouthStretchLeft','mouthStretchLeft'],
//     ['MouthStretchRight','mouthStretchRight'],
//     ['MouthRollLower','mouthRollLower'],
//     ['MouthRollUpper','mouthRollUpper'],
//     ['MouthShrugLower','mouthShrugLower'],
//     ['MouthShrugUpper','mouthShrugUpper'],
//     ['MouthPressLeft','mouthPressLeft'],
//     ['MouthPressRight','mouthPressRight'],
//     ['MouthLowerDownLeft','mouthLowerDownLeft'],
//     ['MouthLowerDownRight','mouthLowerDownRight'],
//     ['MouthUpperUpLeft','mouthUpperUpLeft'],
//     ['MouthUpperUpRight','mouthUpperUpRight'],
//     ['BrowDownLeft','browDownLeft'],
//     ['BrowDownRight','browDownRight'],
//     ['BrowInnerUp','browInnerUp'],
//     ['BrowOuterUpLeft','browOuterUpLeft'],
//     ['BrowOuterUpRight','browOuterUpRight'],
//     ['CheekPuff','cheekPuff'],
//     ['CheekSquintLeft','cheekSquintLeft'],
//     ['CheekSquintRight','cheekSquintRight'],
//     ['NoseSneerLeft','noseSneerLeft'],
//     ['NoseSneerRight','noseSneerRight'],
//     ['TongueOut','tongueOut']
// ]);

// const EMOTION_TO_UNITY_MAP = new Map([
//     ['Angry',['Angry']],
//     ['Happy',['Happy']],
//     ['Neutral',['Smile']],
//     ['Sad',['Sad']],
//     ['Surprised',['Suprise']]
// ]);

// const UNITY_INDEX = new Map(UNITY_BLENDSHAPE_NAMES.map((name, idx) => [name, idx]));
// const DEFAULT_DECAY = 0.95;
// const DEFAULT_ALPHA = 0.65;
// const lastValues = new Float32Array(UNITY_BLENDSHAPE_NAMES.length);

// function toNumber(value) {
//     const num = Number(value);
//     return Number.isFinite(num) ? num : 0;
// }

// function arrayToNamedValues(array) {
//     const named = {};
//     for (let i = 0; i < NEUROSYNC_BASE_COLUMNS.length && i < array.length; i++) {
//         const col = NEUROSYNC_BASE_COLUMNS[i];
//         if (col) named[col] = toNumber(array[i]);
//     }
//     const emotionOffset = NEUROSYNC_BASE_COLUMNS.length;
//     for (let i = 0; i < NEUROSYNC_EMOTION_COLUMNS.length; i++) {
//         const col = NEUROSYNC_EMOTION_COLUMNS[i];
//         const value = array[emotionOffset + i];
//         if (value !== undefined) named[col] = toNumber(value);
//     }
//     return named;
// }

// function cloneObjectValues(obj) {
//     const cloned = {};
//     Object.entries(obj).forEach(([key, value]) => {
//         cloned[key] = toNumber(value);
//     });
//     return cloned;
// }

// function clamp01(value) {
//     if (!Number.isFinite(value)) return 0;
//     if (value < 0) return 0;
//     if (value > 1) return 1;
//     return value;
// }

// function copyLastValues() {
//     return Float32Array.from(lastValues);
// }

// function valuesToObject(valuesArray) {
//     const result = {};
//     UNITY_BLENDSHAPE_NAMES.forEach((name, idx) => {
//         result[name] = clamp01(valuesArray[idx] ?? 0);
//     });
//     return result;
// }

// function applyUnityValue(targetArray, unityName, value) {
//     const index = UNITY_INDEX.get(unityName);
//     if (index === undefined) return;
//     targetArray[index] = clamp01(value);
// }

// function mapArrayValues(nsArray, { decay = DEFAULT_DECAY, alpha = DEFAULT_ALPHA } = {}) {
//     const mapped = copyLastValues();

//     const baseCount = Math.min(NEUROSYNC_BASE_COLUMNS.length, nsArray.length);
//     for (let i = 0; i < baseCount; i++) {
//         const neuroName = NEUROSYNC_BASE_COLUMNS[i];
//         const unityName = NEUROSYNC_TO_UNITY_MAP.get(neuroName);
//         if (!unityName) continue;
//         applyUnityValue(mapped, unityName, nsArray[i]);
//     }

//     const emotionOffset = NEUROSYNC_BASE_COLUMNS.length;
//     const emotionCount = Math.min(NEUROSYNC_EMOTION_COLUMNS.length, nsArray.length - emotionOffset);
//     for (let i = 0; i < emotionCount; i++) {
//         const emoName = NEUROSYNC_EMOTION_COLUMNS[i];
//         const unityNames = EMOTION_TO_UNITY_MAP.get(emoName);
//         if (!unityNames) continue;
//         const emoVal = nsArray[emotionOffset + i];
//         unityNames.forEach(unityName => {
//             const index = UNITY_INDEX.get(unityName);
//             if (index === undefined) return;
//             if (emoVal === 0) {
//                 mapped[index] = clamp01(mapped[index] * decay);
//             } else {
//                 const targetVal = 0.5 * clamp01(emoVal);
//                 mapped[index] = clamp01(alpha * mapped[index] + (1 - alpha) * targetVal);
//             }
//         });
//     }

//     lastValues.set(mapped);
//     return valuesToObject(mapped);
// }

// function mapObjectValues(valueObject, options) {
//     const mapped = copyLastValues();
//     let changed = false;

//     const lowerCaseMap = new Map();
//     Object.entries(valueObject).forEach(([key, value]) => {
//         lowerCaseMap.set(key.toLowerCase(), value);
//     });

//     NEUROSYNC_TO_UNITY_MAP.forEach((unityName, neuroName) => {
//         const value = lowerCaseMap.get(neuroName.toLowerCase());
//         if (value === undefined) return;
//         applyUnityValue(mapped, unityName, value);
//         changed = true;
//     });

//     UNITY_INDEX.forEach((idx, unityName) => {
//         if (NEUROSYNC_TO_UNITY_MAP.has(unityName)) return;
//         const value = lowerCaseMap.get(unityName.toLowerCase());
//         if (value === undefined) return;
//         applyUnityValue(mapped, unityName, value);
//         changed = true;
//     });

//     const emotions = valueObject.emotions || valueObject.Emotions;
//     if (emotions && typeof emotions === 'object') {
//         EMOTION_TO_UNITY_MAP.forEach((unityNames, emoName) => {
//             const emoValue = emotions[emoName] ?? emotions[emoName.toLowerCase()];
//             if (emoValue === undefined) return;
//             unityNames.forEach(unityName => {
//                 const index = UNITY_INDEX.get(unityName);
//                 if (index === undefined) return;
//                 const current = mapped[index];
//                 const newValue = emoValue === 0
//                     ? clamp01(current * (options?.decay ?? DEFAULT_DECAY))
//                     : clamp01((options?.alpha ?? DEFAULT_ALPHA) * current + (1 - (options?.alpha ?? DEFAULT_ALPHA)) * (0.5 * clamp01(emoValue)));
//                 mapped[index] = newValue;
//             });
//         });
//     }

//     if (changed) {
//         lastValues.set(mapped);
//     }

//     return valuesToObject(mapped);
// }

// function normalizeFrameList(response) {
//     if (!response) return [];
//     if (Array.isArray(response)) return response;
//     if (Array.isArray(response.frames)) return response.frames;
//     if (Array.isArray(response.blendshapes)) return response.blendshapes;
//     if (response.frame) return [response.frame];
//     return [response];
// }

// export function parseNeuroSyncBlendshapeFrames(response, { duration = 0, decay = DEFAULT_DECAY, alpha = DEFAULT_ALPHA } = {}, preExtractedFrames = null) {
//     const rawFrames = preExtractedFrames ?? extractRawNeuroSyncFrames(response, { duration });
//     return rawFrames.map(frame => {
//         const mapped = frame.arrayValues
//             ? mapArrayValues(frame.arrayValues, { decay, alpha })
//             : mapObjectValues(frame.values, { decay, alpha });
//         return { time: frame.time, values: mapped };
//     });
// }

// export function resetNeuroSyncBlendshapeState() {
//     lastValues.fill(0);
// }

// export function extractRawNeuroSyncFrames(response, { duration = 0 } = {}) {
//     const frames = normalizeFrameList(response);
//     if (!frames.length) return [];

//     const totalDuration = Math.max(duration, 0);
//     const timeStep = frames.length > 1 ? totalDuration / (frames.length - 1) : 0;

//     return frames.map((frame, index) => {
//         let valuesSource = frame;
//         if (frame && typeof frame === 'object') {
//             if (Array.isArray(frame.values)) {
//                 valuesSource = frame.values;
//             } else if (frame.values && typeof frame.values === 'object') {
//                 valuesSource = frame.values;
//             }
//         }

//         let arrayValues = null;
//         let namedValues = {};

//         if (Array.isArray(valuesSource)) {
//             arrayValues = valuesSource.map(toNumber);
//             namedValues = arrayToNamedValues(arrayValues);
//         } else if (valuesSource && typeof valuesSource === 'object') {
//             namedValues = cloneObjectValues(valuesSource);
//         }

//         let time = 0;
//         if (frame && typeof frame.time === 'number' && Number.isFinite(frame.time)) {
//             time = Math.max(0, frame.time);
//         } else {
//             time = index * timeStep;
//         }

//         return {
//             time,
//             values: namedValues,
//             arrayValues
//         };
//     });
// }

// export {
//     UNITY_BLENDSHAPE_NAMES,
//     NEUROSYNC_BASE_COLUMNS,
//     NEUROSYNC_EMOTION_COLUMNS
// };
