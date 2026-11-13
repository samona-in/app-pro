/**
 * Legacy per-service cart URL.
 *
 * The cart is now global — one checkout may hold works from several services —
 * so this route simply renders the shared cart screen. It is kept so deep
 * links from older builds keep working.
 */
export { default } from '../../cart';
