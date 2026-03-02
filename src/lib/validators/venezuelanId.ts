const FINAL_REGEX = /^[VEJ]\d{6,10}$/;

export function normalizeVenezuelanId(input: string): string | null {
  if (!input) return null;

  const text = input.toUpperCase();
  const patterns = [
    /([VEJ])\s*-?\s*(\d{1,2}(?:[\s.,]*\d{3}){1,3})/g,
    /([VEJ])\s*-?\s*(\d{6,10})/g
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);

    while (match) {
      const letter = match[1];
      const digits = match[2].replace(/[.,\s]/g, '');
      const canonical = `${letter}${digits}`;

      if (isValidVenezuelanId(canonical)) {
        return canonical;
      }

      match = pattern.exec(text);
    }
  }

  return null;
}

export function isValidVenezuelanId(canonical: string): boolean {
  return FINAL_REGEX.test(canonical);
}

export function formatVenezuelanId(canonical: string): string {
  return `${canonical.slice(0, 1)}-${canonical.slice(1)}`;
}
