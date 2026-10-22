/** 将时间点投影到显式指定的业务时区，不使用浏览器或服务器默认时区。 */
function zonedParts(epochMs: number, timeZone: string) {
  if (
    !Number.isFinite(epochMs) ||
    !Number.isFinite(new Date(epochMs).getTime())
  ) {
    throw new RangeError('Expected a valid Unix timestamp in milliseconds');
  }
  if (!timeZone || timeZone.trim() !== timeZone) {
    throw new RangeError('An explicit business time zone is required');
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    era: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  if (get('era') !== 'AD' || Number(get('year')) > 9999) {
    throw new RangeError('Expected a calendar year between 0001 and 9999');
  }
  return {
    date: `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/** TIMESTAMP → date input；空值由表单显式处理，不转换成今天。 */
export function formatDateInput(epochMs: number, timeZone: string): string {
  return zonedParts(epochMs, timeZone).date;
}

/** 时间点 → 指定时区的无偏移文本；写入方必须使用同一时区解析。 */
export function formatBaseDateTime(epochMs: number, timeZone: string): string {
  const { date, time } = zonedParts(epochMs, timeZone);
  return `${date} ${time}`;
}

/** 日历日期 → Base 日期字段文本；不经 Date 解析或时区偏移。 */
export function dateInputToBaseDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Expected a calendar date: YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new RangeError('Invalid calendar date');
  }
  return `${value} 00:00:00`;
}
