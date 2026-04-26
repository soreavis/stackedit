import utils from './utils';
import store from '../store';
import { useWorkspaceStore } from '../stores/workspace';
import { useNotificationStore } from '../stores/notification';
import constants from '../data/constants';
import { useDataStore } from '../stores/data';

interface RequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  params?: Record<string, unknown>;
  blob?: boolean;
  raw?: boolean;
  withCredentials?: boolean;
  timeout?: number;
}

interface RequestResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

interface OAuth2Params {
  pkce?: boolean;
  [key: string]: unknown;
}

interface OAuth2Result {
  accessToken: string;
  code: string;
  idToken: string;
  expiresIn: string;
  codeVerifier?: string;
}

const scriptLoadingPromises: Record<string, Promise<unknown> | null> = Object.create(null);
const authorizeTimeout = 6 * 60 * 1000; // 2 minutes
const silentAuthorizeTimeout = 15 * 1000; // 15 secondes (which will be reattempted)
const networkTimeout = 30 * 1000; // 30 sec
let isConnectionDown = false;
const userInactiveAfter = 3 * 60 * 1000; // 3 minutes (twice the default sync period)
let lastActivity = 0;
let lastFocus = 0;
let isConfLoading = false;
let isConfLoaded = false;

function parseHeaders(xhr: XMLHttpRequest): Record<string, string> {
  const pairs = xhr.getAllResponseHeaders().trim().split('\n');
  const headers: Record<string, string> = {};
  pairs.forEach((header) => {
    const split = header.trim().split(':');
    const key = (split.shift() || '').trim().toLowerCase();
    const value = split.join(':').trim();
    headers[key] = value;
  });
  return headers;
}

function isRetriable(err: any): boolean {
  if (err.status === 403) {
    const googleReason = ((((err.body || {}).error || {}).errors || [])[0] || {}).reason;
    return googleReason === 'rateLimitExceeded' || googleReason === 'userRateLimitExceeded';
  }
  return err.status === 429 || (err.status >= 500 && err.status < 600);
}

export default {
  async init(): Promise<void> {
    // Keep track of the last user activity
    const setLastActivity = () => {
      lastActivity = Date.now();
    };
    window.document.addEventListener('mousedown', setLastActivity);
    window.document.addEventListener('keydown', setLastActivity);
    window.document.addEventListener('touchstart', setLastActivity);

    // Keep track of the last window focus
    lastFocus = 0;
    const setLastFocus = () => {
      lastFocus = Date.now();
      localStorage.setItem(useWorkspaceStore().lastFocusKey, String(lastFocus));
      setLastActivity();
    };
    if (document.hasFocus()) {
      setLastFocus();
    }
    window.addEventListener('focus', setLastFocus);

    // Check that browser is online periodically
    const checkOffline = async () => {
      const isBrowserOffline = window.navigator.onLine === false;
      if (!isBrowserOffline
        && store.state.lastOfflineCheck + networkTimeout + 5000 < Date.now()
        && this.isUserActive()
      ) {
        store.commit('updateLastOfflineCheck');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), networkTimeout);
        try {
          const res = await fetch(`conf?_=${Date.now()}`, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!res.ok) throw new Error('offline_check_failed');
          isConnectionDown = false;
        } catch {
          isConnectionDown = true;
        } finally {
          clearTimeout(timeout);
        }
      }
      const offline = isBrowserOffline || isConnectionDown;
      if (store.state.offline !== offline) {
        store.commit('setOffline', offline);
        if (offline) {
          useNotificationStore().error('You are offline.');
        } else {
          useNotificationStore().info('You are back online!');
          this.getServerConf();
        }
      }
    };

    utils.setInterval(checkOffline, 1000);
    window.addEventListener('online', () => {
      isConnectionDown = false;
      checkOffline();
    });
    window.addEventListener('offline', checkOffline);
    await checkOffline();
    this.getServerConf();
  },

  async getServerConf(): Promise<void> {
    if (!store.state.offline && !isConfLoading && !isConfLoaded) {
      try {
        isConfLoading = true;
        const res = await this.request({ url: 'conf' });
        await useDataStore().setServerConf(res.body);
        isConfLoaded = true;
      } finally {
        isConfLoading = false;
      }
    }
  },

  isWindowFocused(): boolean {
    // We don't use state.workspace.lastFocus as it's not reactive
    const storedLastFocus = localStorage.getItem(useWorkspaceStore().lastFocusKey);
    return parseInt(storedLastFocus || '0', 10) === lastFocus;
  },

  isUserActive(): boolean {
    return lastActivity > Date.now() - userInactiveAfter && this.isWindowFocused();
  },

  isConfLoaded(): boolean {
    return !!Object.keys(useDataStore().serverConf).length;
  },

  async loadScript(url: string): Promise<unknown> {
    if (!scriptLoadingPromises[url]) {
      scriptLoadingPromises[url] = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.onload = () => resolve(undefined);
        script.onerror = () => {
          scriptLoadingPromises[url] = null;
          reject();
        };
        script.src = url;
        document.head.appendChild(script);
      });
    }
    return scriptLoadingPromises[url];
  },

  async startOauth2(
    url: string,
    params: OAuth2Params = {},
    silent = false,
    reattempt = false,
  ): Promise<OAuth2Result> {
    try {
      // Build the authorize URL
      const state = utils.uid();
      const { pkce, ...authParams } = params;
      let codeVerifier: string | undefined;
      const extraAuthParams: Record<string, string> = {};
      if (pkce) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        codeVerifier = btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const digest = new Uint8Array(await crypto.subtle.digest(
          'SHA-256', new TextEncoder().encode(codeVerifier),
        ));
        extraAuthParams.code_challenge = btoa(String.fromCharCode(...digest))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        extraAuthParams.code_challenge_method = 'S256';
      }
      const authorizeUrl = utils.addQueryParams(url, {
        ...authParams,
        ...extraAuthParams,
        state,
        redirect_uri: (constants as any).oauth2RedirectUri,
      });

      let iframeElt: HTMLIFrameElement | undefined;
      let wnd: Window | null = null;
      if (silent) {
        // Use an iframe as wnd for silent mode
        iframeElt = (utils as any).createHiddenIframe(authorizeUrl);
        document.body.appendChild(iframeElt as HTMLIFrameElement);
        wnd = (iframeElt as HTMLIFrameElement).contentWindow;
      } else {
        // Open a tab otherwise
        wnd = window.open(authorizeUrl);
        if (!wnd) {
          throw new Error('The authorize window was blocked.');
        }
      }

      let checkClosedInterval: ReturnType<typeof setInterval> | undefined;
      let closeTimeout: ReturnType<typeof setTimeout> | undefined;
      let msgHandler: ((event: MessageEvent) => void) | undefined;
      try {
        return await new Promise<OAuth2Result>((resolve, reject) => {
          if (silent) {
            (iframeElt as HTMLIFrameElement).onerror = () => {
              reject(new Error('Unknown error.'));
            };
            closeTimeout = setTimeout(() => {
              if (!reattempt) {
                reject(new Error('REATTEMPT'));
              } else {
                isConnectionDown = true;
                store.commit('setOffline', true);
                store.commit('updateLastOfflineCheck');
                reject(new Error('You are offline.'));
              }
            }, silentAuthorizeTimeout);
          } else {
            closeTimeout = setTimeout(() => {
              reject(new Error('Timeout.'));
            }, authorizeTimeout);
          }

          msgHandler = (event: MessageEvent) => {
            if (event.source === wnd && event.origin === (constants as any).origin) {
              const data = utils.parseQueryParams(`${event.data}`.slice(1)) as Record<string, string>;
              if (data.error || data.state !== state) {
                console.error(data);
                reject(new Error('Could not get required authorization.'));
              } else {
                resolve({
                  accessToken: data.access_token,
                  code: data.code,
                  idToken: data.id_token,
                  expiresIn: data.expires_in,
                  codeVerifier,
                });
              }
            }
          };

          window.addEventListener('message', msgHandler);
          if (!silent) {
            checkClosedInterval = setInterval(() => {
              if (wnd && wnd.closed) {
                reject(new Error('Authorize window was closed.'));
              }
            }, 250);
          }
        });
      } finally {
        if (checkClosedInterval) clearInterval(checkClosedInterval);
        if (!silent && wnd && !wnd.closed) {
          wnd.close();
        }
        if (iframeElt) {
          document.body.removeChild(iframeElt);
        }
        if (closeTimeout) clearTimeout(closeTimeout);
        if (msgHandler) window.removeEventListener('message', msgHandler);
      }
    } catch (e: any) {
      if (e.message === 'REATTEMPT') {
        return this.startOauth2(url, params, silent, true);
      }
      throw e;
    }
  },

  async request(config: RequestConfig, offlineCheck = false): Promise<RequestResult> {
    let retryAfter = 500; // 500 ms
    const maxRetryAfter = 10 * 1000; // 10 sec
    const sanitizedConfig: RequestConfig = { ...config };
    sanitizedConfig.timeout = sanitizedConfig.timeout || networkTimeout;
    sanitizedConfig.headers = { ...sanitizedConfig.headers };
    if (sanitizedConfig.body && typeof sanitizedConfig.body === 'object') {
      sanitizedConfig.body = JSON.stringify(sanitizedConfig.body);
      sanitizedConfig.headers['Content-Type'] = 'application/json';
    }

    const attempt = async (): Promise<RequestResult> => {
      try {
        return await new Promise<RequestResult>((resolve, reject) => {
          if (offlineCheck) {
            store.commit('updateLastOfflineCheck');
          }

          const xhr = new window.XMLHttpRequest();
          xhr.withCredentials = sanitizedConfig.withCredentials || false;

          const timeoutId = setTimeout(() => {
            xhr.abort();
            if (offlineCheck) {
              isConnectionDown = true;
              store.commit('setOffline', true);
              reject(new Error('You are offline.'));
            } else {
              reject(new Error('Network request timeout.'));
            }
          }, sanitizedConfig.timeout);

          xhr.onload = () => {
            if (offlineCheck) {
              isConnectionDown = false;
            }
            clearTimeout(timeoutId);
            const result: RequestResult = {
              status: xhr.status,
              headers: parseHeaders(xhr),
              body: sanitizedConfig.blob ? xhr.response : xhr.responseText,
            };
            if (!sanitizedConfig.raw && !sanitizedConfig.blob) {
              try {
                result.body = JSON.parse(result.body as string);
              } catch {
                // ignore
              }
            }
            if (result.status >= 200 && result.status < 300) {
              resolve(result);
            } else {
              reject(result);
            }
          };

          xhr.onerror = () => {
            clearTimeout(timeoutId);
            if (offlineCheck) {
              isConnectionDown = true;
              store.commit('setOffline', true);
              reject(new Error('You are offline.'));
            } else {
              reject(new Error('Network request failed.'));
            }
          };

          const url = utils.addQueryParams(sanitizedConfig.url, sanitizedConfig.params);
          xhr.open(sanitizedConfig.method || 'GET', url);
          Object.entries(sanitizedConfig.headers || {}).forEach(([key, value]) => {
            if (value) {
              xhr.setRequestHeader(key, `${value}`);
            }
          });
          if (sanitizedConfig.blob) {
            xhr.responseType = 'blob';
          }
          xhr.send((sanitizedConfig.body as XMLHttpRequestBodyInit) || null);
        });
      } catch (err: any) {
        // Try again later in case of retriable error
        if (isRetriable(err) && retryAfter < maxRetryAfter) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, retryAfter);
            // Exponential backoff
            retryAfter *= 2;
          });
          return attempt();
        }
        throw err;
      }
    };

    return attempt();
  },
};
