# -*- coding: utf-8 -*-
"""
Smart Studio - Audio Engine
د غږ پروسس کولو اصلي انجن

دا ماډل لاندې دندې ترسره کوي:
 * د میکروفون د سطحې (RMS) دوامداره اندازه کول
 * د شاته میوزیک (BGM) غږول او د هغه د حجم کنټرول
 * هوښیار Auto-Ducking (کله چې څوک خبرې وکړي میوزیک ښکته کیږي)
 * د Fade-in / Fade-out نرم لیکوي (linear ramp) لیږد
 * د غږیزو وسایلو (microphone / speaker) پیژندنه

د غږ کتابتونونه (sounddevice / soundfile) ممکن په ځینو چاپیریالونو کې
شتون ونلري (لکه سرور / container). په دې حالت کې انجن بې له crash
"ډیمو حالت" ته ځي او پروګرام بیا هم بوټ کیږي.
"""

import threading
import time
import os

import numpy as np

# د غږ کتابتونونه په محتاطه توګه ایمپورټ کوو
try:
    import sounddevice as sd
    import soundfile as sf
    AUDIO_AVAILABLE = True
    AUDIO_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - چاپیریال پورې اړه لري
    sd = None
    sf = None
    AUDIO_AVAILABLE = False
    AUDIO_IMPORT_ERROR = str(exc)


class AudioEngine:
    """د Smart Studio اصلي غږیز انجن."""

    def __init__(self, on_level=None, on_state=None):
        # د callback فنکشنونه (د SocketIO له لارې UI ته خبر ورکول)
        self.on_level = on_level      # callback(rms_float)
        self.on_state = on_state      # callback(state_dict)

        self._lock = threading.Lock()

        # ---------- د کارن تنظیمات (Settings) ----------
        self.mode = "auto"            # "auto" یا "manual"
        self.threshold = 0.05         # د میکروفون حساسیت (0.0 - 1.0)
        self.min_vol = 0.10           # د خبرو پر مهال د میوزیک لږترلږه حجم
        self.max_vol = 0.80           # د چوپتیا پر مهال د میوزیک اعظمي حجم
        self.fade_down_ms = 300       # د ښکته کیدو سرعت (ms)
        self.fade_up_ms = 800         # د پورته کیدو سرعت (ms)
        self.hold_time = 1.5          # د چوپتیا ځنډ (ثانیې)
        self.master_volume = 0.80     # د لاسي حالت اصلي حجم

        # ---------- د اوډیو سټریم تنظیمات ----------
        self.input_device = None      # د میکروفون device index
        self.output_device = None     # د سپیکر device index
        self.samplerate = 44100
        self.in_blocksize = 1024

        # ---------- د چلولو حالت (Runtime) ----------
        self._mic_rms = 0.0
        self._current_gain = self.max_vol
        self._target_gain = self.max_vol
        self._gain_step = 0.0         # د هر sample لپاره د gain بدلون

        self._audio_data = None       # numpy array (frames, channels)
        self._audio_sr = None
        self._audio_channels = 2
        self._play_pos = 0
        self._playing = False
        self._paused = False
        self._loop = True
        self._loaded_file = None

        self._input_stream = None
        self._output_stream = None

        self._control_thread = None
        self._running = False
        self._last_voice_time = 0.0
        self._ducking = False

    # ==================================================================
    #  د وسایلو پیژندنه (Device discovery)
    # ==================================================================
    def list_devices(self):
        """د موجودو میکروفونونو او سپیکرونو لیست راګرځوي."""
        inputs, outputs = [], []
        if not AUDIO_AVAILABLE:
            return {"inputs": inputs, "outputs": outputs,
                    "available": False, "error": AUDIO_IMPORT_ERROR}
        try:
            devices = sd.query_devices()
            for idx, dev in enumerate(devices):
                entry = {"id": idx, "name": dev["name"]}
                if dev.get("max_input_channels", 0) > 0:
                    inputs.append(entry)
                if dev.get("max_output_channels", 0) > 0:
                    outputs.append(entry)
        except Exception as exc:  # pragma: no cover
            return {"inputs": [], "outputs": [],
                    "available": False, "error": str(exc)}
        return {"inputs": inputs, "outputs": outputs,
                "available": True, "error": None}

    # ==================================================================
    #  د انجن پیل / بندول
    # ==================================================================
    def start(self):
        """د کنټرول thread او د میکروفون سټریم پیل کوي."""
        if self._running:
            return
        self._running = True
        self._start_input_stream()
        self._control_thread = threading.Thread(
            target=self._control_loop, daemon=True)
        self._control_thread.start()

    def stop(self):
        """ټول سټریمونه او thread ودروي."""
        self._running = False
        self._stop_playback_internal()
        self._stop_input_stream()

    # ------------------------------------------------------------------
    #  د میکروفون سټریم
    # ------------------------------------------------------------------
    def _start_input_stream(self):
        if not AUDIO_AVAILABLE:
            return
        self._stop_input_stream()
        try:
            self._input_stream = sd.InputStream(
                samplerate=self.samplerate,
                blocksize=self.in_blocksize,
                device=self.input_device,
                channels=1,
                dtype="float32",
                callback=self._input_callback,
            )
            self._input_stream.start()
        except Exception as exc:  # pragma: no cover
            self._input_stream = None
            self._emit_state(message=f"د میکروفون سټریم تېروتنه: {exc}")

    def _stop_input_stream(self):
        if self._input_stream is not None:
            try:
                self._input_stream.stop()
                self._input_stream.close()
            except Exception:
                pass
            self._input_stream = None

    def _input_callback(self, indata, frames, time_info, status):
        """د هرې میکرو-بفر لپاره د RMS محاسبه."""
        try:
            rms = float(np.sqrt(np.mean(np.square(indata[:, 0]))))
        except Exception:
            rms = 0.0
        # یوه نرمه (smoothed) ارزښت چې VU meter ښه ښکاره شي
        self._mic_rms = 0.6 * self._mic_rms + 0.4 * rms

    # ==================================================================
    #  د میوزیک پلیر (Playback)
    # ==================================================================
    def load_file(self, path):
        """د اوډیو فایل (.wav / .mp3 / .flac ...) لوډ کوي."""
        if not AUDIO_AVAILABLE:
            self._loaded_file = os.path.basename(path)
            return {"ok": False, "error": "د غږ کتابتونونه شتون نلري (ډیمو حالت)"}
        try:
            data, sr = sf.read(path, dtype="float32", always_2d=True)
        except Exception as exc:
            return {"ok": False, "error": f"فایل لوډ نشو: {exc}"}

        with self._lock:
            self._audio_data = data
            self._audio_sr = sr
            self._audio_channels = data.shape[1]
            self._play_pos = 0
            self._loaded_file = os.path.basename(path)
        # د نوي sample rate سره د خروجي سټریم بیا جوړول
        self._restart_output_stream()
        return {"ok": True, "file": self._loaded_file,
                "duration": round(len(data) / sr, 1)}

    def _restart_output_stream(self):
        if not AUDIO_AVAILABLE or self._audio_data is None:
            return
        self._stop_output_stream()
        try:
            self._output_stream = sd.OutputStream(
                samplerate=self._audio_sr,
                device=self.output_device,
                channels=self._audio_channels,
                dtype="float32",
                callback=self._output_callback,
            )
            self._output_stream.start()
        except Exception as exc:  # pragma: no cover
            self._output_stream = None
            self._emit_state(message=f"د خروجي سټریم تېروتنه: {exc}")

    def _stop_output_stream(self):
        if self._output_stream is not None:
            try:
                self._output_stream.stop()
                self._output_stream.close()
            except Exception:
                pass
            self._output_stream = None

    def _output_callback(self, outdata, frames, time_info, status):
        """د میوزیک سامپلونه له نرم (ramped) gain سره خروجي ته لیکي."""
        if self._audio_data is None or not self._playing or self._paused:
            outdata.fill(0)
            return

        data = self._audio_data
        total = len(data)
        pos = self._play_pos
        end = pos + frames

        if end <= total:
            chunk = data[pos:end].copy()
            self._play_pos = end
        else:
            # د فایل پای ته رسیدلی — که loop وي بیا له سره پیل
            first = data[pos:total]
            remaining = frames - len(first)
            if self._loop and remaining > 0:
                second = data[0:remaining]
                chunk = np.vstack([first, second]).copy()
                self._play_pos = remaining
            else:
                chunk = np.zeros((frames, self._audio_channels), dtype="float32")
                chunk[:len(first)] = first
                self._play_pos = total
                self._playing = False

        # ---- د هر sample لپاره د gain نرم ليکوی (linear ramp) ----
        cur = self._current_gain
        step = self._gain_step
        tgt = self._target_gain
        ramp = cur + step * np.arange(1, frames + 1, dtype="float32")
        if step >= 0:
            ramp = np.minimum(ramp, tgt)
        else:
            ramp = np.maximum(ramp, tgt)
        self._current_gain = float(ramp[-1])

        outdata[:] = chunk * ramp[:, None]

    # ------------------------------------------------------------------
    #  د پلیر کنټرولونه
    # ------------------------------------------------------------------
    def play(self):
        if self._audio_data is None:
            return {"ok": False, "error": "هیڅ فایل نه دی لوډ شوی"}
        self._paused = False
        self._playing = True
        if self._output_stream is None:
            self._restart_output_stream()
        self._emit_state()
        return {"ok": True}

    def pause(self):
        self._paused = True
        self._emit_state()
        return {"ok": True}

    def stop_playback(self):
        self._stop_playback_internal()
        self._emit_state()
        return {"ok": True}

    def _stop_playback_internal(self):
        self._playing = False
        self._paused = False
        self._play_pos = 0

    # ==================================================================
    #  د gain د هدف ټاکل (Fade engine)
    # ==================================================================
    def _set_target(self, target, fade_ms):
        """نوی gain هدف او د هغه لپاره د هر sample قدم محاسبه کوي."""
        target = max(0.0, min(1.0, float(target)))
        sr = self._audio_sr or self.samplerate
        ramp_samples = max(1, int((fade_ms / 1000.0) * sr))
        with self._lock:
            self._target_gain = target
            self._gain_step = (target - self._current_gain) / ramp_samples

    # ==================================================================
    #  د کنټرول حلقه (د SRS pseudocode منطق)
    # ==================================================================
    def _control_loop(self):
        while self._running:
            rms = self._mic_rms

            # VU meter ته خبر ورکول
            if self.on_level:
                try:
                    self.on_level(rms)
                except Exception:
                    pass

            if self.mode == "auto":
                if rms > self.threshold:
                    # غږ دی — میوزیک ښکته کړه
                    self._last_voice_time = time.time()
                    if not self._ducking:
                        self._ducking = True
                        self._set_target(self.min_vol, self.fade_down_ms)
                else:
                    # چوپتیا — د hold_time وروسته میوزیک پورته کړه
                    if self._ducking and \
                            (time.time() - self._last_voice_time) >= self.hold_time:
                        self._ducking = False
                        self._set_target(self.max_vol, self.fade_up_ms)
            else:
                # لاسي حالت — مستقیم د master volume تعقیب
                self._ducking = False
                self._set_target(self.master_volume, 80)

            time.sleep(0.05)  # هر 50ms

    # ==================================================================
    #  د تنظیماتو تازه کول
    # ==================================================================
    def update_settings(self, **kwargs):
        """له UI څخه د راغلو تنظیماتو تطبیق."""
        mapping = {
            "mode": str,
            "threshold": float,
            "min_vol": float,
            "max_vol": float,
            "fade_down_ms": int,
            "fade_up_ms": int,
            "hold_time": float,
            "master_volume": float,
        }
        for key, caster in mapping.items():
            if key in kwargs and kwargs[key] is not None:
                try:
                    setattr(self, key, caster(kwargs[key]))
                except (ValueError, TypeError):
                    pass

        # که په لاسي حالت کې یو، سمدلاسه د master volume تطبیق
        if self.mode == "manual" and "master_volume" in kwargs:
            self._set_target(self.master_volume, 80)
        self._emit_state()
        return self.get_state()

    def set_input_device(self, device_id):
        self.input_device = None if device_id in (None, "", "null") else int(device_id)
        if self._running:
            self._start_input_stream()
        self._emit_state()

    def set_output_device(self, device_id):
        self.output_device = None if device_id in (None, "", "null") else int(device_id)
        if self._audio_data is not None:
            self._restart_output_stream()
        self._emit_state()

    # ==================================================================
    #  د حالت راپور
    # ==================================================================
    def get_state(self):
        return {
            "mode": self.mode,
            "threshold": self.threshold,
            "min_vol": self.min_vol,
            "max_vol": self.max_vol,
            "fade_down_ms": self.fade_down_ms,
            "fade_up_ms": self.fade_up_ms,
            "hold_time": self.hold_time,
            "master_volume": self.master_volume,
            "playing": self._playing and not self._paused,
            "paused": self._paused,
            "ducking": self._ducking,
            "current_gain": round(self._current_gain, 3),
            "loaded_file": self._loaded_file,
            "input_device": self.input_device,
            "output_device": self.output_device,
            "audio_available": AUDIO_AVAILABLE,
        }

    def _emit_state(self, message=None):
        if self.on_state:
            try:
                state = self.get_state()
                if message:
                    state["message"] = message
                self.on_state(state)
            except Exception:
                pass
