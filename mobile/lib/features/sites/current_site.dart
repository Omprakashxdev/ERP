import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The "current site" selected on the dashboard — reset by the auth
/// controller on login/logout so a previous account's selection can't
/// leak into a new session.
final currentSiteIdProvider = StateProvider<String?>((ref) => null);
