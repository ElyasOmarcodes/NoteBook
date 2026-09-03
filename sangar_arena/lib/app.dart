import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'l10n/strings.dart';
import 'state/settings_controller.dart';
import 'theme/app_theme.dart';
import 'ui/screens/home_screen.dart';

class SangarArenaApp extends StatefulWidget {
  const SangarArenaApp({super.key, required this.settings});

  final SettingsController settings;

  @override
  State<SangarArenaApp> createState() => _SangarArenaAppState();
}

class _SangarArenaAppState extends State<SangarArenaApp> {
  @override
  void initState() {
    super.initState();
    widget.settings.addListener(_onSettingsChanged);
  }

  @override
  void dispose() {
    widget.settings.removeListener(_onSettingsChanged);
    super.dispose();
  }

  void _onSettingsChanged() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final strings = widget.settings.strings;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: AppTheme.overlay,
      child: LocalizedApp(
        strings: strings,
        child: SettingsScope(
          controller: widget.settings,
          child: MaterialApp(
            title: 'Sangar Arena',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.dark(),
            locale: strings.locale,
            builder: (context, child) => Directionality(
              textDirection: strings.direction,
              child: MediaQuery.withNoTextScaling(child: child!),
            ),
            home: const HomeScreen(),
          ),
        ),
      ),
    );
  }
}

/// Lets any screen reach the settings controller without a package dependency.
class SettingsScope extends InheritedNotifier<SettingsController> {
  const SettingsScope({
    super.key,
    required SettingsController controller,
    required super.child,
  }) : super(notifier: controller);

  static SettingsController of(BuildContext context) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<SettingsScope>();
    assert(scope != null, 'No SettingsScope in context');
    return scope!.notifier!;
  }
}
