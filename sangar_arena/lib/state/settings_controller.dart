import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../models/hud_layout.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/strings.dart';

enum GraphicsQuality { low, medium, high }

/// All persisted preferences: language, audio, graphics, controls and the
/// player's loadout. Everything is stored in a single SharedPreferences JSON
/// blob so the settings screen can save atomically.
class SettingsController extends ChangeNotifier {
  SettingsController._(this._prefs);

  static const _key = 'sangar_settings_v1';

  final SharedPreferences _prefs;

  static Future<SettingsController> load() async {
    final prefs = await SharedPreferences.getInstance();
    final c = SettingsController._(prefs);
    c._readFromDisk();
    return c;
  }

  // ---- general -----------------------------------------------------------
  AppLang lang = AppLang.ps;
  String playerName = '';
  String playerId = '';

  // ---- audio -------------------------------------------------------------
  double masterVolume = 0.9;
  double sfxVolume = 1.0;
  double musicVolume = 0.4;

  // ---- graphics ----------------------------------------------------------
  GraphicsQuality quality = GraphicsQuality.medium;
  bool shadows = true;
  bool postFx = true;
  bool showFps = false;
  double renderScale = 1.0;

  // ---- controls ----------------------------------------------------------
  double sensitivity = 1.0;
  double adsSensitivity = 0.6;
  bool invertY = false;
  bool autoFire = false;
  bool leftHanded = false;
  double hudScale = 1.0;

  /// Where the on-screen action buttons sit, and how big they are. Editable
  /// in settings; the engine positions its buttons straight from this.
  List<HudButton> hudLayout = List.of(kDefaultHudLayout);

  // ---- loadout -----------------------------------------------------------
  String agentId = 'zmarai';
  String primaryId = 'ak_sangar';
  String secondaryId = 'pistol_teera';
  String grenadeId = 'frag';

  Strings get strings => Strings(lang);

  void _readFromDisk() {
    final raw = _prefs.getString(_key);
    if (raw != null) {
      try {
        final j = jsonDecode(raw) as Map<String, dynamic>;
        lang = j['lang'] == 'en' ? AppLang.en : AppLang.ps;
        playerName = (j['playerName'] ?? '') as String;
        playerId = (j['playerId'] ?? '') as String;
        masterVolume = (j['masterVolume'] as num?)?.toDouble() ?? masterVolume;
        sfxVolume = (j['sfxVolume'] as num?)?.toDouble() ?? sfxVolume;
        musicVolume = (j['musicVolume'] as num?)?.toDouble() ?? musicVolume;
        quality = GraphicsQuality.values.firstWhere(
          (q) => q.name == j['quality'],
          orElse: () => GraphicsQuality.medium,
        );
        shadows = (j['shadows'] ?? shadows) as bool;
        postFx = (j['postFx'] ?? postFx) as bool;
        showFps = (j['showFps'] ?? showFps) as bool;
        renderScale = (j['renderScale'] as num?)?.toDouble() ?? renderScale;
        sensitivity = (j['sensitivity'] as num?)?.toDouble() ?? sensitivity;
        adsSensitivity =
            (j['adsSensitivity'] as num?)?.toDouble() ?? adsSensitivity;
        invertY = (j['invertY'] ?? invertY) as bool;
        autoFire = (j['autoFire'] ?? autoFire) as bool;
        leftHanded = (j['leftHanded'] ?? leftHanded) as bool;
        hudScale = (j['hudScale'] as num?)?.toDouble() ?? hudScale;
        hudLayout = hudLayoutFromJson(j['hudLayout']);
        agentId = (j['agentId'] ?? agentId) as String;
        primaryId = (j['primaryId'] ?? primaryId) as String;
        secondaryId = (j['secondaryId'] ?? secondaryId) as String;
        grenadeId = (j['grenadeId'] ?? grenadeId) as String;
      } catch (_) {
        // Corrupt blob: fall through to defaults rather than blocking start-up.
      }
    }
    if (playerId.isEmpty) {
      playerId = _newId();
    }
    if (playerName.isEmpty) {
      playerName = 'Player${Random().nextInt(900) + 100}';
    }
  }

  static String _newId() {
    final r = Random.secure();
    final bytes = List<int>.generate(8, (_) => r.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  Map<String, dynamic> toJson() => {
        'lang': lang.name,
        'playerName': playerName,
        'playerId': playerId,
        'masterVolume': masterVolume,
        'sfxVolume': sfxVolume,
        'musicVolume': musicVolume,
        'quality': quality.name,
        'shadows': shadows,
        'postFx': postFx,
        'showFps': showFps,
        'renderScale': renderScale,
        'sensitivity': sensitivity,
        'adsSensitivity': adsSensitivity,
        'invertY': invertY,
        'autoFire': autoFire,
        'leftHanded': leftHanded,
        'hudScale': hudScale,
        'hudLayout': hudLayoutToJson(hudLayout),
        'agentId': agentId,
        'primaryId': primaryId,
        'secondaryId': secondaryId,
        'grenadeId': grenadeId,
      };

  /// The subset the three.js engine cares about.
  Map<String, dynamic> toEngineJson() => {
        'lang': lang.name,
        'masterVolume': masterVolume,
        'sfxVolume': sfxVolume,
        'musicVolume': musicVolume,
        'quality': quality.name,
        'shadows': shadows,
        'postFx': postFx,
        'showFps': showFps,
        'renderScale': renderScale,
        'sensitivity': sensitivity,
        'adsSensitivity': adsSensitivity,
        'invertY': invertY,
        'autoFire': autoFire,
        'leftHanded': leftHanded,
        'hudScale': hudScale,
        'hudLayout': hudLayoutToJson(hudLayout),
      };

  Future<void> save() async {
    await _prefs.setString(_key, jsonEncode(toJson()));
    notifyListeners();
  }

  /// Mutate + persist in one call so screens stay terse.
  Future<void> update(void Function(SettingsController s) fn) async {
    fn(this);
    await save();
  }

  Future<void> resetDefaults() async {
    final keptName = playerName;
    final keptId = playerId;
    masterVolume = 0.9;
    sfxVolume = 1.0;
    musicVolume = 0.4;
    quality = GraphicsQuality.medium;
    shadows = true;
    postFx = true;
    showFps = false;
    renderScale = 1.0;
    sensitivity = 1.0;
    adsSensitivity = 0.6;
    invertY = false;
    autoFire = false;
    leftHanded = false;
    hudScale = 1.0;
    hudLayout = List.of(kDefaultHudLayout);
    playerName = keptName;
    playerId = keptId;
    await save();
  }
}
