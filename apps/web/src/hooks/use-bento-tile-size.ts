import { createContext, useContext } from "react";
import type { BentoSize } from "@/lib/bento-tile-layout";
import type { ColSpan, RowSpan } from "@/lib/dashboard-layout";

export type BentoTileSizeContextValue = {
  colSpan: ColSpan;
  rowSpan: RowSpan;
};

const defaultSize: BentoTileSizeContextValue = {
  colSpan: 4,
  rowSpan: 2,
};

const BentoTileSizeContext = createContext<BentoTileSizeContextValue>(defaultSize);

export const BentoTileSizeProvider = BentoTileSizeContext.Provider;

export const useBentoTileSize = (): BentoSize => {
  const { colSpan, rowSpan } = useContext(BentoTileSizeContext);
  return { col: colSpan, row: rowSpan };
};
