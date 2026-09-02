import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../../app.dart';
import '../../game/engine_server.dart';
import '../../game/game_bridge.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../models/match.dart';
import '../../net/match_session.dart';
import '../../net/protocol.dart';
import '../../theme/app_theme.dart';
import '../widgets/common.dart';
import 'results_screen.dart';

/// Hosts the three.js engine in a WebView and wires it to the match session.
class GameScreen extends StatefulWidget {
  const GameScreen({
    super.key,
    required this.session,
    this.trainingBots = 0,
    this.freeRoam = false,
  });

  final MatchSession session;
  final int trainingBots;
  final bool freeRoam;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  final GameBridge _bridge = GameBridge();
  StreamSubscription<Map<String, dynamic>>? _bridgeSub;
  StreamSubscription<SessionEvent>? _sessionSub;
  Timer? _hudTimer;

  bool _paused = false;
  bool _booted = false;
  bool _serverReady = false;
  String? _engineError;

  MatchSession get session => widget.session;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _startEngineServer();
    _bridgeSub = _bridge.messages.listen(_onEngineMessage);
    _sessionSub = session.events.listen(_onSessionEvent);
    session.addListener(_onSessionChanged);
    // Push the clock and scoreboard into the HUD once a second; everything
    // else is event driven.
    _hudTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!_bridge.engineReady) return;
      _bridge.send({
        't': 'clock',
        'seconds': session.secondsRemaining,
        'running': session.phase == MatchPhase.live,
      });
      final scores = session.teamScores;
      _bridge.send({'t': 'scores', 'scores': [scores[0] ?? 0, scores[1] ?? 0]});
    });
  }

  Future<void> _startEngineServer() async {
    try {
      await EngineServer.instance.ensureRunning();
    } catch (e) {
      if (mounted) setState(() => _engineError = 'engine server: $e');
      return;
    }
    if (mounted) setState(() => _serverReady = true);
  }

  @override
  void dispose() {
    _hudTimer?.cancel();
    _bridgeSub?.cancel();
    _sessionSub?.cancel();
    session.removeListener(_onSessionChanged);
    _bridge.stop();
    _bridge.dispose();
    super.dispose();
  }

  // ---- engine -> app -----------------------------------------------------

  void _onEngineMessage(Map<String, dynamic> msg) {
    switch (msg['t']) {
      case 'loaded':
        _boot();
      case 'ready':
        if (mounted) setState(() {});
        _pushRoster();
      case 'state':
        final s = msg['s'];
        if (s is Map) {
          session.reportSelfState(
            Map<String, dynamic>.from(s),
            firedShots: (msg['fired'] as int?) ?? 0,
          );
        }
        final me = session.self;
        if (me != null) {
          // Solo modes keep their own tally; networked matches trust the host.
          if (session.isSolo) {
            me.kills = (msg['kills'] as int?) ?? me.kills;
            me.deaths = (msg['deaths'] as int?) ?? me.deaths;
          }
        }
      case 'hit':
        session.reportHit(
          targetId: (msg['target'] ?? '') as String,
          damage: ((msg['dmg'] as num?) ?? 0).toDouble(),
          weaponId: (msg['weapon'] ?? '') as String,
          headshot: (msg['head'] ?? false) as bool,
          direction: (msg['dir'] as List?)?.cast<num>()
              .map((n) => n.toDouble())
              .toList(),
        );
      case 'nade':
        session.reportGrenade(Map<String, dynamic>.from(msg)..remove('t'));
      case 'soloKill':
        session.reportSoloKill(
          victimName: (msg['victim'] ?? '?') as String,
          headshot: (msg['head'] ?? false) as bool,
        );
      case 'soloDeath':
        session.reportSoloDeath(killerName: (msg['killer'] ?? '?') as String);
      case 'error':
        setState(() => _engineError = msg['message'] as String?);
    }
  }

  Future<void> _boot() async {
    if (_booted) return;
    _booted = true;
    final settings = SettingsScope.of(context);
    final me = session.self;
    final loadout = session.loadout;

    await _bridge.start({
      'id': session.selfId,
      'name': session.selfName,
      'team': me?.team ?? 0,
      'mode': widget.freeRoam
          ? 'freeroam'
          : (session.isSolo ? 'training' : 'multiplayer'),
      'teamMode': session.config.mode == GameMode.tdm,
      'botCount': widget.trainingBots,
      'botDifficulty': 0.55,
      'durationSeconds': session.config.durationSeconds,
      'respawnSeconds': session.config.respawnSeconds,
      'agent': loadout.agent.toJson(),
      'agentPool': Catalog.agents.map((a) => a.toJson()).toList(),
      'primary': loadout.primary.toJson(),
      'secondary': loadout.secondary.toJson(),
      'botWeapon': Catalog.weaponById('m4_kandak').toJson(),
      'grenade': loadout.grenade.toJson(),
      'settings': settings.toEngineJson(),
    });
    _bridge.resumeAudio();
  }

  // ---- session -> engine -------------------------------------------------

  void _onSessionEvent(SessionEvent event) {
    if (!_bridge.engineReady) return;
    switch (event.type) {
      case Proto.snapshot:
        _bridge.send({'t': 'snap', 'p': event.data['p'] ?? const []});
      case Proto.kill:
        _bridge.send({'t': 'kill', ...event.data});
      case Proto.damage:
        _bridge.send({'t': 'dmg', ...event.data});
      case Proto.respawn:
        _bridge.send({'t': 'respawn', ...event.data});
      case Proto.grenade:
        _bridge.send({'t': 'nade', ...event.data});
      case Proto.matchEnd:
        _bridge.send({'t': 'end'});
        _showResults();
      case Proto.start:
        _pushRoster();
    }
  }

  void _onSessionChanged() {
    if (!mounted) return;
    if (_bridge.engineReady) _pushRoster();
    if (session.status == SessionStatus.failed) {
      _showDisconnected();
    }
  }

  /// Keeps the engine's list of remote soldiers in step with the lobby.
  void _pushRoster() {
    final players = session.players.values
        .where((p) => p.id != session.selfId)
        .map((p) => {
              'id': p.id,
              'name': p.name,
              'team': p.team,
              'agent': p.agent.toJson(),
              'primary': Catalog.weaponById(p.primaryId).toJson(),
              'secondary': Catalog.weaponById(p.secondaryId).toJson(),
            })
        .toList();
    _bridge.send({'t': 'roster', 'players': players});
  }

  // ---- navigation --------------------------------------------------------

  bool _resultsShown = false;

  void _showResults() {
    if (_resultsShown || !mounted) return;
    _resultsShown = true;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => ResultsScreen(session: session)),
    );
  }

  void _showDisconnected() {
    if (!mounted || _resultsShown) return;
    _resultsShown = true;
    final s = Strings.of(context);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: AppPalette.surface,
        title: Text(s.disconnected),
        content: Text(session.errorMessage ?? ''),
        actions: [
          FilledButton(
            onPressed: () {
              Navigator.of(context).pop();
              _quit();
            },
            child: Text(s.backToMenu),
          ),
        ],
      ),
    );
  }

  Future<void> _quit() async {
    _bridge.stop();
    if (session.isSolo) {
      session.endSoloMatch();
    } else {
      await session.close();
    }
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void _togglePause() {
    setState(() => _paused = !_paused);
    _bridge.send({'t': 'pause', 'value': _paused});
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_paused) _togglePause();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Positioned.fill(
              child: !_serverReady
                  ? const ColoredBox(color: Colors.black)
                  : InAppWebView(
                initialUrlRequest: URLRequest(
                  url: WebUri(EngineServer.instance.indexUrl),
                ),
                initialSettings: InAppWebViewSettings(
                  transparentBackground: false,
                  disableVerticalScroll: true,
                  disableHorizontalScroll: true,
                  supportZoom: false,
                  javaScriptEnabled: true,
                  allowFileAccessFromFileURLs: true,
                  allowUniversalAccessFromFileURLs: true,
                  useHybridComposition: true,
                  hardwareAcceleration: true,
                  mediaPlaybackRequiresUserGesture: false,
                  allowsInlineMediaPlayback: true,
                  useWideViewPort: false,
                  disableContextMenu: true,
                  algorithmicDarkeningAllowed: false,
                ),
                onWebViewCreated: _bridge.attach,
                onLoadStop: (controller, url) => _bridge.onPageLoaded(),
                onReceivedError: (controller, request, error) {
                  if (!request.isForMainFrame!) return;
                  setState(() => _engineError = 'load: ${error.description}');
                },
                onConsoleMessage: (controller, message) {
                  if (message.messageLevel == ConsoleMessageLevel.ERROR) {
                    debugPrint('[engine] ${message.message}');
                  }
                },
              ),
            ),

            // A small pause affordance; everything else is drawn by the engine.
            Positioned(
              top: 4,
              left: 0,
              right: 0,
              child: Center(
                child: SafeArea(
                  child: IconButton(
                    onPressed: _togglePause,
                    icon: const Icon(Icons.pause_circle_outline),
                    color: Colors.white70,
                    iconSize: 26,
                  ),
                ),
              ),
            ),

            if (_engineError != null)
              Positioned(
                bottom: 12,
                left: 12,
                right: 12,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppPalette.danger.withValues(alpha: 0.85),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(_engineError!,
                      style: const TextStyle(fontSize: 11)),
                ),
              ),

            if (_paused) _PauseOverlay(
              onResume: _togglePause,
              onQuit: _quit,
              session: session,
              strings: s,
            ),
          ],
        ),
      ),
    );
  }
}

class _PauseOverlay extends StatelessWidget {
  const _PauseOverlay({
    required this.onResume,
    required this.onQuit,
    required this.session,
    required this.strings,
  });

  final VoidCallback onResume;
  final VoidCallback onQuit;
  final MatchSession session;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final board = session.scoreboard;
    return Positioned.fill(
      child: Container(
        color: Colors.black.withValues(alpha: 0.78),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 5,
                  child: Panel(
                    title: s.score.toUpperCase(),
                    child: SizedBox(
                      height: double.infinity,
                      child: ListView.builder(
                        itemCount: board.length,
                        itemBuilder: (context, i) {
                          final p = board[i];
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 5),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 24,
                                  child: Text('${i + 1}',
                                      style: const TextStyle(
                                          color: AppPalette.textLow)),
                                ),
                                Expanded(
                                  child: Text(p.name,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontWeight: p.id == session.selfId
                                            ? FontWeight.w800
                                            : FontWeight.w500,
                                      )),
                                ),
                                SizedBox(
                                  width: 44,
                                  child: Text('${p.kills}',
                                      textAlign: TextAlign.end,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700)),
                                ),
                                SizedBox(
                                  width: 44,
                                  child: Text('${p.deaths}',
                                      textAlign: TextAlign.end,
                                      style: const TextStyle(
                                          color: AppPalette.textLow)),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  flex: 3,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(s.pause,
                          style: const TextStyle(
                              fontSize: 26, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        onPressed: onResume,
                        icon: const Icon(Icons.play_arrow),
                        label: Text(s.resume),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: onQuit,
                        icon: const Icon(Icons.exit_to_app),
                        label: Text(s.quitMatch),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
