/** Returns YYYY-MM-DD for the current Egyptian business day, including Cairo DST. */
export const getCairoDateKey = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  ) as Record<string, string>;

  return `${values.year}-${values.month}-${values.day}`;
};
