// kiaao — Router utility functions (URL/location helpers)

export const getPathname = (): string => window.location.pathname;
export const getSearch = (): string => window.location.search;
export const pushState = (path: string) => history.pushState(null, "", path);
export const parseSearch = (search: string): URLSearchParams => new URLSearchParams(search);
