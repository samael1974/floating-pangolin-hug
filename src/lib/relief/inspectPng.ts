export function inspectPng(_pngData: ArrayBuffer): { valid: boolean; message?: string } {
  // TODO: implement PNG inspection logic. For now treat PNG as valid.
  return { valid: true };
}

export function pngCompatibilityMessage(info: { valid: boolean; message?: string }): string {
  if (info.valid) return "";
  return info.message || "Invalid PNG file.";
}
