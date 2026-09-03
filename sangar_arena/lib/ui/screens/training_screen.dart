import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/match.dart';
import '../../net/match_session.dart';
import '../../theme/app_theme.dart';
import '../widgets/common.dart';
import 'game_screen.dart';

/// Solo play: walk the map alone, or fight a handful of bots.
class TrainingScreen extends StatefulWidget {
  const TrainingScreen({super.key});

  @override
  State<TrainingScreen> createState() => _TrainingScreenState();
}

class _TrainingScreenState extends State<TrainingScreen> {
  bool _withBots = true;
  int _botCount = 4;
  int _minutes = 10;

  void _start() {
    final settings = SettingsScope.of(context);
    final session = MatchSession.solo(
      selfId: settings.playerId,
      selfName: settings.playerName,
      config: MatchConfig(
        groupName: 'Training',
        mode: GameMode.dm,
        durationSeconds: _minutes * 60,
        killLimit: 999,
        maxPlayers: 1,
      ),
      loadout: Loadout(
        agentId: settings.agentId,
        primaryId: settings.primaryId,
        secondaryId: settings.secondaryId,
        grenadeId: settings.grenadeId,
      ),
      botCount: _withBots ? _botCount : 0,
    );
    session.open();

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => GameScreen(
          session: session,
          trainingBots: _withBots ? _botCount : 0,
          freeRoam: !_withBots,
        ),
      ),
    );
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
                    Text(s.training,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    const Wordmark(compact: true),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Panel(
                        title: s.soloRange.toUpperCase(),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              s.trainingIntro,
                              style: const TextStyle(
                                  fontSize: 13,
                                  color: AppPalette.textLow,
                                  height: 1.5),
                            ),
                            const SizedBox(height: 16),
                            SettingRow(
                              label: s.withBots,
                              description: _withBots ? null : s.freeRoam,
                              child: Switch(
                                value: _withBots,
                                onChanged: (v) =>
                                    setState(() => _withBots = v),
                              ),
                            ),
                            if (_withBots)
                              SliderRow(
                                label: s.botCount,
                                value: _botCount.toDouble(),
                                min: 1,
                                max: 8,
                                divisions: 7,
                                format: (v) => v.round().toString(),
                                onChanged: (v) =>
                                    setState(() => _botCount = v.round()),
                              ),
                            SliderRow(
                              label: s.matchLength,
                              value: _minutes.toDouble(),
                              min: 3,
                              max: 30,
                              divisions: 9,
                              format: (v) => s.minutes(v.round()),
                              onChanged: (v) =>
                                  setState(() => _minutes = v.round()),
                            ),
                            const SizedBox(height: 18),
                            FilledButton.icon(
                              onPressed: _start,
                              icon: const Icon(Icons.play_arrow),
                              label: Text(s.play),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
