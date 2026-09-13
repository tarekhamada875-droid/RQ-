const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Returns YYYY-MM-DD for the current Egyptian business day, including Cairo DST. */
export const getCairoDateKey = (date: Date = new Date()): string => {
  return cairoDateFormatter.format(date);
};
