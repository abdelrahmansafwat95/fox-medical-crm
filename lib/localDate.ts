// Calendar dates in the browser's own time zone. toISOString() gives the UTC day: in Cairo
// that is yesterday until 2-3 a.m., and a date built at local midnight (a month's last day
// from new Date(y, m, 0)) comes out one day early.
export const localIso = (d: Date | number = new Date()) => new Date(d).toLocaleDateString("en-CA");
export const localInDays = (n: number) => localIso(Date.now() + n * 864e5);
/** Last day of the month of a YYYY-MM or YYYY-MM-DD string. */
export const monthEndIso = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
