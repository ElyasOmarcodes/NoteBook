import 'package:flutter/foundation.dart';

/// One on-screen action button: what it does, where it sits and how big it is.
///
/// Position is a fraction of the screen rather than a pixel offset, so an
/// arrangement made on one phone lands in the same place on another.
@immutable
class HudButton {
  const HudButton({
    required this.action,
    required this.x,
    required this.y,
    this.scale = 1.0,
  });

  /// Matches the engine's `data-action`: fire, reload, swap, scope, nade,
  /// jump, crouch, prone, melee.
  final String action;

  /// 0 = left/top edge, 1 = right/bottom edge.
  final double x;
  final double y;

  /// Size multiplier, 0.6 to 1.8.
  final double scale;

  HudButton copyWith({double? x, double? y, double? scale}) => HudButton(
        action: action,
        x: x ?? this.x,
        y: y ?? this.y,
        scale: scale ?? this.scale,
      );

  Map<String, dynamic> toJson() =>
      {'action': action, 'x': x, 'y': y, 'scale': scale};

  static HudButton fromJson(Map<String, dynamic> j) => HudButton(
        action: (j['action'] ?? 'fire') as String,
        x: ((j['x'] as num?) ?? 0.5).toDouble(),
        y: ((j['y'] as num?) ?? 0.5).toDouble(),
        scale: ((j['scale'] as num?) ?? 1).toDouble(),
      );
}

/// Every action a button can be bound to.
const List<String> kHudActions = [
  'fire', 'reload', 'swap', 'scope', 'nade', 'jump', 'crouch', 'prone', 'melee',
];

/// The arrangement the game ships with: the cluster in the lower right, fire
/// largest and outermost where a thumb rests.
const List<HudButton> kDefaultHudLayout = [
  HudButton(action: 'fire',   x: 0.925, y: 0.660, scale: 1.35),
  HudButton(action: 'reload', x: 0.735, y: 0.470, scale: 1.0),
  HudButton(action: 'swap',   x: 0.845, y: 0.430, scale: 1.0),
  HudButton(action: 'scope',  x: 0.735, y: 0.680, scale: 1.0),
  HudButton(action: 'nade',   x: 0.828, y: 0.700, scale: 1.0),
  HudButton(action: 'jump',   x: 0.735, y: 0.880, scale: 1.0),
  HudButton(action: 'crouch', x: 0.828, y: 0.900, scale: 1.0),
  HudButton(action: 'prone',  x: 0.925, y: 0.895, scale: 1.0),
  HudButton(action: 'melee',  x: 0.640, y: 0.885, scale: 0.9),
];

List<Map<String, dynamic>> hudLayoutToJson(List<HudButton> layout) =>
    layout.map((b) => b.toJson()).toList();

List<HudButton> hudLayoutFromJson(Object? raw) {
  if (raw is! List) return List.of(kDefaultHudLayout);
  final out = <HudButton>[];
  for (final item in raw) {
    if (item is Map) {
      out.add(HudButton.fromJson(Map<String, dynamic>.from(item)));
    }
  }
  return out.isEmpty ? List.of(kDefaultHudLayout) : out;
}
