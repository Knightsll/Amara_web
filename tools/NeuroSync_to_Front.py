import random
import math
import time

class BlinkController:
    def __init__(self):
        self.next_blink_time = time.time() + random.uniform(2, 5)  # 下一次眨眼时间
        self.blink_duration = 0.2  # 眨眼持续时间 (秒)
        self.state = "idle"  # idle / blinking
        self.start_time = None

    def update(self):
        now = time.time()
        blink_val = 0.0

        if self.state == "idle" and now >= self.next_blink_time:
            # 开始眨眼
            self.state = "blinking"
            self.start_time = now
            self.next_blink_time = now + random.uniform(2, 5)  # 下一次眨眼
        if self.state == "blinking":
            t = (now - self.start_time) / self.blink_duration
            if t >= 1.0:
                self.state = "idle"
                blink_val = 0.0
            else:
                # 用 cos 曲线平滑模拟
                blink_val = 0.5 * (1 - math.cos(math.pi * min(1.0, t)))
        return blink_val


import requests
import soundfile as sf
import time
import socket
import json
import numpy as np
import threading
import queue
from convert_audio import audio_to_bytes

API_URL = "http://127.0.0.1:5000/audio_to_blendshapes"
HOST, PORT = "127.0.0.1", 5005

UNITY_BLENDSHAPE_NAMES = [
    "eyeBlinkLeft",        # 0
    "eyeLookDownLeft",     # 1
    "eyeLookInLeft",       # 2
    "eyeLookOutLeft",      # 3
    "eyeLookUpLeft",       # 4
    "eyeSquintLeft",       # 5
    "eyeWideLeft",         # 6
    "eyeBlinkRight",       # 7
    "eyeLookDownRight",    # 8
    "eyeLookInRight",      # 9
    "eyeLookOutRight",     # 10
    "eyeLookUpRight",      # 11
    "eyeSquintRight",      # 12
    "eyeWideRight",        # 13
    "jawForward",          # 14
    "jawLeft",             # 15
    "jawRight",            # 16
    "jawOpen",             # 17
    "mouthClose",          # 18
    "mouthFunnel",         # 19
    "mouthPucker",         # 20
    "mouthRight",          # 21
    "mouthLeft",           # 22
    "mouthSmileLeft",      # 23
    "mouthSmileRight",     # 24
    "mouthFrownRight",     # 25
    "mouthFrownLeft",      # 26
    "mouthDimpleLeft",     # 27
    "mouthDimpleRight",    # 28
    "mouthStretchLeft",    # 29
    "mouthStretchRight",   # 30
    "mouthRollLower",      # 31
    "mouthRollUpper",      # 32
    "mouthShrugLower",     # 33
    "mouthShrugUpper",     # 34
    "mouthPressLeft",      # 35
    "mouthPressRight",     # 36
    "mouthLowerDownLeft",  # 37
    "mouthLowerDownRight", # 38
    "mouthUpperUpLeft",    # 39
    "mouthUpperUpRight",   # 40
    "browDownLeft",        # 41
    "browDownRight",       # 42
    "browInnerUp",         # 43
    "browOuterUpLeft",     # 44
    "browOuterUpRight",    # 45
    "cheekPuff",           # 46
    "cheekSquintLeft",     # 47
    "cheekSquintRight",    # 48
    "noseSneerLeft",       # 49
    "noseSneerRight",      # 50
    "tongueOut",           # 51
    "STAFF",               # 52
    "EYEPATCH",            # 53
    "SMUG"                 # 54
]


NEUROSYNC_BASE_COLUMNS = [
    'EyeBlinkLeft','EyeLookDownLeft','EyeLookInLeft','EyeLookOutLeft','EyeLookUpLeft',
    'EyeSquintLeft','EyeWideLeft','EyeBlinkRight','EyeLookDownRight','EyeLookInRight','EyeLookOutRight','EyeLookUpRight',
    'EyeSquintRight','EyeWideRight','JawForward','JawRight','JawLeft','JawOpen','MouthClose','MouthFunnel','MouthPucker',
    'MouthRight','MouthLeft','MouthSmileLeft','MouthSmileRight','MouthFrownLeft','MouthFrownRight','MouthDimpleLeft',
    'MouthDimpleRight','MouthStretchLeft','MouthStretchRight','MouthRollLower','MouthRollUpper','MouthShrugLower',
    'MouthShrugUpper','MouthPressLeft','MouthPressRight','MouthLowerDownLeft','MouthLowerDownRight','MouthUpperUpLeft',
    'MouthUpperUpRight','BrowDownLeft','BrowDownRight','BrowInnerUp','BrowOuterUpLeft','BrowOuterUpRight','CheekPuff',
    'CheekSquintLeft','CheekSquintRight','NoseSneerLeft','NoseSneerRight','TongueOut','HeadYaw','HeadPitch','HeadRoll',
    'LeftEyeYaw','LeftEyePitch','LeftEyeRoll','RightEyeYaw','RightEyePitch','RightEyeRoll'
]

NEUROSYNC_EMOTION_COLUMNS = ['Angry','Disgusted','Fearful','Happy','Neutral','Sad','Surprised']

neurosync_to_unity_map = {
    "EyeBlinkLeft": "eyeBlinkLeft",
    "EyeBlinkRight": "eyeBlinkRight",
    "EyeSquintLeft": "eyeSquintLeft",
    "EyeSquintRight": "eyeSquintRight",
    "EyeWideLeft": "eyeWideLeft",
    "EyeWideRight": "eyeWideRight",
    "EyeLookUpLeft": "eyeLookUpLeft",
    "EyeLookUpRight": "eyeLookUpRight",
    "EyeLookDownLeft": "eyeLookDownLeft",
    "EyeLookDownRight": "eyeLookDownRight",
    "EyeLookInLeft": "eyeLookInLeft",
    "EyeLookInRight": "eyeLookInRight",
    "EyeLookOutLeft": "eyeLookOutLeft",
    "EyeLookOutRight": "eyeLookOutRight",

    "JawForward": "jawForward",
    "JawRight": "jawRight",
    "JawLeft": "jawLeft",
    "JawOpen": "jawOpen",

    "MouthClose": "mouthClose",
    "MouthFunnel": "mouthFunnel",
    "MouthPucker": "mouthPucker",
    "MouthSmileLeft": "mouthSmileLeft",
    "MouthSmileRight": "mouthSmileRight",
    "MouthFrownLeft": "mouthFrownLeft",
    "MouthFrownRight": "mouthFrownRight",
    "MouthDimpleLeft": "mouthDimpleLeft",
    "MouthDimpleRight": "mouthDimpleRight",
    "MouthStretchLeft": "mouthStretchLeft",
    "MouthStretchRight": "mouthStretchRight",
    "MouthRollLower": "mouthRollLower",
    "MouthRollUpper": "mouthRollUpper",
    "MouthShrugLower": "mouthShrugLower",
    "MouthShrugUpper": "mouthShrugUpper",
    "MouthPressLeft": "mouthPressLeft",
    "MouthPressRight": "mouthPressRight",
    "MouthLowerDownLeft": "mouthLowerDownLeft",
    "MouthLowerDownRight": "mouthLowerDownRight",
    "MouthUpperUpLeft": "mouthUpperUpLeft",
    "MouthUpperUpRight": "mouthUpperUpRight",

    "BrowDownLeft": "browDownLeft",
    "BrowDownRight": "browDownRight",
    "BrowInnerUp": "browInnerUp",
    "BrowOuterUpLeft": "browOuterUpLeft",
    "BrowOuterUpRight": "browOuterUpRight",

    "CheekPuff": "cheekPuff",
    "CheekSquintLeft": "cheekSquintLeft",
    "CheekSquintRight": "cheekSquintRight",

    "NoseSneerLeft": "noseSneerLeft",
    "NoseSneerRight": "noseSneerRight",

    "TongueOut": "tongueOut"
}


emotion_to_unity_map = {
    "Angry": ["frown"],
    "Disgusted": ["Sneer"],
    "Fearful": ["LipsStretch_L","LipsStretch_R"],
    "Happy": ["smile","MouthSmile_L","MouthSmile_R"],
    "Neutral": ["sil"],
    "Sad": ["MouthFrown_L","MouthFrown_R"],
    "Surprised": ["OH","BrowsU_C"]
}

# ---------- 映射 ----------
last_values = np.zeros(len(UNITY_BLENDSHAPE_NAMES))

def map_neurosync_to_unity(ns_output_68, decay=0.95, alpha=0.65):
    global last_values
    mapped = last_values.copy()

    # base 通道：直接赋值
    for idx, name in enumerate(NEUROSYNC_BASE_COLUMNS):
        if name in neurosync_to_unity_map:
            uni_name = neurosync_to_unity_map[name]
            if uni_name in UNITY_BLENDSHAPE_NAMES:
                ui = UNITY_BLENDSHAPE_NAMES.index(uni_name)
                mapped[ui] = ns_output_68[idx]

    # # emotion 通道：防闪烁 + 平滑
    # for i, emo in enumerate(NEUROSYNC_EMOTION_COLUMNS):
    #     for uni_name in emotion_to_unity_map.get(emo, []):
    #         if uni_name in UNITY_BLENDSHAPE_NAMES:
    #             ui = UNITY_BLENDSHAPE_NAMES.index(uni_name)
    #             emo_val = ns_output_68[61 + i]

    #             if emo_val == 0:
    #                 mapped[ui] = last_values[ui] * decay
    #             else:
    #                 target_val = 0.5 * emo_val
    #                 mapped[ui] = alpha * last_values[ui] + (1 - alpha) * target_val

    last_values = mapped
    return np.clip(mapped, 0.0, 1.0)




