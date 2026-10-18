/** Workbook 'Consul Bill' formula: SGST = CGST = Gross x 9%. */
export function calcNinePercentGst(grossAmount: number): string {
  return (Math.round(grossAmount * 9) / 100).toFixed(2);
}
