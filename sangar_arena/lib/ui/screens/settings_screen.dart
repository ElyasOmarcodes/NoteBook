import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../state/settings_controller.dart';
import '../../theme/app_theme.dart';
import '../widgets/cards.dart';
import '../widgets/common.dart';
import '../widgets/preview_3d.dart';

/// Tabbed settings: general, audio, graphics, controls, character, weapons.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs =
      TabController(length: 6, vsync: this, initialIndex: widget.initialTab);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final settings = SettingsScope.of(context);

    return Scaffold(
      body: ArenaBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 16, 0),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back),
                      tooltip: s.back,
                    ),
                    Text(s.settings,
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    TextButton.icon(
                      onPressed: () async {
                        await settings.resetDefaults();
                        if (context.mounted) setState(() {});
                      },
                      icon: const Icon(Icons.restart_alt, size: 18),
                      label: Text(s.resetDefaults),
                    ),
                  ],
                ),
              ),
              TabBar(
                controller: _tabs,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: [
                  Tab(text: s.tabGeneral),
                  Tab(text: s.tabAudio),
                  Tab(text: s.tabGraphics),
                  Tab(text: s.tabControls),
                  Tab(text: s.tabCharacter),
                  Tab(text: s.tabWeapons),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    _GeneralTab(settings: settings),
                    _AudioTab(settings: settings),
                    _GraphicsTab(settings: settings),
                    _ControlsTab(settings: settings),
                    _CharacterTab(settings: settings),
                    _WeaponsTab(settings: settings),
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

EdgeInsets get _pad => const EdgeInsets.fromLTRB(20, 16, 20, 24);

class _GeneralTab extends StatefulWidget {
  const _GeneralTab({required this.settings});
  final SettingsController settings;

  @override
  State<_GeneralTab> createState() => _GeneralTabState();
}

class _GeneralTabState extends State<_GeneralTab> {
  late final TextEditingController _name =
      TextEditingController(text: widget.settings.playerName);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final settings = widget.settings;
    return ListView(
      padding: _pad,
      children: [
        Panel(
          title: s.profile.toUpperCase(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(s.playerName,
                  style: const TextStyle(
                      fontSize: 13, color: AppPalette.textLow)),
              const SizedBox(height: 8),
              TextField(
                controller: _name,
                maxLength: 16,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(counterText: ''),
                onChanged: (v) => settings.update((x) =>
                    x.playerName = v.trim().isEmpty ? x.playerName : v.trim()),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Panel(
          title: s.language.toUpperCase(),
          child: SettingRow(
            label: s.language,
            child: SegmentedChoice<AppLang>(
              value: settings.lang,
              options: [
                (value: AppLang.ps, label: s.pashto),
                (value: AppLang.en, label: s.english),
              ],
              onChanged: (v) => settings.update((x) => x.lang = v),
            ),
          ),
        ),
        const SizedBox(height: 14),
        // The weapon models are used under CC BY 4.0, which asks for the
        // authors to be named wherever the work is shown.
        Panel(
          title: s.credits.toUpperCase(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.creditsIntro,
                  style: const TextStyle(
                      fontSize: 12.5, height: 1.5, color: AppPalette.textLow)),
              const SizedBox(height: 8),
              Text(s.creditsModels,
                  style: const TextStyle(fontSize: 12.5, height: 1.6)),
              const SizedBox(height: 8),
              Text(s.creditsEngine,
                  style: const TextStyle(
                      fontSize: 12.5, height: 1.5, color: AppPalette.textLow)),
            ],
          ),
        ),
      ],
    );
  }
}

class _AudioTab extends StatelessWidget {
  const _AudioTab({required this.settings});
  final SettingsController settings;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListView(
      padding: _pad,
      children: [
        Panel(
          title: s.tabAudio.toUpperCase(),
          child: Column(
            children: [
              SliderRow(
                label: s.masterVolume,
                value: settings.masterVolume,
                onChanged: (v) => settings.update((x) => x.masterVolume = v),
              ),
              SliderRow(
                label: s.sfxVolume,
                value: settings.sfxVolume,
                onChanged: (v) => settings.update((x) => x.sfxVolume = v),
              ),
              SliderRow(
                label: s.musicVolume,
                value: settings.musicVolume,
                onChanged: (v) => settings.update((x) => x.musicVolume = v),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _GraphicsTab extends StatelessWidget {
  const _GraphicsTab({required this.settings});
  final SettingsController settings;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListView(
      padding: _pad,
      children: [
        Panel(
          title: s.tabGraphics.toUpperCase(),
          child: Column(
            children: [
              SettingRow(
                label: s.quality,
                child: SegmentedChoice<GraphicsQuality>(
                  value: settings.quality,
                  options: [
                    (value: GraphicsQuality.low, label: s.qualityLow),
                    (value: GraphicsQuality.medium, label: s.qualityMedium),
                    (value: GraphicsQuality.high, label: s.qualityHigh),
                  ],
                  onChanged: (v) => settings.update((x) => x.quality = v),
                ),
              ),
              const Divider(),
              SettingRow(
                label: s.shadows,
                child: Switch(
                  value: settings.shadows,
                  onChanged: (v) => settings.update((x) => x.shadows = v),
                ),
              ),
              SettingRow(
                label: s.postFx,
                child: Switch(
                  value: settings.postFx,
                  onChanged: (v) => settings.update((x) => x.postFx = v),
                ),
              ),
              SettingRow(
                label: s.showFps,
                child: Switch(
                  value: settings.showFps,
                  onChanged: (v) => settings.update((x) => x.showFps = v),
                ),
              ),
              const Divider(),
              SliderRow(
                label: s.renderScale,
                value: settings.renderScale,
                min: 0.6,
                max: 1.4,
                divisions: 8,
                format: (v) => '${(v * 100).round()}%',
                onChanged: (v) => settings.update((x) => x.renderScale = v),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ControlsTab extends StatelessWidget {
  const _ControlsTab({required this.settings});
  final SettingsController settings;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListView(
      padding: _pad,
      children: [
        Panel(
          title: s.tabControls.toUpperCase(),
          child: Column(
            children: [
              SliderRow(
                label: s.sensitivity,
                value: settings.sensitivity,
                min: 0.2,
                max: 3.0,
                divisions: 28,
                format: (v) => v.toStringAsFixed(2),
                onChanged: (v) => settings.update((x) => x.sensitivity = v),
              ),
              SliderRow(
                label: s.adsSensitivity,
                value: settings.adsSensitivity,
                min: 0.1,
                max: 1.5,
                divisions: 28,
                format: (v) => v.toStringAsFixed(2),
                onChanged: (v) => settings.update((x) => x.adsSensitivity = v),
              ),
              SliderRow(
                label: s.hudScale,
                value: settings.hudScale,
                min: 0.75,
                max: 1.4,
                divisions: 13,
                format: (v) => '${(v * 100).round()}%',
                onChanged: (v) => settings.update((x) => x.hudScale = v),
              ),
              const Divider(),
              SettingRow(
                label: s.invertY,
                child: Switch(
                  value: settings.invertY,
                  onChanged: (v) => settings.update((x) => x.invertY = v),
                ),
              ),
              SettingRow(
                label: s.autoFire,
                child: Switch(
                  value: settings.autoFire,
                  onChanged: (v) => settings.update((x) => x.autoFire = v),
                ),
              ),
              SettingRow(
                label: s.leftHanded,
                child: Switch(
                  value: settings.leftHanded,
                  onChanged: (v) => settings.update((x) => x.leftHanded = v),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CharacterTab extends StatelessWidget {
  const _CharacterTab({required this.settings});
  final SettingsController settings;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Padding(
      padding: _pad,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.selectAgent,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          // The real model, turning, so what is chosen here is what deploys.
          Preview3D(
            kind: 'character',
            id: Catalog.agentById(settings.agentId).model,
            height: 190,
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: Catalog.agents.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final agent = Catalog.agents[i];
                return AgentCard(
                  agent: agent,
                  selected: agent.id == settings.agentId,
                  onTap: () => settings.update((x) => x.agentId = agent.id),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _WeaponsTab extends StatefulWidget {
  const _WeaponsTab({required this.settings});
  final SettingsController settings;

  @override
  State<_WeaponsTab> createState() => _WeaponsTabState();
}

class _WeaponsTabState extends State<_WeaponsTab> {
  /// 0 = primary slot, 1 = secondary slot.
  int _slot = 0;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final settings = widget.settings;
    final selectedId = _slot == 0 ? settings.primaryId : settings.secondaryId;

    return Padding(
      padding: _pad,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(s.selectWeapon,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700)),
              const Spacer(),
              SegmentedChoice<int>(
                value: _slot,
                options: [
                  (value: 0, label: s.primaryWeapon),
                  (value: 1, label: s.secondaryWeapon),
                ],
                onChanged: (v) => setState(() => _slot = v),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Preview3D(kind: 'weapon', id: selectedId, height: 150),
          const SizedBox(height: 12),
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: Catalog.weapons.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final weapon = Catalog.weapons[i];
                final isOther = _slot == 0
                    ? weapon.id == settings.secondaryId
                    : weapon.id == settings.primaryId;
                return WeaponCard(
                  weapon: weapon,
                  selected: weapon.id == selectedId,
                  slotLabel: isOther
                      ? (_slot == 0 ? s.secondaryWeapon : s.primaryWeapon)
                      : null,
                  onTap: () => settings.update((x) {
                    // Picking a weapon already in the other slot swaps them,
                    // so you can never carry the same gun twice.
                    if (_slot == 0) {
                      if (weapon.id == x.secondaryId) {
                        x.secondaryId = x.primaryId;
                      }
                      x.primaryId = weapon.id;
                    } else {
                      if (weapon.id == x.primaryId) {
                        x.primaryId = x.secondaryId;
                      }
                      x.secondaryId = weapon.id;
                    }
                  }),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          Text(s.grenade,
              style:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final g in Catalog.grenades)
                ChoiceChip(
                  label: Text(s.isPashto ? g.namePs : g.nameEn),
                  selected: g.id == settings.grenadeId,
                  onSelected: (_) =>
                      settings.update((x) => x.grenadeId = g.id),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
