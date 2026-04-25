// Credit: https://github.com/github/time-elements/
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (num: number): string => `0${num}`.slice(-2);

function strftime(time: Date, formatString: string): string {
  const day = time.getDay();
  const date = time.getDate();
  const month = time.getMonth();
  const year = time.getFullYear();
  const hour = time.getHours();
  const minute = time.getMinutes();
  const second = time.getSeconds();
  return formatString.replace(/%([%aAbBcdeHIlmMpPSwyYZz])/g, (_arg) => {
    let match: RegExpMatchArray | null;
    const modifier = _arg[1];
    switch (modifier) {
      case '%':
      default:
        return '%';
      case 'a':
        return weekdays[day].slice(0, 3);
      case 'A':
        return weekdays[day];
      case 'b':
        return months[month].slice(0, 3);
      case 'B':
        return months[month];
      case 'c':
        return time.toString();
      case 'd':
        return pad(date);
      case 'e':
        return String(date);
      case 'H':
        return pad(hour);
      case 'I':
        return pad(parseInt(strftime(time, '%l'), 10));
      case 'l':
        return String(hour === 0 || hour === 12 ? 12 : (hour + 12) % 12);
      case 'm':
        return pad(month + 1);
      case 'M':
        return pad(minute);
      case 'p':
        return hour > 11 ? 'PM' : 'AM';
      case 'P':
        return hour > 11 ? 'pm' : 'am';
      case 'S':
        return pad(second);
      case 'w':
        return String(day);
      case 'y':
        return pad(year % 100);
      case 'Y':
        return String(year);
      case 'Z':
        match = time.toString().match(/\((\w+)\)$/);
        return match ? match[1] : '';
      case 'z':
        match = time.toString().match(/\w([+-]\d\d\d\d) /);
        return match ? match[1] : '';
    }
  });
}

let dayFirst: boolean | null = null;
let yearSeparator: boolean | null = null;

// Private: Determine if the day should be formatted before the month name in
// the user's current locale. For example, `9 Jun` for en-GB and `Jun 9`
// for en-US.
function isDayFirst(): boolean {
  if (dayFirst !== null) {
    return dayFirst;
  }

  if (!('Intl' in window)) {
    return false;
  }

  const options = { day: 'numeric' as const, month: 'short' as const };
  const formatter = new window.Intl.DateTimeFormat(undefined, options);
  const output = formatter.format(new Date(0));

  dayFirst = !!output.match(/^\d/);
  return dayFirst;
}

// Private: Determine if the year should be separated from the month and day
// with a comma. For example, `9 Jun 2014` in en-GB and `Jun 9, 2014` in en-US.
function isYearSeparator(): boolean {
  if (yearSeparator !== null) {
    return yearSeparator;
  }

  if (!('Intl' in window)) {
    return true;
  }

  const options = { day: 'numeric' as const, month: 'short' as const, year: 'numeric' as const };
  const formatter = new window.Intl.DateTimeFormat(undefined, options);
  const output = formatter.format(new Date(0));

  yearSeparator = !!output.match(/\d,/);
  return yearSeparator;
}

// Private: Determine if the date occurs in the same year as today's date.
function isThisYear(date: Date): boolean {
  const now = new Date();
  return now.getUTCFullYear() === date.getUTCFullYear();
}

class RelativeTime {
  private date: Date;

  constructor(date: Date) {
    this.date = date;
  }

  toString(): string {
    const ago = this.timeElapsed();
    return ago || `on ${this.formatDate()}`;
  }

  timeElapsed(): string | null {
    const ms = new Date().getTime() - this.date.getTime();
    const sec = Math.round(ms / 1000);
    const min = Math.round(sec / 60);
    const hr = Math.round(min / 60);
    const day = Math.round(hr / 24);
    if (ms < 0) {
      return 'just now';
    } else if (sec < 45) {
      return 'just now';
    } else if (sec < 90) {
      return 'a minute ago';
    } else if (min < 45) {
      return `${min} minutes ago`;
    } else if (min < 90) {
      return 'an hour ago';
    } else if (hr < 24) {
      return `${hr} hours ago`;
    } else if (hr < 36) {
      return 'a day ago';
    } else if (day < 30) {
      return `${day} days ago`;
    }
    return null;
  }

  formatDate(): string {
    let format = isDayFirst() ? '%e %b' : '%b %e';
    if (!isThisYear(this.date)) {
      format += isYearSeparator() ? ', %Y' : ' %Y';
    }
    return strftime(this.date, format);
  }
}

export default {
  // The optional second argument is unused — callers (Vue filter in
  // `vueGlobals.js`) pass `store.state.timeCounter` as a reactivity tripwire
  // so Vue re-evaluates the filter every minute without us having to
  // subscribe inside the service. Documented here so the signature matches
  // the actual call shape.
  format(time: number | string | Date | undefined | null, _refreshKey?: unknown): string | undefined {
    if (!time) return undefined;
    return new RelativeTime(new Date(time)).toString();
  },
};
