import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth/auth_controller.dart';
import '../core/offline/sync_providers.dart';
import '../core/routing/router.dart';
import '../core/theme/app_theme.dart';

class SaecProgressApp extends ConsumerStatefulWidget {
  const SaecProgressApp({super.key});

  @override
  ConsumerState<SaecProgressApp> createState() => _SaecProgressAppState();
}

class _SaecProgressAppState extends ConsumerState<SaecProgressApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // ERP edits made while the app was parked must be visible on
    // return — drop every read snapshot and drain queued writes.
    refreshAllReads(ref);
    ref.read(syncServiceProvider).syncNow();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final auth = ref.watch(authControllerProvider);
    // Keep the queue orchestrator alive for the app lifetime — it
    // drains pending ops on sign-in and on connectivity regain.
    ref.watch(syncOrchestratorProvider);

    // While the stored session is being restored, show a minimal splash —
    // the router's redirect decides where to go once auth resolves.
    return MaterialApp.router(
      title: 'SAEC Progress',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      routerConfig: router,
      builder: (context, child) {
        if (auth is AuthUnknown) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return child ?? const SizedBox.shrink();
      },
    );
  }
}
