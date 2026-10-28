import 'package:flutter/material.dart';

/// Design tokens matching the field-staff reference design.
abstract class AppColors {
  static const background = Color(0xFFF3F5F9);
  static const card = Colors.white;
  static const navy = Color(0xFF12232E); // dark buttons / selected chips
  static const ink = Color(0xFF1B2A38); // primary text
  static const muted = Color(0xFF6B7A8C); // secondary text
  static const faint = Color(0xFF94A3B8); // icons / yet-to-start
  static const hairline = Color(0xFFE8EDF3);

  static const green = Color(0xFF16A34A);
  static const greenBg = Color(0xFFDCFCE7);
  static const greenText = Color(0xFF15803D);

  static const amber = Color(0xFFF59E0B);
  static const amberBg = Color(0xFFFEF3C7);
  static const amberText = Color(0xFFB45309);

  static const red = Color(0xFFEF4444);
  static const redBg = Color(0xFFFEE2E2);
  static const redText = Color(0xFFB91C1C);

  static const blue = Color(0xFF2563EB);
  static const blueBg = Color(0xFFDBEAFE);
  static const purple = Color(0xFF7C3AED);
  static const purpleBg = Color(0xFFEDE9FE);
}

abstract class AppRadius {
  static const card = 16.0;
  static const tile = 14.0;
  static const chip = 12.0;
}

ThemeData buildAppTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.background,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.navy,
      surface: AppColors.card,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.background,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      foregroundColor: AppColors.ink,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      hintStyle: const TextStyle(color: AppColors.faint, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.chip),
        borderSide: const BorderSide(color: AppColors.hairline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.chip),
        borderSide: const BorderSide(color: AppColors.hairline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.chip),
        borderSide: const BorderSide(color: AppColors.navy, width: 1.4),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    dividerTheme: const DividerThemeData(
      color: AppColors.hairline,
      thickness: 1,
      space: 1,
    ),
  );
}
