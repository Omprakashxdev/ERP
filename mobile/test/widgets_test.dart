import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:saec_progress/core/widgets/app_widgets.dart';
import 'package:saec_progress/core/models/models.dart';

void main() {
  testWidgets('StatusChip renders label', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: StatusChip(kind: StatusKind.completed, label: 'Completed'),
      ),
    ));
    expect(find.text('Completed'), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
  });

  testWidgets('AppProgressBar shows empty track when percent is null',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: AppProgressBar(percent: null)),
    ));
    expect(find.byType(AppProgressBar), findsOneWidget);
  });

  testWidgets('SegmentedStatusBar legend shows counts', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SegmentedStatusBar(slices: [
          StatusSlice(label: 'Completed', count: 4, color: Colors.green),
          StatusSlice(label: 'Remaining', count: 6, color: Colors.grey),
        ]),
      ),
    ));
    expect(find.text('40% (4)'), findsOneWidget);
    expect(find.text('60% (6)'), findsOneWidget);
  });

  test('SiteProgress parses API contract', () {
    final p = SiteProgress.fromJson(const {
      'totalActivities': 10,
      'completedActivities': 4,
      'configuredRooms': 2,
      'unconfiguredRooms': 1,
      'percent': 40.0,
    });
    expect(p.percent, 40.0);
    expect(p.totalRooms, 3);
    expect(SiteProgress.fromJson(null).percent, isNull);
  });

  test('AssignedSite parses list-item contract', () {
    final s = AssignedSite.fromJson(const {
      'id': 's1',
      'siteCode': 'SR-01',
      'siteName': 'Sunrise Residency',
      'status': 'ACTIVE',
      'city': 'Ahmedabad',
      'state': 'Gujarat',
      'coverImagePath': null,
      'canUpdate': true,
      'progress': {
        'totalActivities': 10,
        'completedActivities': 6,
        'configuredRooms': 2,
        'unconfiguredRooms': 0,
        'percent': 60.0,
      },
    });
    expect(s.status, SiteStatus.active);
    expect(s.locationLabel, 'Ahmedabad, Gujarat');
    expect(s.canUpdate, isTrue);
  });
}
