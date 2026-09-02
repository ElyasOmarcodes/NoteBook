import 'dart:async';

import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../models/match.dart';
import '../../net/lan.dart';
import '../../net/match_session.dart';
import '../../net/protocol.dart';
import '../../theme/app_theme.dart';
import '../widgets/common.dart';
import 'lobby_screen.dart';

/// Browses the Wi-Fi for advertised groups, with a manual IP fallback.
class JoinGroupScreen extends StatefulWidget {
  const JoinGroupScreen({super.key});

  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  final GroupBrowser _browser = GroupBrowser();
  final TextEditingController _manualIp = TextEditingController();
  StreamSubscription<List<GroupBeacon>>? _sub;
  List<GroupBeacon> _groups = const [];
  bool _searching = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startBrowsing();
  }

  Future<void> _startBrowsing() async {
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      await _browser.start();
      _sub = _browser.groups.listen((groups) {
        if (mounted) setState(() => _groups = groups);
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
    // Give the beacons a moment before declaring the list empty.
    await Future<void>.delayed(const Duration(milliseconds: 1800));
    if (mounted) setState(() => _searching = false);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _browser.dispose();
    _manualIp.dispose();
    super.dispose();
  }

  void _join(GroupBeacon beacon) {
    final settings = SettingsScope.of(context);
    final session = MatchSession.client(
      selfId: settings.playerId,
      selfName: settings.playerName,
      beacon: beacon,
      loadout: Loadout(
        agentId: settings.agentId,
        primaryId: settings.primaryId,
        secondaryId: settings.secondaryId,
        grenadeId: settings.grenadeId,
      ),
    );
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => LobbyScreen(session: session)),
    );
  }

  void _joinManual() {
    final ip = _manualIp.text.trim();
    if (ip.isEmpty) return;
    _join(GroupBeacon(
      groupName: ip,
      hostName: '-',
      address: ip,
      port: Proto.gamePort,
      mapId: 'sangar_chowk',
      mode: GameMode.tdm,
      players: 0,
      maxPlayers: 12,
      phase: MatchPhase.lobby,
      durationSeconds: 600,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      body: ArenaBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 20, 0),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back),
                    ),
                    Text(s.joinGroup,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    FilledButton.tonalIcon(
                      onPressed: () {
                        _browser.probe();
                        _startBrowsing();
                      },
                      icon: const Icon(Icons.search, size: 18),
                      label: Text(s.searchGroups),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 6,
                      child: _buildList(s),
                    ),
                    Expanded(
                      flex: 3,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(6, 12, 20, 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Panel(
                              title: s.manualJoin.toUpperCase(),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  TextField(
                                    controller: _manualIp,
                                    keyboardType: TextInputType.number,
                                    decoration: InputDecoration(
                                      hintText: s.ipAddress,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  OutlinedButton(
                                    onPressed: _joinManual,
                                    child: Text(s.connect),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppPalette.surface.withValues(alpha: .7),
                                borderRadius: BorderRadius.circular(14),
                                border:
                                    Border.all(color: AppPalette.outline),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.wifi,
                                      size: 18, color: AppPalette.teal),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      s.hotspotHint,
                                      style: const TextStyle(
                                          fontSize: 11.5,
                                          height: 1.4,
                                          color: AppPalette.textLow),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildList(Strings s) {
    if (_error != null) {
      return StatusView(
        message: '${s.errNoWifi}\n\n$_error',
        busy: false,
        action: FilledButton(
          onPressed: _startBrowsing,
          child: Text(s.retry),
        ),
      );
    }
    if (_groups.isEmpty) {
      return StatusView(
        message: _searching ? s.searching : s.noGroups,
        busy: _searching,
        action: _searching
            ? null
            : OutlinedButton(
                onPressed: _startBrowsing,
                child: Text(s.retry),
              ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 12, 6, 20),
      itemCount: _groups.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, i) => _GroupTile(
        beacon: _groups[i],
        onJoin: () => _join(_groups[i]),
      ),
    );
  }
}

class _GroupTile extends StatelessWidget {
  const _GroupTile({required this.beacon, required this.onJoin});

  final GroupBeacon beacon;
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final map = Catalog.mapById(beacon.mapId);
    final joinable = beacon.isJoinable;

    return Opacity(
      opacity: joinable ? 1 : 0.55,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppPalette.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppPalette.outline),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppPalette.accent.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.groups_2, color: AppPalette.accent),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(beacon.groupName,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      Pill(
                        label: '${s.host}: ${beacon.hostName}',
                        color: AppPalette.textLow,
                      ),
                      Pill(
                        label: s.isPashto ? map.namePs : map.nameEn,
                        color: AppPalette.teal,
                      ),
                      Pill(
                        label: beacon.mode == GameMode.tdm
                            ? s.modeTdm
                            : s.modeDm,
                        color: AppPalette.teamAlpha,
                      ),
                      if (beacon.phase == MatchPhase.live)
                        Pill(
                          label: s.isPashto ? 'روان' : 'In progress',
                          color: AppPalette.danger,
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${beacon.players}/${beacon.maxPlayers}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
                Text(s.playersInLobby,
                    style: const TextStyle(
                        fontSize: 10, color: AppPalette.textLow)),
              ],
            ),
            const SizedBox(width: 14),
            FilledButton(
              onPressed: joinable ? onJoin : null,
              child: Text(s.connect),
            ),
          ],
        ),
      ),
    );
  }
}
