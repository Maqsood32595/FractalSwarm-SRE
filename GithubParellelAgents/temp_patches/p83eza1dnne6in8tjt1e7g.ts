const s = 1000;
const m = s * 60;
const h = m * 60;
const d = h * 24;
const w = d * 7;
const y = d * 365.25;
const mo = y / 12;

type Years = 'years' | 'year' | 'yrs' | 'yr' | 'y';
type Months = 'months' | 'month' | 'mo';
type Weeks = 'weeks' | 'week' | 'w';
type Days = 'days' | 'day' | 'd';
type Hours = 'hours' | 'hour' | 'hrs' | 'hr' | 'h';
type Minutes = 'minutes' | 'minute' | 'mins' | 'min' | 'm';
type Seconds = 'seconds' | 'second' | 'secs' | 'sec' | 's';
type Milliseconds = 'milliseconds' | 'millisecond' | 'msecs' | 'msec' | 'ms';
type Unit =
  | Years
  | Months
  | Weeks
  | Days
  | Hours
  | Minutes
  | Seconds
  | Milliseconds;

type UnitAnyCase = Capitalize<Unit> | Uppercase<Unit> | Unit;

export type StringValue =
  | `${number}`
  | `${number}${UnitAnyCase}`
  | `${number} ${UnitAnyCase}`;

export interface LocaleDefinition {
  shortUnits: {
    ms: string;
    s: string;
    m: string;
    h: string;
    d: string;
    w: string;
    mo: string;
    y: string;
  };
  longUnits: {
    millisecond: [string, string];
    second: [string, string];
    minute: [string, string];
    hour: [string, string];
    day: [string, string];
    week: [string, string];
    month: [string, string];
    year: [string, string];
  };
  isPlural?: (value: number) => boolean;
}

interface Options {
  /**
   * Set to `true` to use verbose formatting. Defaults to `false`.
   */
  long?: boolean;
  /**
   * Locale definition for i18n support.
   */
  locale?: LocaleDefinition;
}

/**
 * Parse or format the given value.
 *
 * @param value - The string or number to convert
 * @param options - Options for the conversion
 * @throws Error if `value` is not a non-empty string or a number
 */
export function ms(value: StringValue, options?: Options): number;
export function ms(value: number, options?: Options): string;
export function ms(
  value: StringValue | number,
  options?: Options,
): number | string {
  if (typeof value === 'string') {
    return parse(value);
  } else if (typeof value === 'number') {
    return format(value, options);
  }
  throw new Error(
    `Value provided to ms() must be a string or number. value=${JSON.stringify(value)}`,
  );
}

/**
 * Parse the given string and return milliseconds.
 *
 * @param str - A string to parse to milliseconds
 * @returns The parsed value in milliseconds, or `NaN` if the string can't be
 * parsed
 */
export function parse(str: string): number {
  if (typeof str !== 'string' || str.length === 0 || str.length > 100) {
    throw new Error(
      `Value provided to ms.parse() must be a string with length between 1 and 99. value=${JSON.stringify(str)}`,
    );
  }
  const match =
    /^(?<value>-?\d*\.?\d+) *(?<unit>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)?$/i.exec(
      str,
    );

  if (!match?.groups) {
    return NaN;
  }

  // Named capture groups need to be manually typed today.
  // https://github.com/microsoft/TypeScript/issues/32098
  const { value, unit = 'ms' } = match.groups as {
    value: string;
    unit: string | undefined;
  };

  const n = parseFloat(value);

  const matchUnit = unit.toLowerCase() as Lowercase<Unit>;

  /* istanbul ignore next - istanbul doesn't understand, but thankfully the TypeScript the exhaustiveness check in the default case keeps us type safe here */
  switch (matchUnit) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'months':
    case 'month':
    case 'mo':
      return n * mo;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      matchUnit satisfies never;
      throw new Error(
        `Unknown unit "${matchUnit}" provided to ms.parse(). value=${JSON.stringify(str)}`,
      );
  }
}

/**
 * Parse the given StringValue and return milliseconds.
 *
 * @param value - A typesafe StringValue to parse to milliseconds
 * @returns The parsed value in milliseconds, or `NaN` if the string can't be
 * parsed
 */
export function parseStrict(value: StringValue): number {
  return parse(value);
}

// Helper function to get units based on locale or fallback to English
function getUnits(locale?: LocaleDefinition) {
  const defaultShortUnits = { ms: 'ms', s: 's', m: 'm', h: 'h', d: 'd', w: 'w', mo: 'mo', y: 'y' };
  const defaultLongUnits = {
    millisecond: ['millisecond', 'milliseconds'],
    second: ['second', 'seconds'],
    minute: ['minute', 'minutes'],
    hour: ['hour', 'hours'],
    day: ['day', 'days'],
    week: ['week', 'weeks'],
    month: ['month', 'months'],
    year: ['year', 'years'],
  };
  return {
    short: locale?.shortUnits || defaultShortUnits,
    long: locale?.longUnits || defaultLongUnits,
    isPlural: locale?.isPlural || ((v: number) => Math.abs(v) !== 1),
  };
}

/**
 * Short format for `ms`.
 */
function fmtShort(ms: number, locale?: LocaleDefinition): StringValue {
  const msAbs = Math.abs(ms);
  const { short: shortUnits } = getUnits(locale);

  if (msAbs >= y) {
    return `${Math.round(ms / y)}${shortUnits.y}`;
  }
  if (msAbs >= mo) {
    return `${Math.round(ms / mo)}${shortUnits.mo}`;
  }
  if (msAbs >= w) {
    return `${Math.round(ms / w)}${shortUnits.w}`;
  }
  if (msAbs >= d) {
    return `${Math.round(ms / d)}${shortUnits.d}`;
  }
  if (msAbs >= h) {
    return `${Math.round(ms / h)}${shortUnits.h}`;
  }
  if (msAbs >= m) {
    return `${Math.round(ms / m)}${shortUnits.m}`;
  }
  if (msAbs >= s) {
    return `${Math.round(ms / s)}${shortUnits.s}`;
  }
  return `${ms}${shortUnits.ms}`;
}

/**
 * Long format for `ms`.
 */
function fmtLong(ms: number, locale?: LocaleDefinition): StringValue {
  const msAbs = Math.abs(ms);

  if (msAbs >= y) {
    return plural(Math.round(ms / y), 'year', locale);
  }
  if (msAbs >= mo) {
    return plural(Math.round(ms / mo), 'month', locale);
  }
  if (msAbs >= w) {
    return plural(Math.round(ms / w), 'week', locale);
  }
  if (msAbs >= d) {
    return plural(Math.round(ms / d), 'day', locale);
  }
  if (msAbs >= h) {
    return plural(Math.round(ms / h), 'hour', locale);
  }
  if (msAbs >= m) {
    return plural(Math.round(ms / m), 'minute', locale);
  }
  if (msAbs >= s) {
    return plural(Math.round(ms / s), 'second', locale);
  }
  return plural(ms, 'millisecond', locale);
}

/**
 * Format the given integer as a string.
 *
 * @param ms - milliseconds
 * @param options - Options for the conversion
 * @returns The formatted string
 */
export function format(ms: number, options?: Options): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new Error('Value provided to ms.format() must be of type number.');
  }

  return options?.long ? fmtLong(ms, options.locale) : fmtShort(ms, options.locale);
}

/**
 * Pluralization helper.
 */
function plural(
  value: number,
  unitName: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year',
  locale?: LocaleDefinition,
): StringValue {
  const { long: longUnits, isPlural } = getUnits(locale);
  const [singular, pluralForm] = longUnits[unitName];
  return `${value} ${isPlural(value) ? pluralForm : singular}` as StringValue;
}

// Built-in Locales

export const fr: LocaleDefinition = {
  shortUnits: { ms: 'ms', s: 's', m: 'min', h: 'h', d: 'j', w: 'sem', mo: 'mois', y: 'an' },
  longUnits: {
    millisecond: ['milliseconde', 'millisecondes'],
    second: ['seconde', 'secondes'],
    minute: ['minute', 'minutes'],
    hour: ['heure', 'heures'],
    day: ['jour', 'jours'],
    week: ['semaine', 'semaines'],
    month: ['mois', 'mois'],
    year: ['an', 'ans'],
  },
  isPlural: (v) => v !== 1,
};

export const de: LocaleDefinition = {
  shortUnits: { ms: 'ms', s: 's', m: 'min', h: 'Std', d: 'T', w: 'Wo', mo: 'Mo', y: 'J' },
  longUnits: {
    millisecond: ['Millisekunde', 'Millisekunden'],
    second: ['Sekunde', 'Sekunden'],
    minute: ['Minute', 'Minuten'],
    hour: ['Stunde', 'Stunden'],
    day: ['Tag', 'Tage'],
    week: ['Woche', 'Wochen'],
    month: ['Monat', 'Monate'],
    year: ['Jahr', 'Jahre'],
  },
  isPlural: (v) => v !== 1,
};

export const es: LocaleDefinition = {
  shortUnits: { ms: 'ms', s: 's', m: 'min', h: 'h', d: 'd', w: 'sem', mo: 'mes', y: 'a' },
  longUnits: {
    millisecond: ['milisegundo', 'milisegundos'],
    second: ['segundo', 'segundos'],
    minute: ['minuto', 'minutos'],
    hour: ['hora', 'horas'],
    day: ['día', 'días'],
    week: ['semana', 'semanas'],
    month: ['mes', 'meses'],
    year: ['año', 'años'],
  },
  isPlural: (v) => v !== 1,
};

export const zh: LocaleDefinition = {
  shortUnits: { ms: '毫秒', s: '秒', m: '分', h: '时', d: '天', w: '周', mo: '月', y: '年' },
  longUnits: {
    millisecond: ['毫秒', '毫秒'],
    second: ['秒', '秒'],
    minute: ['分钟', '分钟'],
    hour: ['小时', '小时'],
    day: ['天', '天'],
    week: ['周', '周'],
    month: ['月', '月'],
    year: ['年', '年'],
  },
  isPlural: (v) => false,
};

export const ar: LocaleDefinition = {
  shortUnits: {
    ms: 'مللي ثانية',
    s: 'ثانية',
    m: 'دقيقة',
    h: 'ساعة',
    d: 'يوم',
    w: 'أسبوع',
    mo: 'شهر',
    y: 'سنة',
  },
  longUnits: {
    millisecond: ['مللي ثانية', 'مللي ثواني'],
    second: ['ثانية', 'ثواني'],
    minute: ['دقيقة', 'دقائق'],
    hour: ['ساعة', 'ساعات'],
    day: ['يوم', 'أيام'],
    week: ['أسبوع', 'أسابيع'],
    month: ['شهر', 'شهور'],
    year: ['سنة', 'سنوات'],
  },
  isPlural: (v) => v !== 1,
};