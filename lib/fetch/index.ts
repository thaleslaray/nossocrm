/**
 * Fetch utilities with timeout and error handling
 * @module lib/fetch
 */

export {
  safeFetch,
  safeFetchJson,
  FetchTimeoutError,
  FetchAbortedError,
  type SafeFetchOptions,
} from './safeFetch';

export { default } from './safeFetch';
