import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../models/catalog.dart';
import '../models/match.dart';
import 'lan.dart';
import 'protocol.dart';

enum SessionRole { host, client, solo }

enum SessionStatus { idle, starting, connecting, connected, failed, closed }

/// Owns one match from lobby to scoreboard, in whichever role this device is
/// playing.
///
/// Simulation is split the pragmatic way for a phone LAN game: every device
/// simulates its own soldier inside the three.js engine and streams the
/// resulting transform; the host merges those into a snapshot, owns health,
/// scoring and the clock, and is the single source of truth for kills.
class MatchSession extends ChangeNotifier {
  MatchSession.host({
    required this.selfId,
    required this.selfName,
    required MatchConfig config,
    required this.loadout,
  })  : role = SessionRole.host,
        _config = config;

  MatchSession.client({
    required this.selfId,
    required this.selfName,
    required this.loadout,
    required GroupBeacon beacon,
  })  : role = SessionRole.client,
        _beacon = beacon,
        _config = MatchConfig(groupName: beacon.groupName, mapId: beacon.mapId);

  MatchSession.solo({
    required this.selfId,
    required this.selfName,
    required this.loadout,
    required MatchConfig config,
    required this.botCount,
  })  : role = SessionRole.solo,
        _config = config;

  final SessionRole role;
  final String selfId;
  final String selfName;
  final Loadout loadout;
  int botCount = 0;

  GroupBeacon? _beacon;
  MatchConfig _config;

  MatchConfig get config => _config;

  SessionStatus status = SessionStatus.idle;
  String? errorMessage;
  MatchPhase phase = MatchPhase.lobby;

  final Map<String, PlayerInfo> players = {};
  final List<KillEvent> killFeed = [];

  /// Latest transform reported by each player, keyed by id. Opaque to Dart —
  /// it is forwarded to the engine verbatim.
  final Map<String, Map<String, dynamic>> _transforms = {};

  final Map<String, double> _health = {};
  final Map<String, int> _lastSeenMs = {};

  int secondsRemaining = 0;
  DateTime? _matchStart;

  // ---- host plumbing -----------------------------------------------------
  HttpServer? _server;
  final Map<WebSocket, String> _socketToPlayer = {};
  final Map<String, WebSocket> _playerToSocket = {};
  final GroupAdvertiser _advertiser = GroupAdvertiser();

  /// True when UDP discovery could not start; the lobby then tells players to
  /// join by IP instead.
  bool advertisingFailed = false;
  Timer? _snapshotTimer;
  Timer? _clockTimer;
  Timer? _pingTimer;
  String hostAddress = '';

  // ---- client plumbing ---------------------------------------------------
  WebSocket? _clientSocket;
  Timer? _inputTimer;
  Map<String, dynamic>? _pendingSelfState;
  int pingMs = 0;

  final _events = StreamController<SessionEvent>.broadcast();

  /// Events the game screen forwards into the engine.
  Stream<SessionEvent> get events => _events.stream;

  bool get isHost => role == SessionRole.host;
  bool get isSolo => role == SessionRole.solo;

  PlayerInfo? get self => players[selfId];

  List<PlayerInfo> get scoreboard {
    final list = players.values.toList()
      ..sort((a, b) {
        final byScore = b.score.compareTo(a.score);
        if (byScore != 0) return byScore;
        final byDeaths = a.deaths.compareTo(b.deaths);
        if (byDeaths != 0) return byDeaths;
        return a.name.compareTo(b.name);
      });
    return list;
  }

  Map<int, int> get teamScores {
    final scores = <int, int>{0: 0, 1: 0};
    for (final p in players.values) {
      scores[p.team] = (scores[p.team] ?? 0) + p.kills;
    }
    return scores;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  Future<void> open() async {
    switch (role) {
      case SessionRole.host:
        await _openHost();
      case SessionRole.client:
        await _openClient();
      case SessionRole.solo:
        _openSolo();
    }
  }

  void _openSolo() {
    status = SessionStatus.connected;
    players[selfId] = _makeSelf(team: 0, isHost: true);
    _health[selfId] = 100;
    phase = MatchPhase.lobby;
    notifyListeners();
  }

  PlayerInfo _makeSelf({required int team, required bool isHost}) => PlayerInfo(
        id: selfId,
        name: selfName,
        agentId: loadout.agentId,
        primaryId: loadout.primaryId,
        secondaryId: loadout.secondaryId,
        grenadeId: loadout.grenadeId,
        team: team,
        isHost: isHost,
        ready: isHost,
      );

  // ---- host --------------------------------------------------------------
  Future<void> _openHost() async {
    status = SessionStatus.starting;
    notifyListeners();
    try {
      final local = await LanInfo.localAddress();
      hostAddress = local?.address ?? '0.0.0.0';
      _server = await HttpServer.bind(
        InternetAddress.anyIPv4,
        Proto.gamePort,
        shared: false,
      );
      _server!.listen(_onHttpRequest, onError: (Object e) {
        _fail('$e');
      });

      players[selfId] = _makeSelf(team: 0, isHost: true);
      _health[selfId] = 100;

      try {
        await _advertiser.start(_beaconPayload);
      } catch (e) {
        // Some networks (and some emulators) refuse UDP broadcast. The group
        // then will not appear in the browser, but it is still reachable by
        // typing the host's IP, so this must not fail the whole session.
        advertisingFailed = true;
      }
      _pingTimer = Timer.periodic(Proto.pingInterval, (_) => _hostPing());

      status = SessionStatus.connected;
      notifyListeners();
    } catch (e) {
      _fail('$e');
    }
  }

  Map<String, dynamic> _beaconPayload() => GroupBeacon(
        groupName: _config.groupName,
        hostName: selfName,
        address: hostAddress,
        port: Proto.gamePort,
        mapId: _config.mapId,
        mode: _config.mode,
        players: players.length,
        maxPlayers: _config.maxPlayers,
        phase: phase,
        durationSeconds: _config.durationSeconds,
      ).toJson();

  Future<void> _onHttpRequest(HttpRequest request) async {
    if (!WebSocketTransformer.isUpgradeRequest(request)) {
      request.response
        ..statusCode = HttpStatus.ok
        ..headers.contentType = ContentType.json
        ..write(jsonEncode(_beaconPayload()));
      await request.response.close();
      return;
    }
    try {
      final socket = await WebSocketTransformer.upgrade(request);
      _attachClientSocket(socket);
    } catch (_) {
      // Upgrade failed; the peer will retry.
    }
  }

  void _attachClientSocket(WebSocket socket) {
    socket.listen(
      (dynamic data) => _onHostMessage(socket, data),
      onDone: () => _dropSocket(socket),
      onError: (Object _) => _dropSocket(socket),
      cancelOnError: true,
    );
  }

  void _onHostMessage(WebSocket socket, dynamic data) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(data as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final type = msg['t'] as String?;
    if (type == null) return;

    if (type == Proto.hello) {
      _hostHandleHello(socket, msg);
      return;
    }

    final playerId = _socketToPlayer[socket];
    if (playerId == null) return;
    _lastSeenMs[playerId] = DateTime.now().millisecondsSinceEpoch;

    switch (type) {
      case Proto.loadout:
        final p = players[playerId];
        if (p == null) break;
        p.agentId = (msg['agentId'] ?? p.agentId) as String;
        p.primaryId = (msg['primaryId'] ?? p.primaryId) as String;
        p.secondaryId = (msg['secondaryId'] ?? p.secondaryId) as String;
        p.grenadeId = (msg['grenadeId'] ?? p.grenadeId) as String;
        p.name = (msg['name'] ?? p.name) as String;
        _broadcastLobby();
      case Proto.ready:
        players[playerId]?.ready = (msg['ready'] ?? false) as bool;
        _broadcastLobby();
      case Proto.state:
        final s = msg['s'];
        if (s is Map) {
          _transforms[playerId] = Map<String, dynamic>.from(s);
        }
        final fired = msg['fired'];
        if (fired is int && fired > 0) {
          players[playerId]?.shotsFired += fired;
        }
      case Proto.hit:
        _hostApplyHit(playerId, msg);
      case Proto.grenade:
        _broadcast({...msg, 't': Proto.grenade, 'from': playerId},
            except: playerId);
      case Proto.pong:
        final sent = msg['ts'];
        if (sent is int) {
          final rtt = DateTime.now().millisecondsSinceEpoch - sent;
          players[playerId]?.ping = rtt.clamp(0, 9999);
        }
      case Proto.chat:
        _broadcast({
          't': Proto.chat,
          'from': players[playerId]?.name ?? '?',
          'text': msg['text'],
        });
      case Proto.leave:
        _dropSocket(socket);
    }
  }

  void _hostHandleHello(WebSocket socket, Map<String, dynamic> msg) {
    final id = msg['id'] as String?;
    if (id == null) return;

    if (players.length >= _config.maxPlayers && !players.containsKey(id)) {
      socket.add(jsonEncode({'t': Proto.kicked, 'reason': 'full'}));
      socket.close();
      return;
    }
    if (phase == MatchPhase.ended) {
      socket.add(jsonEncode({'t': Proto.kicked, 'reason': 'ended'}));
      socket.close();
      return;
    }

    // Balance teams by head count so the smaller side always gets the joiner.
    final counts = <int, int>{0: 0, 1: 0};
    for (final p in players.values) {
      counts[p.team] = (counts[p.team] ?? 0) + 1;
    }
    final team = _config.mode == GameMode.dm
        ? 0
        : (counts[0]! <= counts[1]! ? 0 : 1);

    final player = PlayerInfo(
      id: id,
      name: (msg['name'] ?? 'Player') as String,
      agentId: (msg['agentId'] ?? 'zmarai') as String,
      primaryId: (msg['primaryId'] ?? 'ak_sangar') as String,
      secondaryId: (msg['secondaryId'] ?? 'pistol_teera') as String,
      grenadeId: (msg['grenadeId'] ?? 'frag') as String,
      team: team,
    );

    players[id] = player;
    _health[id] = 100;
    _socketToPlayer[socket] = id;
    _playerToSocket[id] = socket;
    _lastSeenMs[id] = DateTime.now().millisecondsSinceEpoch;

    socket.add(jsonEncode({
      't': Proto.welcome,
      'you': id,
      'team': team,
      'config': _config.toJson(),
      'phase': phase.name,
      'players': players.values.map((p) => p.toJson()).toList(),
      if (_matchStart != null)
        'elapsed':
            DateTime.now().difference(_matchStart!).inMilliseconds,
    }));

    _broadcastLobby();
    notifyListeners();
  }

  void _hostApplyHit(String shooterId, Map<String, dynamic> msg) {
    if (phase != MatchPhase.live) return;
    final targetId = msg['target'] as String?;
    if (targetId == null) return;
    final target = players[targetId];
    final shooter = players[shooterId];
    if (target == null || shooter == null) return;
    if (targetId == shooterId) return;
    if (!_config.friendlyFire &&
        _config.mode == GameMode.tdm &&
        target.team == shooter.team) {
      return;
    }
    if ((_health[targetId] ?? 0) <= 0) return;

    final raw = (msg['dmg'] as num?)?.toDouble() ?? 0;
    final dmg = raw.clamp(0.0, Proto.maxReportedDamage);
    if (dmg <= 0) return;

    shooter.shotsHit += 1;
    final remaining = (_health[targetId] ?? 100) - dmg;
    _health[targetId] = remaining;

    _sendTo(targetId, {
      't': Proto.damage,
      'from': shooterId,
      'fromName': shooter.name,
      'hp': remaining.clamp(0, 100),
      'dir': msg['dir'],
    });

    if (remaining <= 0) {
      _hostRegisterKill(
        shooter: shooter,
        victim: target,
        weaponId: (msg['weapon'] ?? '') as String,
        headshot: (msg['head'] ?? false) as bool,
      );
    } else {
      _broadcastStats();
    }
  }

  void _hostRegisterKill({
    required PlayerInfo shooter,
    required PlayerInfo victim,
    required String weaponId,
    required bool headshot,
  }) {
    shooter.kills += 1;
    victim.deaths += 1;
    _health[victim.id] = 0;

    final event = KillEvent(
      killerName: shooter.name,
      victimName: victim.name,
      weaponId: weaponId,
      headshot: headshot,
      killerTeam: shooter.team,
      victimTeam: victim.team,
    );
    _pushKill(event);
    _broadcast({
      't': Proto.kill,
      ...event.toJson(),
      'killerId': shooter.id,
      'victimId': victim.id,
    });
    _broadcastStats();

    Timer(Duration(seconds: _config.respawnSeconds), () {
      if (phase != MatchPhase.live) return;
      _health[victim.id] = 100;
      _sendTo(victim.id, {'t': Proto.respawn, 'hp': 100});
      if (victim.id == selfId) {
        _events.add(const SessionEvent(Proto.respawn, {'hp': 100}));
      }
    });

    final reachedLimit = _config.mode == GameMode.dm
        ? shooter.kills >= _config.killLimit
        : (teamScores[shooter.team] ?? 0) >= _config.killLimit;
    if (reachedLimit) _hostEndMatch();
  }

  void _hostPing() {
    final now = DateTime.now().millisecondsSinceEpoch;
    _broadcast({'t': Proto.ping, 'ts': now});
    // Reap peers that stopped answering (walked out of Wi-Fi range).
    final stale = <String>[];
    _lastSeenMs.forEach((id, seen) {
      if (now - seen > Proto.clientTimeout.inMilliseconds) stale.add(id);
    });
    for (final id in stale) {
      final socket = _playerToSocket[id];
      if (socket != null) _dropSocket(socket);
    }
  }

  void _dropSocket(WebSocket socket) {
    final id = _socketToPlayer.remove(socket);
    if (id != null) {
      _playerToSocket.remove(id);
      _lastSeenMs.remove(id);
      _transforms.remove(id);
      if (phase == MatchPhase.lobby) {
        players.remove(id);
        _health.remove(id);
      } else {
        players[id]?.connected = false;
      }
      _broadcastLobby();
      notifyListeners();
    }
    try {
      socket.close();
    } catch (_) {
      // Already closed.
    }
  }

  void _broadcast(Map<String, dynamic> msg, {String? except}) {
    final encoded = jsonEncode(msg);
    _playerToSocket.forEach((id, socket) {
      if (id == except) return;
      try {
        socket.add(encoded);
      } catch (_) {
        // Dead socket; the reaper will clean it up.
      }
    });
  }

  void _sendTo(String playerId, Map<String, dynamic> msg) {
    if (playerId == selfId) {
      _events.add(SessionEvent(msg['t'] as String, msg));
      return;
    }
    final socket = _playerToSocket[playerId];
    if (socket == null) return;
    try {
      socket.add(jsonEncode(msg));
    } catch (_) {
      // Dead socket.
    }
  }

  void _broadcastLobby() {
    _broadcast({
      't': Proto.lobby,
      'config': _config.toJson(),
      'phase': phase.name,
      'players': players.values.map((p) => p.toJson()).toList(),
    });
    notifyListeners();
  }

  void _broadcastStats() {
    _broadcast({
      't': Proto.lobby,
      'config': _config.toJson(),
      'phase': phase.name,
      'players': players.values.map((p) => p.toJson()).toList(),
    });
    notifyListeners();
  }

  // ---- client ------------------------------------------------------------
  Future<void> _openClient() async {
    final beacon = _beacon;
    if (beacon == null) {
      _fail('no beacon');
      return;
    }
    status = SessionStatus.connecting;
    notifyListeners();
    try {
      final socket = await WebSocket.connect(
        'ws://${beacon.address}:${beacon.port}/ws',
      ).timeout(const Duration(seconds: 8));
      _clientSocket = socket;
      socket.listen(
        _onClientMessage,
        onDone: _onClientClosed,
        onError: (Object _) => _onClientClosed(),
        cancelOnError: true,
      );
      _send({
        't': Proto.hello,
        'id': selfId,
        'name': selfName,
        'agentId': loadout.agentId,
        'primaryId': loadout.primaryId,
        'secondaryId': loadout.secondaryId,
        'grenadeId': loadout.grenadeId,
      });
      status = SessionStatus.connected;
      notifyListeners();
    } catch (e) {
      _fail('$e');
    }
  }

  void _onClientMessage(dynamic data) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(data as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    final type = msg['t'] as String?;
    if (type == null) return;

    switch (type) {
      case Proto.welcome:
      case Proto.lobby:
        _applyLobby(msg);
      case Proto.start:
        _config = MatchConfig.fromJson(
            (msg['config'] as Map).cast<String, dynamic>());
        _beginLocalMatch(
          elapsedMs: (msg['elapsed'] as int?) ?? 0,
          seed: (msg['seed'] as int?) ?? 1,
        );
      case Proto.snapshot:
        final list = msg['p'];
        if (list is List) {
          _transforms.clear();
          for (final entry in list) {
            if (entry is Map && entry['id'] is String) {
              _transforms[entry['id'] as String] =
                  Map<String, dynamic>.from(entry);
            }
          }
        }
        _events.add(SessionEvent(Proto.snapshot, msg));
      case Proto.kill:
        _pushKill(KillEvent.fromJson(msg));
        _events.add(SessionEvent(Proto.kill, msg));
        notifyListeners();
      case Proto.damage:
      case Proto.respawn:
      case Proto.grenade:
        _events.add(SessionEvent(type, msg));
      case Proto.matchEnd:
        _applyLobby(msg);
        phase = MatchPhase.ended;
        _stopTimers();
        _events.add(SessionEvent(Proto.matchEnd, msg));
        notifyListeners();
      case Proto.ping:
        final ts = msg['ts'];
        _send({'t': Proto.pong, 'ts': ts});
        if (ts is int) {
          pingMs = DateTime.now().millisecondsSinceEpoch - ts;
        }
      case Proto.kicked:
        errorMessage = (msg['reason'] ?? 'kicked') as String;
        status = SessionStatus.failed;
        notifyListeners();
    }
  }

  void _applyLobby(Map<String, dynamic> msg) {
    final cfg = msg['config'];
    if (cfg is Map) {
      _config = MatchConfig.fromJson(cfg.cast<String, dynamic>());
    }
    final list = msg['players'];
    if (list is List) {
      final seen = <String>{};
      for (final entry in list) {
        if (entry is! Map) continue;
        final p = PlayerInfo.fromJson(entry.cast<String, dynamic>());
        seen.add(p.id);
        final existing = players[p.id];
        if (existing == null) {
          players[p.id] = p;
        } else {
          existing
            ..name = p.name
            ..agentId = p.agentId
            ..primaryId = p.primaryId
            ..secondaryId = p.secondaryId
            ..grenadeId = p.grenadeId
            ..team = p.team
            ..ready = p.ready
            ..connected = p.connected
            ..ping = p.ping
            ..applyStats(entry.cast<String, dynamic>());
        }
      }
      players.removeWhere((id, _) => !seen.contains(id));
    }
    final phaseName = msg['phase'];
    if (phaseName is String) {
      phase = MatchPhase.values
          .firstWhere((p) => p.name == phaseName, orElse: () => phase);
    }
    notifyListeners();
  }

  void _onClientClosed() {
    if (status == SessionStatus.closed) return;
    status = SessionStatus.failed;
    errorMessage ??= 'disconnected';
    _stopTimers();
    notifyListeners();
  }

  void _send(Map<String, dynamic> msg) {
    final socket = _clientSocket;
    if (socket == null) return;
    try {
      socket.add(jsonEncode(msg));
    } catch (_) {
      // Socket is going away; _onClientClosed will fire.
    }
  }

  // =========================================================================
  // Public API used by the UI / engine bridge
  // =========================================================================

  void updateConfig(void Function(MatchConfig c) fn) {
    if (!isHost && !isSolo) return;
    fn(_config);
    if (isHost) _broadcastLobby();
    notifyListeners();
  }

  void setReady(bool ready) {
    if (isHost || isSolo) {
      players[selfId]?.ready = ready;
      if (isHost) _broadcastLobby();
      notifyListeners();
    } else {
      players[selfId]?.ready = ready;
      _send({'t': Proto.ready, 'ready': ready});
      notifyListeners();
    }
  }

  void updateLoadout(Loadout next) {
    final p = players[selfId];
    if (p != null) {
      p
        ..agentId = next.agentId
        ..primaryId = next.primaryId
        ..secondaryId = next.secondaryId
        ..grenadeId = next.grenadeId;
    }
    if (isHost) {
      _broadcastLobby();
    } else if (role == SessionRole.client) {
      _send({
        't': Proto.loadout,
        'name': selfName,
        'agentId': next.agentId,
        'primaryId': next.primaryId,
        'secondaryId': next.secondaryId,
        'grenadeId': next.grenadeId,
      });
    }
    notifyListeners();
  }

  void switchTeam(String playerId) {
    if (!isHost) return;
    final p = players[playerId];
    if (p == null || phase != MatchPhase.lobby) return;
    p.team = p.team == 0 ? 1 : 0;
    _broadcastLobby();
  }

  void kick(String playerId) {
    if (!isHost || playerId == selfId) return;
    final socket = _playerToSocket[playerId];
    if (socket != null) {
      try {
        socket.add(jsonEncode({'t': Proto.kicked, 'reason': 'host'}));
      } catch (_) {
        // Ignore.
      }
      _dropSocket(socket);
    }
  }

  /// Host (or solo player) starts the match for everyone.
  void startMatch() {
    if (!isHost && !isSolo) return;
    if (phase == MatchPhase.live) return;
    final seed = Random().nextInt(1 << 30);
    if (isHost) {
      _broadcast({
        't': Proto.start,
        'seed': seed,
        'elapsed': 0,
        'config': _config.toJson(),
        'players': players.values.map((p) => p.toJson()).toList(),
      });
      _snapshotTimer =
          Timer.periodic(Proto.snapshotInterval, (_) => _hostSnapshot());
    }
    for (final id in players.keys) {
      _health[id] = 100;
    }
    _beginLocalMatch(elapsedMs: 0, seed: seed);
  }

  int matchSeed = 1;

  void _beginLocalMatch({required int elapsedMs, required int seed}) {
    matchSeed = seed;
    phase = MatchPhase.live;
    _matchStart =
        DateTime.now().subtract(Duration(milliseconds: elapsedMs));
    secondsRemaining = _config.durationSeconds - (elapsedMs ~/ 1000);
    _clockTimer?.cancel();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    if (role == SessionRole.client) {
      _inputTimer?.cancel();
      _inputTimer = Timer.periodic(Proto.inputInterval, (_) => _flushInput());
    }
    _events.add(SessionEvent(Proto.start, {'seed': seed}));
    notifyListeners();
  }

  void _tick() {
    if (phase != MatchPhase.live) return;
    final start = _matchStart;
    if (start == null) return;
    final elapsed = DateTime.now().difference(start).inSeconds;
    secondsRemaining = (_config.durationSeconds - elapsed).clamp(0, 1 << 30);
    if (secondsRemaining <= 0) {
      if (isHost || isSolo) {
        _hostEndMatch();
      }
    }
    notifyListeners();
  }

  void _hostEndMatch() {
    if (phase == MatchPhase.ended) return;
    phase = MatchPhase.ended;
    _stopTimers();
    if (isHost) {
      _broadcast({
        't': Proto.matchEnd,
        'phase': MatchPhase.ended.name,
        'config': _config.toJson(),
        'players': players.values.map((p) => p.toJson()).toList(),
      });
    }
    _events.add(const SessionEvent(Proto.matchEnd, {}));
    notifyListeners();
  }

  void _hostSnapshot() {
    if (_transforms.isEmpty && players.length <= 1) return;
    final list = <Map<String, dynamic>>[];
    _transforms.forEach((id, t) {
      final p = players[id];
      if (p == null) return;
      list.add({
        ...t,
        'id': id,
        'team': p.team,
        'hp': (_health[id] ?? 100).clamp(0, 100),
      });
    });
    _broadcast({
      't': Proto.snapshot,
      'ts': DateTime.now().millisecondsSinceEpoch,
      'p': list,
    });
  }

  /// Called by the engine bridge ~20x a second with this device's transform.
  void reportSelfState(Map<String, dynamic> state, {int firedShots = 0}) {
    if (firedShots > 0) players[selfId]?.shotsFired += firedShots;
    if (isSolo) return;
    if (isHost) {
      _transforms[selfId] = state;
    } else {
      _pendingSelfState = state;
      if (firedShots > 0) {
        _pendingFired += firedShots;
      }
    }
  }

  int _pendingFired = 0;

  void _flushInput() {
    final s = _pendingSelfState;
    if (s == null) return;
    _send({'t': Proto.state, 's': s, 'fired': _pendingFired});
    _pendingFired = 0;
  }

  /// Called by the engine when this device's shot hits someone.
  void reportHit({
    required String targetId,
    required double damage,
    required String weaponId,
    required bool headshot,
    List<double>? direction,
  }) {
    if (isSolo) return;
    final msg = {
      't': Proto.hit,
      'target': targetId,
      'dmg': damage,
      'weapon': weaponId,
      'head': headshot,
      if (direction != null) 'dir': direction,
    };
    if (isHost) {
      _hostApplyHit(selfId, msg);
    } else {
      _send(msg);
    }
  }

  /// Called by the engine when this device throws a grenade, so peers can
  /// render and resolve the same blast.
  void reportGrenade(Map<String, dynamic> data) {
    if (isSolo) return;
    final msg = {'t': Proto.grenade, ...data, 'from': selfId};
    if (isHost) {
      _broadcast(msg, except: selfId);
    } else {
      _send(msg);
    }
  }

  /// Solo mode books its own kills so the scoreboard still works offline.
  void reportSoloKill({required String victimName, required bool headshot}) {
    if (!isSolo) return;
    final me = players[selfId];
    if (me == null) return;
    me.kills += 1;
    _pushKill(KillEvent(
      killerName: me.name,
      victimName: victimName,
      weaponId: loadout.primaryId,
      headshot: headshot,
    ));
    notifyListeners();
  }

  void reportSoloDeath({required String killerName}) {
    if (!isSolo) return;
    final me = players[selfId];
    if (me == null) return;
    me.deaths += 1;
    _pushKill(KillEvent(killerName: killerName, victimName: me.name,
        weaponId: '', killerTeam: 1, victimTeam: 0));
    notifyListeners();
  }

  void endSoloMatch() {
    if (!isSolo) return;
    _hostEndMatch();
  }

  void _pushKill(KillEvent event) {
    killFeed.insert(0, event);
    if (killFeed.length > 40) killFeed.removeRange(40, killFeed.length);
    _events.add(SessionEvent(Proto.kill, event.toJson()));
  }

  void _fail(String message) {
    errorMessage = message;
    status = SessionStatus.failed;
    notifyListeners();
  }

  void _stopTimers() {
    _snapshotTimer?.cancel();
    _snapshotTimer = null;
    _clockTimer?.cancel();
    _clockTimer = null;
    _inputTimer?.cancel();
    _inputTimer = null;
  }

  Future<void> close() async {
    if (status == SessionStatus.closed) return;
    status = SessionStatus.closed;
    _stopTimers();
    _pingTimer?.cancel();
    _pingTimer = null;
    await _advertiser.stop();
    if (role == SessionRole.client) {
      _send({'t': Proto.leave});
    }
    for (final socket in _playerToSocket.values.toList()) {
      try {
        await socket.close();
      } catch (_) {
        // Ignore.
      }
    }
    _playerToSocket.clear();
    _socketToPlayer.clear();
    try {
      await _clientSocket?.close();
    } catch (_) {
      // Ignore.
    }
    _clientSocket = null;
    await _server?.close(force: true);
    _server = null;
    notifyListeners();
  }

  @override
  void dispose() {
    close();
    _events.close();
    super.dispose();
  }
}

/// A message the game screen should hand to the three.js engine.
class SessionEvent {
  const SessionEvent(this.type, this.data);
  final String type;
  final Map<String, dynamic> data;
}

/// The four choices a player carries into a match.
class Loadout {
  const Loadout({
    required this.agentId,
    required this.primaryId,
    required this.secondaryId,
    required this.grenadeId,
  });

  final String agentId;
  final String primaryId;
  final String secondaryId;
  final String grenadeId;

  AgentDef get agent => Catalog.agentById(agentId);
  WeaponDef get primary => Catalog.weaponById(primaryId);
  WeaponDef get secondary => Catalog.weaponById(secondaryId);
  GrenadeDef get grenade => Catalog.grenadeById(grenadeId);

  Map<String, dynamic> toJson() => {
        'agent': agent.toJson(),
        'primary': primary.toJson(),
        'secondary': secondary.toJson(),
        'grenade': grenade.toJson(),
      };
}
