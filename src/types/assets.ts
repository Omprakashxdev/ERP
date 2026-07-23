import { Asset } from "@prisma/client";

export type AssetListRow = Asset;

export type AssetWithComputed = AssetListRow & {
  remainingQuantity: number;
  isWarrantyDocumentMissing: boolean;
};
