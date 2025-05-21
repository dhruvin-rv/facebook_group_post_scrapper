export class ProxyConfigResponse {
  proxies: string[];
}

export interface ProxyConfig {
  proxy: string;
  lastUpdated: Date;
}
