import 'package:flutter/material.dart';

import '../../l10n/strings.dart';
import '../../theme/app_theme.dart';
import '../widgets/preview_3d.dart';

/// A full-screen turntable of one character or weapon.
///
/// The card in the list carries a small still; this is where a player goes to
/// actually look at what they are choosing — the same model the match loads,
/// filling the screen, with a way back.
class PreviewScreen extends StatelessWidget {
  const PreviewScreen({
    super.key,
    required this.kind,
    required this.id,
    required this.title,
    this.subtitle,
  });

  /// `character` or `weapon`.
  final String kind;
  final String id;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      backgroundColor: AppPalette.ink,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 56, 10, 10),
                child: Preview3D(
                  kind: kind,
                  id: id,
                  height: double.infinity,
                ),
              ),
            ),
            Positioned(
              top: 4,
              left: 4,
              right: 4,
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back),
                    tooltip: s.back,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title,
                            style: const TextStyle(
                                fontSize: 17, fontWeight: FontWeight.w800)),
                        if (subtitle != null)
                          Text(subtitle!,
                              style: const TextStyle(
                                  fontSize: 11, color: AppPalette.textLow)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: Center(
                child: Text(s.dragToTurn,
                    style: const TextStyle(
                        fontSize: 11, color: AppPalette.textLow)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
