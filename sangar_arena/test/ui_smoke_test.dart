import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sangar_arena/l10n/strings.dart';
import 'package:sangar_arena/models/catalog.dart';
import 'package:sangar_arena/theme/app_theme.dart';
import 'package:sangar_arena/ui/widgets/agent_portrait.dart';
import 'package:sangar_arena/ui/widgets/cards.dart';
import 'package:sangar_arena/ui/widgets/common.dart';

/// Renders the pieces the menus are built from, in both languages, so a
/// layout or RTL regression fails here rather than on a phone.
Widget host(Widget child, {AppLang lang = AppLang.ps}) {
  final strings = Strings(lang);
  return LocalizedApp(
    strings: strings,
    child: MaterialApp(
      theme: AppTheme.dark(),
      locale: strings.locale,
      home: Directionality(
        textDirection: strings.direction,
        child: Scaffold(body: Center(child: child)),
      ),
    ),
  );
}

void main() {
  testWidgets('agent cards render for every agent in both languages',
      (tester) async {
    tester.view.physicalSize = const Size(1600, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    for (final lang in AppLang.values) {
      for (final agent in Catalog.agents) {
        await tester.pumpWidget(host(
          SizedBox(
            height: 300,
            child: AgentCard(agent: agent, selected: true, onTap: () {}),
          ),
          lang: lang,
        ));
        await tester.pump();
        expect(
          find.text(lang == AppLang.ps ? agent.namePs : agent.nameEn),
          findsOneWidget,
        );
      }
    }
  });

  testWidgets('weapon cards render for every weapon', (tester) async {
    tester.view.physicalSize = const Size(1600, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    for (final weapon in Catalog.weapons) {
      await tester.pumpWidget(host(
        SizedBox(
          height: 340,
          child: WeaponCard(weapon: weapon, selected: false, onTap: () {}),
        ),
      ));
      await tester.pump();
      expect(find.text(weapon.namePs), findsOneWidget);
    }
  });

  testWidgets('the portrait paints without overflowing its box',
      (tester) async {
    await tester.pumpWidget(host(
      AgentPortrait(agent: Catalog.agents.last, size: 120),
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('shared widgets lay out at a phone-sized viewport',
      (tester) async {
    tester.view.physicalSize = const Size(1600, 720);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(host(
      SizedBox(
        width: 360,
        child: Panel(
          title: 'PANEL',
          child: Column(
            children: [
              SliderRow(label: 'Volume', value: 0.5, onChanged: (_) {}),
              SettingRow(label: 'Shadows', child: Switch(value: true, onChanged: (_) {})),
              SegmentedChoice<int>(
                value: 0,
                options: const [(value: 0, label: 'A'), (value: 1, label: 'B')],
                onChanged: (_) {},
              ),
              const StatBar(label: 'Damage', value: 0.7),
              const Pill(label: 'HOST'),
            ],
          ),
        ),
      ),
    ));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
