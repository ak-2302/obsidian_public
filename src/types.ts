export type VaultFile = { path: string; sha: string; size: number; contentType: string };
export type VaultManifest = { commitSha: string; syncedAt: string; files: VaultFile[] };
