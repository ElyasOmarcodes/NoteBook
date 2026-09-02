import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Visual identity for Sangar Arena.
///
/// The palette is a cold industrial one — gun-metal greys lifted by an amber
/// "tracer" accent — so the Flutter shell and the three.js battlefield feel
/// like one product.
class AppPalette {
  static const Color ink = Color(0xFF0B0F14);
  static const Color surface = Color(0xFF141A22);
  static const Color surfaceHigh = Color(0xFF1D2530);
  static const Color outline = Color(0xFF2C3745);
  static const Color accent = Color(0xFFE8A33D);
  static const Color accentSoft = Color(0xFFF4C67C);
  static const Color teal = Color(0xFF3DA9A0);
  static const Color danger = Color(0xFFD9534F);
  static const Color success = Color(0xFF5DBB6A);
  static const Color textHigh = Color(0xFFF1F4F8);
  static const Color textLow = Color(0xFF8E9AAA);

  /// Team colours, shared with the engine (see js/config.js).
  static const Color teamAlpha = Color(0xFF4C8DFF);
  static const Color teamBravo = Color(0xFFE2574C);
}

class AppTheme {
  static ThemeData dark() {
    const scheme = ColorScheme.dark(
      primary: AppPalette.accent,
      onPrimary: AppPalette.ink,
      secondary: AppPalette.teal,
      onSecondary: AppPalette.ink,
      surface: AppPalette.surface,
      onSurface: AppPalette.textHigh,
      error: AppPalette.danger,
      onError: Colors.white,
      outline: AppPalette.outline,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppPalette.ink,
      splashFactory: InkSparkle.splashFactory,
    );

    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppPalette.textHigh,
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppPalette.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppPalette.outline),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 52),
          foregroundColor: AppPalette.textHigh,
          side: const BorderSide(color: AppPalette.outline),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppPalette.surfaceHigh,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppPalette.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppPalette.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppPalette.accent, width: 1.6),
        ),
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: AppPalette.accent,
        inactiveTrackColor: AppPalette.outline,
        thumbColor: AppPalette.accentSoft,
        overlayColor: Color(0x22E8A33D),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? AppPalette.accent
                : AppPalette.textLow),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? AppPalette.accent.withValues(alpha: 0.35)
                : AppPalette.surfaceHigh),
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: AppPalette.accent,
        unselectedLabelColor: AppPalette.textLow,
        indicatorColor: AppPalette.accent,
        dividerColor: AppPalette.outline,
        labelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
      dividerTheme: const DividerThemeData(
        color: AppPalette.outline,
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppPalette.surfaceHigh,
        contentTextStyle: const TextStyle(color: AppPalette.textHigh),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  static const SystemUiOverlayStyle overlay = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: AppPalette.ink,
    systemNavigationBarIconBrightness: Brightness.light,
  );
}

/// A subtle brushed-steel backdrop used behind every menu screen.
class ArenaBackdrop extends StatelessWidget {
  const ArenaBackdrop({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0B0F14), Color(0xFF101822), Color(0xFF0B0F14)],
          stops: [0, 0.55, 1],
        ),
      ),
      child: child,
    );
  }
}
