export interface Dependency {
  name: string;
  version: string;
  isDev: boolean;
}

export type AttestationStatus = 'attested' | 'signed-only' | 'unattested';

export interface DependencyResult {
  name: string;
  version: string;
  isDev: boolean;
  status: AttestationStatus;
  predicateType?: string;
}

export interface CheckResult {
  dependencies: DependencyResult[];
  summary: {
    total: number;
    prod: number;
    dev: number;
    attested: number;
    signedOnly: number;
    unattested: number;
    prodAttested: number;
    prodTotal: number;
    score: number;
  };
}

export interface CLIOptions {
  lockfilePath: string;
  format: 'text' | 'json' | 'html';
  threshold: number;
  prodOnly: boolean;
  output: string;
  concurrency: number;
}
