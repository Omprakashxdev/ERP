import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/activities/activity_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/hierarchy/hierarchy_screens.dart';
import '../../features/login/login_screen.dart';
import '../../features/more/more_screen.dart';
import '../../features/reports/reports_screen.dart';
import '../../features/sites/site_detail_screen.dart';
import '../../features/sites/sites_screen.dart';
import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../motion/app_motion.dart';

abstract class Routes {
  static const login = '/login';
  static const home = '/home';
  static const sites = '/sites';
  static const reports = '/reports';
  static const more = '/more';

  // Reserved hierarchy routes — screens land in the next brick.
  static String site(String id) => '/sites/$id';
  static String wings(String id) => '/sites/$id/wings';
  static String floors(String wingId) => '/wings/$wingId/floors';
  static String flats(String floorId) => '/floors/$floorId/flats';
  static String rooms(String flatId) => '/flats/$flatId/rooms';
  static String activities(String roomId) => '/rooms/$roomId/activities';
  static String activity(String activityId) => '/activities/$activityId';
}

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: Routes.home,
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == Routes.login;
      switch (auth) {
        case AuthUnknown():
          return null; // splash visible below via builder
        case AuthSignedOut():
          return loggingIn ? null : Routes.login;
        case AuthSignedIn():
          return loggingIn ? Routes.home : null;
      }
    },
    routes: [
      GoRoute(
        path: Routes.login,
        builder: (_, __) => const LoginScreen(),
      ),
      StatefulShellRoute(
        builder: (_, __, shell) => AppShell(shell: shell),
        // Same always-mounted branch Navigators as indexedStack, plus a
        // fade-through between tabs instead of a hard cut.
        navigatorContainerBuilder: (context, shell, children) =>
            BranchFadeStack(
          currentIndex: shell.currentIndex,
          children: children,
        ),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: Routes.home, builder: (_, __) => const DashboardScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: Routes.sites, builder: (_, __) => const SitesScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
                path: Routes.reports,
                builder: (_, __) => const ReportsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: Routes.more, builder: (_, __) => const MoreScreen()),
          ]),
        ],
      ),
      // Hierarchy routes — live screens; breadcrumb context travels via
      // `extra` (HierarchyContext) so taps carry ancestor names. All use
      // the same slide+fade push (mirrored on back).
      GoRoute(
        path: '/sites/:siteId',
        pageBuilder: (_, s) => slideFadePage(
          state: s,
          child: SiteDetailScreen(siteId: s.pathParameters['siteId']!),
        ),
      ),
      GoRoute(
        path: '/wings/:wingId/floors',
        pageBuilder: (_, s) => slideFadePage(
          state: s,
          child: FloorsScreen(
            wingId: s.pathParameters['wingId']!,
            context_: s.extra as HierarchyContext?,
          ),
        ),
      ),
      GoRoute(
        path: '/floors/:floorId/flats',
        pageBuilder: (_, s) => slideFadePage(
          state: s,
          child: FlatsScreen(
            floorId: s.pathParameters['floorId']!,
            context_: s.extra as HierarchyContext?,
          ),
        ),
      ),
      GoRoute(
        path: '/flats/:flatId/rooms',
        pageBuilder: (_, s) => slideFadePage(
          state: s,
          child: RoomsScreen(
            flatId: s.pathParameters['flatId']!,
            context_: s.extra as HierarchyContext?,
          ),
        ),
      ),
      GoRoute(
        path: '/rooms/:roomId/activities',
        pageBuilder: (_, s) => slideFadePage(
          state: s,
          child: RoomDetailScreen(
            roomId: s.pathParameters['roomId']!,
            context_: s.extra as HierarchyContext?,
          ),
        ),
      ),
      GoRoute(
        path: '/activities/:activityId',
        pageBuilder: (_, s) => slideFadePage(
          state: s,
          child: ActivityDetailScreen(args: s.extra as ActivityDetailArgs),
        ),
      ),
    ],
  );
});

/// Bottom-nav scaffold — Home / Sites / Reports / More (reference design).
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  static const _items = [
    (icon: Icons.home_outlined, activeIcon: Icons.home, label: 'Home'),
    (icon: Icons.apartment_outlined, activeIcon: Icons.apartment, label: 'Sites'),
    (icon: Icons.assignment_outlined, activeIcon: Icons.assignment, label: 'Reports'),
    (icon: Icons.more_horiz, activeIcon: Icons.more_horiz, label: 'More'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) =>
            shell.goBranch(i, initialLocation: i == shell.currentIndex),
        height: 68,
        destinations: [
          for (final item in _items)
            NavigationDestination(
              icon: Icon(item.icon),
              selectedIcon: Icon(item.activeIcon),
              label: item.label,
            ),
        ],
      ),
    );
  }
}
