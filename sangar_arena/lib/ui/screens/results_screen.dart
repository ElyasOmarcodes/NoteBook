import 'package:flutter/material.dart';

import '../../l10n/strings.dart';
import '../../models/match.dart';
import '../../net/match_session.dart';
import '../../theme/app_theme.dart';
import '../widgets/agent_portrait.dart';
import '../widgets/common.dart';

/// End-of-match scoreboard: the ranked table every player sees when the clock
/// runs out or the kill limit is reached.
class ResultsScreen extends StatelessWidget {
  const ResultsScreen({super.key, required this.session});

  final MatchSession session;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final board = session.scoreboard;
    final teamMode = session.config.mode == GameMode.tdm;
    final scores = session.teamScores;
    final me = session.self;

    String outcome;
    Color outcomeColor;
    if (teamMode && me != null) {
      final mine = scores[me.team] ?? 0;
      final theirs = scores[me.team == 0 ? 1 : 0] ?? 0;
      if (mine > theirs) {
        outcome = s.victory;
        outcomeColor = AppPalette.success;
      } else if (mine < theirs) {
        outcome = s.defeat;
        outcomeColor = AppPalette.danger;
      } else {
        outcome = s.draw;
        outcomeColor = AppPalette.accent;
      }
    } else {
      final top = board.isNotEmpty ? board.first : null;
      final won = top != null && me != null && top.id == me.id;
      outcome = won ? s.victory : s.defeat;
      outcomeColor = won ? AppPalette.success : AppPalette.danger;
    }

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: ArenaBackdrop(
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.matchResults,
                              style: const TextStyle(
                                  fontSize: 13,
                                  letterSpacing: 1.4,
                                  color: AppPalette.textLow)),
                          Text(outcome,
                              style: TextStyle(
                                  fontSize: 32,
                                  fontWeight: FontWeight.w900,
                                  color: outcomeColor)),
                        ],
                      ),
                      const Spacer(),
                      if (teamMode)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            _TeamScore(
                                label: s.teamAlpha,
                                score: scores[0] ?? 0,
                                color: AppPalette.teamAlpha),
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: Text(':',
                                  style: TextStyle(
                                      fontSize: 26,
                                      color: AppPalette.textLow)),
                            ),
                            _TeamScore(
                                label: s.teamBravo,
                                score: scores[1] ?? 0,
                                color: AppPalette.teamBravo),
                          ],
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Expanded(
                    child: Panel(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
                      child: Column(
                        children: [
                          _HeaderRow(strings: s, teamMode: teamMode),
                          const Divider(height: 14),
                          Expanded(
                            child: ListView.builder(
                              itemCount: board.length,
                              itemBuilder: (context, i) => _ResultRow(
                                rank: i + 1,
                                player: board[i],
                                isSelf: board[i].id == session.selfId,
                                teamMode: teamMode,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () async {
                            await session.close();
                            if (context.mounted) {
                              Navigator.of(context)
                                  .popUntil((r) => r.isFirst);
                            }
                          },
                          icon: const Icon(Icons.home_outlined),
                          label: Text(s.backToMenu),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TeamScore extends StatelessWidget {
  const _TeamScore({
    required this.label,
    required this.score,
    required this.color,
  });

  final String label;
  final int score;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(label,
            style: TextStyle(fontSize: 11, color: color)),
        Text('$score',
            style: TextStyle(
                fontSize: 30, fontWeight: FontWeight.w900, color: color)),
      ],
    );
  }
}

class _HeaderRow extends StatelessWidget {
  const _HeaderRow({required this.strings, required this.teamMode});

  final Strings strings;
  final bool teamMode;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(
        fontSize: 11, color: AppPalette.textLow, fontWeight: FontWeight.w700);
    final s = strings;
    return Row(
      children: [
        SizedBox(width: 34, child: Text(s.rank, style: style)),
        const SizedBox(width: 44),
        Expanded(child: Text(s.player, style: style)),
        if (teamMode) const SizedBox(width: 72),
        SizedBox(
            width: 52,
            child: Text(s.kills, style: style, textAlign: TextAlign.end)),
        SizedBox(
            width: 52,
            child: Text(s.deaths, style: style, textAlign: TextAlign.end)),
        SizedBox(
            width: 56,
            child:
                Text(s.accuracyPct, style: style, textAlign: TextAlign.end)),
        SizedBox(
            width: 60,
            child: Text(s.score, style: style, textAlign: TextAlign.end)),
      ],
    );
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow({
    required this.rank,
    required this.player,
    required this.isSelf,
    required this.teamMode,
  });

  final int rank;
  final PlayerInfo player;
  final bool isSelf;
  final bool teamMode;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final teamColor =
        player.team == 0 ? AppPalette.teamAlpha : AppPalette.teamBravo;
    final medal = switch (rank) {
      1 => AppPalette.accent,
      2 => const Color(0xFFB9C2CC),
      3 => const Color(0xFFB07A46),
      _ => AppPalette.textLow,
    };

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: isSelf
            ? AppPalette.accent.withValues(alpha: 0.10)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isSelf ? AppPalette.accent : Colors.transparent,
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 34,
            child: Text('$rank',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w900, color: medal)),
          ),
          AgentPortrait(
            agent: player.agent,
            size: 36,
            teamColor: teamMode ? teamColor : AppPalette.accent,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              player.name,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: isSelf ? FontWeight.w800 : FontWeight.w600),
            ),
          ),
          if (teamMode)
            SizedBox(
              width: 72,
              child: Pill(
                label: player.team == 0 ? s.teamAlpha : s.teamBravo,
                color: teamColor,
              ),
            ),
          SizedBox(
            width: 52,
            child: Text('${player.kills}',
                textAlign: TextAlign.end,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700)),
          ),
          SizedBox(
            width: 52,
            child: Text('${player.deaths}',
                textAlign: TextAlign.end,
                style: const TextStyle(color: AppPalette.textLow)),
          ),
          SizedBox(
            width: 56,
            child: Text('${(player.accuracy * 100).round()}%',
                textAlign: TextAlign.end,
                style: const TextStyle(color: AppPalette.textLow)),
          ),
          SizedBox(
            width: 60,
            child: Text('${player.score}',
                textAlign: TextAlign.end,
                style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppPalette.accent)),
          ),
        ],
      ),
    );
  }
}
