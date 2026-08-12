import { Asset, AssetMovement, Staff } from "@prisma/client";

export type AssetListRow = Asset & {
  currentHolder?: Staff | null;
};

export type AssetWithComputed = AssetListRow & {
  remainingQuantity: number;
  isWarrantyDocumentMissing: boolean;
  movements?: AssetMovement[];
};
