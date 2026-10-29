import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/perf/frame_log.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  FrameLog.install(); // no-op unless --dart-define=PERF_TRACE=true
  runApp(const ProviderScope(child: SaecProgressApp()));
}
