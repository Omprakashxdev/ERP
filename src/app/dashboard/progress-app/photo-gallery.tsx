import { Camera } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Read-only progress photo gallery. Bytes stream through the
 * session-authenticated /api/progress-photos content route — storage
 * paths are never exposed to the client.
 */

export interface GalleryPhoto {
  id: string;
  targetType: "SITE" | "FLAT" | "ROOM" | "ACTIVITY";
  caption: string | null;
  mimeType: string;
  fileSize: number;
  uploadedAt: string | Date;
  originalFilename: string;
  uploadedBy: { name: string | null; email: string };
  roomActivity?: { activityNameSnapshot: string; status: string } | null;
  room?: { roomName: string } | null;
  flat?: { flatNumber: string } | null;
}

const TARGET_LABELS: Record<GalleryPhoto["targetType"], string> = {
  SITE: "Site",
  FLAT: "Flat",
  ROOM: "Room",
  ACTIVITY: "Activity",
};

function targetLabel(p: GalleryPhoto): string {
  switch (p.targetType) {
    case "ACTIVITY":
      return p.roomActivity?.activityNameSnapshot ?? "Activity";
    case "ROOM":
      return p.room?.roomName ?? "Room";
    case "FLAT":
      return p.flat?.flatNumber ? `Flat ${p.flat.flatNumber}` : "Flat";
    default:
      return "Site";
  }
}

export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <Camera className="h-4 w-4" />
          Progress photos
          <Badge
            variant="secondary"
            className="font-normal text-xs bg-zinc-100 text-zinc-600"
          >
            {photos.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {photos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 py-8 text-center text-xs text-zinc-500">
            No photos uploaded yet. Field staff add photos from the Android
            app.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <figure
                key={p.id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
              >
                { }
                <img
                  src={`/api/progress-photos/${p.id}/content`}
                  alt={p.caption ?? p.originalFilename}
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                />
                <figcaption className="space-y-1 p-2">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className="bg-zinc-100 text-[10px] font-normal text-zinc-600"
                    >
                      {TARGET_LABELS[p.targetType]}
                    </Badge>
                    <span className="truncate text-[11px] font-medium text-zinc-800">
                      {targetLabel(p)}
                    </span>
                  </div>
                  {p.caption && (
                    <p className="truncate text-[11px] text-zinc-600">
                      {p.caption}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-400">
                    {p.uploadedBy.name ?? p.uploadedBy.email} ·{" "}
                    {new Date(p.uploadedAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
