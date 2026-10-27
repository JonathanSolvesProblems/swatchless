/** Stores write some shades in capitals ("ESPRESSO MIX"); a tag reads them the way a stylist says them. Codes like 1B stay. */
export function shadeName(shade: string): string {
  return /[A-Z]{3}/.test(shade) && shade === shade.toUpperCase() ? shade.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : shade;
}
