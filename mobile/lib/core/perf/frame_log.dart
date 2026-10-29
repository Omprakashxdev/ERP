import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

/// Opt-in frame-timing probe — enabled only via
/// `--dart-define=PERF_TRACE=true`. Emits one rolling summary line to
/// logcat every ~5 s (`PERF ...`) so UX changes can be compared on the
/// same device with the same scripted actions. Inert in normal builds.
const bool kPerfTrace = bool.fromEnvironment('PERF_TRACE');

class FrameLog {
  FrameLog._();

  static final _build = <int>[];
  static final _raster = <int>[];
  static final _total = <int>[];
  static Timer? _flush;

  static void install() {
    if (!kPerfTrace) return;
    SchedulerBinding.instance.addTimingsCallback((timings) {
      for (final t in timings) {
        _build.add(t.buildDuration.inMicroseconds);
        _raster.add(t.rasterDuration.inMicroseconds);
        _total.add(t.totalSpan.inMicroseconds);
      }
      _flush ??= Timer(const Duration(seconds: 5), _report);
    });
  }

  static double _avg(List<int> v) =>
      v.isEmpty ? 0 : v.reduce((a, b) => a + b) / v.length / 1000;

  static double _p95(List<int> v) {
    if (v.isEmpty) return 0;
    final s = [...v]..sort();
    return s[(s.length * 0.95).floor().clamp(0, s.length - 1)] / 1000;
  }

  static void _report() {
    _flush = null;
    if (_total.isEmpty) return;
    final n = _total.length;
    var jank = 0;
    for (var i = 0; i < n; i++) {
      if (_build[i] > 16700 || _raster[i] > 16700) jank++;
    }
    debugPrint('PERF n=$n jank=$jank '
        'jank_pct=${(100 * jank / n).toStringAsFixed(0)}% '
        'build_avg=${_avg(_build).toStringAsFixed(1)} '
        'build_p95=${_p95(_build).toStringAsFixed(1)} '
        'raster_avg=${_avg(_raster).toStringAsFixed(1)} '
        'raster_p95=${_p95(_raster).toStringAsFixed(1)}');
    _build.clear();
    _raster.clear();
    _total.clear();
  }
}
