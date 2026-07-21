export type LayoutTool = 'select' | 'pan';

export type LayoutAdornmentId = 'north-arrow' | 'scale-bar';

export type LayoutPaperId = 'custom-145x100' | 'a4-portrait' | 'a4-landscape' | 'a3-portrait' | 'a3-landscape';

export type LayoutPaperPreset = {
  id: LayoutPaperId;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm: number;
};

export const layoutPaperPresets: LayoutPaperPreset[] = [
  { id: 'custom-145x100', label: '145 x 100 mm', shortLabel: '145x100', widthMm: 145, heightMm: 100 },
  { id: 'a4-portrait', label: 'A4 纵向', shortLabel: 'A4 纵', widthMm: 210, heightMm: 297 },
  { id: 'a4-landscape', label: 'A4 横向', shortLabel: 'A4 横', widthMm: 297, heightMm: 210 },
  { id: 'a3-portrait', label: 'A3 纵向', shortLabel: 'A3 纵', widthMm: 297, heightMm: 420 },
  { id: 'a3-landscape', label: 'A3 横向', shortLabel: 'A3 横', widthMm: 420, heightMm: 297 },
];

export function getLayoutPaperPreset(paperId: LayoutPaperId) {
  return layoutPaperPresets.find((paper) => paper.id === paperId) ?? layoutPaperPresets[0];
}
