/**
 * ICE / STUN / TURN server configuration interfaces and utilities.
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RtcConfigurationOptions {
  iceServers: IceServerConfig[];
  iceCandidatePoolSize?: number;
}

/**
 * Default public STUN servers for NAT traversal.
 */
export const DEFAULT_STUN_SERVERS: readonly IceServerConfig[] = Object.freeze([
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
]);

/**
 * Provider interface for obtaining ICE configurations dynamically.
 */
export interface IceConfigProvider {
  getIceServers(): Promise<IceServerConfig[]> | IceServerConfig[];
  getRtcConfiguration(): Promise<RtcConfigurationOptions> | RtcConfigurationOptions;
}

/**
 * Default implementation returning Google public STUN servers or custom overrides.
 */
export class DefaultIceConfigProvider implements IceConfigProvider {
  private readonly customServers?: IceServerConfig[];

  constructor(customServers?: IceServerConfig[]) {
    this.customServers = customServers;
  }

  getIceServers(): IceServerConfig[] {
    if (this.customServers && this.customServers.length > 0) {
      return this.customServers;
    }
    return [...DEFAULT_STUN_SERVERS];
  }

  getRtcConfiguration(): RtcConfigurationOptions {
    return {
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 10,
    };
  }
}

/**
 * Helper to fetch runtime ICE server list.
 */
export function getRuntimeIceServers(customServers?: IceServerConfig[]): IceServerConfig[] {
  const provider = new DefaultIceConfigProvider(customServers);
  return provider.getIceServers();
}
