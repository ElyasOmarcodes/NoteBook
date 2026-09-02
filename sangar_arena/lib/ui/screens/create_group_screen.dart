import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../models/match.dart';
import '../../net/match_session.dart';
import '../../theme/app_theme.dart';
import '../widgets/common.dart';
import 'lobby_screen.dart';

/// The host-only screen: name the group, pick the map, mode and limits.
class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  late final TextEditingController _name;
  late MatchConfig _config;

  @override
  void initState() {
    super.initState();
    _config = MatchConfig(groupName: '');
    _name = TextEditingController();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_name.text.isEmpty) {
      final settings = SettingsScope.of(context);
      _name.text = '${settings.playerName} — سنګر';
      _config.groupName = _name.text;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _start() {
    final settings = SettingsScope.of(context);
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(Strings.of(context).errNameRequired)),
      );
      return;
    }
    _config.groupName = name;

    final session = MatchSession.host(
      selfId: settings.playerId,
      selfName: settings.playerName,
      config: _config,
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

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final map = Catalog.mapById(_config.mapId);

    return Scaffold(
      body: ArenaBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              _Header(title: s.createGroup),
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 5,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 8, 10, 20),
                        children: [
                          Panel(
                            title: s.groupName.toUpperCase(),
                            child: TextField(
                              controller: _name,
                              maxLength: 24,
                              decoration:
                                  const InputDecoration(counterText: ''),
                              onChanged: (v) => _config.groupName = v,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Panel(
                            title: s.mode.toUpperCase(),
                            child: Column(
                              children: [
                                SettingRow(
                                  label: s.mode,
                                  child: SegmentedChoice<GameMode>(
                                    value: _config.mode,
                                    options: [
                                      (value: GameMode.tdm, label: s.modeTdm),
                                      (value: GameMode.dm, label: s.modeDm),
                                    ],
                                    onChanged: (v) =>
                                        setState(() => _config.mode = v),
                                  ),
                                ),
                                const Divider(),
                                SliderRow(
                                  label: s.matchLength,
                                  value: _config.durationSeconds.toDouble(),
                                  min: 180,
                                  max: 1800,
                                  divisions: 27,
                                  format: (v) => s.minutes((v / 60).round()),
                                  onChanged: (v) => setState(() =>
                                      _config.durationSeconds = v.round()),
                                ),
                                SliderRow(
                                  label: s.scoreLimit,
                                  value: _config.killLimit.toDouble(),
                                  min: 5,
                                  max: 100,
                                  divisions: 19,
                                  format: (v) => v.round().toString(),
                                  onChanged: (v) => setState(
                                      () => _config.killLimit = v.round()),
                                ),
                                SliderRow(
                                  label: s.maxPlayers,
                                  value: _config.maxPlayers.toDouble(),
                                  min: 2,
                                  max: 12,
                                  divisions: 10,
                                  format: (v) => v.round().toString(),
                                  onChanged: (v) => setState(
                                      () => _config.maxPlayers = v.round()),
                                ),
                                SliderRow(
                                  label: s.respawningIn,
                                  value: _config.respawnSeconds.toDouble(),
                                  min: 2,
                                  max: 15,
                                  divisions: 13,
                                  format: (v) => s.seconds(v.round()),
                                  onChanged: (v) => setState(
                                      () => _config.respawnSeconds = v.round()),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      flex: 4,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(10, 8, 20, 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Panel(
                              title: s.mapLabel.toUpperCase(),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  for (final m in Catalog.maps)
                                    _MapTile(
                                      map: m,
                                      selected: m.id == _config.mapId,
                                      onTap: () =>
                                          setState(() => _config.mapId = m.id),
                                    ),
                                  const SizedBox(height: 10),
                                  Text(
                                    s.isPashto ? map.descPs : map.descEn,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: AppPalette.textLow,
                                        height: 1.4),
                                  ),
                                ],
                              ),
                            ),
                            const Spacer(),
                            FilledButton.icon(
                              onPressed: _start,
                              icon: const Icon(Icons.wifi_tethering),
                              label: Text(s.createGroup),
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
}

class _MapTile extends StatelessWidget {
  const _MapTile({
    required this.map,
    required this.selected,
    required this.onTap,
  });

  final MapDef map;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? AppPalette.accent.withValues(alpha: 0.12)
              : AppPalette.surfaceHigh,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppPalette.accent : AppPalette.outline,
          ),
        ),
        child: Row(
          children: [
            const Icon(Icons.map_outlined, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.isPashto ? map.namePs : map.nameEn,
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700)),
                  Text('${map.size} × ${map.size} m',
                      style: const TextStyle(
                          fontSize: 11, color: AppPalette.textLow)),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle,
                  size: 18, color: AppPalette.accent),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 20, 0),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back),
          ),
          Text(title,
              style:
                  const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const Spacer(),
          const Wordmark(compact: true),
        ],
      ),
    );
  }
}
