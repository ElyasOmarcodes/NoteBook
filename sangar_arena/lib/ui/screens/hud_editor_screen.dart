import 'package:flutter/material.dart';

import '../../app.dart';
import '../../l10n/strings.dart';
import '../../models/hud_layout.dart';
import '../../theme/app_theme.dart';

/// Drag-and-drop editor for the on-screen buttons.
///
/// The board is the phone screen at the game's own aspect, so a button dropped
/// under the right thumb here is under the right thumb in a match. Everything
/// is a fraction of the board rather than a pixel, which is what lets one
/// arrangement travel between devices.
class HudEditorScreen extends StatefulWidget {
  const HudEditorScreen({super.key});

  @override
  State<HudEditorScreen> createState() => _HudEditorScreenState();
}

class _HudEditorScreenState extends State<HudEditorScreen> {
  List<HudButton>? _layout0;
  int? _selected;
  bool _dirty = false;

  List<HudButton> get _layout => _layout0!;
  set _layout(List<HudButton> v) => _layout0 = v;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Not in initState: reading an inherited widget is only legal from here on.
    _layout0 ??= List.of(SettingsScope.of(context).hudLayout);
  }

  void _commit() {
    SettingsScope.of(context)
        .update((x) => x.hudLayout = List.of(_layout));
    _dirty = false;
  }

  void _mutate(void Function() fn) {
    setState(() {
      fn();
      _dirty = true;
    });
    _commit();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final sel = _selected != null && _selected! < _layout.length
        ? _layout[_selected!]
        : null;

    return Scaffold(
      backgroundColor: AppPalette.ink,
      appBar: AppBar(
        title: Text(s.buttonLayout),
        actions: [
          TextButton.icon(
            onPressed: () => _mutate(() {
              _layout = List.of(kDefaultHudLayout);
              _selected = null;
            }),
            icon: const Icon(Icons.restart_alt, size: 18),
            label: Text(s.resetDefaults),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Text(s.buttonLayoutHint,
                style:
                    const TextStyle(fontSize: 12, color: AppPalette.textLow)),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: LayoutBuilder(
                builder: (context, box) {
                  final w = box.maxWidth;
                  final h = box.maxHeight;
                  return DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppPalette.outline),
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0xFF16202C), Color(0xFF0D141C)],
                      ),
                    ),
                    child: Stack(
                      children: [
                        // A hint of where the thumbs live, so an arrangement
                        // can be judged rather than guessed at.
                        Positioned(
                          left: w * 0.04,
                          top: h * 0.58,
                          child: _Ghost(size: w * 0.20, label: s.moveStick),
                        ),
                        for (var i = 0; i < _layout.length; i++)
                          _DraggableButton(
                            key: ValueKey('$i-${_layout[i].action}'),
                            item: _layout[i],
                            boardWidth: w,
                            boardHeight: h,
                            selected: _selected == i,
                            onTap: () => setState(() => _selected = i),
                            onMove: (dx, dy) => _mutate(() {
                              final b = _layout[i];
                              _layout[i] = b.copyWith(
                                x: (b.x + dx / w).clamp(0.03, 0.97),
                                y: (b.y + dy / h).clamp(0.03, 0.97),
                              );
                              _selected = i;
                            }),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
          _Toolbar(
            selected: sel,
            onScale: (v) => _mutate(
                () => _layout[_selected!] = _layout[_selected!].copyWith(scale: v)),
            onDuplicate: sel == null
                ? null
                : () => _mutate(() {
                      _layout.add(sel.copyWith(
                        x: (sel.x - 0.10).clamp(0.03, 0.97),
                        y: (sel.y - 0.06).clamp(0.03, 0.97),
                      ));
                      _selected = _layout.length - 1;
                    }),
            onRemove: sel == null || _layout.length <= 1
                ? null
                : () => _mutate(() {
                      _layout.removeAt(_selected!);
                      _selected = null;
                    }),
            onAdd: (action) => _mutate(() {
              _layout.add(HudButton(action: action, x: 0.5, y: 0.5));
              _selected = _layout.length - 1;
            }),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    if (_dirty) _commit();
    super.dispose();
  }
}

class _DraggableButton extends StatelessWidget {
  const _DraggableButton({
    super.key,
    required this.item,
    required this.boardWidth,
    required this.boardHeight,
    required this.selected,
    required this.onTap,
    required this.onMove,
  });

  final HudButton item;
  final double boardWidth;
  final double boardHeight;
  final bool selected;
  final VoidCallback onTap;
  final void Function(double dx, double dy) onMove;

  @override
  Widget build(BuildContext context) {
    final size = 46.0 * item.scale;
    return Positioned(
      left: item.x * boardWidth - size / 2,
      top: item.y * boardHeight - size / 2,
      child: GestureDetector(
        onTap: onTap,
        onPanUpdate: (d) => onMove(d.delta.dx, d.delta.dy),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppPalette.surfaceHigh.withValues(alpha: 0.92),
            border: Border.all(
              color: selected ? AppPalette.accent : AppPalette.outline,
              width: selected ? 2 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Icon(_iconFor(item.action),
              size: size * 0.46,
              color: selected ? AppPalette.accent : AppPalette.textHigh),
        ),
      ),
    );
  }
}

IconData _iconFor(String action) {
  switch (action) {
    case 'fire':
      return Icons.gps_fixed;
    case 'reload':
      return Icons.refresh;
    case 'swap':
      return Icons.swap_horiz;
    case 'scope':
      return Icons.center_focus_strong;
    case 'nade':
      return Icons.bubble_chart;
    case 'jump':
      return Icons.arrow_upward;
    case 'crouch':
      return Icons.airline_seat_recline_normal;
    case 'prone':
      return Icons.horizontal_rule;
    default:
      return Icons.content_cut;
  }
}

class _Ghost extends StatelessWidget {
  const _Ghost({required this.size, required this.label});
  final double size;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: AppPalette.outline),
      ),
      child: Text(label,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 9, color: AppPalette.textLow)),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.selected,
    required this.onScale,
    required this.onDuplicate,
    required this.onRemove,
    required this.onAdd,
  });

  final HudButton? selected;
  final ValueChanged<double> onScale;
  final VoidCallback? onDuplicate;
  final VoidCallback? onRemove;
  final ValueChanged<String> onAdd;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 14),
      color: AppPalette.surface,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              SizedBox(
                width: 74,
                child: Text(s.buttonSize,
                    style: const TextStyle(
                        fontSize: 12, color: AppPalette.textLow)),
              ),
              Expanded(
                child: Slider(
                  min: 0.6,
                  max: 1.8,
                  divisions: 12,
                  value: (selected?.scale ?? 1).clamp(0.6, 1.8),
                  onChanged: selected == null ? null : onScale,
                ),
              ),
              IconButton(
                onPressed: onDuplicate,
                icon: const Icon(Icons.copy_all),
                tooltip: s.duplicate,
              ),
              IconButton(
                onPressed: onRemove,
                icon: const Icon(Icons.delete_outline),
                tooltip: s.removeButton,
              ),
            ],
          ),
          const SizedBox(height: 4),
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: kHudActions.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) => ActionChip(
                avatar: Icon(_iconFor(kHudActions[i]), size: 16),
                label: Text(s.actionName(kHudActions[i]),
                    style: const TextStyle(fontSize: 11)),
                onPressed: () => onAdd(kHudActions[i]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
