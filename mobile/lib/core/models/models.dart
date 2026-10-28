// Plain models matching the Brick 4 mobile API contracts.
// Every field maps to a real ERP column — no client-side invention.

class MobileUser {
  const MobileUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
  });

  final String id;
  final String email;
  final String? name;
  final String role;

  String get displayName =>
      (name != null && name!.trim().isNotEmpty) ? name! : email.split('@').first;

  String get initials {
    final parts = displayName.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
    }
    return displayName.substring(0, 1).toUpperCase();
  }

  factory MobileUser.fromJson(Map<String, dynamic> j) => MobileUser(
        id: j['id'] as String,
        email: j['email'] as String,
        name: j['name'] as String?,
        role: j['role'] as String,
      );

  Map<String, dynamic> toJson() =>
      {'id': id, 'email': email, 'name': name, 'role': role};
}

/// Authoritative per-status activity counts (server-provided; absent on
/// pre-5C backends — callers must not synthesize them).
class StatusCounts {
  const StatusCounts({
    required this.notStarted,
    required this.inProgress,
    required this.onHold,
    required this.completed,
  });

  final int notStarted;
  final int inProgress;
  final int onHold;
  final int completed;

  int get total => notStarted + inProgress + onHold + completed;

  factory StatusCounts.fromJson(Map<String, dynamic>? j) => StatusCounts(
        notStarted: (j?['notStarted'] as num?)?.toInt() ?? 0,
        inProgress: (j?['inProgress'] as num?)?.toInt() ?? 0,
        onHold: (j?['onHold'] as num?)?.toInt() ?? 0,
        completed: (j?['completed'] as num?)?.toInt() ?? 0,
      );
}

/// Server-authoritative rollup: {totalActivities, completedActivities,
/// configuredRooms, unconfiguredRooms, percent|null, statusCounts?}
class SiteProgress {
  const SiteProgress({
    required this.totalActivities,
    required this.completedActivities,
    required this.configuredRooms,
    required this.unconfiguredRooms,
    required this.percent,
    this.statusCounts,
  });

  final int totalActivities;
  final int completedActivities;
  final int configuredRooms;
  final int unconfiguredRooms;
  final double? percent;
  final StatusCounts? statusCounts;

  bool get configured => percent != null;
  int get totalRooms => configuredRooms + unconfiguredRooms;

  static const empty = SiteProgress(
    totalActivities: 0,
    completedActivities: 0,
    configuredRooms: 0,
    unconfiguredRooms: 0,
    percent: null,
  );

  factory SiteProgress.fromJson(Map<String, dynamic>? j) {
    if (j == null) return empty;
    return SiteProgress(
      totalActivities: (j['totalActivities'] as num?)?.toInt() ?? 0,
      completedActivities: (j['completedActivities'] as num?)?.toInt() ?? 0,
      configuredRooms: (j['configuredRooms'] as num?)?.toInt() ?? 0,
      unconfiguredRooms: (j['unconfiguredRooms'] as num?)?.toInt() ?? 0,
      percent: (j['percent'] as num?)?.toDouble(),
      statusCounts: j['statusCounts'] == null
          ? null
          : StatusCounts.fromJson(j['statusCounts'] as Map<String, dynamic>),
    );
  }
}

enum SiteStatus { planned, active, onHold, completed, archived, unknown }

SiteStatus siteStatusFrom(String? raw) => switch (raw) {
      'PLANNED' => SiteStatus.planned,
      'ACTIVE' => SiteStatus.active,
      'ON_HOLD' => SiteStatus.onHold,
      'COMPLETED' => SiteStatus.completed,
      'ARCHIVED' => SiteStatus.archived,
      _ => SiteStatus.unknown,
    };

String siteStatusLabel(SiteStatus s) => switch (s) {
      SiteStatus.planned => 'Planned',
      SiteStatus.active => 'Ongoing',
      SiteStatus.onHold => 'On Hold',
      SiteStatus.completed => 'Completed',
      SiteStatus.archived => 'Archived',
      SiteStatus.unknown => '—',
    };

class AssignedSite {
  const AssignedSite({
    required this.id,
    required this.siteCode,
    required this.siteName,
    required this.status,
    required this.city,
    required this.state,
    required this.coverImagePath,
    required this.canUpdate,
    required this.progress,
  });

  final String id;
  final String siteCode;
  final String siteName;
  final SiteStatus status;
  final String? city;
  final String? state;
  final String? coverImagePath;
  final bool canUpdate;
  final SiteProgress progress;

  String get locationLabel =>
      [city, state].where((p) => p != null && p.isNotEmpty).join(', ');

  factory AssignedSite.fromJson(Map<String, dynamic> j) => AssignedSite(
        id: j['id'] as String,
        siteCode: j['siteCode'] as String? ?? '',
        siteName: j['siteName'] as String? ?? '',
        status: siteStatusFrom(j['status'] as String?),
        city: j['city'] as String?,
        state: j['state'] as String?,
        coverImagePath: j['coverImagePath'] as String?,
        canUpdate: j['canUpdate'] as bool? ?? false,
        progress: SiteProgress.fromJson(j['progress'] as Map<String, dynamic>?),
      );
}

class SiteDetail {
  const SiteDetail({
    required this.id,
    required this.siteCode,
    required this.siteName,
    required this.status,
    this.description,
    this.address,
    this.city,
    this.state,
    this.coverImagePath,
    required this.wingsCount,
    required this.progress,
  });

  final String id;
  final String siteCode;
  final String siteName;
  final SiteStatus status;
  final String? description;
  final String? address;
  final String? city;
  final String? state;
  final String? coverImagePath;
  final int wingsCount;
  final SiteProgress progress;

  factory SiteDetail.fromJson(Map<String, dynamic> j, SiteProgress p) =>
      SiteDetail(
        id: j['id'] as String,
        siteCode: j['siteCode'] as String? ?? '',
        siteName: j['siteName'] as String? ?? '',
        status: siteStatusFrom(j['status'] as String?),
        description: j['description'] as String?,
        address: j['address'] as String?,
        city: j['city'] as String?,
        state: j['state'] as String?,
        coverImagePath: j['coverImagePath'] as String?,
        wingsCount: (j['wingsCount'] as num?)?.toInt() ?? 0,
        progress: p,
      );
}

class Wing {
  const Wing({
    required this.id,
    required this.code,
    required this.name,
    required this.floorsCount,
    required this.isActive,
    required this.progress,
  });

  final String id;
  final String code;
  final String name;
  final int floorsCount;
  final bool isActive;
  final SiteProgress? progress;

  factory Wing.fromJson(Map<String, dynamic> j) => Wing(
        id: j['id'] as String,
        code: j['code'] as String? ?? '',
        name: j['name'] as String? ?? '',
        floorsCount: (j['floorsCount'] as num?)?.toInt() ?? 0,
        isActive: j['isActive'] as bool? ?? true,
        progress: j['progress'] == null
            ? null
            : SiteProgress.fromJson(j['progress'] as Map<String, dynamic>),
      );
}

/// GET /wings/:wingId/floors item:
/// {id, floorIdentifier, displayName, displayOrder, isActive, flatsCount, progress}
class HierarchyFloor {
  const HierarchyFloor({
    required this.id,
    required this.floorIdentifier,
    required this.displayName,
    required this.isActive,
    required this.flatsCount,
    required this.progress,
  });

  final String id;
  final String floorIdentifier;
  final String? displayName;
  final bool isActive;
  final int flatsCount;
  final SiteProgress? progress;

  String get label =>
      (displayName != null && displayName!.isNotEmpty)
          ? displayName!
          : 'Floor $floorIdentifier';

  factory HierarchyFloor.fromJson(Map<String, dynamic> j) => HierarchyFloor(
        id: j['id'] as String,
        floorIdentifier: j['floorIdentifier'] as String? ?? '',
        displayName: j['displayName'] as String?,
        isActive: j['isActive'] as bool? ?? true,
        flatsCount: (j['flatsCount'] as num?)?.toInt() ?? 0,
        progress: j['progress'] == null
            ? null
            : SiteProgress.fromJson(j['progress'] as Map<String, dynamic>),
      );
}

/// GET /floors/:floorId/flats item:
/// {id, flatNumber, flatType, displayOrder, isActive, roomsCount, progress}
class HierarchyFlat {
  const HierarchyFlat({
    required this.id,
    required this.flatNumber,
    required this.flatType,
    required this.isActive,
    required this.roomsCount,
    required this.progress,
  });

  final String id;
  final String flatNumber;
  final String? flatType;
  final bool isActive;
  final int roomsCount;
  final SiteProgress? progress;

  factory HierarchyFlat.fromJson(Map<String, dynamic> j) => HierarchyFlat(
        id: j['id'] as String,
        flatNumber: j['flatNumber'] as String? ?? '',
        flatType: j['flatType'] as String?,
        isActive: j['isActive'] as bool? ?? true,
        roomsCount: (j['roomsCount'] as num?)?.toInt() ?? 0,
        progress: j['progress'] == null
            ? null
            : SiteProgress.fromJson(j['progress'] as Map<String, dynamic>),
      );
}

/// GET /flats/:flatId/rooms item:
/// {id, roomName, roomType, displayOrder, isActive, progress}
class HierarchyRoom {
  const HierarchyRoom({
    required this.id,
    required this.roomName,
    required this.roomType,
    required this.isActive,
    required this.progress,
  });

  final String id;
  final String roomName;
  final String? roomType;
  final bool isActive;
  final SiteProgress? progress;

  factory HierarchyRoom.fromJson(Map<String, dynamic> j) => HierarchyRoom(
        id: j['id'] as String,
        roomName: j['roomName'] as String? ?? '',
        roomType: j['roomType'] as String?,
        isActive: j['isActive'] as bool? ?? true,
        progress: j['progress'] == null
            ? null
            : SiteProgress.fromJson(j['progress'] as Map<String, dynamic>),
      );
}

/// ProgressActivityStatus — read-only in this brick.
enum ActivityStatus { notStarted, inProgress, onHold, completed, unknown }

ActivityStatus activityStatusFrom(String? raw) => switch (raw) {
      'NOT_STARTED' => ActivityStatus.notStarted,
      'IN_PROGRESS' => ActivityStatus.inProgress,
      'ON_HOLD' => ActivityStatus.onHold,
      'COMPLETED' => ActivityStatus.completed,
      _ => ActivityStatus.unknown,
    };

/// Wire value for PATCH /activities/:id/status — never send `unknown`.
String? activityStatusToApi(ActivityStatus s) => switch (s) {
      ActivityStatus.notStarted => 'NOT_STARTED',
      ActivityStatus.inProgress => 'IN_PROGRESS',
      ActivityStatus.onHold => 'ON_HOLD',
      ActivityStatus.completed => 'COMPLETED',
      ActivityStatus.unknown => null,
    };

String activityStatusLabel(ActivityStatus s) => switch (s) {
      ActivityStatus.notStarted => 'Yet to start',
      ActivityStatus.inProgress => 'In Progress',
      ActivityStatus.onHold => 'On Hold',
      ActivityStatus.completed => 'Completed',
      ActivityStatus.unknown => '—',
    };

/// GET /rooms/:roomId/activities activity item.
class RoomActivity {
  const RoomActivity({
    required this.id,
    required this.name,
    required this.description,
    required this.status,
    required this.revision,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String? description;
  final ActivityStatus status;
  final int revision;
  final DateTime? updatedAt;

  factory RoomActivity.fromJson(Map<String, dynamic> j) => RoomActivity(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        description: j['description'] as String?,
        status: activityStatusFrom(j['status'] as String?),
        revision: (j['revision'] as num?)?.toInt() ?? 0,
        updatedAt: j['updatedAt'] == null
            ? null
            : DateTime.tryParse(j['updatedAt'] as String),
      );
}

/// Room detail bundle from GET /rooms/:roomId/activities.
class RoomDetail {
  const RoomDetail({
    required this.id,
    required this.roomName,
    required this.roomType,
    required this.isActive,
    required this.checklistName,
    required this.checklistVersion,
    required this.progress,
    required this.activities,
    this.canUpdate = false,
  });

  final String id;
  final String roomName;
  final String? roomType;
  final bool isActive;
  final String? checklistName;
  final int? checklistVersion;
  final SiteProgress progress;
  final List<RoomActivity> activities;
  final bool canUpdate;

  bool get hasChecklist => checklistName != null;
}

/// GET /activities/:id/history entry — immutable transition record.
class ActivityHistoryEntry {
  const ActivityHistoryEntry({
    required this.id,
    required this.previousStatus,
    required this.newStatus,
    required this.note,
    required this.createdAt,
    required this.changedBy,
  });

  final String id;
  final ActivityStatus previousStatus;
  final ActivityStatus newStatus;
  final String? note;
  final DateTime? createdAt;
  final String changedBy;

  factory ActivityHistoryEntry.fromJson(Map<String, dynamic> j) =>
      ActivityHistoryEntry(
        id: j['id'] as String? ?? '',
        previousStatus: activityStatusFrom(j['previousStatus'] as String?),
        newStatus: activityStatusFrom(j['newStatus'] as String?),
        note: j['note'] as String?,
        createdAt: j['createdAt'] == null
            ? null
            : DateTime.tryParse(j['createdAt'] as String),
        changedBy: j['changedBy'] as String? ?? '',
      );
}

/// ProgressPhotoTargetType — SITE | FLAT | ROOM | ACTIVITY.
enum PhotoTarget { site, flat, room, activity }

String photoTargetToApi(PhotoTarget t) => switch (t) {
      PhotoTarget.site => 'SITE',
      PhotoTarget.flat => 'FLAT',
      PhotoTarget.room => 'ROOM',
      PhotoTarget.activity => 'ACTIVITY',
    };

PhotoTarget photoTargetFrom(String raw) => switch (raw) {
      'FLAT' => PhotoTarget.flat,
      'ROOM' => PhotoTarget.room,
      'ACTIVITY' => PhotoTarget.activity,
      _ => PhotoTarget.site,
    };

/// GET /photos item — metadata only; bytes come from `contentUrl` with auth.
class ProgressPhoto {
  const ProgressPhoto({
    required this.id,
    required this.targetType,
    required this.mimeType,
    required this.fileSize,
    required this.caption,
    required this.uploadedAt,
    required this.uploadedBy,
    required this.contentUrl,
  });

  final String id;
  final String targetType;
  final String mimeType;
  final int fileSize;
  final String? caption;
  final DateTime? uploadedAt;
  final String? uploadedBy;
  final String contentUrl;

  factory ProgressPhoto.fromJson(Map<String, dynamic> j) => ProgressPhoto(
        id: j['id'] as String? ?? '',
        targetType: j['targetType'] as String? ?? '',
        mimeType: j['mimeType'] as String? ?? 'image/jpeg',
        fileSize: (j['fileSize'] as num?)?.toInt() ?? 0,
        caption: j['caption'] as String?,
        uploadedAt: j['uploadedAt'] == null
            ? null
            : DateTime.tryParse(j['uploadedAt'] as String),
        uploadedBy: j['uploadedBy'] as String?,
        contentUrl: j['contentUrl'] as String? ?? '',
      );
}

/// Parent-context passed via go_router `extra` so detail pages can render
/// breadcrumbs without extra API calls. All fields optional — deep links
/// simply render fewer crumbs.
class HierarchyContext {
  const HierarchyContext({
    this.siteId,
    this.siteName,
    this.wingName,
    this.floorName,
    this.flatName,
    this.roomName,
    this.canUpdate = false,
  });

  final String? siteId;
  final String? siteName;
  final String? wingName;
  final String? floorName;
  final String? flatName;
  final String? roomName;
  final bool canUpdate;

  List<String> get crumbs => [
        if (siteName != null && siteName!.isNotEmpty) siteName!,
        if (wingName != null && wingName!.isNotEmpty) wingName!,
        if (floorName != null && floorName!.isNotEmpty) floorName!,
        if (flatName != null && flatName!.isNotEmpty) flatName!,
        if (roomName != null && roomName!.isNotEmpty) roomName!,
      ];

  HierarchyContext withCanUpdate(bool v) => HierarchyContext(
      siteId: siteId,
      siteName: siteName,
      wingName: wingName,
      floorName: floorName,
      flatName: flatName,
      roomName: roomName,
      canUpdate: v);

  HierarchyContext withWing(String name) => HierarchyContext(
      siteId: siteId,
      siteName: siteName,
      wingName: name,
      canUpdate: canUpdate);

  HierarchyContext withFloor(String name) => HierarchyContext(
      siteId: siteId,
      siteName: siteName,
      wingName: wingName,
      floorName: name,
      canUpdate: canUpdate);

  HierarchyContext withFlat(String name) => HierarchyContext(
      siteId: siteId,
      siteName: siteName,
      wingName: wingName,
      floorName: floorName,
      flatName: name,
      canUpdate: canUpdate);

  HierarchyContext withRoom(String name) => HierarchyContext(
      siteId: siteId,
      siteName: siteName,
      wingName: wingName,
      floorName: floorName,
      flatName: flatName,
      roomName: name,
      canUpdate: canUpdate);
}
