import bezierEasing from 'bezier-easing';

// Easing entry: bezier-easing@3 returns a plain `(t) => y` function. We
// pair it with the matching CSS `cubic-bezier(...)` string so the
// transition path can read both without method-on-function shims that
// the v2 API used to expose.
interface Easing {
  fn: (t: number) => number;
  css: string;
}

const makeEasing = (x1: number, y1: number, x2: number, y2: number): Easing => ({
  fn: bezierEasing(x1, y1, x2, y2),
  css: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
});

const easings: Record<string, Easing> = {
  materialIn: makeEasing(0.75, 0, 0.8, 0.25),
  materialOut: makeEasing(0.25, 0.8, 0.25, 1),
  inOut: makeEasing(0.25, 0.1, 0.67, 1),
};

const vendors = ['moz', 'webkit'];
for (let x = 0; x < vendors.length && !window.requestAnimationFrame; x += 1) {
  (window as any).requestAnimationFrame = (window as any)[`${vendors[x]}RequestAnimationFrame`];
  (window as any).cancelAnimationFrame = (window as any)[`${vendors[x]}CancelAnimationFrame`]
    || (window as any)[`${vendors[x]}CancelRequestAnimationFrame`];
}

const transformStyles = [
  'WebkitTransform',
  'MozTransform',
  'msTransform',
  'OTransform',
  'transform',
];

const transitionEndEvents: Record<string, string> = {
  WebkitTransition: 'webkitTransitionEnd',
  MozTransition: 'transitionend',
  msTransition: 'MSTransitionEnd',
  OTransition: 'oTransitionEnd',
  transition: 'transitionend',
};

function getStyle(styles: string[]): string | undefined {
  const elt = document.createElement('div');
  return styles.reduce<string | undefined>((result, style) => {
    if ((elt.style as any)[style] === undefined) {
      return undefined;
    }
    return style;
  }, undefined);
}

const transformStyle = getStyle(transformStyles);
const transitionStyle = getStyle(Object.keys(transitionEndEvents));
const transitionEndEvent = transitionEndEvents[transitionStyle as string];

function identity<T>(x: T): T {
  return x;
}

interface AttributeHandler {
  name: string;
  setStart(animation: Animation): boolean;
  applyCurrent(animation: Animation): unknown;
}

class ElementAttribute implements AttributeHandler {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  setStart(animation: Animation): boolean {
    const value = (animation.elt as any)[this.name];
    animation.$start[this.name] = value;
    return value !== undefined && animation.$end[this.name] !== undefined;
  }

  applyCurrent(animation: Animation): unknown {
    (animation.elt as any)[this.name] = animation.$current[this.name];
    return undefined;
  }
}

class StyleAttribute implements AttributeHandler {
  name: string;
  unit: string;
  defaultValue: number;
  wrap: (x: number) => number;

  constructor(name: string, unit: string, defaultValue: number, wrap: (x: number) => number = identity) {
    this.name = name;
    this.unit = unit;
    this.defaultValue = defaultValue;
    this.wrap = wrap;
  }

  setStart(animation: Animation): boolean {
    let value = parseFloat((animation.elt.style as any)[this.name]);
    if (Number.isNaN(value)) {
      value = animation.$current[this.name] || this.defaultValue;
    }
    animation.$start[this.name] = value;
    return animation.$end[this.name] !== undefined;
  }

  applyCurrent(animation: Animation): unknown {
    (animation.elt.style as any)[this.name] = this.wrap(animation.$current[this.name]) + this.unit;
    return undefined;
  }
}

class TransformAttribute implements AttributeHandler {
  name: string;
  unit: string;
  defaultValue: number;
  wrap: (x: number) => number;

  constructor(name: string, unit: string, defaultValue: number, wrap: (x: number) => number = identity) {
    this.name = name;
    this.unit = unit;
    this.defaultValue = defaultValue;
    this.wrap = wrap;
  }

  setStart(animation: Animation): boolean {
    let value = animation.$current[this.name];
    if (value === undefined) {
      value = this.defaultValue;
    }
    animation.$start[this.name] = value;
    if (animation.$end[this.name] === undefined) {
      animation.$end[this.name] = value;
    }
    return value !== undefined;
  }

  applyCurrent(animation: Animation): string | false {
    const value = animation.$current[this.name];
    return value !== this.defaultValue && `${this.name}(${this.wrap(value)}${this.unit})`;
  }
}

const attributes: AttributeHandler[] = [
  new ElementAttribute('scrollTop'),
  new ElementAttribute('scrollLeft'),
  new StyleAttribute('opacity', '', 1),
  new StyleAttribute('zIndex', '', 0),
  new TransformAttribute('translateX', 'px', 0, Math.round),
  new TransformAttribute('translateY', 'px', 0, Math.round),
  new TransformAttribute('scale', '', 1),
  new TransformAttribute('rotate', 'deg', 0),
  ...['width', 'height', 'top', 'right', 'bottom', 'left']
    .map(name => new StyleAttribute(name, 'px', 0, Math.round)),
];

class Animation {
  elt: HTMLElement;
  $current: Record<string, number>;
  $pending: Record<string, unknown>;
  $start!: Record<string, number>;
  $end!: Record<string, any>;
  $attributes!: AttributeHandler[];
  $startTime!: number;
  $requestId?: number;

  constructor(elt: HTMLElement) {
    this.elt = elt;
    this.$current = {};
    this.$pending = {};
  }

  start(param1?: unknown, param2?: unknown, param3?: unknown): HTMLElement {
    let endCb = param1;
    let stepCb = param2;
    let useTransition = false;
    if (typeof param1 === 'boolean') {
      useTransition = param1;
      endCb = param2;
      stepCb = param3;
    }

    this.stop();
    this.$start = {};
    this.$end = this.$pending;
    this.$pending = {};
    this.$attributes = attributes.filter(attribute => attribute.setStart(this));
    this.$end.duration = this.$end.duration || 0;
    this.$end.delay = this.$end.delay || 0;
    this.$end.easing = easings[this.$end.easing] || easings.materialOut;
    this.$end.endCb = typeof endCb === 'function' && endCb;
    this.$end.stepCb = typeof stepCb === 'function' && stepCb;
    this.$startTime = Date.now() + this.$end.delay;
    if (!this.$end.duration) {
      this.loop(false);
    } else if (useTransition) {
      this.loop(true);
    } else {
      this.$requestId = window.requestAnimationFrame(() => this.loop(false));
    }
    return this.elt;
  }

  stop(): void {
    if (this.$requestId) window.cancelAnimationFrame(this.$requestId);
  }

  loop(useTransition: boolean): void {
    const onTransitionEnd = (evt: Event) => {
      if (evt.target === this.elt) {
        this.elt.removeEventListener(transitionEndEvent, onTransitionEnd);
        const { endCb } = this.$end;
        this.$end.endCb = undefined;
        if (endCb) {
          endCb();
        }
      }
    };

    let progress = (Date.now() - this.$startTime) / this.$end.duration;
    let transition = '';
    if (useTransition) {
      progress = 1;
      const transitions = [
        'all',
        `${this.$end.duration}ms`,
        this.$end.easing.css,
      ];
      if (this.$end.delay) {
        transitions.push(`${this.$end.duration}ms`);
      }
      transition = transitions.join(' ');
      if (this.$end.endCb) {
        this.elt.addEventListener(transitionEndEvent, onTransitionEnd);
      }
    } else if (progress < 1) {
      this.$requestId = window.requestAnimationFrame(() => this.loop(false));
      if (progress < 0) {
        return;
      }
    } else if (this.$end.endCb) {
      this.$requestId = window.requestAnimationFrame(this.$end.endCb);
    }

    const coeff = this.$end.easing.fn(progress);
    const transforms = this.$attributes.reduce<string[]>((result, attribute) => {
      if (progress < 1) {
        const diff = this.$end[attribute.name] - this.$start[attribute.name];
        this.$current[attribute.name] = this.$start[attribute.name] + (diff * coeff);
      } else {
        this.$current[attribute.name] = this.$end[attribute.name];
      }
      const transform = attribute.applyCurrent(this);
      if (transform) {
        result.push(transform as string);
      }
      return result;
    }, []);

    if (transforms.length) {
      transforms.push('translateZ(0)'); // activate GPU
    }
    const transform = transforms.join(' ');
    (this.elt.style as any)[transformStyle as string] = transform;
    (this.elt.style as any)[transitionStyle as string] = transition;
    if (this.$end.stepCb) {
      this.$end.stepCb();
    }
  }
}

// Attach `width(val)` / `height(val)` / etc setter methods to Animation
// instances so the chained call syntax works (`animate(elt).width(120)`).
attributes.map(attribute => attribute.name).concat('duration', 'easing', 'delay')
  .forEach((name) => {
    (Animation.prototype as any)[name] = function setter(this: Animation, val: unknown) {
      this.$pending[name] = val;
      return this;
    };
  });

function animate(elt: HTMLElement & { $animation?: Animation }): Animation {
  if (!elt.$animation) {
    elt.$animation = new Animation(elt);
  }
  return elt.$animation;
}

export default {
  animate,
};
