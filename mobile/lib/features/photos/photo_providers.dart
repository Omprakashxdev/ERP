import 'dart:math';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http_parser/http_parser.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';

/// Generates a stable idempotency key — created once per intended
/// operation and reused across retries so server dedupe kicks in.
String newClientEventId() {
  final r = Random.secure();
  final ts = DateTime.now().microsecondsSinceEpoch.toRadixString(16);
  final rand =
      List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0'))
          .join();
  return '$ts-$rand';
}

/// Photo target key for family providers.
typedef PhotoRef = ({PhotoTarget target, String targetId});

bool _signedIn(Ref ref) => ref.watch(authControllerProvider) is AuthSignedIn;

/// GET /photos?targetType&targetId — metadata for one target.
final photosProvider =
    FutureProvider.autoDispose.family<List<ProgressPhoto>, PhotoRef>(
        (ref, key) async {
  if (!_signedIn(ref)) return const [];
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/photos', queryParameters: {
      'targetType': photoTargetToApi(key.target),
      'targetId': key.targetId,
    });
    final items = (res.data['items'] as List?) ?? const [];
    return items
        .map((e) => ProgressPhoto.fromJson(e as Map<String, dynamic>))
        .toList();
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  }
});

/// GET /photos/:id/content — authenticated bytes (never a public URL).
final photoBytesProvider =
    FutureProvider.autoDispose.family<Uint8List, String>((ref, photoId) async {
  if (!_signedIn(ref)) return Uint8List(0);
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get<List<int>>(
      '/photos/$photoId/content',
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(res.data ?? const []);
  } on DioException catch (e) {
    throw ApiException.fromDio(e);
  }
});

/// POST /photos — multipart upload.
///
/// The [clientEventId] is generated once per intended upload and reused on
/// every retry of that same upload — the server returns the winner
/// (`alreadyUploaded: true`) instead of creating a duplicate record.
class PhotoUploader {
  const PhotoUploader(this._dio);
  final Dio _dio;

  Future<({ProgressPhoto photo, bool alreadyUploaded})> upload({
    required PhotoTarget target,
    required String targetId,
    required String filePath,
    required String clientEventId,
    String? caption,
    String? fileName,
    String? mimeType,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        filePath,
        filename: fileName,
        contentType:
            mimeType == null ? null : MediaType.parse(mimeType),
      ),
      'targetType': photoTargetToApi(target),
      'targetId': targetId,
      'clientEventId': clientEventId,
      if (caption != null && caption.isNotEmpty) 'caption': caption,
    });
    try {
      final res = await _dio.post(
        '/photos',
        data: form,
        options: Options(
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
        onSendProgress: onProgress,
      );
      return (
        photo: ProgressPhoto.fromJson(
            res.data['photo'] as Map<String, dynamic>),
        alreadyUploaded: res.data['alreadyUploaded'] == true,
      );
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final photoUploaderProvider =
    Provider<PhotoUploader>((ref) => PhotoUploader(ref.watch(dioProvider)));
