import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';
import '../../core/offline/offline_state.dart';

/// Every data provider watches auth state: signing out or switching
/// accounts automatically recomputes to an empty surface instead of
/// showing the previous session's cached data.
bool _signedIn(Ref ref) => ref.watch(authControllerProvider) is AuthSignedIn;

List<T> _items<T>(
  dynamic data,
  T Function(Map<String, dynamic>) parse,
) {
  final items = (data['items'] as List?) ?? const [];
  return items.map((e) => parse(e as Map<String, dynamic>)).toList();
}

/// Cache keys — one entry per endpoint response, namespaced by user
/// inside the store itself.
String wingFloorsKey(String wingId) => 'wing:$wingId:floors';
String floorFlatsKey(String floorId) => 'floor:$floorId:flats';
String flatRoomsKey(String flatId) => 'flat:$flatId:rooms';
String roomDetailKey(String roomId) => 'room:$roomId:activities';

/// GET /wings/:wingId/floors — live first, cached snapshot offline.
final wingFloorsProvider = FutureProvider.autoDispose
    .family<List<HierarchyFloor>, String>((ref, wingId) async {
  if (!_signedIn(ref)) return const [];
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: wingFloorsKey(wingId),
    fetch: () => dio.get('/wings/$wingId/floors').then((r) => r.data),
    parse: (data) => _items(data, HierarchyFloor.fromJson),
  );
});

/// GET /floors/:floorId/flats
final floorFlatsProvider = FutureProvider.autoDispose
    .family<List<HierarchyFlat>, String>((ref, floorId) async {
  if (!_signedIn(ref)) return const [];
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: floorFlatsKey(floorId),
    fetch: () => dio.get('/floors/$floorId/flats').then((r) => r.data),
    parse: (data) => _items(data, HierarchyFlat.fromJson),
  );
});

/// GET /flats/:flatId/rooms — rooms + site-update permission scope.
class FlatRoomsBundle {
  const FlatRoomsBundle({required this.rooms, required this.canUpdate});
  final List<HierarchyRoom> rooms;
  final bool canUpdate;
}

final flatRoomsProvider = FutureProvider.autoDispose
    .family<FlatRoomsBundle, String>((ref, flatId) async {
  if (!_signedIn(ref)) {
    return const FlatRoomsBundle(rooms: [], canUpdate: false);
  }
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: flatRoomsKey(flatId),
    fetch: () => dio.get('/flats/$flatId/rooms').then((r) => r.data),
    parse: (data) => FlatRoomsBundle(
      rooms: _items(data, HierarchyRoom.fromJson),
      canUpdate: (data['permissions']
              as Map<String, dynamic>?)?['canUpdate'] as bool? ??
          false,
    ),
  );
});

/// GET /rooms/:roomId/activities — active checklist snapshot + statuses.
final roomDetailProvider = FutureProvider.autoDispose
    .family<RoomDetail, String>((ref, roomId) async {
  if (!_signedIn(ref)) {
    return const RoomDetail(
      id: '',
      roomName: '',
      roomType: null,
      isActive: false,
      checklistName: null,
      checklistVersion: null,
      progress: SiteProgress.empty,
      activities: [],
    );
  }
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: roomDetailKey(roomId),
    fetch: () =>
        dio.get('/rooms/$roomId/activities').then((r) => r.data),
    parse: (data) {
      final room = data['room'] as Map<String, dynamic>;
      final checklist = data['checklist'] as Map<String, dynamic>?;
      final acts = (data['activities'] as List?) ?? const [];
      return RoomDetail(
        id: room['id'] as String,
        roomName: room['roomName'] as String? ?? '',
        roomType: room['roomType'] as String?,
        isActive: room['isActive'] as bool? ?? true,
        checklistName: checklist?['templateName'] as String?,
        checklistVersion:
            (checklist?['snapshotVersion'] as num?)?.toInt(),
        progress:
            SiteProgress.fromJson(data['progress'] as Map<String, dynamic>?),
        activities: acts
            .map((e) => RoomActivity.fromJson(e as Map<String, dynamic>))
            .toList(),
        canUpdate:
            (data['permissions'] as Map<String, dynamic>?)?['canUpdate']
                    as bool? ??
                false,
      );
    },
  );
});
