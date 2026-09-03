import 'package:flutter/material.dart';

import '../../l10n/strings.dart';
import '../../models/catalog.dart';
import '../../theme/app_theme.dart';
import 'common.dart';
import 'agent_portrait.dart';

/// Selection card for one agent.
class AgentCard extends StatelessWidget {
  const AgentCard({
    super.key,
    required this.agent,
    required this.selected,
    required this.onTap,
  });

  final AgentDef agent;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 178,
        decoration: BoxDecoration(
          color: selected
              ? AppPalette.accent.withValues(alpha: 0.10)
              : AppPalette.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected ? AppPalette.accent : AppPalette.outline,
            width: selected ? 1.8 : 1,
          ),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Center(
                child: AgentPortrait(agent: agent, size: 92),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              s.isPashto ? agent.namePs : agent.nameEn,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            Text(
              s.isPashto ? agent.bioPs : agent.bioEn,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: AppPalette.textLow),
            ),
            const SizedBox(height: 8),
            StatBar(label: s.isPashto ? 'چټکتیا' : 'Speed', value: agent.speed),
            StatBar(
                label: s.isPashto ? 'زغم' : 'Armour',
                value: agent.armour,
                color: AppPalette.teal),
            StatBar(
                label: s.isPashto ? 'پټېدل' : 'Stealth',
                value: agent.stealth,
                color: AppPalette.teamAlpha),
          ],
        ),
      ),
    );
  }
}

/// Selection card for one weapon.
class WeaponCard extends StatelessWidget {
  const WeaponCard({
    super.key,
    required this.weapon,
    required this.selected,
    required this.onTap,
    this.slotLabel,
  });

  final WeaponDef weapon;
  final bool selected;
  final VoidCallback onTap;
  final String? slotLabel;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 210,
        decoration: BoxDecoration(
          color: selected
              ? AppPalette.accent.withValues(alpha: 0.10)
              : AppPalette.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected ? AppPalette.accent : AppPalette.outline,
            width: selected ? 1.8 : 1,
          ),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    s.isPashto ? weapon.namePs : weapon.nameEn,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800),
                  ),
                ),
                if (weapon.scope)
                  const Icon(Icons.center_focus_strong,
                      size: 16, color: AppPalette.accent),
              ],
            ),
            Text(
              _kindLabel(weapon.kind, s),
              style: const TextStyle(fontSize: 11, color: AppPalette.textLow),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 46,
              child: WeaponSilhouette(kind: weapon.kind),
            ),
            const SizedBox(height: 6),
            // Damage and rate of fire are stated as real numbers below, so
            // they do not also need a bar; these two have no plain unit.
            StatBar(
                label: s.accuracy,
                value: weapon.accuracyBar,
                color: AppPalette.teamAlpha),
            StatBar(
                label: s.range,
                value: weapon.rangeBar,
                color: AppPalette.accentSoft),
            const SizedBox(height: 8),
            // The real numbers, not just bars: how fast it fires, how much a
            // round takes off, and how many of them it takes to drop someone.
            Text(
              '${weapon.roundsPerSecond.toStringAsFixed(1)} ${s.perSecond}'
              '  ·  ${weapon.damage}${weapon.pellets > 1 ? '×${weapon.pellets}' : ''} ${s.perHit}',
              style: const TextStyle(fontSize: 11, color: AppPalette.textLow),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Pill(
                    label: '${s.toKillHead} ${weapon.headShotsToKill}',
                    color: AppPalette.danger),
                const SizedBox(width: 6),
                Pill(label: '${s.toKillBody} ${weapon.bodyShotsToKill}'),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Pill(label: '${s.magazine} ${weapon.magazine}'),
                const SizedBox(width: 6),
                if (slotLabel != null)
                  Pill(label: slotLabel!, color: AppPalette.teal, filled: true),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _kindLabel(WeaponKind kind, Strings s) {
    switch (kind) {
      case WeaponKind.rifle:
        return s.isPashto ? 'برید ټوپک' : 'Assault rifle';
      case WeaponKind.smg:
        return s.isPashto ? 'لنډه ماشیندار' : 'SMG';
      case WeaponKind.sniper:
        return s.isPashto ? 'ټکمار' : 'Sniper rifle';
      case WeaponKind.marksman:
        return s.isPashto ? 'نښه ویشتونکی' : 'Marksman rifle';
      case WeaponKind.shotgun:
        return s.isPashto ? 'ساچمه ییز' : 'Shotgun';
      case WeaponKind.lmg:
        return s.isPashto ? 'دروند ماشیندار' : 'Light machine gun';
      case WeaponKind.pistol:
        return s.isPashto ? 'پستول' : 'Pistol';
    }
  }
}

/// A flat vector silhouette of each weapon class, drawn to match the shape of
/// the 3D model the engine builds for it.
class WeaponSilhouette extends StatelessWidget {
  const WeaponSilhouette({super.key, required this.kind});

  final WeaponKind kind;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _WeaponPainter(kind),
      size: Size.infinite,
    );
  }
}

class _WeaponPainter extends CustomPainter {
  _WeaponPainter(this.kind);

  final WeaponKind kind;

  @override
  void paint(Canvas canvas, Size size) {
    final body = Paint()..color = const Color(0xFF2A2E34);
    final metal = Paint()..color = const Color(0xFF454C55);
    final wood = Paint()..color = const Color(0xFF6B4326);

    final w = size.width, h = size.height;
    // Everything is drawn on a 0..1 grid then scaled, so the proportions hold
    // at any card width.
    Rect r(double x, double y, double rw, double rh) =>
        Rect.fromLTWH(x * w, y * h, rw * w, rh * h);

    void rr(Rect rect, Paint p, [double radius = 2]) =>
        canvas.drawRRect(RRect.fromRectXY(rect, radius, radius), p);

    switch (kind) {
      case WeaponKind.pistol:
        rr(r(0.30, 0.30, 0.34, 0.16), body);
        rr(r(0.34, 0.46, 0.11, 0.34), body);
        rr(r(0.62, 0.34, 0.12, 0.07), metal);
        break;
      case WeaponKind.shotgun:
        rr(r(0.08, 0.42, 0.26, 0.14), wood);
        rr(r(0.32, 0.36, 0.30, 0.16), body);
        rr(r(0.60, 0.39, 0.34, 0.08), metal);
        rr(r(0.60, 0.50, 0.24, 0.06), metal);
        rr(r(0.40, 0.52, 0.09, 0.26), body);
        break;
      case WeaponKind.sniper:
      case WeaponKind.marksman:
        rr(r(0.04, 0.44, 0.28, 0.14), wood);
        rr(r(0.30, 0.38, 0.28, 0.18), body);
        rr(r(0.56, 0.44, 0.42, 0.07), metal);
        rr(r(0.34, 0.20, 0.30, 0.10), metal);   // scope
        rr(r(0.38, 0.56, 0.09, 0.26), body);
        rr(r(0.50, 0.56, 0.08, 0.20), body);    // magazine
        break;
      case WeaponKind.lmg:
        rr(r(0.04, 0.42, 0.24, 0.16), body);
        rr(r(0.26, 0.34, 0.34, 0.22), body);
        rr(r(0.58, 0.40, 0.38, 0.09), metal);
        canvas.drawCircle(Offset(0.44 * w, 0.72 * h), 0.13 * h, body);
        rr(r(0.32, 0.56, 0.09, 0.24), body);
        break;
      case WeaponKind.smg:
        rr(r(0.10, 0.42, 0.20, 0.09), metal);
        rr(r(0.28, 0.34, 0.30, 0.18), body);
        rr(r(0.56, 0.40, 0.24, 0.08), metal);
        rr(r(0.38, 0.52, 0.10, 0.34), body);
        break;
      case WeaponKind.rifle:
        rr(r(0.04, 0.42, 0.24, 0.15), wood);
        rr(r(0.26, 0.34, 0.32, 0.19), body);
        rr(r(0.56, 0.41, 0.38, 0.08), metal);
        rr(r(0.34, 0.54, 0.11, 0.30), body);
        rr(r(0.48, 0.54, 0.16, 0.10), wood);
        break;
    }
  }

  @override
  bool shouldRepaint(_WeaponPainter oldDelegate) => oldDelegate.kind != kind;
}
