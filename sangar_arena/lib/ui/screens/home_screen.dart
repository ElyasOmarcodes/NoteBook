import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../theme/app_theme.dart';
import '../widgets/agent_portrait.dart';
import '../widgets/common.dart';
import 'create_group_screen.dart';
import 'join_group_screen.dart';
import 'settings_screen.dart';
import 'training_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final settings = SettingsScope.of(context);
    final agent = Catalog.agentById(settings.agentId);

    return Scaffold(
      body: ArenaBackdrop(
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 18, 24, 18),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ---- left: identity + actions ----
                Expanded(
                  flex: 5,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Wordmark(),
                      const SizedBox(height: 6),
                      Text(
                        s.tagline,
                        style: const TextStyle(
                            fontSize: 13, color: AppPalette.textLow),
                      ),
                      const SizedBox(height: 22),
                      Expanded(
                        child: SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              FilledButton.icon(
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const CreateGroupScreen(),
                                  ),
                                ),
                                icon: const Icon(Icons.add_circle_outline),
                                label: Text(s.createGroup),
                              ),
                              const SizedBox(height: 10),
                              OutlinedButton.icon(
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const JoinGroupScreen(),
                                  ),
                                ),
                                icon: const Icon(Icons.wifi_tethering),
                                label: Text(s.joinGroup),
                              ),
                              const SizedBox(height: 10),
                              OutlinedButton.icon(
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const TrainingScreen(),
                                  ),
                                ),
                                icon: const Icon(Icons.my_location),
                                label: Text(s.training),
                              ),
                              const SizedBox(height: 10),
                              OutlinedButton.icon(
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const SettingsScreen(),
                                  ),
                                ),
                                icon: const Icon(Icons.tune),
                                label: Text(s.settings),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppPalette.surface.withValues(alpha: 0.7),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppPalette.outline),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline,
                                size: 18, color: AppPalette.teal),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                s.hotspotHint,
                                style: const TextStyle(
                                    fontSize: 11.5,
                                    color: AppPalette.textLow,
                                    height: 1.4),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 24),
                // ---- right: current loadout ----
                Expanded(
                  flex: 4,
                  child: _LoadoutSummary(agent: agent),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LoadoutSummary extends StatelessWidget {
  const _LoadoutSummary({required this.agent});

  final AgentDef agent;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final settings = SettingsScope.of(context);
    final primary = Catalog.weaponById(settings.primaryId);
    final secondary = Catalog.weaponById(settings.secondaryId);
    final grenade = Catalog.grenadeById(settings.grenadeId);

    return Panel(
      title: s.profile.toUpperCase(),
      trailing: TextButton(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => const SettingsScreen(initialTab: 4),
          ),
        ),
        child: Text(s.equip),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AgentPortrait(agent: agent, size: 84),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      settings.playerName,
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                    Text(
                      s.isPashto ? agent.namePs : agent.nameEn,
                      style: const TextStyle(
                          fontSize: 13, color: AppPalette.accent),
                    ),
                    const SizedBox(height: 8),
                    StatBar(
                        label: s.isPashto ? 'چټکتیا' : 'Speed',
                        value: agent.speed),
                    StatBar(
                        label: s.isPashto ? 'زغم' : 'Armour',
                        value: agent.armour,
                        color: AppPalette.teal),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(),
          const SizedBox(height: 10),
          _LoadoutLine(
            label: s.primaryWeapon,
            value: s.isPashto ? primary.namePs : primary.nameEn,
            icon: Icons.gps_fixed,
          ),
          _LoadoutLine(
            label: s.secondaryWeapon,
            value: s.isPashto ? secondary.namePs : secondary.nameEn,
            icon: Icons.gps_not_fixed,
          ),
          _LoadoutLine(
            label: s.grenade,
            value: s.isPashto ? grenade.namePs : grenade.nameEn,
            icon: Icons.bubble_chart_outlined,
          ),
        ],
      ),
    );
  }
}

class _LoadoutLine extends StatelessWidget {
  const _LoadoutLine({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppPalette.textLow),
          const SizedBox(width: 10),
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    fontSize: 12.5, color: AppPalette.textLow)),
          ),
          Text(value,
              style:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
