# -*- coding: utf-8 -*-
"""
Smart Studio - Flask Web Server
د سمارټ سټوډیو ویب سرور

دا سرور لاندې چاره کوي:
 * د HTML انٹرفیس وړاندې کول (Pashto / RTL)
 * د REST API له لارې د فایل اپلوډ، وسایلو پیژندنه، تنظیمات
 * د Flask-SocketIO له لارې د VU meter او حالت ریښتیني-وخت تازه کول
"""

import os
import threading

from flask import (Flask, render_template, request, jsonify,
                   send_from_directory)
from flask_socketio import SocketIO

from audio_engine import AudioEngine, AUDIO_AVAILABLE, AUDIO_IMPORT_ERROR

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
app.config["SECRET_KEY"] = "smart-studio-secret-key"
app.config["UPLOAD_FOLDER"] = UPLOAD_DIR
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100MB

# د threading حالت — له eventlet/gevent پرته کار کوي
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


# ----------------------------------------------------------------------
#  د انجن callbacks (له background thread څخه SocketIO ته)
# ----------------------------------------------------------------------
def _on_level(rms):
    socketio.emit("vu_level", {"level": float(rms)})


def _on_state(state):
    socketio.emit("state_update", state)


engine = AudioEngine(on_level=_on_level, on_state=_on_state)


# ----------------------------------------------------------------------
#  مرستندویه فنکشنونه
# ----------------------------------------------------------------------
def _allowed_file(filename):
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS


# ----------------------------------------------------------------------
#  Routes
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html",
                           audio_available=AUDIO_AVAILABLE,
                           audio_error=AUDIO_IMPORT_ERROR)


@app.route("/api/devices")
def api_devices():
    """د موجودو غږیزو وسایلو لیست (Hot-plug refresh)."""
    return jsonify(engine.list_devices())


@app.route("/api/state")
def api_state():
    return jsonify(engine.get_state())


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """د اوډیو فایل اپلوډ او لوډ کول."""
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "هیڅ فایل ونه لیږل شو"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"ok": False, "error": "د فایل نوم تش دی"}), 400
    if not _allowed_file(file.filename):
        return jsonify({"ok": False,
                        "error": "د فایل ډول نه منل کیږي (.mp3/.wav)"}), 400

    safe_name = os.path.basename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
    file.save(save_path)

    result = engine.load_file(save_path)
    status = 200 if result.get("ok") else 200  # ډیمو حالت کې هم 200
    return jsonify(result), status


@app.route("/api/settings", methods=["POST"])
def api_settings():
    """د تنظیماتو تازه کول (threshold, volumes, fade, hold ...)."""
    data = request.get_json(silent=True) or {}
    state = engine.update_settings(**data)
    return jsonify({"ok": True, "state": state})


@app.route("/api/device/input", methods=["POST"])
def api_device_input():
    data = request.get_json(silent=True) or {}
    engine.set_input_device(data.get("device_id"))
    return jsonify({"ok": True, "state": engine.get_state()})


@app.route("/api/device/output", methods=["POST"])
def api_device_output():
    data = request.get_json(silent=True) or {}
    engine.set_output_device(data.get("device_id"))
    return jsonify({"ok": True, "state": engine.get_state()})


@app.route("/api/play", methods=["POST"])
def api_play():
    return jsonify(engine.play())


@app.route("/api/pause", methods=["POST"])
def api_pause():
    return jsonify(engine.pause())


@app.route("/api/stop", methods=["POST"])
def api_stop():
    return jsonify(engine.stop_playback())


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# ----------------------------------------------------------------------
#  SocketIO پیښې
# ----------------------------------------------------------------------
@socketio.on("connect")
def on_connect():
    socketio.emit("state_update", engine.get_state())


# ----------------------------------------------------------------------
#  د پروګرام پیل
# ----------------------------------------------------------------------
def main():
    # د انجن پیل (که غږ شتون ولري میکروفون فعالیږي)
    engine.start()
    print("=" * 60)
    print("  Smart Studio — د هوښیار غږ مدیریت سیسټم")
    print("  پته: http://127.0.0.1:5000")
    if not AUDIO_AVAILABLE:
        print("  خبرتیا: د غږ کتابتونونه شتون نلري — ډیمو حالت فعال دی")
        print(f"  ({AUDIO_IMPORT_ERROR})")
    print("=" * 60)
    socketio.run(app, host="0.0.0.0", port=5000,
                 debug=False, allow_unsafe_werkzeug=True)


if __name__ == "__main__":
    main()
