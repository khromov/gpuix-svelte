export type Failure = Error & { code?: string; transient?: boolean };
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
