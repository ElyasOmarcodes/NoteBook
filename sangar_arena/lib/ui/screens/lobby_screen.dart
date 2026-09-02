import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../models/match.dart';
import '../../net/match_session.dart';
import '../../theme/app_theme.dart';
import '../widgets/agent_portrait.dart';
import '../widgets/common.dart';
import 'game_screen.dart';

/// The shared waiting room. The host sees the match controls; everyone sees
/// the roster and their own loadout.
class LobbyScreen extends StatefulWidget {
  const LobbyScreen({super.key, required this.session});

  final MatchSession session;

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  MatchSession get session => widget.session;
  bool _launched = false;

  @override
  void initState() {
    super.initState();
    session.addListener(_onChanged);
    session.open();
  }

  @override
  void dispose() {
    session.removeListener(_onChanged);
    super.dispose();
  }

  void _onChanged() {
    if (!mounted) return;
    // A client follows the host into the match automatically.
    if (!_launched && session.phase == MatchPhase.live) {
      _launched = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _enterMatch());
      return;
    }
    setState(() {});
  }

  Future<void> _enterMatch() async {
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => GameScreen(session: session)),
    );
    _launched = false;
    if (mounted) setState(() {});
  }

  Future<void> _leave() async {
    await session.close();
    if (mounted) Navigator.of(context).pop();
  }

  void _start() {
    session.startMatch();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final settings = SettingsScope.of(context);

    if (session.status == SessionStatus.connecting ||
        session.status == SessionStatus.starting) {
      return Scaffold(
        body: ArenaBackdrop(
          child: SafeArea(
            child: StatusView(
              message: session.isHost ? s.loading : s.connecting,
              action: OutlinedButton(onPressed: _leave, child: Text(s.cancel)),
            ),
          ),
        ),
      );
    }

    if (session.status == SessionStatus.failed) {
      return Scaffold(
        body: ArenaBackdrop(
          child: SafeArea(
            child: StatusView(
              message: session.isHost
                  ? '${s.errHostFailed}\n${session.errorMessage ?? ''}'
                  : '${s.errJoinFailed}\n${session.errorMessage ?? ''}',
              busy: false,
              action: FilledButton(onPressed: _leave, child: Text(s.back)),
            ),
          ),
        ),
      );
    }

    final players = session.players.values.toList()
      ..sort((a, b) {
        if (a.team != b.team) return a.team.compareTo(b.team);
        return a.name.compareTo(b.name);
      });

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        body: ArenaBackdrop(
          child: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 20, 6),
                  child: Row(
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(session.config.groupName,
                              style: const TextStyle(
                                  fontSize: 21, fontWeight: FontWeight.w800)),
                          Row(
                            children: [
                              Pill(
                                label: session.isHost ? s.host : s.connected,
                                color: session.isHost
                                    ? AppPalette.accent
                                    : AppPalette.success,
                              ),
                              const SizedBox(width: 6),
                              if (session.isHost &&
                                  session.hostAddress.isNotEmpty)
                                Pill(
                                  label: session.hostAddress,
                                  color: session.advertisingFailed
                                      ? AppPalette.danger
                                      : AppPalette.textLow,
                                ),
                            ],
                          ),
                        ],
                      ),
                      const Spacer(),
                      OutlinedButton.icon(
                        onPressed: _leave,
                        icon: const Icon(Icons.logout, size: 18),
                        label: Text(s.leave),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // ---- roster ----
                      Expanded(
                        flex: 6,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 6, 8, 16),
                          child: Panel(
                            title:
                                '${s.playersInLobby} (${players.length}/${session.config.maxPlayers})',
                            child: SizedBox(
                              height: double.infinity,
                              child: ListView.separated(
                                itemCount: players.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (context, i) => _PlayerRow(
                                  player: players[i],
                                  isSelf: players[i].id == session.selfId,
                                  canManage: session.isHost,
                                  teamMode:
                                      session.config.mode == GameMode.tdm,
                                  onSwitchTeam: () =>
                                      session.switchTeam(players[i].id),
                                  onKick: () => session.kick(players[i].id),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      // ---- match settings / start ----
                      Expanded(
                        flex: 4,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(8, 6, 16, 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Panel(
                                title: s.mapLabel.toUpperCase(),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    _InfoLine(
                                      label: s.mapLabel,
                                      value: s.isPashto
                                          ? session.config.map.namePs
                                          : session.config.map.nameEn,
                                    ),
                                    _InfoLine(
                                      label: s.mode,
                                      value:
                                          session.config.mode == GameMode.tdm
                                              ? s.modeTdm
                                              : s.modeDm,
                                    ),
                                    _InfoLine(
                                      label: s.matchLength,
                                      value: s.minutes(
                                          session.config.durationSeconds ~/ 60),
                                    ),
                                    _InfoLine(
                                      label: s.scoreLimit,
                                      value: '${session.config.killLimit}',
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                              Panel(
                                title: s.profile.toUpperCase(),
                                child: Row(
                                  children: [
                                    AgentPortrait(
                                      agent: Catalog.agentById(
                                          settings.agentId),
                                      size: 56,
                                      teamColor: (session.self?.team ?? 0) == 0
                                          ? AppPalette.teamAlpha
                                          : AppPalette.teamBravo,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            s.isPashto
                                                ? Catalog.weaponById(
                                                        settings.primaryId)
                                                    .namePs
                                                : Catalog.weaponById(
                                                        settings.primaryId)
                                                    .nameEn,
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w700),
                                          ),
                                          Text(
                                            s.isPashto
                                                ? Catalog.weaponById(
                                                        settings.secondaryId)
                                                    .namePs
                                                : Catalog.weaponById(
                                                        settings.secondaryId)
                                                    .nameEn,
                                            style: const TextStyle(
                                                fontSize: 12,
                                                color: AppPalette.textLow),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Spacer(),
                              if (session.isHost)
                                FilledButton.icon(
                                  onPressed:
                                      players.isEmpty ? null : _start,
                                  icon: const Icon(Icons.play_arrow),
                                  label: Text(s.startMatch),
                                )
                              else
                                Column(
                                  children: [
                                    OutlinedButton.icon(
                                      onPressed: () => session.setReady(
                                          !(session.self?.ready ?? false)),
                                      icon: Icon(
                                        (session.self?.ready ?? false)
                                            ? Icons.check_circle
                                            : Icons.radio_button_unchecked,
                                      ),
                                      label: Text(
                                        (session.self?.ready ?? false)
                                            ? s.ready
                                            : s.notReady,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(s.waitingForHost,
                                        style: const TextStyle(
                                            fontSize: 12,
                                            color: AppPalette.textLow)),
                                  ],
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
      ),
    );
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({
    required this.player,
    required this.isSelf,
    required this.canManage,
    required this.teamMode,
    required this.onSwitchTeam,
    required this.onKick,
  });

  final PlayerInfo player;
  final bool isSelf;
  final bool canManage;
  final bool teamMode;
  final VoidCallback onSwitchTeam;
  final VoidCallback onKick;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final teamColor =
        player.team == 0 ? AppPalette.teamAlpha : AppPalette.teamBravo;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isSelf
            ? AppPalette.accent.withValues(alpha: 0.08)
            : AppPalette.surfaceHigh,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isSelf ? AppPalette.accent : AppPalette.outline,
        ),
      ),
      child: Row(
        children: [
          AgentPortrait(
            agent: player.agent,
            size: 42,
            teamColor: teamMode ? teamColor : AppPalette.accent,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        player.name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (player.isHost) ...[
                      const SizedBox(width: 8),
                      Pill(label: s.host),
                    ],
                    if (!player.connected) ...[
                      const SizedBox(width: 8),
                      Pill(label: s.disconnected, color: AppPalette.danger),
                    ],
                  ],
                ),
                Text(
                  s.isPashto ? player.agent.namePs : player.agent.nameEn,
                  style: const TextStyle(
                      fontSize: 11.5, color: AppPalette.textLow),
                ),
              ],
            ),
          ),
          if (teamMode)
            Pill(
              label: player.team == 0 ? s.teamAlpha : s.teamBravo,
              color: teamColor,
            ),
          if (!player.isHost && player.ready) ...[
            const SizedBox(width: 6),
            Pill(label: s.ready, color: AppPalette.success),
          ],
          if (canManage && !isSelf) ...[
            if (teamMode)
              IconButton(
                onPressed: onSwitchTeam,
                icon: const Icon(Icons.swap_horiz, size: 18),
                tooltip: s.teamAlpha,
              ),
            IconButton(
              onPressed: onKick,
              icon: const Icon(Icons.person_remove_outlined, size: 18),
              color: AppPalette.danger,
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 12.5, color: AppPalette.textLow)),
          ),
          Text(value,
              style:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
